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
function logicPage({ editorOpen = false } = {}) {
  const calls = [], sent = [], views = [], channels = [];
  let handler = null;
  const cindy = {
    node: { request: async (r) => {
      calls.push([r.method, plain(r.params)]);
      if (r.method === "montclip/start") return { ok: true, result: { origin: "http://127.0.0.1:1", url: "http://127.0.0.1:1/?host=cindy&token=" + "a".repeat(64), ffmpeg: "missing" } };
      if (r.method === "montclip/ui") return { ok: true, result: editorOpen ? { status: 200, undo: 1 } : { status: 409, code: "NO_EDITOR" } };
      if (r.method === "montclip/bind") return { ok: true, result: { project: "p_1", name: "任务的项目" } };
      if (r.method === "montclip/tools") return { ok: true, result: { tools: [{ name: "fablecut_get_project", inputSchema: {} }] } };
      if (r.method === "montclip/call") return { ok: true, result: { text: "ok" } };
      if (r.method === "montclip/overview") return { ok: true, result: { projects: [], exports: [] } };
      return { ok: false, message: "unexpected " + r.method };
    } },
    send: async (m) => { sent.push(plain(m)); return { ok: true }; },
    onHostMessage: (fn) => { handler = fn; },
    taskView: async (o) => { views.push(plain(o)); return { ok: true, sessionId: o.sessionId }; },
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
