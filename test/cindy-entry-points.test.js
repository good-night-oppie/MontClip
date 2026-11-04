/* Ways into the editor in Cindy: the status card's button, the task the chat is in (sessionContext), and the main view
   as an overview across tasks. main.js runs here in a sandbox with a stand-in `cindy`, the way Cindy's logic page
   runs it. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const { ROOT, seedProject } = require("./helpers");
const PLUGIN = path.join(ROOT, "plugins", "montclip-cindy");
const V = require(path.join(PLUGIN, "main-view-model.js"));

// objects made inside the sandbox have its own prototypes: compare them as data
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
function logicPage({ editorOpen = false, ffmpeg = "missing", taskView = null } = {}) {
  const calls = [], sent = [], views = [], channels = [];
  let handler = null;
  const cindy = {
    node: { request: async (r) => {
      calls.push([r.method, plain(r.params)]);
      if (r.method === "montclip/start") return { ok: true, result: { origin: "http://127.0.0.1:1", url: "http://127.0.0.1:1/?host=cindy&token=" + "a".repeat(64), ffmpeg } };
      if (r.method === "montclip/ui") return { ok: true, result: editorOpen ? { status: 200, undo: 1 } : { status: 409, code: "NO_EDITOR" } };
      if (r.method === "montclip/bind") return { ok: true, result: { project: "p_1", name: "任务的项目" } };
      if (r.method === "montclip/tools") return { ok: true, result: { tools: [{ name: "fablecut_get_project", inputSchema: {} }] } };
      if (r.method === "montclip/call") return { ok: true, result: { text: "ok" } };
      if (r.method === "montclip/overview") return { ok: true, result: { projects: [], exports: [] } };
      return { ok: false, message: "unexpected " + r.method };
    } },
    send: async (m) => { sent.push(plain(m)); return { ok: true }; },
    onHostMessage: (fn) => { handler = fn; },
    taskView: async (o) => { views.push(plain(o)); return taskView || { ok: true, sessionId: o.sessionId }; },
  };
  class BroadcastChannel { constructor() { channels.push(this); this.posted = []; } postMessage(m) { this.posted.push(plain(m)); } }
  vm.runInNewContext(fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8"), { cindy, BroadcastChannel, setTimeout, clearTimeout, console, Map, Promise });
  return {
    calls, sent, views, channel: () => channels[0],
    tool: async (tool, args = {}, session = "task-a") => {
      await handler({ type: "tool-call", callId: "call-1", tool, args: { ...args, session_context: { session_id: session, workdir: null, workdir_is_local: true } } });
      return sent.filter((m) => m.type === "tool-result").at(-1);
    },
    event: (m) => handler({ type: "event", ...m }),
    page: async (m) => { await channels[0].onmessage({ data: m }); return channels[0].posted.at(-1); },
  };
}

test("a tool call works on the project of the task the chat is in: bind first, then the tool", async () => {
  const p = logicPage();
  const r = await p.tool("call_tool", { name: "fablecut_get_project", args: { compact: true } }, "task-b");
  assert.equal(r.ok, true);
  const order = p.calls.map((c) => c[0]);
  assert.ok(order.indexOf("montclip/bind") < order.indexOf("montclip/call"), order.join(" → "));
  assert.deepEqual(p.calls.find((c) => c[0] === "montclip/bind")[1], { session: "task-b" });
  assert.deepEqual(p.calls.find((c) => c[0] === "montclip/call")[1].arguments, { compact: true }, "session_context is not passed on to the engine");
  for (const t of ["montclip_undo", "montclip_redo"]) {
    const before = p.calls.length;
    await p.tool(t, {}, "task-c");
    assert.deepEqual(p.calls.slice(before).map((c) => c[0]), ["montclip/bind", "montclip/ui"]);
  }
});

test("status card: a button opens the editor in this task when it is not open; none when it is", async () => {
  const closed = logicPage();
  await closed.tool("montclip_status");
  const card = closed.sent.find((m) => m.type === "card-update");
  assert.match(card.html, /<button data-ghost-action="open-editor"[^>]*>在这个任务里打开剪辑器<\/button>/);
  assert.match(card.html, /任务的项目/);
  assert.doesNotMatch(card.html, /<script|<[^>]*\son\w+=|token=/i, "no script, and never the editor's session token");
  const r = closed.sent.find((m) => m.type === "tool-result");
  assert.doesNotMatch(JSON.stringify(r.result), /token=/);
  // the click comes back as a card action, in the card's own task
  await closed.event({ name: "card-action", actionId: "open-editor", callId: "call-1", sessionId: "task-a" });
  assert.deepEqual(closed.views.at(-1), { sessionId: "task-a" });
  assert.match(closed.sent.at(-1).html, /剪辑器已在右侧栏打开/);

  const open = logicPage({ editorOpen: true });
  await open.tool("montclip_status");
  assert.doesNotMatch(open.sent.find((m) => m.type === "card-update").html, /data-ghost-action/);
});

test("montclip_open_task_view opens in the chat's own task, not whichever task is in front", async () => {
  const p = logicPage();
  await p.tool("montclip_open_task_view", {}, "task-z");
  assert.deepEqual(p.views.at(-1), { sessionId: "task-z" });
  await p.tool("montclip_open_task_view", { sessionId: "task-y" }, "task-z");
  assert.deepEqual(p.views.at(-1), { sessionId: "task-y" });
});

test("main view: the overview comes from the worker; its button opens that task and goes there", async () => {
  const p = logicPage();
  const o = await p.page({ reqId: "r1", type: "overview" });
  assert.deepEqual([o.answer, o.projects], [true, []]);
  await p.page({ reqId: "r2", type: "open-task", session: "task-q" });
  assert.deepEqual(p.views.at(-1), { sessionId: "task-q", focus: true });
});

test("overview rows: newest first, each with its task, sizes and lengths readable", () => {
  const rows = V.projectRows({ projects: [
    { id: "p_a", name: "旧", modified: "2026-11-01T10:00:00Z", clips: 2, duration: 75, task: "t1" },
    { id: "p_b", name: "新", modified: "2026-11-04T08:30:00Z", clips: 0, duration: 0, task: null } ] });
  assert.deepEqual(rows.map((r) => [r.name, r.action]), [["新", null], ["旧", "open-task"]]);
  assert.equal(rows[1].meta, "2 段 · 1:15 · 2026-11-01 10:00");
  assert.deepEqual(V.exportRows({ exports: [{ name: "a.mp4", bytes: 2 * 1048576, modified: "2026-11-04T09:00:00Z" }, { name: "b.mov", bytes: 3 * 1073741824 }] }).map((e) => e.meta),
    ["2.0 MB · 2026-11-04 09:00", "3.0 GB"]);
});

test("manifest: the main view is an overview page (no sidebar placement), tool calls carry their task", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGIN, "ghost.json"), "utf8"));
  assert.deepEqual(m.mainView, { title: "MontClip", icon: "image", html: "main-view.html" });
  assert.equal(m.sessionContext, true);
  for (const f of ["main-view.html", "main-view.js", "main-view-model.js", "main-view.css"]) assert.ok(fs.existsSync(path.join(PLUGIN, f)), f);
  assert.match(fs.readFileSync(path.join(PLUGIN, "main-view.html"), "utf8"), /「更多」→「自定义」/);
  for (const t of m.tools) assert.ok(!("session_context" in (t.parameters.properties || {})), t.name + ": the host fills it in");
});

test("worker overview: every project with the task it belongs to, and the exported files", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ov-"));
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(seedProject({ name: "第一个" })));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, [path.join(PLUGIN, "node", "worker.cjs")], {
    env: { ...process.env, MONTCLIP_CINDY_APP: ROOT, MONTCLIP_CINDY_DATA: dir, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" }, stdio: ["pipe", "pipe", "ignore"] });
  t.after(() => new Promise((r) => { if (child.exitCode !== null) return r(); child.once("exit", r); child.kill(); }));
  let buf = "", n = 0; const pend = new Map();
  child.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
  const rpc = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const a = (await rpc("montclip/bind", { session: "task-one" })).result;
  const b = (await rpc("montclip/bind", { session: "task-two" })).result;
  fs.mkdirSync(path.join(dir, "exports"), { recursive: true });
  fs.writeFileSync(path.join(dir, "exports", "cut.mp4"), Buffer.alloc(1024));
  fs.writeFileSync(path.join(dir, "exports", "half.mp4.part"), "x");
  const o = (await rpc("montclip/overview")).result;
  const task = Object.fromEntries(o.projects.map((p) => [p.id, p.task]));
  assert.deepEqual([task[a.project], task[b.project]], ["task-one", "task-two"]);
  assert.deepEqual(o.exports.map((e) => [e.name, e.bytes]), [["cut.mp4", 1024]], "half-copied files are not listed");
});

test("file sizes: bytes under 1 KB, then KB, MB, GB — never 0.0 MB", () => {
  assert.deepEqual([0, 512, 900 * 1024, 1.5 * 1048576, 2.3 * 1073741824].map(V.size), ["0 字节", "512 字节", "900 KB", "1.5 MB", "2.3 GB"]);
  assert.deepEqual([1023, 1024, 1048575, 1048576, 1073741824].map(V.size), ["1023 字节", "1 KB", "1.0 MB", "1.0 MB", "1.0 GB"]);
  assert.equal(V.exportRows({ exports: [{ name: "a.srt", bytes: 2048 }] })[0].meta, "2 KB", "an exported subtitle file is not 0.0 MB");
});

/* JJ's final words for the overview and the status card (2026-11-04), word for word */
const shown = (html) => html.replace(/<[^>]+>/g, "\n").split("\n").map((x) => x.trim()).filter(Boolean);

test("main view in JJ's words: the lead, no projects yet, where the exports are", () => {
  const page = fs.readFileSync(path.join(PLUGIN, "main-view.html"), "utf8");
  assert.ok(page.includes('<p class="lead">每个任务有自己的剪辑项目：在任务里打开剪辑器，它就在聊天旁边。这里列出所有任务的项目和导出的文件。</p>'));
  assert.ok(page.includes(">还没有项目。在一个任务里跟 AI 说「打开剪辑器」就行。</p>"));
  assert.ok(page.includes("<span>左侧导航「更多」→「自定义」，把 MontClip 拖到导航上。以后从导航一点就到这里。</span>"), "the pin hint: unchanged");
});

/* VV (2026-11-04): where the exports are is a sentence and 打开文件夹; the full path is only in the button's hover
   text. Whether the sentence names the path waits for JJ (for now JJ's sentence without it). */
test("main view: where the exports are — a sentence, 打开文件夹, the full path in its hover text only", () => {
  const sentence = "导出的文件都在 MontClip 自己的导出文件夹里。在聊天里让 AI 导出时，会先请你选一个文件夹，再另存一份到那里。";
  assert.deepEqual(V.exportsWhere("C:\\Users\\me\\FableCut"), { text: sentence, path: "C:\\Users\\me\\FableCut\\exports" });
  assert.deepEqual(V.exportsWhere("/home/me/FableCut/"), { text: sentence, path: "/home/me/FableCut/exports" }, "the folder's own separator");
  assert.deepEqual(V.exportsWhere(""), { text: "", path: "" });
  assert.doesNotMatch(V.exportsWhere("C:\\Users\\me\\FableCut").text, /Users|FableCut|exports/, "no path in the sentence");
  const page = fs.readFileSync(path.join(PLUGIN, "main-view.html"), "utf8");
  assert.match(page, /<p class="hint" id="exportsWhere"><\/p>\n\s+<button type="button" id="openExports" hidden>打开文件夹<\/button>/);
  const js = fs.readFileSync(path.join(PLUGIN, "main-view.js"), "utf8");
  assert.match(js, /\$\('openExports'\)\.title = where\.path;/);
  assert.match(js, /const r = await ask\('open-folder'\);\n\s+if \(r\.error\) fail\(V\.FAILED\.openFolder\(r\.error\)\);/);
  assert.deepEqual(V.FAILED.openFolder("FOLDER_NOT_ALLOWED"), { text: "没能打开导出文件夹。再点一次试试；还不行，把下面这行发给我们：", detail: "FOLDER_NOT_ALLOWED" });
});

test("main view: 打开文件夹 asks the worker for MontClip's exports folder, whatever the page sends", async () => {
  const p = logicPage();
  await p.page({ reqId: "o1", type: "open-folder" });
  await p.page({ reqId: "o2", type: "open-folder", folder: "C:\\Windows" });
  assert.deepEqual(p.calls.filter((c) => c[0] === "montclip/open-folder").map((c) => c[1]), [{ folder: "exports" }, { folder: "exports" }]);
});

test("main view failures in JJ's words: the error on a small line of its own, and no second half without one", () => {
  assert.deepEqual(V.FAILED.load("EACCES: permission denied"),
    { text: "MontClip 没能读取项目。关掉这页再打开试试；还不行，把下面这行发给我们：", detail: "EACCES: permission denied" });
  assert.deepEqual(V.FAILED.load(""), { text: "MontClip 没能读取项目。关掉这页再打开试试。", detail: "" });
  assert.deepEqual(V.FAILED.openTask("SESSION_NOT_FOUND"),
    { text: "没能打开这个任务。这个任务可能已经删掉了；还不行，把下面这行发给我们：", detail: "SESSION_NOT_FOUND" });
  assert.deepEqual(V.FAILED.openTask(undefined), { text: "没能打开这个任务。这个任务可能已经删掉了。", detail: "" });
  const js = fs.readFileSync(path.join(PLUGIN, "main-view.js"), "utf8");
  assert.match(js, /if \(o\.error\) \{ fail\(V\.FAILED\.load\(o\.error\)\); return; \}/);
  assert.match(js, /if \(!r\.ok\) fail\(V\.FAILED\.openTask\(r\.message \|\| r\.errorCode \|\| r\.error\)\);/);
  assert.match(js, /\$\('statusDetail'\)\.textContent = f\.detail; \$\('statusDetail'\)\.hidden = !f\.detail;/, "the error as text, never as HTML");
  for (const keep of ["'在任务中打开'", "' · 没有对应的任务'"]) assert.ok(js.includes(keep), keep);
});

test("status card in JJ's words: 导出组件（ffmpeg） and its three states", async () => {
  const states = { missing: "还没装（导出、降噪要用）", downloaded: "已装好", changed: "文件被改过，建议重新安装" };
  for (const [ffmpeg, words] of Object.entries(states)) {
    const p = logicPage({ ffmpeg });
    await p.tool("montclip_status");
    const lines = shown(p.sent.find((m) => m.type === "card-update").html);
    const i = lines.indexOf("导出组件（ffmpeg）");
    assert.deepEqual(lines.slice(i, i + 2), ["导出组件（ffmpeg）", words]);
    assert.ok(lines.includes("在这个任务里打开剪辑器"));
  }
});

test("status card button: opened, or JJ's failure words with the error on a small line, escaped", async () => {
  const ok = logicPage();
  await ok.event({ name: "card-action", actionId: "open-editor", callId: "c", sessionId: "task-a" });
  assert.deepEqual(shown(ok.sent.at(-1).html), ["剪辑器已在右侧栏打开。"]);
  const bad = logicPage({ taskView: { ok: false, errorCode: "TASK_VIEW_UNAVAILABLE", message: '<b>"gone"</b>' } });
  await bad.event({ name: "card-action", actionId: "open-editor", callId: "c", sessionId: "task-a" });
  const html = bad.sent.at(-1).html;
  assert.deepEqual(shown(html), ["没能打开剪辑器。再点一次试试；还不行，把下面这行发给我们：", "&lt;b&gt;&quot;gone&quot;&lt;/b&gt;"]);
  assert.match(html, /font-size:12px/, "the error is the small line");
  const none = logicPage({ taskView: { ok: false } });
  await none.event({ name: "card-action", actionId: "open-editor", callId: "c", sessionId: "task-a" });
  assert.deepEqual(shown(none.sent.at(-1).html), ["没能打开剪辑器。再点一次试试。"]);
});
