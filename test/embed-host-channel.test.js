/* E3 (MontClip#215, QQ issuecomment-6726997672, option ①): inside Cindy the plugin's side panel (文稿 / 属性) and a
   task's editor talk over a BroadcastChannel. Every page of the engine's origin shares BroadcastChannel names, and one
   engine serves every task's editor, so the channel is named per task: "montclip-editor:<channel>", where channel is
   an HMAC of {project, session} under a key drawn when the engine starts. A page gets it only by trading a one-time
   task ticket: the editor in its /api/embed/claim answer, the panel from POST /api/embed/channel. No channel, no
   BroadcastChannel (never the shared name). The messages carry no identity, and the channel never reaches a log line
   or an error text. Synthetic data only; no browser. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createEmbed, TASK_TICKET_MS } = require("../server/embed");
const { toolError } = require("../server/tool-error");
const { redactProblem } = require("../problem-redact");
const { makeDataDir, freePort, endTree } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const hex = () => crypto.randomBytes(32).toString("hex");
const CHANNEL_RE = /^[a-f0-9]{32}$/;

/* ── the suffix (embed.js) ── */

test("a task's channel: 128 bits of an HMAC of its project and session, under a key of this engine's own", () => {
  let clock = 1_000_000;
  const e = createEmbed({ token: hex(), hostAllowed: () => true, now: () => clock });
  const A = { project: "p_a", session: "task-A" };
  const a = e.channelFor(A);
  assert.match(a, CHANNEL_RE);
  assert.equal(e.channelFor({ ...A }), a, "the same task: the same channel, for its editor and its panel");
  assert.notEqual(e.channelFor({ project: "p_a", session: "task-B" }), a, "another task");
  assert.notEqual(e.channelFor({ project: "p_b", session: "task-A" }), a, "the same session on another project");
  // "\0" between the two can't be faked: a task's ids never hold one (taskTicket refuses them)
  for (const bad of [{ project: "p_a\0task", session: "-A" }, { project: "p_a", session: "task\0-A" }])
    assert.throws(() => e.taskTicket(bad), (err) => err.code === 400);
  const token = hex();
  const one = createEmbed({ token, hostAllowed: () => true }), two = createEmbed({ token, hostAllowed: () => true });
  assert.notEqual(one.channelFor(A), two.channelFor(A), "the key is drawn when the engine starts, not taken from the embed token");
  assert.ok(!one.channelFor(A).includes(token.slice(0, 32)) && !token.includes(one.channelFor(A)));
  // the panel's way: a one-time task ticket, used up; reused, expired or another engine's: nothing
  const t1 = e.taskTicket(A).ticket;
  assert.equal(e.redeemChannel(t1), a);
  assert.equal(e.redeemChannel(t1), null, "used once");
  const t2 = e.taskTicket(A).ticket;
  clock += TASK_TICKET_MS;
  assert.equal(e.redeemChannel(t2), null, "expired");
  assert.equal(e.redeemChannel(one.taskTicket(A).ticket), null, "another engine's");
  for (const bad of [undefined, null, "", hex(), 7, { ticket: t1 }]) assert.equal(e.redeemChannel(bad), null, String(bad));
});

/* ── the editor (app.js startHostChannel) ── */

function hostChannel(env0 = {}) {
  const SRC = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const i = SRC.indexOf("function startHostChannel("), j = SRC.indexOf("\n}\n", i) + 3;
  assert.ok(i > 0, "app.js has startHostChannel");
  const channels = [], timers = [];
  class FakeChannel {
    constructor(name) { this.name = name; this.posted = []; this.closed = false; channels.push(this); }
    postMessage(m) { this.posted.push(m); }
    close() { this.closed = true; }
  }
  const state = { time: 1.234, playing: false, selId: "c1" };
  const env = { BroadcastChannel: FakeChannel, runtime: { projectId: "p_secret_project" }, state, project: { revision: 4 },
    setTime: (t) => { state.time = t; }, projDur: () => 60, setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: (n) => { timers[n - 1] = null; }, ...env0 };
  const names = Object.keys(env);
  const start = new Function(...names, SRC.slice(i, j) + "\nreturn startHostChannel;")(...names.map((k) => env[k]));
  const tick = () => timers.forEach((f) => f && f());
  return { start, channels, state, tick, runtime: env.runtime };
}

test("editor: no channel suffix, no channel — never the shared name (fail-closed, QQ 3)", () => {
  const h = hostChannel();
  for (const bad of [undefined, null, "", "montclip-editor", "A".repeat(32), "a".repeat(31), "a".repeat(33), "../x", 7])
    h.start(bad);
  assert.equal(h.channels.length, 0);
});

test("editor: it tells its own task's panel where the playhead is, takes its seeks, and says nothing about who it is", () => {
  const sfx = "a".repeat(32), h = hostChannel();
  h.start(sfx);
  assert.equal(h.channels.length, 1);
  const ch = h.channels[0];
  assert.equal(ch.name, "montclip-editor:" + sfx);
  assert.deepEqual(ch.posted.at(-1), { type: "editor-state", time: 1.23, playing: false, selId: "c1", revision: 4 });
  const sent = JSON.stringify(ch.posted);
  assert.ok(!sent.includes("p_secret_project") && !sent.includes(sfx), "no project, session, ticket or channel in a message (QQ 5)");
  h.tick(); h.tick(); h.tick(); assert.equal(ch.posted.length, 1, "nothing changed: nothing sent at once");
  h.tick(); assert.equal(ch.posted.length, 2, "but once a second anyway, so the panel knows the editor is still open");
  h.state.time = 2; h.tick(); assert.equal(ch.posted.at(-1).time, 2);
  ch.onmessage({ data: { type: "seek", t: 90 } });
  assert.equal(h.state.time, 60, "kept inside the timeline");
  assert.equal(ch.posted.at(-1).time, 60);
  // a message of the wrong shape is dropped
  for (const m of [{ type: "seek", t: -5 }, { type: "seek", t: "3" }, { type: "seek", t: NaN }, { type: "seek", t: 3, session: "task-B" },
    { type: "seek", t: 3, project: "p" }, [{ type: "seek", t: 3 }], "seek", null, { type: "Seek", t: 3 }, { type: "hello", ticket: "x" }])
    ch.onmessage({ data: m });
  assert.equal(h.state.time, 60);
  const n = ch.posted.length;
  ch.onmessage({ data: { type: "hello" } });
  assert.equal(ch.posted.length, n + 1, "a panel that opens later gets the state at once");
  // a reconnect claims the same task again: the same channel stays; another suffix replaces it
  h.start(sfx);
  assert.equal(h.channels.length, 1);
  h.start("b".repeat(32));
  assert.equal(h.channels.length, 2);
  assert.ok(ch.closed, "the old channel is closed");
  assert.equal(h.runtime.hostChannel, h.channels[1]);
});

test("editor: the channel comes from the claim answer, not from the address or the page's own guess", () => {
  const SRC = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const conn = SRC.slice(SRC.indexOf('es.addEventListener("conn"'), SRC.indexOf('es.addEventListener("versions"'));
  assert.match(conn, /\/api\/embed\/claim/);
  assert.match(conn, /startHostChannel\(\w+\.channel\)/, "the claim's answer opens the channel");
  assert.equal((SRC.match(/startHostChannel\(/g) || []).length, 2, "defined once, called from the claim only");
  assert.doesNotMatch(SRC, /new BroadcastChannel\("montclip-editor"\)/, "the shared name is gone");
  assert.doesNotMatch(SRC.slice(SRC.indexOf("function startHostChannel("), SRC.indexOf("function keepPlayheadOnLeave")), /console\.|location|history/);
});

/* ── over HTTP: one embedded engine, tasks A and B on the same port (#251's A/B) ── */

async function engine(t, { embedded = true } = {}) {
  let stop = () => { };
  t.after(() => stop());
  const token = hex(), port = await freePort(), dir = makeDataDir(t);
  let out = "";
  const child = spawn(process.execPath, [path.join(ROOT, "server/server.js")], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1",
      FABLECUT_CHROME: path.join(dir, "no-such-browser"), MONTCLIP_DESKTOP: "",
      ...(embedded ? { MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token } : { MONTCLIP_HOST: "", MONTCLIP_EMBED_TOKEN: "" }) },
  });
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { out += c; });
  const exited = new Promise((r) => child.on("exit", r));
  stop = async () => { endTree(child); await exited; };
  const base = `http://127.0.0.1:${port}`, worker = embedded ? { "X-MontClip-Session": token } : {};
  for (let i = 0; i < 400; i++) {
    try { if ((await fetch(base + "/api/project", { headers: worker })).status === 200) break; } catch { }
    await new Promise((r) => setTimeout(r, 50));
  }
  let page = {};
  if (embedded) {
    const boot = await fetch(base + "/?token=" + token, { redirect: "manual" });
    page = { Cookie: boot.headers.get("set-cookie").split(";")[0] };
  }
  const project = (await call(base, "/api/projects", undefined, embedded ? worker : {})).body.active;
  return { base, worker, page, project, out: () => out };
}
const call = (base, p, body, headers = {}) => fetch(base + p, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
async function stream(t, s) {
  const seen = { conn: null };
  let buf = "";
  const req = http.get(s.base + "/api/events", { headers: s.page }, (res) => {
    res.setEncoding("utf8");
    res.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: conn$/m.test(block)) seen.conn = JSON.parse(/^data: (.*)$/m.exec(block)[1]).conn;
      }
    });
  });
  req.on("error", () => { });
  t.after(() => req.destroy());
  for (let i = 0; i < 100 && !seen.conn; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(seen.conn);
  return seen;
}
const ticketFor = async (s, session, project = s.project) => (await call(s.base, "/api/embed/ticket", { project, session }, s.worker)).body.ticket;

test("over HTTP: A's editor and A's panel get the same channel, B's another; the panel's ticket binds nothing", async (t) => {
  const s = await engine(t);
  const edA = await stream(t, s), edB = await stream(t, s);
  const a = await call(s.base, "/api/embed/claim", { ticket: await ticketFor(s, "task-A"), conn: edA.conn }, s.page);
  const b = await call(s.base, "/api/embed/claim", { ticket: await ticketFor(s, "task-B"), conn: edB.conn }, s.page);
  assert.equal(a.status, 200); assert.equal(a.body.bound, true); assert.match(a.body.channel, CHANNEL_RE);
  assert.equal(b.status, 200); assert.match(b.body.channel, CHANNEL_RE);
  assert.notEqual(a.body.channel, b.body.channel, "B's page cannot name A's channel");
  const panelA = await call(s.base, "/api/embed/channel", { ticket: await ticketFor(s, "task-A") }, s.page);
  assert.equal(panelA.status, 200);
  assert.deepEqual(panelA.body, { channel: a.body.channel }, "only the channel");
  // the panel's ticket gave it no UI commands: task C has no editor, and the panel did not become one
  assert.equal((await call(s.base, "/api/embed/channel", { ticket: await ticketFor(s, "task-C") }, s.page)).status, 200);
  assert.equal((await call(s.base, "/api/ui/command", { cmd: "state", session: "task-C" }, s.worker)).status, 409);
  // forged, reused, expired-by-use and another project's tickets: 403 and no channel
  const used = await ticketFor(s, "task-A");
  assert.equal((await call(s.base, "/api/embed/channel", { ticket: used }, s.page)).status, 200);
  for (const bad of [used, hex(), "", undefined]) {
    const r = await call(s.base, "/api/embed/channel", { ticket: bad }, s.page);
    assert.equal(r.status, 403, String(bad));
    assert.equal(r.body.code, "TASK_TICKET_REFUSED");
    assert.equal(r.body.channel, undefined);
  }
  // the same session on another project is another task
  const other = await call(s.base, "/api/embed/channel", { ticket: await ticketFor(s, "task-A", "p_other") }, s.page);
  assert.notEqual(other.body.channel, a.body.channel);
  // without the cookie or the worker's header, the gate refuses before any ticket is looked at
  assert.equal((await call(s.base, "/api/embed/channel", { ticket: await ticketFor(s, "task-A") })).status, 403);
  // no channel in the engine's output
  for (const c of [a.body.channel, b.body.channel, panelA.body.channel]) assert.ok(!s.out().includes(c), "stdout");
});

test("not embedded (the desktop app): no task channels at all", async (t) => {
  const s = await engine(t, { embedded: false });
  const r = await call(s.base, "/api/embed/channel", { ticket: hex() });
  assert.notEqual(r.status, 200);
  assert.equal(r.body?.channel, undefined);
});

/* ── the channel never leaves in a message (QQ 4) ── */

test("a channel in an error is hidden like a ticket: by its key, and as a 32-hex value after channel= / channel:", () => {
  const c = crypto.randomBytes(16).toString("hex");
  assert.deepEqual(toolError({ error: { channel: c, code: "X" } }), { error: { channel: "…", code: "X" } });
  for (const m of ["claim answered {\"bound\":true,\"channel\":\"" + c + "\"}", "channel=" + c, "channel: " + c]) {
    assert.ok(!JSON.stringify(toolError({ error: m })).includes(c), "tool error: " + m.slice(0, 20));
    assert.ok(!redactProblem(m).includes(c), "copied problem details: " + m.slice(0, 20));
  }
  // an ordinary channel word stays readable (templates.js, audio)
  const t = "preset p: keys is {channel: [{t, v, ease?}, …]}";
  assert.equal(toolError({ error: t }).error, t);
  assert.equal(redactProblem("audio channel: 2"), "audio channel: 2");
});
