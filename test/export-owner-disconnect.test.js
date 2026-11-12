'use strict';
/* MontClip#302 follow-up: Cindy closes the whole editor tab by destroying its view, so the page gets no pagehide
   and its sendBeacon never leaves. The server does see the editor's SSE connection close. This test binds an export
   to that connection; after the connection goes away its export must be cleaned within 30 s, while a reconnect of
   the same task keeps it alive. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { makeDataDir, freePort, ROOT } = require("./helpers");
const FF = require("../ffmpeg-path");

async function launch(t, dir, token) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1",
      MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token },
  });
  let out = "";
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { out += c; });
  t.after(() => { try { child.kill(); } catch { } });
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(base + "/api/project", { headers: { "X-MontClip-Session": token } });
      if (r.status === 200) return base;
    } catch { }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("server did not start: " + out.slice(-2000));
}

async function connect(base, token, tabId) {
  const boot = await fetch(base + "/?token=" + token, { redirect: "manual" });
  const cookie = String(boot.headers.get("set-cookie") || "").split(";")[0];
  assert.ok(cookie, "a cookie session");
  const headers = { Cookie: cookie };
  const ac = new AbortController();
  const es = await fetch(base + "/api/events" + (tabId ? "?tabId=" + encodeURIComponent(tabId) : ""), { headers, signal: ac.signal });
  const reader = es.body.getReader();
  let buf = "", conn = null;
  while (!conn) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += Buffer.from(value).toString();
    const m = /event: conn\ndata: (.*)\n\n/.exec(buf);
    if (m) conn = JSON.parse(m[1]).conn;
  }
  assert.ok(conn, "the SSE connection id");
  return { headers, ac, reader, conn };
}
async function claim(base, token, headers, conn, session) {
  const ticket = await (await fetch(base + "/api/embed/ticket", { method: "POST", headers: { "Content-Type": "application/json", "X-MontClip-Session": token }, body: JSON.stringify({ project: "p_1", session }) })).json();
  const r = await fetch(base + "/api/embed/claim", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ticket: ticket.ticket, conn }) });
  assert.equal(r.status, 200);
}
const active = async (base, token) => (await (await fetch(base + "/api/export/active", { headers: { "X-MontClip-Session": token } })).json()).active;
async function begin(base, headers, conn, name) {
  const r = await fetch(base + "/api/export/begin", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ fps: 30, frames: 30, profile: "prores422", name, hasAudio: false, conn }) });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  return j;
}

test("a closed editor connection stops its own export within 30 s", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 120000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token);
  const c = await connect(base, token);
  await claim(base, token, c.headers, c.conn, "task-owner-1");
  const job = await begin(base, c.headers, c.conn, "owner-gone");
  assert.equal(await active(base, token), 1);
  c.ac.abort();
  try { await c.reader.cancel(); } catch { }
  const until = Date.now() + 27000;
  let now = 1;
  while (Date.now() < until) {
    now = await active(base, token);
    if (now === 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(now, 0, "the export of the closed connection is cleaned (session " + job.id + ")");
  const leftovers = fs.readdirSync(path.join(dir, "exports")).filter((n) => n.startsWith("fablecut-") || /\.part\./.test(n));
  assert.deepEqual(leftovers, [], "its half-made files and folder go too");
});

test("a same-task reconnect inside the grace keeps the running export", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 120000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token);
  const a = await connect(base, token);
  await claim(base, token, a.headers, a.conn, "task-owner-2");
  await begin(base, a.headers, a.conn, "owner-reconnect");
  a.ac.abort();
  try { await a.reader.cancel(); } catch { }
  const b = await connect(base, token);
  await claim(base, token, b.headers, b.conn, "task-owner-2");
  await new Promise((r) => setTimeout(r, 20000));
  assert.equal(await active(base, token), 1, "the export is not killed when its task reconnected");
  b.ac.abort();
});

test("the same tab reconnects, then closes: its export is cleaned then", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 120000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token);
  const a = await connect(base, token, "tab-same");
  await claim(base, token, a.headers, a.conn, "task-owner-3");
  await begin(base, a.headers, a.conn, "owner-same-tab");
  a.ac.abort();
  try { await a.reader.cancel(); } catch { }
  const b = await connect(base, token, "tab-same");
  await claim(base, token, b.headers, b.conn, "task-owner-3");
  await new Promise((r) => setTimeout(r, 20000));
  assert.equal(await active(base, token), 1, "the reconnect of the same tab keeps it");
  b.ac.abort();
  try { await b.reader.cancel(); } catch { }
  let now = 1;
  const until = Date.now() + 25000;
  while (Date.now() < until) { now = await active(base, token); if (now === 0) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(now, 0, "closing the reconnected tab still cleans its export");
});

test("a new tab of the same task does not save the closed tab's export", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 120000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token);
  const a = await connect(base, token, "tab-old");
  await claim(base, token, a.headers, a.conn, "task-owner-4");
  await begin(base, a.headers, a.conn, "owner-old-tab");
  a.ac.abort();
  try { await a.reader.cancel(); } catch { }
  const b = await connect(base, token, "tab-new");
  await claim(base, token, b.headers, b.conn, "task-owner-4");
  let now = 1;
  const until = Date.now() + 25000;
  while (Date.now() < until) { now = await active(base, token); if (now === 0) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(now, 0, "the old tab's export is not kept alive by another tab of the same task");
  b.ac.abort();
});

test("webCodecsExport never reads opts: it uses runtime.sseConn only", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const start = app.indexOf("async function webCodecsExport(");
  const end = app.indexOf("async function fastExport(", start);
  const body = app.slice(start, end > start ? end : start + 20000);
  assert.ok(start >= 0 && body.includes('mode: "annexb"'));
  assert.doesNotMatch(body, /opts.conn/, "webCodecsExport has no opts parameter");
  assert.match(body, /conn: \(typeof runtime !== "undefined" && runtime\.sseConn\)/);
});
