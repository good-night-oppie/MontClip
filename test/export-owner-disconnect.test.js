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
const { makeDataDir, launch, ROOT } = require("./helpers");
const FF = require("../server/ffmpeg-path");

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
  const app = fs.readFileSync(path.join(__dirname, "..", "app/app.js"), "utf8");
  const start = app.indexOf("async function webCodecsExport(");
  const end = app.indexOf("async function fastExport(", start);
  const body = app.slice(start, end > start ? end : start + 20000);
  assert.ok(start >= 0 && body.includes('mode: "annexb"'));
  assert.doesNotMatch(body, /opts.conn/, "webCodecsExport has no opts parameter");
  assert.match(body, /conn: \(typeof runtime !== "undefined" && runtime\.sseConn\)/);
});

test("an export begun while the editor closes is still cleaned", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 120000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token);
  const c = await connect(base, token, "tab-inflight");
  await claim(base, token, c.headers, c.conn, "task-owner-5");
  const pending = fetch(base + "/api/export/begin", {
    method: "POST", headers: { ...c.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fps: 30, frames: 30, profile: "prores422", name: "owner-inflight", hasAudio: false, conn: c.conn }),
  }).then((r) => r.json());
  c.ac.abort();
  try { await c.reader.cancel(); } catch { }
  const job = await pending;
  assert.ok(job.id, JSON.stringify(job));
  let now = 1;
  const until = Date.now() + 25000;
  while (Date.now() < until) { now = await active(base, token); if (now === 0) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(now, 0, "the session begun during the close is cleaned too");
});

/* MontClip#302: /api/export/begin snapshots the owner before its precheck (a dry run). A claim that lands while
   that precheck runs must still bind the tab, or the same-tab reconnect rule never matches this session. */
test("a claim during the precheck binds the tab, so closing the same tab again still cleans the export", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 180000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token, { MONTCLIP_TEST_BEGIN_DELAY_MS: "1500" });
  const a = await connect(base, token, "tab-late-claim");
  const pending = begin(base, a.headers, a.conn, "owner-late-claim");
  await new Promise((r) => setTimeout(r, 500));   // the begin request is inside its precheck now
  await claim(base, token, a.headers, a.conn, "task-owner-6");
  const job = await pending;
  assert.ok(job.id, JSON.stringify(job));
  a.ac.abort();
  try { await a.reader.cancel(); } catch { }
  const b = await connect(base, token, "tab-late-claim");
  await claim(base, token, b.headers, b.conn, "task-owner-6");
  await new Promise((r) => setTimeout(r, 20000));
  assert.equal(await active(base, token), 1, "the tab that claimed during the precheck keeps its export");
  b.ac.abort();
  try { await b.reader.cancel(); } catch { }
  let now = 1;
  const until = Date.now() + 25000;
  while (Date.now() < until) { now = await active(base, token); if (now === 0) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(now, 0, "closing that tab still cleans its export (session " + job.id + ")");
});

/* The snapshot is stale the other way too: the page claims and then closes while the precheck runs, so the close
   handler records the task first. begin must not replace that record with its older, taskless snapshot. */
test("a close after a claim during the precheck keeps the task, so a same-tab reconnect is not killed", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 180000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token, { MONTCLIP_TEST_BEGIN_DELAY_MS: "1500" });
  const a = await connect(base, token, "tab-claim-close");
  const pending = begin(base, a.headers, a.conn, "owner-claim-close");
  await new Promise((r) => setTimeout(r, 500));
  await claim(base, token, a.headers, a.conn, "task-owner-7");
  a.ac.abort();
  try { await a.reader.cancel(); } catch { }
  await new Promise((r) => setTimeout(r, 300));   // the close reaches the server while begin is still prechecking
  const job = await pending;
  assert.ok(job.id, JSON.stringify(job));
  const b = await connect(base, token, "tab-claim-close");
  await claim(base, token, b.headers, b.conn, "task-owner-7");
  await new Promise((r) => setTimeout(r, 20000));
  assert.equal(await active(base, token), 1, "the reconnected same tab keeps the export");
  b.ac.abort();
});

/* A precheck that outlasts the grace: the page claims, the tab closes and the same tab reconnects while begin still
   runs. By the time begin returns the grace record is gone, so the task has to come from the live connection object
   claim wrote it onto -- otherwise the fresh, taskless schedule deletes the reconnected tab's export. */
test("a precheck longer than the grace keeps the task from the claim: a same-tab reconnect keeps the export", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 180000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token, { MONTCLIP_TEST_BEGIN_DELAY_MS: "3200", MONTCLIP_OWNER_GRACE_MS: "1500" });
  const a = await connect(base, token, "tab-slow-precheck");
  await claim(base, token, a.headers, a.conn, "task-owner-8");
  const pending = begin(base, a.headers, a.conn, "owner-slow-precheck");
  await new Promise((r) => setTimeout(r, 400));   // begin is inside its precheck; the claim is already on the connection
  a.ac.abort();
  try { await a.reader.cancel(); } catch { }
  await new Promise((r) => setTimeout(r, 200));
  const b = await connect(base, token, "tab-slow-precheck");
  await claim(base, token, b.headers, b.conn, "task-owner-8");
  const job = await pending;
  assert.ok(job.id, JSON.stringify(job));
  await new Promise((r) => setTimeout(r, 3000));   // the fresh 1.5 s grace has run by now
  assert.equal(await active(base, token), 1, "the reconnected tab keeps an export whose begin outlasted the grace");
  b.ac.abort();
  try { await b.reader.cancel(); } catch { }
  let now = 1;
  const until = Date.now() + 15000;
  while (Date.now() < until) { now = await active(base, token); if (now === 0) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(now, 0, "closing that tab still cleans its export (session " + job.id + ")");
});

test("the background export page receives conn through the editor's start opts", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app/app.js"), "utf8");
  const start = app.indexOf("async function runBgExportHere(");
  const body = app.slice(start, start + 1200);
  assert.ok(start >= 0);
  assert.match(body, /conn: opts\.conn/);
  assert.match(app, /conn: \(opts && opts\.conn\) \|\|/);
});

/* MontClip-Cindy#79 matrix, "switch"/"dropNoRe": the editor's SSE connection is gone for longer than the grace, but the
   page still pushes frames for this export. Its export must survive; once the frames stop it is cleaned as before. */
const { execFileSync } = require("node:child_process");
function jpegFrame() {
  return execFileSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "color=c=gray:size=320x180", "-frames:v", "1", "-c:v", "mjpeg", "-f", "image2pipe", "-"], { windowsHide: true });
}
const pushFrame = (base, token, id, jpeg) => fetch(base + "/api/export/frame?id=" + id, { method: "POST", headers: { "X-MontClip-Session": token }, body: jpeg }).then((r) => r.status);

test("a closed connection whose page keeps pushing frames keeps its export; it is cleaned once the frames stop", { skip: !FF.available("ffmpeg") && "no ffmpeg here", timeout: 120000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token, { MONTCLIP_OWNER_GRACE_MS: "1500" });
  const jpeg = jpegFrame();
  const c = await connect(base, token, "tab-pushing");
  await claim(base, token, c.headers, c.conn, "task-owner-push");
  const job = await begin(base, c.headers, c.conn, "owner-pushing");
  c.ac.abort();
  try { await c.reader.cancel(); } catch { }
  // 6 s of frames, four times the grace: every one of them must be accepted
  const statuses = [];
  for (let i = 0; i < 15; i++) { statuses.push(await pushFrame(base, token, job.id, jpeg)); await new Promise((r) => setTimeout(r, 400)); }
  assert.deepEqual([...new Set(statuses)], [200], "frames keep being accepted after the grace: " + statuses.join(","));
  assert.equal(await active(base, token), 1, "the export is still there while the page pushes (session " + job.id + ")");
  // the page goes away: the export is cleaned within a few graces
  let now = 1;
  const until = Date.now() + 15000;
  while (Date.now() < until) { now = await active(base, token); if (now === 0) break; await new Promise((r) => setTimeout(r, 300)); }
  assert.equal(now, 0, "once frames stop, the closed connection's export is cleaned");
  // active is 0 the moment the session is dropped, but ffmpeg may still hold its files: they go once it has exited (up to 5 s)
  const left = () => fs.readdirSync(path.join(dir, "exports")).filter((n) => n.startsWith("fablecut-") || /\.part\./.test(n));
  const gone = Date.now() + 8000;
  let leftovers = left();
  while (leftovers.length && Date.now() < gone) { await new Promise((r) => setTimeout(r, 200)); leftovers = left(); }
  assert.deepEqual(leftovers, [], "its half-made files and folder go too");
});
