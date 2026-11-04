/* The Cindy plugin shell (plugins/montclip-cindy): its manifest, its Node worker driven the way Cindy drives it
   (one JSON-RPC message per line on stdio), the engine's session token, the trimmed Windows environment, and one
   project per task without duplicates. Only generated data; no recordings, no keys. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { ROOT, seedProject } = require("./helpers");
const PLUGIN = path.join(ROOT, "plugins", "montclip-cindy");
const { fillWindowsEnv, createBinder, flatten } = require(path.join(PLUGIN, "node", "lib.cjs"));

/* ── the manifest ── */

test("manifest: every tool has a handler, the task view and the worker exist, the loopback frame is allowed", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGIN, "ghost.json"), "utf8"));
  assert.equal(m.schemaVersion, 3);
  assert.equal(m.id, "montclip");
  const main = fs.readFileSync(path.join(PLUGIN, m.entry), "utf8");
  const handlers = /const HANDLERS = \{([\s\S]*?)\n\};/.exec(main)[1];
  const names = [...handlers.matchAll(/^ {2}async (\w+)\(/gm)].map((x) => x[1]);
  assert.deepEqual(m.tools.map((t) => t.name).sort(), names.sort());
  for (const t of m.tools) assert.equal(t.parameters.type, "object", t.name);
  assert.ok(fs.existsSync(path.join(PLUGIN, m.taskView.html)));
  assert.ok(fs.existsSync(path.join(PLUGIN, m.node.entry)));
  assert.ok(fs.existsSync(path.join(PLUGIN, m.icon)));
  // Cindy frames a loopback page only for a plugin with a page, node and preview.hosts 127.0.0.1 (ADR: risks)
  assert.deepEqual(m.preview.hosts, ["127.0.0.1"]);
  assert.equal(m.node.protocol, "json-rpc-stdio");
  assert.ok(m.node.idleTimeoutSeconds >= 30 && m.node.idleTimeoutSeconds <= 3600);
  // the session token reaches only the plugin's own pages, never a tool result
  assert.match(main, /delete o\.url/);
});

/* ── the trimmed Windows environment (Cindy 0.1.122 hands the worker 17 variables, no PROGRAMFILES) ── */

test("fillWindowsEnv puts back the Program Files and AppData folders that exist, and nothing else", () => {
  const env = { SystemRoot: "D:\\Windows", USERPROFILE: "D:\\Users\\u", PROGRAMFILES: "" };
  const there = new Set(["D:\\Program Files", "D:\\Program Files (x86)", "D:\\Users\\u\\AppData\\Local"]);
  const filled = fillWindowsEnv(env, { platform: "win32", exists: (p) => there.has(p) });
  assert.deepEqual(filled.sort(), ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "ProgramW6432"].sort());
  assert.equal(env.PROGRAMFILES, "D:\\Program Files");
  assert.equal(env["PROGRAMFILES(X86)"], "D:\\Program Files (x86)");
  assert.equal(env.LOCALAPPDATA, "D:\\Users\\u\\AppData\\Local");
  assert.equal(env.APPDATA, undefined, "a folder that is not there is not invented");
  const kept = { SystemDrive: "C:", PROGRAMFILES: "E:\\Apps" };
  fillWindowsEnv(kept, { platform: "win32", exists: () => true });
  assert.equal(kept.PROGRAMFILES, "E:\\Apps", "a value that is set is kept");
  assert.deepEqual(fillWindowsEnv({}, { platform: "linux", exists: () => true }), []);
});

test("with the trimmed environment filled in, the engine finds the same browser for headless export", { skip: process.platform !== "win32" ? "Windows only" : false }, (t) => {
  const { findBrowser } = require("../export-jobs");
  const full = findBrowser(process.env);
  if (!full || !/Program Files/i.test(full)) { t.skip("no Chrome / Edge under Program Files on this machine"); return; }
  const keep = ["SystemRoot", "SystemDrive", "USERPROFILE", "PATH", "TEMP", "TMP", "COMPUTERNAME", "USERNAME", "windir", "OS"];
  const trimmed = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.some((x) => x.toLowerCase() === k.toLowerCase())));
  assert.equal(findBrowser(trimmed), null, "without PROGRAMFILES it finds none (the spike's failure)");
  fillWindowsEnv(trimmed);
  assert.equal(findBrowser(trimmed), full);
});

/* ── one project per task ── */

function fakeEngine() {
  const projects = [{ id: "p_first" }];
  let active = "p_first", n = 0;
  const calls = [];
  const api = async (method, url, body) => {
    calls.push([method, url, body && body.action]);
    await new Promise((r) => setTimeout(r, 5));   // answers take a moment, so two binds would interleave
    if (method === "GET") return { status: 200, body: { active, projects: projects.map((p) => ({ ...p })) } };
    if (body.action === "new") { const id = "p_new" + ++n; projects.push({ id }); return { status: 200, body: { id } }; }
    if (body.action === "open") { active = body.id; return { status: 200, body: { id: body.id } }; }
    throw new Error("unexpected " + body.action);
  };
  return { api, projects, calls, get active() { return active; }, drop(id) { projects.splice(projects.findIndex((p) => p.id === id), 1); } };
}

test("binding: two binds of a new task at once make one project; each task gets its own; coming back opens it", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-bind-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const e = fakeEngine();
  const b = createBinder({ file: path.join(dir, "sessions.json"), api: e.api });
  // the first task takes the project that is open
  const [a1, a2] = await Promise.all([b.bind("task-a"), b.bind("task-a")]);
  assert.deepEqual([a1.project, a1.created, a2.project, a2.created], ["p_first", false, "p_first", false]);
  // a new task opens twice at once (page open + visible): one project, not two
  const [n1, n2] = await Promise.all([b.bind("task-b"), b.bind("task-b")]);
  assert.equal(n1.project, n2.project);
  assert.deepEqual([n1.created, n2.created], [true, false]);
  assert.equal(e.projects.length, 2, "no orphan project");
  assert.equal(e.active, n1.project);
  const back = await b.bind("task-a");
  assert.deepEqual([back.project, back.switched], ["p_first", true]);
  assert.deepEqual(b.map(), { "task-a": "p_first", "task-b": n1.project });
  // a task whose project was deleted gets a new one
  e.drop(n1.project);
  const again = await b.bind("task-b");
  assert.equal(again.created, true);
  assert.notEqual(again.project, n1.project);
  await assert.rejects(b.bind("../x"), /session id/);
});

test("flatten: text joined, image blocks written into the data folder and named", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-flat-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(flatten("plain", dir), { text: "plain" });
  const out = flatten([{ type: "text", text: "a" }, { type: "image", mimeType: "image/jpeg", data: Buffer.from("jpg").toString("base64") }, { type: "text", text: "b" }], dir);
  assert.equal(out.text, "a\nb");
  assert.equal(out.images.length, 1);
  assert.equal(fs.readFileSync(out.images[0], "utf8"), "jpg");
});

/* ── the worker, driven like Cindy drives it ── */

function startWorker(t, dataDir) {
  const child = spawn(process.execPath, [path.join(PLUGIN, "node", "worker.cjs")], {
    cwd: os.tmpdir(),
    env: { ...process.env, MONTCLIP_CINDY_APP: ROOT, MONTCLIP_CINDY_DATA: dataDir, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map(), stray = [];
  let buf = "", stderr = "", id = 0;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => {
    buf += c;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { stray.push(line); continue; }
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); p(m); } else stray.push(line);
    }
  });
  child.stderr.on("data", (c) => { stderr += c; });
  t.after(() => new Promise((r) => { if (child.exitCode !== null) return r(); child.once("exit", r); child.kill(); }));
  return {
    stray, get stderr() { return stderr; },
    rpc(method, params = {}) {
      const n = ++id;
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no answer to ${method}\n${stderr}`)), 30000);
        pending.set(n, (m) => { clearTimeout(timer); resolve(m); });
      });
    },
  };
}
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      let body = ""; res.setEncoding("utf8");
      res.on("data", (d) => { body += d; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });
}
function dataDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-cindy-"));
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(seedProject({ name: "Cindy test" }), null, 2));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("worker: the engine answers only the plugin's pages (token → cookie) and the worker's own calls", async (t) => {
  const w = startWorker(t, dataDir(t));
  const s = (await w.rpc("montclip/start")).result;
  assert.ok(s, w.stderr);
  assert.match(s.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const token = new URL(s.url).searchParams.get("token");
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(new URL(s.url).searchParams.get("host"), "cindy");

  assert.equal((await get(s.origin + "/api/project")).status, 403, "another program on this machine");
  assert.equal((await get(s.origin + "/")).status, 403);
  assert.equal((await get(s.origin + "/?host=cindy&token=" + "0".repeat(64))).status, 403, "a wrong token");
  // the frame's first load: the token becomes a cookie and leaves the address
  const boot = await get(s.url);
  assert.equal(boot.status, 302);
  assert.equal(boot.headers.location, "/?host=cindy");
  const cookie = boot.headers["set-cookie"][0];
  assert.match(cookie, /^montclip_embed=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=None; Secure; Partitioned$/);
  const jar = cookie.split(";")[0];
  assert.equal((await get(s.origin + "/api/project", { Cookie: jar })).status, 200);
  assert.equal((await get(s.origin + "/?host=cindy", { Cookie: jar })).status, 200);
  assert.equal((await get(s.origin + "/api/project", { Cookie: "montclip_embed=" + "f".repeat(64) })).status, 403);
  assert.equal((await get(s.origin + "/api/project", { "X-MontClip-Session": token })).status, 200);
  // a page of another origin (even Cindy's own plugin page) cannot use the editor's cookie
  assert.equal((await get(s.origin + "/api/project", { Cookie: jar, Origin: "cindy-ghost://montclip" })).status, 403);
  assert.deepEqual(w.stray, [], "stdout carries protocol messages only");
});

test("worker: tools run in-process; a new task's two binds make one project; undo needs the editor tab", async (t) => {
  const dir = dataDir(t);
  const w = startWorker(t, dir);
  const tools = (await w.rpc("montclip/tools")).result.tools;
  assert.ok(tools.some((x) => x.name === "fablecut_patch_project"));
  const got = (await w.rpc("montclip/call", { name: "fablecut_get_project", arguments: { compact: true } })).result;
  assert.match(got.text, /Cindy test/);
  // the tools' own calls to the editor server carry the session token (mcp-server.js SESSION)
  const status = (await w.rpc("montclip/call", { name: "fablecut_status", arguments: {} })).result;
  assert.match(status.text, /Editor server: RUNNING/, status.text);
  const bad = await w.rpc("montclip/call", { name: "rm_rf" });
  assert.equal(bad.error.code, -32602);

  const first = (await w.rpc("montclip/bind", { session: "aaaa1111" })).result;
  assert.equal(first.created, false, "the first task takes the open project");
  const [b1, b2] = await Promise.all([w.rpc("montclip/bind", { session: "bbbb2222" }), w.rpc("montclip/bind", { session: "bbbb2222" })]);
  assert.equal(b1.result.project, b2.result.project);
  assert.deepEqual([b1.result.created, b2.result.created].sort(), [false, true]);
  const map = JSON.parse(fs.readFileSync(path.join(dir, "sessions.json"), "utf8"));
  assert.deepEqual(Object.keys(map).sort(), ["aaaa1111", "bbbb2222"]);
  const list = fs.readdirSync(path.join(dir, "projects")).filter((f) => f.startsWith("p_"));
  assert.equal(list.length, 2, "two tasks, two projects, no orphan");
  const back = (await w.rpc("montclip/bind", { session: "aaaa1111" })).result;
  assert.deepEqual([back.project, back.switched, back.name], [first.project, true, "Cindy test"]);

  const ui = (await w.rpc("montclip/ui", { cmd: "undo" })).result;
  assert.deepEqual([ui.status, ui.code], [409, "NO_EDITOR"]);
  assert.equal((await w.rpc("montclip/ui", { cmd: "eval" })).error.code, -32602);
  assert.equal((await w.rpc("no/such")).error.code, -32601);
});

test("worker: a data folder the Windows app already has is refused, with the reason", async (t) => {
  const dir = dataDir(t);
  const a = startWorker(t, dir);
  assert.ok((await a.rpc("montclip/start")).result);
  const b = startWorker(t, dir);
  const r = await b.rpc("montclip/start");
  assert.ok(r.error);
  assert.match(r.error.message, /Another MontClip \(cindy, pid \d+ on port \d+\) is already editing/);
  assert.equal(r.error.data.code, "DATA_DIR_IN_USE");
});

/* VV's review of #111: the Windows app first, then the plugin on the same projects. The engine refuses
   (DATA_DIR_IN_USE); the plugin says so in plain words, to the chat and on the editor tab, with a retry. */
/* The engine refused to start: another MontClip has these projects (DATA_DIR_IN_USE). JJ's final words (2026-11-04),
   word for word, by who has them; no pid, no port. main.js runs in a sandbox with a stand-in cindy. */
function refusedLogicPage(refusal) {
  const vm = require("node:vm");
  const sent = [], channels = [];
  let handler = null;
  const cindy = {
    node: { request: async () => ({ ok: false, errorCode: "NODE_REQUEST_FAILED", message: refusal }) },
    send: async (m) => { sent.push(JSON.parse(JSON.stringify(m))); return { ok: true }; },
    onHostMessage: (fn) => { handler = fn; },
  };
  class BroadcastChannel { constructor() { channels.push(this); this.posted = []; } postMessage(m) { this.posted.push(JSON.parse(JSON.stringify(m))); } }
  vm.runInNewContext(fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8"), { cindy, BroadcastChannel, setTimeout, console, Map, Promise });
  return {
    status: async () => { await handler({ type: "tool-call", callId: "c1", tool: "montclip_status", args: {} }); return sent.find((m) => m.type === "tool-result"); },
    editor: async () => { await channels[0].onmessage({ data: { reqId: "e1", type: "editor" } }); return channels[0].posted.at(-1); },
  };
}
const refusalBy = (shell) => `Another MontClip (${shell}, pid 31832 on port 10493) is already editing C:/Users/x/MontClip-Cindy. Close it first, or give this one its own data folder (FABLECUT_DATA_DIR).`;
const IN_USE = {
  desktop: ["MontClip 桌面版正在用这些项目。两边同时改，会互相盖掉。先把桌面版关掉，再打开这里。找不到桌面版的窗口，就重启电脑再试。",
    "The MontClip desktop app is using these projects. If both edit at once, one overwrites the other. Close the MontClip desktop app first, then open this one. If you can't find it, restart the computer and try again."],
  other: ["另一个 MontClip 窗口正在用这些项目。两边同时改，会互相盖掉。先把那边的 MontClip 关掉，再打开这里。找不到那边的窗口，就重启电脑再试。",
    "Another MontClip window is using these projects. If both edit at once, one overwrites the other. Close the other MontClip first, then open this one. If you can't find it, restart the computer and try again."],
};

test("the MontClip desktop app has the projects open: the chat and the editor tab get JJ's words, no pid or port", async () => {
  const page = refusedLogicPage(refusalBy("desktop"));
  const r = await page.status();
  assert.deepEqual([r.ok, r.errorCode, r.message], [false, "DATA_DIR_IN_USE", IN_USE.desktop[0]]);
  const a = await page.editor();
  assert.deepEqual([a.code, a.error, a.errorEn], ["DATA_DIR_IN_USE", ...IN_USE.desktop]);
  for (const text of [r.message, a.error, a.errorEn]) assert.doesNotMatch(text, /pid|port|31832|10493/);
});

test("another holder (a server started by hand, or one that cannot be told): the desktop app's words for another window", async () => {
  for (const refusal of [refusalBy("server"), "DATA_DIR_IN_USE"]) {
    const a = await refusedLogicPage(refusal).editor();
    assert.deepEqual([a.code, a.error, a.errorEn], ["DATA_DIR_IN_USE", ...IN_USE.other]);
  }
  // the editor tab shows them as they are, with 重试
  const frame = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(frame, /if \(inUse\(a\)\) show\(a\.error, true, true\);/);
  assert.match(frame, /b\.textContent = '重试';/);
});

test("the editor tab's two failure lines: plain words, then 〔复制问题信息〕 when there is an error (JJ v2; was #112's small print)", () => {
  const frame = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  const Problem = require(path.join(PLUGIN, "problem-details.js"));
  const failureText = new Function("console", "window", "MontClipProblem", frame.slice(frame.indexOf("const COPY = {"), frame.indexOf("/** Put the copy button")) + "\nreturn failureText;")({ warn() { } }, { MontClipProblem: Problem }, Problem);
  const a = failureText("MontClip 没能打开这个任务的项目。", "could not open the task's project: {\"error\":\"x\"}", "PROTOCOL_ERROR");
  assert.equal(a.text, "MontClip 没能打开这个任务的项目。关掉这个页签再打开试试；还不行，点「复制问题信息」发给我们。");
  assert.deepEqual(a.problem, { code: "PROTOCOL_ERROR", error: "could not open the task's project: {\"error\":\"x\"}" }, "for the copy button, not the page");
  assert.equal(failureText("MontClip 没能启动。", "the MontClip engine did not start").text, "MontClip 没能启动。关掉这个页签再打开试试；还不行，点「复制问题信息」发给我们。");
  for (const none of [undefined, null, "", "  "])
    assert.deepEqual(failureText("MontClip 没能启动。", none), { text: "MontClip 没能启动。关掉这个页签再打开试试。", problem: null });
  assert.match(frame, /failureText\('MontClip 没能打开这个任务的项目。', b\.error, b\.code\)/);
  assert.match(frame, /failureText\('MontClip 没能启动。', a\.error, a\.code\)/);
});

test("the plugin's description: JJ's final words", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGIN, "ghost.json"), "utf8"));
  assert.equal(m.description, "在 Cindy 任务里打开 MontClip 剪辑器，跟聊天并排。直接跟 AI 说怎么剪本机的录像和音频：删一段、剪掉停顿、加字幕、调音量、降噪、导出 MP4。每一步都能撤销、重做，也能回到以前的版本。MontClip 在这台电脑上运行，会读写这台电脑上的文件。");
  assert.equal(m.whenToUse, "需要剪辑本机录像或音频时：删掉某段、剪掉停顿、按文字剪、加字幕、调音量、降噪、按节拍剪、导出 MP4；撤销或重做剪辑；查看或回到 MontClip 项目的某个版本；在这个任务里打开 MontClip 剪辑器。", "whenToUse unchanged");
});
