/* P11 (europa, 2026-11-05): an agent's export that stops halfway has to end cleanly, and an export is done only when
   its file is finished — renamed from .part into place — never because ffmpeg exited.
   Seen there: each export that failed halfway left its ffmpeg running for over an hour, holding a deleted .part file
   (ffmpeg reading frames from stdin ignores SIGTERM on Linux), and its half-finished file stayed until the 10-minute
   idle sweep while the retry was already writing the next one. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const FF = require("../ffmpeg-path");
const Cleanup = require("../export-cleanup");
const { createExportJobs } = require("../export-jobs");
const { makeDataDir, seedProject, startServer } = require("./helpers");

const HAS_FFMPEG = FF.available("ffmpeg");
const exited = (p) => p.exitCode !== null || p.signalCode !== null;
const waitFor = async (f, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test("stopping an export stops an ffmpeg that is waiting for its next frame on stdin", { skip: !HAS_FFMPEG && "needs ffmpeg" }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-p11-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const part = path.join(dir, "clip.part.mp4"); fs.writeFileSync(part, "");
  // as the export encodes: frames arrive on stdin; none come, so ffmpeg sits in read() (SIGTERM alone never ends it on Linux)
  const proc = spawn(FF.path("ffmpeg"), ["-y", "-v", "error", "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "-", "-f", "null", "-"],
    { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
  t.after(() => { if (!exited(proc)) proc.kill("SIGKILL"); });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(exited(proc), false, "ffmpeg is waiting for frames");
  const r = await Cleanup.stopSessions([{ proc, partPath: part }], { timeoutMs: 3000 });
  assert.ok(await waitFor(() => exited(proc), 1000), "ffmpeg has exited");
  assert.deepEqual(r.left, []);
  assert.equal(fs.existsSync(part), false, "no half-finished file");
});

/* export-jobs on its own, with the hooks the server gives it */
function jobs(over = {}) {
  const ended = [];
  const j = createExportJobs({ url: () => "", broadcast() {}, editors: () => 1, onEnd: (job) => ended.push(job), ...over });
  return { j, ended };
}

test("a job that fails or is cancelled tells the server, which stops its encode; a finished one does not", (t) => {
  const { j, ended } = jobs({ finished: () => true });
  t.after(() => j.shutdown());
  const a = j.request({ where: "tab" }); j.claim(a.id);
  j.report(a.id, { status: "failed", error: "the editor stopped reporting progress (tab closed or browser crashed)" });
  const b = j.request({ where: "tab" }); j.claim(b.id); j.cancel(b.id);
  const c = j.request({ where: "tab" }); j.claim(c.id); j.report(c.id, { status: "done", src: "/exports/c.mp4" });
  assert.deepEqual(ended.map((x) => [x.id, x.status]), [[a.id, "failed"], [b.id, "cancelled"]]);
  assert.equal(j.get(c.id).status, "done");
});

test("an export job is done only when its file is in place: not while it is still the .part file, not when it is missing", (t) => {
  const inPlace = new Set(["/exports/done.mp4"]);
  const { j } = jobs({ finished: (src) => inPlace.has(src) });
  t.after(() => j.shutdown());
  for (const src of ["/exports/done.part.mp4", "/exports/missing.mp4", ""]) {
    const x = j.request({ where: "tab" }); j.claim(x.id);
    j.report(x.id, { status: "done", src });
    assert.equal(j.get(x.id).status, "failed", src);
    assert.match(j.get(x.id).error, /not in place/);
  }
  const ok = j.request({ where: "tab" }); j.claim(ok.id);
  j.report(ok.id, { status: "done", src: "/exports/done.mp4" });
  assert.equal(j.get(ok.id).status, "done");
});

test("the end of an export renames the .part file first, then checks the file (the self-check never reads a .part)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const end = src.slice(src.indexOf('if (p === "/api/export/end"'), src.indexOf("/* API: reference analysis"));
  const rename = end.indexOf("fs.renameSync(o.partPath, o.outPath)"), check = end.indexOf("verifyDeliveryOutput(");
  assert.ok(rename > 0 && check > 0 && rename < check, "renameSync before verifyDeliveryOutput");
  // and ffmpeg has exited before the rename: the rename waits for its exit code
  assert.ok(end.indexOf("await o.done") < rename);
  assert.ok(end.indexOf("await sess.done") < end.indexOf("fs.renameSync(sess.partPath, out)"));
});

/* The server: an editor tab as an SSE subscriber (as in export-jobs.test.js), and a real encode. */
function fakeTab(t, base) {
  const tickets = [], waiters = [];
  let buf = "";
  const req = http.get(base + "/api/events", (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: (.*)$/m.exec(block)?.[1] !== "export") continue;
        const ticket = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
        const w = waiters.shift(); if (w) w(ticket); else tickets.push(ticket);
      }
    });
  });
  req.on("error", () => {});
  t.after(() => req.destroy());
  return { next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((r) => waiters.push(r)) };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", body: body == null ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

for (const how of ["cancelled", "failed"]) {
  test(`a job ${how} halfway: its encode stops at once and the half-finished file goes`, { skip: !HAS_FFMPEG && "needs ffmpeg" }, async (t) => {
    const dir = makeDataDir(t, seedProject({ revision: 3 }));
    const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
    const h264 = await (await fetch(base + "/api/export/h264")).json();
    if (!h264.encoder) return t.skip("no H.264 encoder on this machine");
    const tab = fakeTab(t, base);
    await waitFor(async () => (await post(base, "/api/export/request", { where: "tab" })).status === 200, 5000);
    const ticket = await tab.next();
    assert.equal((await post(base, "/api/export/job/claim?id=" + ticket.id)).status, 200);
    const begin = (await post(base, "/api/export/begin", { fps: 30, name: "p11", hasAudio: false, duration: 20, job: ticket.id,
      deliveries: [{ delivery: { preset: "custom", width: 320, height: 180 }, name: "p11" }], canvasW: 320, canvasH: 180 })).body;
    assert.ok(begin.id, JSON.stringify(begin));
    const jpg = path.join(dir, "f.jpg");
    execFileSync(FF.path("ffmpeg"), ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180", "-frames:v", "1", jpg]);
    assert.equal((await post(base, "/api/export/frame?id=" + begin.id, Buffer.concat(Array(15).fill(fs.readFileSync(jpg))))).status, 200);
    const exportsDir = path.join(dir, "exports");
    const leftovers = () => fs.readdirSync(exportsDir).filter((f) => f.includes(".part") || f.startsWith("fablecut-"));
    assert.ok(leftovers().some((f) => f.includes(".part")), "a half-finished file while it encodes");
    assert.equal((await (await fetch(base + "/api/export/active")).json()).active, 1);
    if (how === "cancelled") await post(base, "/api/export/job/cancel?id=" + ticket.id);
    else await post(base, "/api/export/job/report?id=" + ticket.id, { status: "failed", error: "the editor stopped reporting progress (tab closed or browser crashed)" });
    const t0 = Date.now();
    assert.ok(await waitFor(async () => (await (await fetch(base + "/api/export/active")).json()).active === 0 && leftovers().length === 0, 8000),
      "no encode and no half-finished file: " + leftovers().join(", "));
    assert.ok(Date.now() - t0 < 8000, "not the 10-minute idle sweep");
    assert.equal((await (await fetch(base + "/api/export/job?id=" + ticket.id)).json()).status, how);
  });
}

test("an export that stops reporting says where it stopped (percent and timeline second), for the log", (t) => {
  const { j } = jobs();
  t.after(() => j.shutdown());
  const x = j.request({ where: "tab" }); j.claim(x.id);
  j.report(x.id, { progress: 0.42, at: 19.37 });
  const realNow = Date.now;
  // the sweep runs on a one-second timer: give it a tick with the clock past the 120 s a running tab may stay silent
  return new Promise((resolve, reject) => {
    Date.now = () => realNow() + 121_000;
    setTimeout(() => {
      Date.now = realNow;
      try {
        const v = j.get(x.id);
        assert.equal(v.status, "failed");
        assert.equal(v.error, "the editor stopped reporting progress at 42% (timeline 19.37 s) (tab closed or browser crashed)");
        resolve();
      } catch (e) { reject(e); }
    }, 1100);
  });
});

/* A stand-in for ffmpeg as europa had it (P11): it reads frames from stdin and does not exit on SIGTERM. "stubborn"
   also ignores the end of its input, so only the kill by its own handle stops it. The job wiring is the server's:
   a job that ends without its file stops its sessions (server.js onEnd → cleanupExport → stopSessions). */
function fakeFfmpeg(t, dir, { stubborn = false } = {}) {
  const script = path.join(dir, "fake-ffmpeg.js");
  fs.writeFileSync(script, `process.on("SIGTERM", () => {});
process.stdin.on("data", () => {});
${stubborn ? "" : 'process.stdin.on("end", () => process.exit(0));'}
setInterval(() => {}, 1000);`);
  const proc = spawn(process.execPath, [script], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
  t.after(() => { if (!exited(proc)) proc.kill("SIGKILL"); });
  return proc;
}
for (const how of ["failed", "cancelled", "timed out"]) for (const stubborn of [false, true]) {
  test(`a job ${how}: its ffmpeg${stubborn ? " (deaf to stdin too)" : ""} exits within the limit and its .part goes`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-p11-fake-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const proc = fakeFfmpeg(t, dir, { stubborn });
    const part = path.join(dir, "out.part.mp4"); fs.writeFileSync(part, "half");
    const work = fs.mkdtempSync(path.join(dir, "fablecut-")); fs.writeFileSync(path.join(work, "audio.wav"), "x");
    const sessions = new Map(), stops = [];
    const { j } = jobs({ onEnd: (job) => { const s = sessions.get(job.id); if (s) stops.push(Cleanup.stopSessions([s], { timeoutMs: 3000 })); } });
    t.after(() => j.shutdown());
    const x = j.request({ where: "tab" }); j.claim(x.id);
    sessions.set(x.id, { proc, partPath: part, dir: work });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(exited(proc), false, "it is waiting for frames");
    const realNow = Date.now;
    const t0 = realNow();
    if (how === "failed") j.report(x.id, { status: "failed", error: "frame upload failed" });
    else if (how === "cancelled") j.cancel(x.id);
    else {   // the renderer went silent: the 1 s sweep sees it past the 120 s limit
      Date.now = () => realNow() + 121_000;
      await waitFor(() => stops.length > 0, 3000);
      Date.now = realNow;
    }
    assert.equal(stops.length, 1, "the job's end stopped its encode");
    const { left } = await stops[0];
    assert.ok(await waitFor(() => exited(proc), 500), "ffmpeg has exited");
    assert.ok(realNow() - t0 < (stubborn ? 3000 : 1500), "stdin closed, SIGTERM, then SIGKILL after 2 s at most");
    assert.deepEqual(left, []);
    assert.equal(fs.existsSync(part), false, "no .part left");
    assert.equal(fs.existsSync(work), false, "no fablecut-XXXX folder left");
    assert.equal(j.get(x.id).status, how === "timed out" ? "failed" : how);
  });
}
