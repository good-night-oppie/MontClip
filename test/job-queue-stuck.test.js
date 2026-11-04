/* A job handed to an editor tab that stops answering must not hold the one-job queue.

   Reported from the Cindy plugin: an export sat at 11% in a tab that was in the background, then every retry —
   headless too — was refused with 409 "scope reading x_… is still …" while two frame readings sat on that tab.
   The queue allows one unfinished job; a tab that claimed a job and went quiet (throttled, minimized, paused)
   held it until the 120 s stall limit, the MCP call that started it cancelled it only on its own deadline, and the
   409 did not say how to free it. Synthetic tabs and a fake clock only — no browser, no keys. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const J = require("../export-jobs");
const V = require("../ui-preferences");
const { makeDataDir, seedProject, startServer, startMcp } = require("./helpers");

const ROOT = path.join(__dirname, "..");

/* The queue with a clock the test moves, and one "open tab" that never does anything. */
function queue({ allowHeadless = true, editors = 1 } = {}) {
  let now = 1_000_000;
  const sent = [];
  const jobs = J.createExportJobs({ allowHeadless, editors: () => editors, url: () => "http://127.0.0.1:1", broadcast: (ev, data) => sent.push(JSON.parse(data)), now: () => now });
  return { jobs, sent, tick: (ms) => { now += ms; }, done: () => jobs.shutdown() };
}
const refusal = (fn) => { try { fn(); } catch (e) { return e; } assert.fail("expected a refusal"); };

test("a tab that claims a job and never reports frees the queue within the limit", () => {
  const q = queue();
  try {
    const first = q.jobs.request({ kind: "scopes", image: true });
    assert.equal(first.via, "tab");
    assert.ok(q.jobs.claim(first.id), "the tab takes it…");
    q.tick(J.TAB_SILENT_MS - 1000);
    assert.equal(q.jobs.get(first.id).status, "running", "…and is given the limit to answer");
    assert.equal(refusal(() => q.jobs.request({})).code, 409);

    q.tick(2000);   // past the limit; no sweep tick has run on this clock — request() must look for itself
    const next = q.jobs.request({});
    assert.equal(next.status, "pending", "a following export is accepted");
    const old = q.jobs.get(first.id);
    assert.equal(old.status, "failed");
    assert.equal(old.code, "EDITOR_STOPPED_ANSWERING");
    assert.match(old.error, /stopped answering/);
    assert.match(old.error, /where:"headless"/, "the web editor may retry in a headless browser");
  } finally { q.done(); }
});

test("a tab offered a job that never claims it frees the queue too", () => {
  const q = queue();
  try {
    const first = q.jobs.request({ kind: "scopes" });
    q.tick(J.TAB_SILENT_MS + 1000);
    assert.equal(q.jobs.request({}).status, "pending");
    assert.equal(q.jobs.get(first.id).status, "failed");
  } finally { q.done(); }
});

test("a tab that keeps answering keeps its job; the limit runs from its last report", () => {
  const q = queue();
  try {
    const j = q.jobs.request({});
    q.jobs.claim(j.id);
    for (let i = 0; i < 12; i++) { q.tick(5000); assert.deepEqual(q.jobs.report(j.id, {}), { cancel: false }, "a heartbeat"); }
    q.jobs.sweep();
    assert.equal(q.jobs.get(j.id).status, "running", "a minute of heartbeats is a working tab");
    q.tick(J.TAB_SILENT_MS + 1);
    q.jobs.sweep();
    assert.equal(q.jobs.get(j.id).status, "failed");
    assert.deepEqual(q.jobs.report(j.id, { progress: 0.2 }), { cancel: true }, "a tab that wakes up later is told to stop");
    assert.deepEqual(q.jobs.report(j.id, { status: "done", src: "/exports/late.mp4" }), { cancel: true });
    assert.equal(q.jobs.get(j.id).status, "failed", "and its late result does not overwrite the reason");
  } finally { q.done(); }
});

test("in the desktop app the reason does not offer a headless browser", () => {
  const q = queue({ allowHeadless: false });
  try {
    const j = q.jobs.request({ kind: "scopes" });
    q.jobs.claim(j.id);
    q.tick(J.TAB_SILENT_MS + 1);
    q.jobs.sweep();
    const v = q.jobs.get(j.id);
    assert.equal(v.code, "EDITOR_STOPPED_ANSWERING");
    assert.doesNotMatch(v.error, /headless/);
  } finally { q.done(); }
});

test("the busy refusal names the job, its kind and the exact cancel call", () => {
  const q = queue();
  try {
    const busy = q.jobs.request({ kind: "scopes", image: true });
    const e = refusal(() => q.jobs.request({ where: "headless" }));
    assert.equal(e.code, 409);
    assert.equal(e.errorCode, "JOB_BUSY");
    assert.deepEqual({ id: e.busy.id, kind: e.busy.kind, status: e.busy.status }, { id: busy.id, kind: "scopes", status: "pending" });
    assert.match(e.message, /still pending/, "the old wording stays, for callers that match it");
    assert.ok(e.message.includes(`fablecut_export {cancel:"${busy.id}"}`), e.message);
    assert.ok(e.message.includes(`POST /api/export/job/cancel?id=${busy.id}`), e.message);
    assert.ok(!/[一-鿿]/.test(e.message), "English for agents and logs");
  } finally { q.done(); }
});

test("the page has plain Chinese for both new codes", () => {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  for (const [code, key] of [["JOB_BUSY", "err-job-busy"], ["EDITOR_STOPPED_ANSWERING", "err-editor-stopped"]]) {
    assert.ok(app.includes(`${code}: "own.${key}"`), code);
    const zh = V.text["zh-CN"]["own." + key], en = V.text.en["own." + key];
    assert.ok(zh && en, key);
    assert.equal(zh.replace(/MontClip/g, "").match(/[A-Za-z]{2,}/), null, "no tool names or English in: " + zh);
    assert.ok(!/[一-鿿]/.test(en), en);
  }
});

test("a tab running a job keeps answering while it works", () => {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const at = app.indexOf("async function runExportJob(");
  const body = app.slice(at, at + 2500);
  assert.match(body, /setInterval\(/, "a heartbeat while the job runs");
  assert.match(body, /clearInterval\(/, "stopped when it ends");
  assert.ok(J.JOB_HEARTBEAT_MS * 3 < J.TAB_SILENT_MS, "several beats fit in the limit");
  assert.match(app, new RegExp(`const JOB_HEARTBEAT_MS = ${J.JOB_HEARTBEAT_MS};`), "the page beats at the queue's rate");
});

/* ── Over HTTP and MCP: a fake editor tab (an SSE reader) that takes jobs and then goes quiet ── */
function fakeTab(t, base) {
  const tickets = [], waiters = [];
  let buf = "";
  const req = http.get(base + "/api/events", (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^event: (.*)$/m.exec(block)?.[1] !== "export") continue;
        const ticket = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
        const w = waiters.shift();
        if (w) w(ticket); else tickets.push(ticket);
      }
    });
  });
  req.on("error", () => {});
  t.after(() => req.destroy());
  return {
    next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((r) => waiters.push(r)),
    connected: async () => {
      for (let i = 0; i < 100 && !req.socket?.readyState; i++) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 100));
    },
  };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const getJob = (base, id) => fetch(base + "/api/export/job?id=" + id).then((r) => r.json());
async function until(fn, ms = 10_000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await new Promise((r) => setTimeout(r, 50)); }
}
async function boot(t) {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const srv = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const tab = fakeTab(t, srv.base);
  await tab.connected();
  return { dir, tab, ...srv };
}

test("the server's 409 carries the code, the busy job and the cancel hint", async (t) => {
  const { base, tab } = await boot(t);
  const first = await post(base, "/api/scopes/request", { where: "tab" });
  assert.equal(first.status, 200);
  const ticket = await tab.next();
  await post(base, "/api/export/job/claim?id=" + ticket.id);
  for (const p of ["/api/scopes/request", "/api/track/request"]) {
    const r = await post(base, p, { where: "tab", track: { clip: "c_a" } });
    assert.equal(r.status, 409, p);
    assert.equal(r.body.code, "JOB_BUSY", p);
    assert.equal(r.body.busy.id, ticket.id);
    assert.equal(r.body.busy.kind, "scopes");
    assert.equal(r.body.busy.status, "running");
    assert.ok(r.body.error.includes(`fablecut_export {cancel:"${ticket.id}"}`), r.body.error);
  }
  assert.equal((await post(base, "/api/export/job/cancel?id=" + ticket.id)).body.status, "cancelled", "the hint works");
  assert.equal((await post(base, "/api/scopes/request", { where: "tab" })).status, 200, "and the slot is free");
});

async function mcpOn(t, dir, port) {
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port), FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });   // id 1; the next request is id 2
  return mcp;
}

test("a scopes reading whose MCP wait times out is cancelled", async (t) => {
  const { dir, base, port, tab } = await boot(t);
  const mcp = await mcpOn(t, dir, port);
  const call = mcp.callTool("fablecut_scopes", { time: 1, timeout: 1 });
  const ticket = await tab.next();
  await post(base, "/api/export/job/claim?id=" + ticket.id);   // the tab takes it and goes quiet
  const res = await call;
  assert.equal(res.isError, true);
  assert.match(res.text, /timed out/);
  assert.equal((await getJob(base, ticket.id)).status, "cancelled");
});

for (const [tool, args] of [["fablecut_scopes", { time: 1 }], ["fablecut_frame", { time: 1 }]]) {
  test(`the caller cancelling ${tool} cancels its job`, async (t) => {
    const { dir, base, port, tab } = await boot(t);
    const mcp = await mcpOn(t, dir, port);
    const call = mcp.request("tools/call", { name: tool, arguments: args });   // id 2
    const ticket = await tab.next();
    await post(base, "/api/export/job/claim?id=" + ticket.id);
    mcp.notify("notifications/cancelled", { requestId: 2, reason: "the user pressed stop" });
    const job = await until(async () => { const j = await getJob(base, ticket.id); return j.status !== "running" && j; }, 5000);
    assert.equal(job && job.status, "cancelled", "cancelled at once, not after the 60 s wait");
    const reply = await call;
    assert.equal(reply.result.isError, true);
    assert.equal((await post(base, "/api/scopes/request", { where: "tab" })).status, 200, "the queue is free");
  });
}

/* A host that requires mcp-server.js (the Cindy plugin's worker) and gives up on a call passes its own signal. This
   file runs in its own process, so the module may be loaded here pointed at this test's server. */
test("a host giving up on callTool (its AbortSignal) cancels the job, and a later export is accepted", async (t) => {
  const { dir, base, port, tab } = await boot(t);
  Object.assign(process.env, { FABLECUT_PORT: String(port), FABLECUT_DATA_DIR: dir, FABLECUT_NO_AUTOSTART: "1" });
  const { callTool } = require("../mcp-server.js");
  const ac = new AbortController();
  const call = callTool("fablecut_frame", { time: 1 }, { signal: ac.signal }).then(() => null, (e) => e);
  const ticket = await tab.next();
  await post(base, "/api/export/job/claim?id=" + ticket.id);
  ac.abort();
  const err = await call;
  assert.ok(err, "the call fails");
  assert.match(err.message, /cancelled/);
  assert.equal((await getJob(base, ticket.id)).status, "cancelled", "and its job is already cancelled when it returns");
  assert.equal((await post(base, "/api/scopes/request", { where: "tab" })).status, 200);
});
