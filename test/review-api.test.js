"use strict";
/* #321 — the check of a stretch of the timeline: the record (review-store.js) and the steps (review-service.js), with the stand-in
   for the tool (test/fixtures/fake-agy.js). No network; the project is never written. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const FF = require("../server/ffmpeg-path");
const VB = require("../server/video-bridge");
const { createReviewStore, contentKey } = require("../server/review-store");
const { createReviewService, skeleton } = require("../server/review-service");

const FAKE = path.join(__dirname, "fixtures", "fake-agy.js");
let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch { }
const skip = HAS_FFMPEG ? false : "needs ffmpeg";
const tmp = (t, p = "mcrv-") => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); t.after(() => VB.rmForce(d)); return d; };
const envFor = (mode, opts = {}) => ({ ...process.env, MONTCLIP_AGY_BIN: process.execPath, SECRET_TOKEN_FOR_TEST: "s3cret-value",
  MONTCLIP_AGY_PREFIX_ARGS: JSON.stringify([FAKE, `--mode=${mode}`, ...(opts.report ? [`--report=${opts.report}`] : []), "--"]) });
function makeSample(dir, sec = 8) {
  const f = path.join(dir, "sample.mp4");
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=30:duration=${sec}`, "-f", "lavfi", "-i", `sine=f=440:duration=${sec}`,
    "-c:v", "mpeg4", "-c:a", "aac", "-shortest", f], { windowsHide: true });
  return f;
}
const DOC = () => ({ revision: 7, inPoint: 2, outPoint: 9, agentLog: [{ a: 1 }], clips: [
  { id: "c1", start: 20, duration: 4, kind: "video" }, { id: "c2", start: 24, duration: 5, kind: "video" },
  { id: "t1", start: 21, duration: 2, kind: "text", props: { text: "大家好 hello" } }] });

/* ---- the record ---- */
test("contentKey ignores the revision and the event log, and notices any other change", () => {
  const a = DOC(), b = DOC(); b.revision = 8; b.agentLog.push({ a: 2 });
  assert.equal(contentKey(a), contentKey(b));
  b.clips[0].start = 20.5;
  assert.notEqual(contentKey(a), contentKey(b));
  const x = { z: 1, a: { y: 2, b: 3 } }, y = { a: { b: 3, y: 2 }, z: 1 };
  assert.equal(contentKey(x), contentKey(y), "key order does not matter");
});

test("store: a mark can never be 'passed'; marks and corrections change nothing about the status", (t) => {
  const dir = tmp(t), s = createReviewStore({ dir });
  s.add("p1", { reviewId: "r1", status: "issues", range: { start: 5, end: 10 }, contentKey: "k", revision: 7, findings: [{ id: 0, t: 6, type: "audio", text: "x", suggestion: "", inLead: false, mark: null }] });
  for (const bad of ["passed", "pass", "ok", "", undefined, "FIXED"]) assert.throws(() => s.mark("p1", { id: "r1", mark: bad }), (e) => e.status === 400, String(bad));
  const r = s.mark("p1", { id: "r1", finding: 0, mark: "fixed", note: "swapped the plates" });
  assert.equal(r.status, "issues");
  assert.equal(r.findings[0].mark, "fixed");
  assert.equal(r.marks.length, 1);
  assert.equal(s.correct("p1", { id: "r1", digest: "host on the left" }).status, "issues");
  assert.throws(() => s.mark("p1", { id: "nope", mark: "note" }), (e) => e.status === 404);
  assert.throws(() => s.mark("p1", { id: "r1", finding: 9, mark: "note" }), (e) => e.status === 404);
  assert.ok(!("contentKey" in s.get("p1", "r1")), "the content hash is not shown");
});

test("gate: only a real pass of this very content that covers the stretch; any edit, a no_result or recheck_needed ends it", (t) => {
  const s = createReviewStore({ dir: tmp(t) });
  const add = (id, status, range, key = "K") => s.add("p", { reviewId: id, status, range, contentKey: key, revision: 3, findings: [] });
  add("a", "passed", { start: 10, end: 20 });
  assert.equal(s.gate("p", { key: "K", start: 12, end: 18 }).passed, true, "inside the checked stretch");
  assert.equal(s.gate("p", { key: "K", start: 5, end: 18 }).passed, false, "starts before it");
  assert.equal(s.gate("p", { key: "K", start: 12, end: 25 }).passed, false, "ends after it");
  assert.equal(s.gate("p", { key: "K2", start: 12, end: 18 }).passed, false, "the project changed since");
  add("b", "no_result", { start: 10, end: 20 });
  assert.equal(s.gate("p", { key: "K", start: 12, end: 18 }).passed, true, "a failed attempt does not take a pass away");
  add("c", "issues", { start: 10, end: 20 });
  assert.equal(s.gate("p", { key: "K", start: 12, end: 18 }).passed, false, "the newest check that covers it decides");
  add("d", "passed", { start: 10, end: 20 });
  s.mark("p", { id: "d", mark: "recheck_needed" });
  assert.equal(s.gate("p", { key: "K", start: 12, end: 18 }).passed, false);
  assert.equal(s.gate("other", { key: "K", start: 12, end: 18 }).passed, false, "another project has its own record");
});

test("store: a project id cannot pick another path; the file is a plain tmp-and-rename write", (t) => {
  const dir = tmp(t), s = createReviewStore({ dir });
  s.add("../../evil", { reviewId: "r", status: "issues", range: { start: 0, end: 1 }, contentKey: "k", findings: [] });
  assert.deepEqual(fs.readdirSync(dir), ["default.json"]);
});

/* ---- the steps ---- */
function setup(t, mode, extra = {}) {
  const d = tmp(t), sample = makeSample(d), report = path.join(d, "report.json");
  const store = createReviewStore({ dir: path.join(d, "reviews") });
  let doc = DOC(), jobs = 0, cancelled = [];
  const svc = createReviewService({
    store, bridge: VB, readProject: () => doc, activeProject: () => "p1", pollMs: 20,
    requestSample: ({ range }) => { jobs++; return { id: "x_" + jobs, range }; },
    getJob: () => ({ status: extra.jobStatus || "done", progress: 1, src: "/previews/sample.mp4" }),
    cancelJob: (id) => cancelled.push(id), sampleFile: () => sample,
    ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"), env: envFor(mode, { report }),
  });
  return { d, svc, store, report, setDoc: (x) => { doc = x; }, doc: () => doc, cancelled, jobsMade: () => jobs };
}
const until = async (fn, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 25)); } };

test("a person's check: ready with what is sent and to whom, sent only with the one-time token, the project untouched", { skip }, async (t) => {
  const S = setup(t, "issues"), before = JSON.stringify(S.doc());
  const v = S.svc.prepare({ start: 24, end: 29 });
  assert.ok(["rendering", "ready"].includes(v.state), "the stand-in's job is done at once");
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const ready = S.svc.status(v.reviewId);
  assert.equal(ready.willSend.to.host, "daily-cloudcode-pa.googleapis.com");
  assert.match(ready.willSend.what, /nothing else/);
  assert.equal(ready.sendToken, undefined, "the token is not in the shared view");
  assert.equal(ready.range.start, 24); assert.equal(ready.lead, 3);
  const token = S.svc.tokenFor(v.reviewId);
  assert.match(token, /^[0-9a-f]{48}$/);
  await assert.rejects(S.svc.send(v.reviewId, "wrong"), (e) => e.status === 403 && e.code === "NOT_CONFIRMED");
  await assert.rejects(S.svc.send(v.reviewId, undefined), (e) => e.status === 403);
  assert.equal(fs.existsSync(S.report), false, "nothing was started without the token");
  const rec = await S.svc.send(v.reviewId, token);
  assert.equal(rec.status, "issues");
  assert.equal(rec.findings.find((f) => f.type === "speaker_swapped").t, 25, "sample second 4.0 + the sample's start 21 (24 minus the 3 s lead-in)");
  assert.ok(rec.findings.some((f) => f.inLead), "the lead-in problem is marked");
  await assert.rejects(S.svc.send(v.reviewId, token), (e) => e.status === 409, "the token works once");
  assert.equal(JSON.stringify(S.doc()), before, "revision, IN/OUT, clips and the log are exactly as they were");
  assert.equal(S.store.get("p1", v.reviewId).status, "issues");
});

test("timeline seconds: the sample starts lead seconds before the stretch", { skip }, async (t) => {
  const S = setup(t, "issues");
  const v = S.svc.prepare({ start: 24, end: 29, lead: 2 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const swapped = rec.findings.find((f) => f.type === "speaker_swapped"), lead = rec.findings.find((f) => f.type === "cut_jump");
  assert.equal(swapped.t, 26, "sample second 4.0 is timeline second 22 + 4");
  assert.equal(swapped.inLead, false);
  assert.equal(lead.t, 22.5); assert.equal(lead.inLead, true);
});

test("an agent's request with send:true is sent when ready; a page cannot ask for that", { skip }, async (t) => {
  const S = setup(t, "pass");
  assert.throws(() => S.svc.prepare({ start: 24, end: 29, agent: false, autoSend: true }), (e) => e.status === 403 && e.code === "CLICK_REQUIRED");
  const v = S.svc.prepare({ start: 24, end: 29, agent: true, autoSend: true });
  const done = await until(() => { const s = S.svc.status(v.reviewId); return s.state === "done" && s; });
  assert.equal(done.result.status, "passed");
  assert.equal(done.result.source, "agent");
  assert.equal(S.svc.tokenFor(v.reviewId), null);
});

test("one check of a project at a time; cancelling ends it and revokes the token", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29 });
  assert.throws(() => S.svc.prepare({ start: 1, end: 5 }), (e) => e.status === 409 && e.code === "BUSY");
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const token = S.svc.tokenFor(v.reviewId);
  const c = S.svc.cancel(v.reviewId);
  assert.equal(c.state, "cancelled");
  assert.equal(S.svc.tokenFor(v.reviewId), null);
  await assert.rejects(S.svc.send(v.reviewId, token), (e) => e.status === 409);
  assert.equal(fs.existsSync(S.report), false, "nothing was sent");
  S.svc.prepare({ start: 1, end: 5 });   // free again
});

test("cancel while the sample is still being made cancels the render job", { skip }, async (t) => {
  const S = setup(t, "pass", { jobStatus: "running" });
  const v = S.svc.prepare({ start: 24, end: 29 });
  const c = S.svc.cancel(v.reviewId);
  assert.equal(c.state, "cancelled");
  assert.deepEqual(S.cancelled, ["x_1"]);
});

test("a failed render is a failed check, not a pass", { skip }, async (t) => {
  const S = setup(t, "pass", { jobStatus: "failed" });
  const v = S.svc.prepare({ start: 24, end: 29 });
  const s = await until(() => { const x = S.svc.status(v.reviewId); return x.state === "failed" && x; });
  assert.equal(s.reason, "RENDER_FAILED");
  assert.equal(S.store.list("p1").length, 0);
});

test("bad ranges, a too long stretch and a bad scope are refused before anything is rendered", { skip }, (t) => {
  const S = setup(t, "pass");
  for (const a of [{ start: -1, end: 5 }, { start: 5, end: 5 }, { start: "x", end: 9 }, { start: 5 }, { start: 0, end: 31 }]) assert.throws(() => S.svc.prepare(a), (e) => e.status === 400, JSON.stringify(a));
  assert.throws(() => S.svc.prepare({ start: 0, end: 5, lead: 11 }), (e) => e.status === 400);
  assert.throws(() => S.svc.prepare({ start: 0, end: 5, scope: "all" }), (e) => e.status === 400);
  assert.equal(S.jobsMade(), 0);
});

test("without the tool installed: NO_BRIDGE before rendering", { skip }, (t) => {
  const S = setup(t, "pass");
  const svc = createReviewService({ store: S.store, bridge: VB, readProject: S.doc, activeProject: () => "p1", requestSample: () => { throw new Error("must not render"); },
    getJob: () => null, cancelJob() { }, sampleFile: () => null, ffmpeg: () => "x", ffprobe: () => "x", env: { MONTCLIP_AGY_BIN: path.join(S.d, "none") } });
  assert.throws(() => svc.prepare({ start: 1, end: 5 }), (e) => e.status === 409 && e.code === "NO_BRIDGE");
});

test("scope window sends no project text; scope full sends the subtitles and cut points of the stretch, as reference", { skip }, async (t) => {
  const W = setup(t, "pass");
  const w = W.svc.prepare({ start: 21, end: 26, scope: "window" });
  await until(() => W.svc.status(w.reviewId).state === "ready");
  await W.svc.send(w.reviewId, W.svc.tokenFor(w.reviewId));
  const wp = JSON.parse(fs.readFileSync(W.report, "utf8")).prompt;
  assert.ok(!/REFERENCE/.test(wp) && !wp.includes("大家好"), "no project text");
  const F = setup(t, "pass");
  const f = F.svc.prepare({ start: 21, end: 26, scope: "full" });
  await until(() => F.svc.status(f.reviewId).state === "ready");
  await F.svc.send(f.reviewId, F.svc.tokenFor(f.reviewId));
  const fp = JSON.parse(fs.readFileSync(F.report, "utf8")).prompt;
  assert.match(fp, /<<<REFERENCE[\s\S]*大家好 hello[\s\S]*REFERENCE>>>/);
});

test("nothing secret reaches the tool, the record or the answer", { skip }, async (t) => {
  const S = setup(t, "issues");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const seen = JSON.parse(fs.readFileSync(S.report, "utf8"));
  assert.ok(!seen.env.includes("SECRET_TOKEN_FOR_TEST"), "the tool's own environment has no secret");
  const text = JSON.stringify([rec, S.svc.status(v.reviewId), fs.readFileSync(path.join(S.d, "reviews", "p1.json"), "utf8")]);
  assert.ok(!text.includes("s3cret-value") && !text.includes(process.execPath) && !text.includes(os.tmpdir()), "no secret, tool path or temp folder in what is kept or returned");
});

test("skeleton: text and cut points inside the stretch only, cut to size", () => {
  const s = skeleton(DOC(), 21, 26);
  assert.match(s, /21\.00-23\.00s text: 大家好 hello/);
  assert.match(s, /24\.00/);
  assert.ok(!/20\.00/.test(s), "a clip that starts before the stretch is not a cut point of it");
  const big = { clips: Array.from({ length: 400 }, (_, i) => ({ start: i, duration: 1, kind: "text", props: { text: "x".repeat(150) } })) };
  assert.ok(skeleton(big, 0, 400).length <= 6000);
});
