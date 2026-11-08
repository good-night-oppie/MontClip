/* E5a (MontClip#215, MontClip-Cindy#18): an export job knows which project it renders and which Cindy task asked
   for it. The job and the ticket carry {project, session}; the plugin worker checks them (EXPORT_TASK_MISMATCH).
   The session is taken only from a request the worker authenticated with its X-MontClip-Session header — never
   from a page's body or URL (a cookie request's self-reported session is dropped). The project is the open one;
   a caller that names another, or a project switch while the job is pending or running, ends it with
   EXPORT_PROJECT_CHANGED. How an editor tab proves its own task (E5b: /api/ui/command, SSE) is not here.
   Synthetic data only; no browser, no recordings. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const { createExportJobs } = require("../export-jobs");
const { makeDataDir, freePort, startServer, endTree } = require("./helpers");

const ROOT = path.join(__dirname, "..");
let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(require("../ffmpeg-path").path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch {}
const skip = HAS_FFMPEG ? false : "export requests need ffmpeg";

/* ── the queue (export-jobs.js) ── */

// the same assertion as MontClip-Cindy's test/engine-task-contract.test.cjs, which runs against the packed engine
for (const surface of ["job", "ticket"]) {
  test(`export ${surface} keeps the project and session it was asked for`, (t) => {
    const jobs = createExportJobs({ editors: () => 1, broadcast() {} });
    t.after(() => jobs.shutdown());
    const identity = { project: "synthetic-project-A", session: "synthetic-task-A" };
    const job = jobs.request({ where: "tab", ...identity });
    const result = surface === "job" ? job : jobs.ticket(job.id);
    assert.deepEqual({ project: result.project, session: result.session }, identity);
  });
}

test("a job asked for without them says null for both (the standalone editor is unchanged)", (t) => {
  const jobs = createExportJobs({ editors: () => 1, broadcast() {} });
  t.after(() => jobs.shutdown());
  const job = jobs.request({ where: "tab" });
  assert.deepEqual([job.project, job.session], [null, null]);
  assert.deepEqual([jobs.ticket(job.id).project, jobs.ticket(job.id).session], [null, null]);
});

test("the open project changing ends a pending or running job with EXPORT_PROJECT_CHANGED; a late 'done' is not taken", (t) => {
  let active = "p_a";
  const jobs = createExportJobs({ editors: () => 1, broadcast() {}, activeProject: () => active });
  t.after(() => jobs.shutdown());
  const running = jobs.request({ where: "tab", project: "p_a", session: "task-A" });
  assert.ok(jobs.claim(running.id, { tabId: "tab1", hidden: false }));
  assert.deepEqual(jobs.report(running.id, { progress: 0.3, tabId: "tab1" }), { cancel: false }, "same project: carries on");
  active = "p_b";
  const reply = jobs.report(running.id, { progress: 0.5, tabId: "tab1" });
  assert.equal(reply.cancel, true, "the tab is told to stop");
  assert.equal(reply.code, "EXPORT_PROJECT_CHANGED");
  jobs.report(running.id, { status: "done", src: "/exports/x.mp4", tabId: "tab1" });
  const v = jobs.get(running.id);
  assert.deepEqual([v.status, v.code, v.src], ["failed", "EXPORT_PROJECT_CHANGED", null]);
  assert.equal(v.session, "task-A", "the ended job still says whose it was");

  active = "p_a";
  const pending = jobs.request({ where: "tab", project: "p_a", session: "task-A" });
  active = "p_b";
  jobs.sweep();
  assert.deepEqual([jobs.get(pending.id).status, jobs.get(pending.id).code], ["failed", "EXPORT_PROJECT_CHANGED"], "found by the sweep, not only on a report");
  assert.equal(jobs.claim(pending.id, { tabId: "tab1" }), false, "nobody can claim it any more");
});

test("a job that names no project is not ended by a project switch", (t) => {
  let active = "p_a";
  const jobs = createExportJobs({ editors: () => 1, broadcast() {}, activeProject: () => active });
  t.after(() => jobs.shutdown());
  const job = jobs.request({ where: "tab", kind: "scopes", time: 0 });
  active = "p_b";
  jobs.sweep();
  assert.equal(jobs.get(job.id).status, "pending");
});

/* ── the editor tab (app.js runClaimedJob): the ticket's project is not the one the tab shows ── */

test("an editor tab showing another project fails the ticket with EXPORT_PROJECT_CHANGED instead of rendering it", async () => {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const at = app.indexOf("async function runClaimedJob(");
  const end = app.indexOf("\nasync function ", at + 10);
  const sent = [];
  const env = {
    project: { revision: 3, clips: [{ id: "c" }] }, runtime: { projectId: "p_b" }, state: { ffmpeg: true },
    syncFromServer: async () => {}, reportExportJob: (id, body) => sent.push({ id, ...body }),
    runScopesJob: () => sent.push("scopes"), runTrackJob() {}, runTranscribeJob() {}, runLyricsJob() {},
    // anything past the checks would start rendering: note it and stop there
    fetchEncodeProfiles: async () => { sent.push("rendering"); throw new Error("rendering"); }, probeMissingMeta: async () => {},
  };
  const run = new Function(...Object.keys(env), app.slice(at, end) + "\nreturn runClaimedJob;")(...Object.values(env));
  await run({ id: "x_1", kind: "export", revision: 3, project: "p_a", session: "task-A" }).catch(() => {});
  assert.equal(sent.length, 1, "nothing rendered: " + JSON.stringify(sent));
  assert.deepEqual([sent[0].id, sent[0].status, sent[0].code], ["x_1", "failed", "EXPORT_PROJECT_CHANGED"]);
  sent.length = 0;
  await run({ id: "x_2", kind: "scopes", revision: 3, project: "p_b" });
  assert.deepEqual(sent, ["scopes"], "its own project runs as before");
});

/* ── over HTTP: embedded in Cindy (MONTCLIP_HOST=cindy), and standalone ── */

const hex = () => crypto.randomBytes(32).toString("hex");
async function embedded(t) {
  // the engine stops before its data folder is removed (helpers.js, #233): this hook is added first, so it runs first
  let stop = () => { };
  t.after(() => stop());
  const token = hex(), port = await freePort();
  const dir = makeDataDir(t);
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT, stdio: "ignore",
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1",
      FABLECUT_CHROME: path.join(dir, "no-such-browser"), MONTCLIP_DESKTOP: "", MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token },
  });
  const exited = new Promise((r) => child.on("exit", r));
  stop = async () => { endTree(child); await exited; };
  const base = `http://127.0.0.1:${port}`;
  const worker = { "X-MontClip-Session": token };
  for (let i = 0; i < 400; i++) {
    try { if ((await fetch(base + "/api/project", { headers: worker })).status === 200) break; } catch { }
    await new Promise((r) => setTimeout(r, 50));
  }
  const boot = await fetch(base + "/?token=" + token, { redirect: "manual" });
  const page = { Cookie: boot.headers.get("set-cookie").split(";")[0] };
  return { base, worker, page };
}
const call = (base, p, body, headers = {}) => fetch(base + p, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
/* an open editor tab, as far as the server can tell: an SSE subscriber (with the worker's header, as a frame has its cookie).
   task {s, project, session}: embedded, the tab binds its connection to that task with a one-time ticket (E5b) — a
   task's export ticket goes only to a connection bound to it. tickets.conn is the connection's id. */
async function tab(t, base, headers, task = null) {
  const tickets = [];
  let buf = "";
  const req = http.get(base + "/api/events", { headers }, (res) => {
    res.setEncoding("utf8");
    res.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: export$/m.test(block)) tickets.push(JSON.parse(/^data: (.*)$/m.exec(block)[1]));
        if (/^event: conn$/m.test(block)) tickets.conn = JSON.parse(/^data: (.*)$/m.exec(block)[1]).conn;
      }
    });
  });
  req.on("error", () => { });
  t.after(() => req.destroy());
  await new Promise((r) => setTimeout(r, 300));
  if (task) {
    const { ticket } = (await call(base, "/api/embed/ticket", { project: task.project, session: task.session }, task.s.worker)).body;
    assert.equal((await call(base, "/api/embed/claim", { ticket, conn: tickets.conn }, task.s.page)).status, 200, "bound");
  }
  return tickets;
}
async function projects(base, headers) {
  const list = (await call(base, "/api/projects", undefined, headers)).body;
  const other = (await call(base, "/api/projects", { action: "new", name: "synthetic other", open: false }, headers)).body.id;
  return { active: list.active, other };
}

test("embedded: the worker's request puts its session and the open project on the job, its ticket and GET job", { skip }, async (t) => {
  const s = await embedded(t);
  const { active } = await projects(s.base, s.worker);
  assert.ok(active, "a project is open");
  const tickets = await tab(t, s.base, s.worker, { s, project: active, session: "synthetic-task-A" });
  const r = await call(s.base, "/api/export/request", { where: "tab", session: "synthetic-task-A", project: active }, s.worker);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.project, r.body.session], [active, "synthetic-task-A"]);
  const job = await call(s.base, "/api/export/job?id=" + r.body.id, undefined, s.worker);
  assert.deepEqual([job.body.project, job.body.session], [active, "synthetic-task-A"]);
  const ticket = await call(s.base, "/api/export/job/ticket?id=" + r.body.id, undefined, s.worker);
  assert.deepEqual([ticket.body.project, ticket.body.session], [active, "synthetic-task-A"]);
  for (let i = 0; i < 50 && !tickets.length; i++) await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual([tickets[0].project, tickets[0].session], [active, "synthetic-task-A"], "the SSE ticket too");
});

test("embedded: a page (cookie) cannot name a task — body and URL session are dropped; a bad session from the worker is refused", { skip }, async (t) => {
  const s = await embedded(t);
  await tab(t, s.base, s.page);
  const fromPage = await call(s.base, "/api/export/request?session=task-B&cindySession=task-B", { where: "tab", session: "task-B" }, s.page);
  assert.equal(fromPage.status, 200, JSON.stringify(fromPage.body));
  assert.equal(fromPage.body.session, null, "a self-reported session is not taken");
  assert.equal((await call(s.base, "/api/export/job?id=" + fromPage.body.id, undefined, s.worker)).body.session, null);
  await call(s.base, "/api/export/job/cancel?id=" + fromPage.body.id, {}, s.worker);
  // a worker request with a forged header value is not the worker (and is not let in at all)
  assert.equal((await call(s.base, "/api/export/request", { where: "tab", session: "task-B" }, { "X-MontClip-Session": hex() })).status, 403);
  for (const bad of ["a b", "x".repeat(129), "../a", 7, { id: "a" }]) {
    const r = await call(s.base, "/api/export/request", { where: "tab", session: bad }, s.worker);
    assert.equal(r.status, 400, "refused: " + JSON.stringify(bad));
  }
});

test("a project that is not the open one is refused with EXPORT_PROJECT_CHANGED before any job is queued", { skip }, async (t) => {
  const s = await embedded(t);
  const { active, other } = await projects(s.base, s.worker);
  await tab(t, s.base, s.worker, { s, project: active, session: "synthetic-task-A" });
  const r = await call(s.base, "/api/export/request", { where: "tab", session: "synthetic-task-A", project: other }, s.worker);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "EXPORT_PROJECT_CHANGED");
  assert.doesNotMatch(JSON.stringify(r.body), /synthetic-task-A/, "the refusal does not echo the task");
  const ok = await call(s.base, "/api/export/request", { where: "tab", session: "synthetic-task-A", project: active }, s.worker);
  assert.equal(ok.status, 200, "nothing was queued by the refused one: " + JSON.stringify(ok.body));
});

test("opening another project mid-export ends the job with EXPORT_PROJECT_CHANGED, and the tab is told to stop", { skip }, async (t) => {
  const s = await embedded(t);
  const { active, other } = await projects(s.base, s.worker);
  const own = await tab(t, s.base, s.worker, { s, project: active, session: "synthetic-task-A" });
  const r = await call(s.base, "/api/export/request", { where: "tab", session: "synthetic-task-A", project: active }, s.worker);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call(s.base, "/api/export/job/claim?id=" + r.body.id, { tabId: "tab1", hidden: false, conn: own.conn }, s.worker)).status, 200);
  assert.equal((await call(s.base, "/api/projects", { action: "open", id: other }, s.worker)).status, 200);
  const reply = await call(s.base, "/api/export/job/report?id=" + r.body.id, { progress: 0.4, tabId: "tab1" }, s.worker);
  assert.deepEqual([reply.body.cancel, reply.body.code], [true, "EXPORT_PROJECT_CHANGED"]);
  const job = (await call(s.base, "/api/export/job?id=" + r.body.id, undefined, s.worker)).body;
  assert.deepEqual([job.status, job.code, job.session, job.project], ["failed", "EXPORT_PROJECT_CHANGED", "synthetic-task-A", active]);
});

test("standalone (not embedded): a body session is not taken either; the job still names the open project", { skip }, async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const { active } = await projects(base, {});
  await tab(t, base, {});
  const r = await call(base, "/api/export/request", { where: "tab", session: "task-B" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.project, r.body.session], [active, null]);
});
