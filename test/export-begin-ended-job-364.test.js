'use strict';
/* MontClip#364 ② (Deja 2026-11-16): an export job can end while the page's /api/export/begin is still in its precheck —
   the export memory limit (#353 Linux, #365 Windows), a cancel, a crashed browser. The job's onEnd then found no export
   session to stop, the session was made just after, and its reserved .part file and work folder sat in exports/ until
   the 10-minute idle sweep. Now begin removes what it just created for an ended job, at once, and answers 409; files that
   were in exports/ before are left alone. The precheck is held open with MONTCLIP_TEST_BEGIN_DELAY_MS so the job ends
   inside it every time. Same code on Linux and Windows; the memory-limit case runs wherever a Chromium is installed. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { makeDataDir, launch } = require("./helpers");
const FF = require("../server/ffmpeg-path");
const { findBrowser } = require("../server/export-jobs");

const post = (base, token, p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", "X-MontClip-Session": token }, body: JSON.stringify(body || {}) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const get = (base, token, p) => fetch(base + p, { headers: { "X-MontClip-Session": token } }).then((r) => r.json());
// prores422: an encoder every bundled ffmpeg has (the same begin the #302 owner tests use)
const begin = (base, token, name, job) => post(base, token, "/api/export/begin", { fps: 30, frames: 30, profile: "prores422", name, hasAudio: false, job });
const active = async (base, token) => (await get(base, token, "/api/export/active")).active;
const halfMade = (dir) => fs.readdirSync(path.join(dir, "exports")).filter((n) => n.startsWith("fablecut-") || /\.part\./.test(n));

/* Files that were in exports/ before: a .part file with the very name this export would reserve first (so it reserves
   <name>_1.part.mov instead) and a finished file. Returns {mine() → what this begin left half-made, intact() → asserts}. */
function seed(dir, name) {
  const ex = path.join(dir, "exports");
  fs.mkdirSync(ex, { recursive: true });
  const older = name + ".part.mov";   // the name this begin (prores422, .mov) would reserve first
  fs.writeFileSync(path.join(ex, older), "older half-file, not this export's");
  fs.writeFileSync(path.join(ex, "finished.mp4"), "a finished export");
  return {
    mine: () => halfMade(dir).filter((n) => n !== older),
    intact() {
      assert.equal(fs.readFileSync(path.join(ex, older), "utf8"), "older half-file, not this export's", "a .part file that was there before is not touched");
      assert.equal(fs.readFileSync(path.join(ex, "finished.mp4"), "utf8"), "a finished export", "nor is a finished file");
    },
  };
}
/* "at once": the cleanup stops ffmpeg (none has started here) and deletes; give it up to 3 s, far from the 10-minute sweep */
async function goneSoon(mine) {
  let left = mine();
  for (let i = 0; i < 30 && left.length; i++) { await new Promise((r) => setTimeout(r, 100)); left = mine(); }
  return left;
}
async function waitJob(base, token, id, ms) {
  const until = Date.now() + ms;
  for (;;) {
    const j = await get(base, token, "/api/export/job?id=" + id);
    if (j.status === "failed" || j.status === "cancelled" || j.status === "done" || Date.now() > until) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
}
/* an editor event stream, so a where:"tab" job waits for that tab (PENDING_TAB_MS, 20 s) instead of ending */
async function openEditor(t, base, token) {
  const boot = await fetch(base + "/?token=" + token, { redirect: "manual" });
  const cookie = String(boot.headers.get("set-cookie") || "").split(";")[0];
  const ac = new AbortController();
  t.after(() => ac.abort());
  const es = await fetch(base + "/api/events", { headers: { Cookie: cookie }, signal: ac.signal });
  await es.body.getReader().read();
}
const NEED_FF = !FF.available("ffmpeg") && "no ffmpeg here";

test("a job that ends while begin prechecks: begin answers 409 and its own .part file and work folder are gone at once; older files stay",
  { skip: NEED_FF, timeout: 60000 }, async (t) => {
    const token = crypto.randomBytes(32).toString("hex");
    const dir = makeDataDir(t);
    const files = seed(dir, "owner-ended");
    // the "browser" is node itself: it refuses Chrome's switches and exits at once, so the job ends as a crashed page
    const base = await launch(t, dir, token, { MONTCLIP_TEST_BEGIN_DELAY_MS: "1500", FABLECUT_CHROME: process.execPath });
    const job = await post(base, token, "/api/export/request", { where: "headless" });
    assert.equal(job.status, 200, JSON.stringify(job.body));
    const pending = begin(base, token, "owner-ended", job.body.id);   // its precheck is held 1.5 s
    const ended = await waitJob(base, token, job.body.id, 10000);
    assert.equal(ended.status, "failed", "the job ended while begin was still prechecking");
    const r = await pending;
    assert.equal(r.status, 409, "begin says the job is over: " + JSON.stringify(r.body));
    assert.equal(r.body.code, ended.code);
    assert.match(r.body.error, /already ended \(failed\)/);
    assert.deepEqual(await goneSoon(files.mine), [], "this begin's own .part file and work folder are removed at once, not after the 10-minute sweep");
    assert.equal(await active(base, token), 0, "no export session is left");
    files.intact();
  });

test("a cancel during the precheck is the same: removed at once, 409 with the job's status", { skip: NEED_FF, timeout: 60000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const files = seed(dir, "owner-cancel");
  const base = await launch(t, dir, token, { MONTCLIP_TEST_BEGIN_DELAY_MS: "1500" });
  await openEditor(t, base, token);
  const job = await post(base, token, "/api/export/request", { where: "tab" });   // pending until cancelled
  assert.equal(job.status, 200, JSON.stringify(job.body));
  const pending = begin(base, token, "owner-cancel", job.body.id);
  await new Promise((r) => setTimeout(r, 300));   // begin is inside its precheck now
  await post(base, token, "/api/export/job/cancel?id=" + job.body.id, {});
  const r = await pending;
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(r.body.error, /already ended \(cancelled\)/);
  assert.deepEqual(await goneSoon(files.mine), []);
  assert.equal(await active(base, token), 0);
  files.intact();
});

test("a job that is still running is not affected: begin goes ahead as before", { skip: NEED_FF, timeout: 60000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const dir = makeDataDir(t);
  const base = await launch(t, dir, token, { MONTCLIP_TEST_BEGIN_DELAY_MS: "300" });
  await openEditor(t, base, token);
  const job = await post(base, token, "/api/export/request", { where: "tab" });
  assert.equal(job.status, 200, JSON.stringify(job.body));
  const r = await begin(base, token, "owner-live", job.body.id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await active(base, token), 1, "the export session is there");
  assert.equal(halfMade(dir).filter((n) => n.startsWith("owner-live.part.")).length, 1, "with its reserved .part file");
  await post(base, token, "/api/export/job/cancel?id=" + job.body.id, {});
});

/* The case #364 ② is about: the export memory limit trips while begin prechecks. A real headless Chromium with the limit
   at 1 MiB trips it within seconds, on Linux (/proc) and on Windows (the #365 watcher); begin's precheck is held 20 s. */
const BROWSER = (() => { try { return findBrowser(); } catch { return null; } })();
test("the memory limit tripping during the precheck: EXPORT_MEMORY_LIMIT, and this begin's .part file is removed at once",
  { skip: NEED_FF || (!BROWSER && "no Chrome / Edge here") || (process.platform === "darwin" && "the limit is not measured on macOS"), timeout: 120000 }, async (t) => {
    const token = crypto.randomBytes(32).toString("hex");
    const dir = makeDataDir(t);
    const files = seed(dir, "owner-memory");
    const base = await launch(t, dir, token, { MONTCLIP_TEST_BEGIN_DELAY_MS: "20000", MONTCLIP_EXPORT_MEMORY_MAX_MIB: "1" });
    const job = await post(base, token, "/api/export/request", { where: "headless" });
    assert.equal(job.status, 200, JSON.stringify(job.body));
    const pending = begin(base, token, "owner-memory", job.body.id);
    const ended = await waitJob(base, token, job.body.id, 18000);
    assert.equal(ended.code, "EXPORT_MEMORY_LIMIT", "the limit tripped while begin was prechecking: " + JSON.stringify(ended));
    const r = await pending;
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.code, "EXPORT_MEMORY_LIMIT");
    assert.deepEqual(await goneSoon(files.mine), [], "this begin's own .part file and work folder are removed at once");
    assert.equal(await active(base, token), 0);
    files.intact();
  });
