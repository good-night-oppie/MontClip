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
const envFor = (mode, opts = {}) => ({ ...process.env, MONTCLIP_AGY_BIN: process.execPath, SECRET_TOKEN_FOR_TEST: "s3cret-value", ...(opts.noConfirm ? {} : { MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com" }),
  MONTCLIP_AGY_PREFIX_ARGS: JSON.stringify([FAKE, `--mode=${mode}`, ...(opts.report ? [`--report=${opts.report}`] : []), ...(opts.calls ? [`--calls=${opts.calls}`] : []), "--"]) });
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
  const d = tmp(t), sample = makeSample(d), report = path.join(d, "report.json"), calls = path.join(d, "calls.jsonl");
  const store = createReviewStore({ dir: path.join(d, "reviews") });
  let doc = DOC(), jobs = 0, cancelled = [];
  const svc = createReviewService({
    store, bridge: extra.bridge || VB, readProject: () => doc, activeProject: () => (extra.active ? extra.active() : "p1"), pollMs: 20, agentSendEnabled: () => !!extra.agentSend,
    requestSample: ({ range }) => { jobs++; return { id: "x_" + jobs, range }; },
    getJob: () => ({ status: extra.jobStatus || "done", progress: 1, src: "/previews/sample.mp4" }),
    cancelJob: (id) => cancelled.push(id), sampleFile: () => sample,
    ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"), env: envFor(mode, { report, calls }),
  });
  return { d, svc, store, report, calls, setDoc: (x) => { doc = x; }, doc: () => doc, cancelled, jobsMade: () => jobs };
}
const until = async (fn, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 25)); } };

test("a person's check: ready with what is sent and to whom, sent only with the one-time token, the project untouched", { skip }, async (t) => {
  const S = setup(t, "issues"), before = JSON.stringify(S.doc());
  const v = S.svc.prepare({ start: 24, end: 29 });
  assert.ok(["rendering", "ready"].includes(v.state), "the stand-in's job is done at once");
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const ready = S.svc.status(v.reviewId);
  assert.equal(ready.willSend.to.host, "daily-cloudcode-pa.googleapis.com");
  assert.match(ready.willSend.what, /No subtitle text, edit points, or good\/bad examples are attached/);
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

test("an agent's request with send:true is OFF by default; with the switch on it is sent when ready; a page cannot ask for that", { skip }, async (t) => {
  const off = setup(t, "pass");
  assert.throws(() => off.svc.prepare({ start: 24, end: 29, agent: true, autoSend: true }), (e) => e.status === 403 && e.code === "AGENT_SEND_OFF");
  assert.equal(off.jobsMade(), 0, "nothing is rendered either");
  const S = setup(t, "pass", { agentSend: true });
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
    getJob: () => null, cancelJob() { }, sampleFile: () => null, ffmpeg: () => "x", ffprobe: () => "x", env: { MONTCLIP_AGY_BIN: path.join(S.d, "none"), MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com" } });
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

/* ---- PG #321 v4 and Deja's gates ---- */
test("the page sees what is sent: how many requests, how many taste notes, to whom; the record says the same", { skip }, async (t) => {
  const S = setup(t, "pass");
  S.store.tasteAdd("p1", { kind: "negative", text: "a caption that explains the joke" });
  S.store.tasteAdd("p1", { kind: "positive", aspect: "pacing", text: "the pause before the reply" });
  const v = S.svc.prepare({ start: 24, end: 29, mode: "two_pass", scope: "full" });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const w = S.svc.status(v.reviewId).willSend;
  assert.equal(w.requests, 2); assert.equal(w.tasteNotes, 2);
  assert.match(w.what, /2 requests/); assert.match(w.what, /2 saved taste notes/);
  assert.deepEqual(w.to, { ...VB.destination({ MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com" }) }, "what is shown is the one decision");
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.deepEqual(rec.destination, w.to, "the record says what was shown");
  assert.equal(rec.mode, "two_pass"); assert.equal(rec.requests, 2); assert.equal(rec.tasteNotes, 2);
  assert.equal(rec.dimensions.fact.state, "passed");
  const calls = fs.readFileSync(S.calls, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(calls.map((c) => c.kind), ["blind", "main"], "the clip really went in 2 requests");
  assert.ok(calls[1].prompt.includes("the pause before the reply") && !calls[0].prompt.includes("the pause before the reply"));
  assert.throws(() => S.svc.prepare({ start: 1, end: 5, mode: "three" }), (e) => e.status === 400 && e.code === "BAD_MODE");
});

test("where it goes is checked again at the moment of sending: a change since it was shown stops the send", { skip }, async (t) => {
  let host = "daily-cloudcode-pa.googleapis.com";
  const moving = { ...VB, destination: () => Object.freeze({ service: "Google Gemini", host, source: "owner-confirmed", verified: true }) };
  const S = setup(t, "pass", { bridge: moving });
  const v = S.svc.prepare({ start: 24, end: 29 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const token = S.svc.tokenFor(v.reviewId);
  host = "somewhere.else.example";
  await assert.rejects(S.svc.send(v.reviewId, token), (e) => e.status === 409 && e.code === "DESTINATION_CHANGED");
  assert.equal(fs.existsSync(S.report), false, "nothing was sent");
  assert.equal(S.svc.status(v.reviewId).state, "failed");
});

test("hard rule over the four verdicts, through the whole check: names right but packaging issues is not a pass and the gate says no", { skip }, async (t) => {
  const S = setup(t, "packaging");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.equal(rec.status, "issues"); assert.equal(rec.dimensions.packaging.state, "issues");
  assert.equal(S.store.gate("p1", { key: S.store.contentKey(S.doc()), start: 24, end: 29 }).passed, false);
});

test("taste notes: a positive one says what was approved, at most 30, removable; they live apart from the project", (t) => {
  const s = createReviewStore({ dir: tmp(t) });
  assert.throws(() => s.tasteAdd("p", { kind: "positive", text: "the whole clip is great" }), (e) => e.status === 400 && e.code === "BAD_TASTE", "no aspect: refused");
  assert.throws(() => s.tasteAdd("p", { kind: "positive", aspect: "everything", text: "x" }), (e) => e.status === 400);
  assert.throws(() => s.tasteAdd("p", { kind: "maybe", text: "x" }), (e) => e.status === 400);
  assert.throws(() => s.tasteAdd("p", { kind: "negative", text: "   " }), (e) => e.status === 400);
  const n = s.tasteAdd("p", { kind: "negative", text: "an explaining caption\u0000 " + "x".repeat(400) });
  assert.equal(n.aspect, null); assert.equal(n.text.length, 200); assert.ok(!/\u0000/.test(n.text));
  const p = s.tasteAdd("p", { kind: "positive", aspect: "caption", text: "the one-word reaction caption" });
  assert.deepEqual(s.tasteList("p").map((x) => x.id), [n.id, p.id]);
  for (let i = 0; i < 28; i++) s.tasteAdd("p", { kind: "negative", text: "n" + i });
  assert.throws(() => s.tasteAdd("p", { kind: "negative", text: "one too many" }), (e) => e.status === 400 && e.code === "TASTE_FULL");
  assert.deepEqual(s.tasteRemove("p", n.id), { removed: n.id });
  assert.throws(() => s.tasteRemove("p", n.id), (e) => e.status === 404);
  assert.equal(s.tasteList("p").length, 29);
  assert.deepEqual(s.tasteList("other"), [], "another project has its own notes");
  s.add("p", { reviewId: "r1", status: "issues", range: { start: 0, end: 1 }, contentKey: "k", findings: [] });
  assert.equal(s.tasteList("p").length, 29, "adding a record does not lose the notes");
});

/* ---- what ReviewInbox found on the first review of #328 (all four real) ---- */
test("a cancel that comes while the copy is being made keeps the tool from ever starting", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const sending = S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const c = S.svc.cancel(v.reviewId);       // no tool is running yet, so there is nothing to kill: only the flag
  const rec = await sending;
  assert.equal(c.state === "cancelled" || c.state === "sending", true);
  assert.equal(rec.status, "no_result"); assert.equal(rec.reason, "CANCELLED");
  assert.equal(fs.existsSync(S.report), false, "the tool never started, so nothing was sent");
  assert.equal(S.svc.status(v.reviewId).state, "cancelled");
});

test("what goes out is what was shown: a project switched, a word edited or a note added after prepare is not sent", { skip }, async (t) => {
  let active = "p1";
  const S = setup(t, "pass", { active: () => active });
  /* the project's words are the ones at prepare */
  const a = S.svc.prepare({ start: 21, end: 26, scope: "full" });
  await until(() => S.svc.status(a.reviewId).state === "ready");
  assert.ok(S.svc.status(a.reviewId).willSend.projectText.includes("大家好 hello"), "the page is shown the words that will go");
  S.store.tasteAdd("p1", { kind: "negative", text: "NOTE-ADDED-AFTER-THE-QUESTION" });
  assert.equal(S.svc.status(a.reviewId).willSend.tasteNotes, 0);
  await S.svc.send(a.reviewId, S.svc.tokenFor(a.reviewId));
  const prompt = JSON.parse(fs.readFileSync(S.report, "utf8")).prompt;
  assert.ok(prompt.includes("大家好 hello"), "the words that were shown");
  assert.ok(!prompt.includes("NOTE-ADDED-AFTER-THE-QUESTION"), "a note added since is not sent");
  /* an edit after the sample was made: the picture is stale, so nothing is sent */
  fs.rmSync(S.report, { force: true });
  const e = S.svc.prepare({ start: 21, end: 26, scope: "full" });
  await until(() => S.svc.status(e.reviewId).state === "ready");
  const tokenE = S.svc.tokenFor(e.reviewId);
  const doc2 = JSON.parse(JSON.stringify(S.doc())); doc2.clips.find((c) => c.id === "t1").props.text = "SECRET-OF-ANOTHER-EDIT"; S.setDoc(doc2);
  await assert.rejects(S.svc.send(e.reviewId, tokenE), (x) => x.status === 409 && x.code === "PROJECT_EDITED");
  assert.equal(fs.existsSync(S.report), false, "nothing was sent");
  /* another project open now: the old token is refused and nothing starts */
  fs.rmSync(S.report, { force: true });
  S.setDoc(JSON.parse(JSON.stringify(DOC())));
  const b = S.svc.prepare({ start: 21, end: 26, scope: "full" });
  await until(() => S.svc.status(b.reviewId).state === "ready");
  const token = S.svc.tokenFor(b.reviewId);
  active = "p2";
  await assert.rejects(S.svc.send(b.reviewId, token), (e) => e.status === 409 && e.code === "PROJECT_CHANGED");
  assert.equal(fs.existsSync(S.report), false, "nothing was sent");
  assert.equal(S.store.list("p2").length, 0); assert.equal(S.store.list("p1").length, 1, "only the first check is on record");
});

test("gate: a later check of a smaller part that found a problem takes the pass away for that part; a failed attempt says nothing", (t) => {
  const s = createReviewStore({ dir: tmp(t) });
  const add = (id, status, a, b, key = "K") => s.add("p", { reviewId: id, status, range: { start: a, end: b }, contentKey: key, revision: 1, findings: [], at: id });
  const g = (a, b) => s.gate("p", { key: "K", start: a, end: b }).passed;
  add("r1", "passed", 0, 30);
  assert.equal(g(0, 30), true);
  add("r2", "issues", 10, 15);
  assert.equal(g(0, 30), false, "the whole is no longer passed");
  assert.equal(g(10, 15), false);
  assert.equal(g(0, 10), true, "the parts nobody questioned still are");
  assert.equal(g(15, 30), true);
  assert.equal(g(8, 12), false, "a window that overlaps the problem");
  add("r3", "no_result", 10, 15);
  assert.equal(g(10, 15), false, "a failed attempt does not give the pass back");
  add("r4", "passed", 10, 15);
  assert.equal(g(0, 30), true, "a newer pass of the same content over that part gives it back");
  s.mark("p", { id: "r4", mark: "recheck_needed" });
  assert.equal(g(0, 30), false, "a person's recheck_needed on it takes it away again");
  assert.equal(g(0, 10), true);
  assert.equal(g(0, 30) === false && s.gate("p", { key: "OTHER", start: 0, end: 10 }).passed, false, "another content has no pass");
});

test("fail closed: an address nobody confirmed means nothing is rendered or sent, and a wrong confirmation confirms nothing", { skip }, async (t) => {
  for (const bad of [undefined, "", "somewhere.else.example", "DAILY-CLOUDCODE-PA.GOOGLEAPIS.COM", "daily-cloudcode-pa.googleapis.com "]) {
    const d = tmp(t), sample = makeSample(d), report = path.join(d, "report.json");
    const env = { ...envFor("pass", { report, noConfirm: true }), ...(bad === undefined ? {} : { MONTCLIP_REVIEW_DEST_CONFIRMED: bad }) };
    let jobs = 0;
    const svc = createReviewService({ store: createReviewStore({ dir: path.join(d, "reviews") }), bridge: VB, readProject: DOC, activeProject: () => "p1", agentSendEnabled: () => true,
      requestSample: () => { jobs++; return { id: "x" }; }, getJob: () => ({ status: "done", src: "/previews/s.mp4" }), cancelJob() { }, sampleFile: () => sample,
      ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"), env });
    assert.throws(() => svc.prepare({ start: 24, end: 29 }), (e) => e.status === 409 && e.code === "DESTINATION_UNVERIFIED" && e.destination.verified === false, String(bad));
    assert.throws(() => svc.prepare({ start: 24, end: 29, agent: true, autoSend: true }), (e) => e.code === "DESTINATION_UNVERIFIED");
    assert.equal(jobs, 0, "nothing was rendered"); assert.equal(fs.existsSync(report), false, "and nothing was started");
  }
  const d = VB.destination({});
  assert.deepEqual([d.verified, d.source], [false, "docs"]);
  assert.deepEqual([VB.destination({ MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com" }).verified, VB.destination({ MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com" }).source], [true, "owner-confirmed"]);
});

/* ---- QQ (#328): the model's words never reach the disk ---- */
const NICK = "SENTINEL-NICK-7731";
const filesUnder = (dir) => fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
test("a viewer's name the model quotes is shown for this check but never written to disk; a restart keeps only structured fields", { skip }, async (t) => {
  const S = setup(t, "nick");
  const v = S.svc.prepare({ start: 24, end: 29, mode: "two_pass", scope: "full" });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  /* in this process the words are there to look at */
  assert.equal(rec.status, "issues"); assert.equal(rec.textAvailable, true);
  assert.ok(JSON.stringify(rec).includes(NICK), "the words of the check just made can be read now");
  S.store.mark("p1", { id: v.reviewId, finding: 0, mark: "note", note: "see " + NICK });
  S.store.correct("p1", { id: v.reviewId, digest: "chat shows " + NICK });
  assert.ok(JSON.stringify(S.store.get("p1", v.reviewId)).includes(NICK));
  /* on disk: nothing of it, in any file the review wrote */
  for (const f of filesUnder(path.join(S.d, "reviews"))) assert.ok(!fs.readFileSync(f, "utf8").includes(NICK), f + " has no name");
  const disk = JSON.parse(fs.readFileSync(path.join(S.d, "reviews", "p1.json"), "utf8")).records[0];
  assert.deepEqual(Object.keys(disk.findings[0]).sort(), ["id", "inLead", "mark", "t", "type"]);
  for (const k of ["summary", "windowDigest", "observation"]) assert.ok(!(k in disk), k + " is not stored");
  assert.deepEqual(disk.dimensions.packaging, { state: "issues" });
  assert.ok(disk.marks.every((m) => !("note" in m)) && !("text" in disk.correction));
  /* after a restart (a new store over the same folder) only the structured fields are left */
  const again = createReviewStore({ dir: path.join(S.d, "reviews") }).get("p1", v.reviewId);
  assert.equal(again.textAvailable, false); assert.ok(!JSON.stringify(again).includes(NICK));
  assert.equal(again.findings[0].type, "protected_region_occluded"); assert.equal(again.findings[0].t, 24); assert.equal(again.status, "issues");
  assert.equal(S.store.gate("p1", { key: S.store.contentKey(S.doc()), start: 24, end: 29 }).passed, false, "the gate does not need the words");
});

test("a file from before the rule is scrubbed the first time it is read", (t) => {
  const d = tmp(t);
  fs.writeFileSync(path.join(d, "p1.json"), JSON.stringify({ version: 1, records: [{ reviewId: "r_old", status: "issues", range: { start: 1, end: 5 }, contentKey: "k", summary: "s " + NICK, windowDigest: NICK,
    observation: NICK, findings: [{ id: 0, t: 2, type: "audio", text: NICK, suggestion: NICK, inLead: false, mark: null }], dimensions: { fact: { state: "issues", reason: NICK } },
    marks: [{ id: null, mark: "note", note: NICK, at: "x" }], correction: { text: NICK, at: "y" } }] }));
  const s = createReviewStore({ dir: d });
  const r = s.get("p1", "r_old");
  assert.ok(!JSON.stringify(r).includes(NICK)); assert.equal(r.findings[0].type, "audio"); assert.equal(r.marks.length, 1);
  assert.ok(!fs.readFileSync(path.join(d, "p1.json"), "utf8").includes(NICK), "the old words are gone from the file");
});

test("taste notes: the words never reach the disk either (a nickname can be typed into one); a restart leaves kind and aspect, and nothing is sent from a note without words", { skip }, async (t) => {
  const S = setup(t, "pass");
  S.store.tasteAdd("p1", { kind: "negative", text: "no captions like the one " + NICK });
  S.store.tasteAdd("p1", { kind: "positive", aspect: "pacing", text: "the pause, as " + NICK + " said" });
  for (const x of filesUnder(path.join(S.d, "reviews"))) assert.ok(!fs.readFileSync(x, "utf8").includes(NICK), x + " has no taste words");
  const disk = JSON.parse(fs.readFileSync(path.join(S.d, "reviews", "p1.json"), "utf8")).taste;
  assert.deepEqual(disk.map((n) => Object.keys(n).sort()), [["aspect", "at", "id", "kind"], ["aspect", "at", "id", "kind"]]);
  assert.equal(S.store.tasteSendable("p1").length, 2, "in this process the words are here and a check sends them");
  const v = S.svc.prepare({ start: 24, end: 29, scope: "full" });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  assert.equal(S.svc.status(v.reviewId).willSend.tasteNotes, 2);
  /* after a restart: the notes are there as kinds, without words, and none is sent */
  const again = createReviewStore({ dir: path.join(S.d, "reviews") });
  assert.deepEqual(again.tasteList("p1").map((n) => [n.kind, n.aspect, n.textAvailable]), [["negative", null, false], ["positive", "pacing", false]]);
  assert.ok(!JSON.stringify(again.tasteList("p1")).includes(NICK));
  assert.equal(again.tasteSendable("p1").length, 0);
});

test("a taste note written before the rule is scrubbed of its words the first time it is read", (t) => {
  const d = tmp(t);
  fs.writeFileSync(path.join(d, "p1.json"), JSON.stringify({ version: 1, records: [], taste: [{ id: "t_old", kind: "negative", aspect: null, text: NICK, at: "x" }] }));
  const s = createReviewStore({ dir: d });
  assert.deepEqual(s.tasteList("p1").map((n) => [n.id, n.textAvailable]), [["t_old", false]]);
  assert.ok(!fs.readFileSync(path.join(d, "p1.json"), "utf8").includes(NICK), "gone from the file");
  assert.deepEqual(s.tasteRemove("p1", "t_old"), { removed: "t_old" });
});

/* ---- QQ's findings on 0c6106d0 ---- */
test("a check that was shown and never confirmed expires and stops holding the project; a failed save of the record does not leave it 'sending'", { skip }, async (t) => {
  let clock = 1_000_000;
  const d = tmp(t), sample = makeSample(d), store = createReviewStore({ dir: path.join(d, "reviews") });
  const mk = (st) => createReviewService({ store: st, bridge: VB, readProject: DOC, activeProject: () => "p1", pollMs: 20, now: () => clock,
    requestSample: () => ({ id: "x" }), getJob: () => ({ status: "done", progress: 1, src: "/previews/s.mp4" }), cancelJob() { }, sampleFile: () => sample,
    ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"), env: envFor("pass") });
  const svc = mk(store);
  const a = svc.prepare({ start: 24, end: 29 });
  await until(() => svc.status(a.reviewId).state === "ready");
  assert.throws(() => svc.prepare({ start: 1, end: 5 }), (e) => e.code === "BUSY");
  clock += 11 * 60 * 1000;   // the token ran out
  const b = svc.prepare({ start: 1, end: 5 });   // not BUSY any more
  assert.equal(svc.status(a.reviewId).state, "expired");
  await until(() => svc.status(b.reviewId).state === "ready");
  /* the record cannot be saved (disk full): the check ends failed with a fixed code, the project is free again */
  const broken = Object.create(store); broken.add = () => { throw new Error("ENOSPC: no space left on device, open 'C:\\secret\\path'"); };
  const svc2 = mk(broken);
  const c = svc2.prepare({ start: 24, end: 29 });
  await until(() => svc2.status(c.reviewId).state === "ready");
  await assert.rejects(svc2.send(c.reviewId, svc2.tokenFor(c.reviewId)), (e) => e.status === 500 && e.code === "STORE_FAILED" && !/secret|ENOSPC/.test(e.message));
  assert.equal(svc2.status(c.reviewId).state, "failed");
  svc2.prepare({ start: 1, end: 5 });   // not BUSY
});

test("a ledger that cannot be read is an error and is never replaced by an empty one; a failed write has a fixed code and no path", (t) => {
  const d = tmp(t); fs.writeFileSync(path.join(d, "p1.json"), "{ not json");
  const s = createReviewStore({ dir: d });
  assert.throws(() => s.get("p1", "r"), (e) => e.status === 500 && e.code === "LEDGER_UNREADABLE" && !e.message.includes(d));
  assert.throws(() => s.add("p1", { reviewId: "r", status: "issues", range: { start: 0, end: 1 }, contentKey: "k", findings: [] }), (e) => e.code === "LEDGER_UNREADABLE");
  assert.equal(fs.readFileSync(path.join(d, "p1.json"), "utf8"), "{ not json", "what was there is still there");
  const blocked = path.join(d, "file-not-dir"); fs.writeFileSync(blocked, "x");
  const s2 = createReviewStore({ dir: blocked });
  assert.throws(() => s2.add("p2", { reviewId: "r", status: "issues", range: { start: 0, end: 1 }, contentKey: "k", findings: [] }), (e) => e.status === 500 && ["LEDGER_UNWRITABLE", "LEDGER_UNREADABLE"].includes(e.code) && !e.message.includes(blocked));
});

test("scrubAll cleans every old ledger at start, a project that is never opened included; the totals of video sent are kept", (t) => {
  const d = tmp(t);
  for (const p of ["a", "b"]) fs.writeFileSync(path.join(d, p + ".json"), JSON.stringify({ version: 1, records: [{ reviewId: "r_" + p, status: "issues", range: { start: 1, end: 5 }, contentKey: "k", sentBytes: 1000, summary: NICK, findings: [{ id: 0, t: 1, type: "audio", text: NICK, suggestion: "", inLead: false, mark: null }] }], taste: [{ id: "t1", kind: "negative", text: NICK }] }));
  const s = createReviewStore({ dir: d });
  assert.equal(s.scrubAll(), 2);
  for (const f of fs.readdirSync(d)) assert.ok(!fs.readFileSync(path.join(d, f), "utf8").includes(NICK), f);
  assert.equal(s.sentTotal("a"), 1000);
});

test("what is sent is capped per project: past the cap nothing is started", { skip }, async (t) => {
  const S = setup(t, "pass");
  const small = createReviewService({ store: S.store, bridge: VB, readProject: S.doc, activeProject: () => "p1", pollMs: 20, sendCapBytes: 3_300_000,
    requestSample: () => ({ id: "x" }), getJob: () => ({ status: "done", progress: 1, src: "/previews/s.mp4" }), cancelJob() { }, sampleFile: () => makeSample(S.d),
    ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"), env: envFor("pass", { report: S.report }) });
  const v = small.prepare({ start: 24, end: 29 });
  await until(() => small.status(v.reviewId).state === "ready");
  const rec = await small.send(v.reviewId, small.tokenFor(v.reviewId));
  assert.ok(rec.sentBytes > 0 && rec.sentBytes <= 3_200_000 && Array.isArray(rec.passes) && rec.passes[0].kind === "check", JSON.stringify(rec.passes));
  assert.ok(!JSON.stringify(rec.passes).includes("SENTINEL"), "kinds and sizes only");
  fs.rmSync(S.report, { force: true });
  const w = small.prepare({ start: 24, end: 29 });
  await until(() => small.status(w.reviewId).state === "ready");
  await assert.rejects(small.send(w.reviewId, small.tokenFor(w.reviewId)), (e) => e.status === 409 && e.code === "SEND_LIMIT");
  assert.equal(fs.existsSync(S.report), false, "nothing was started");
});

test("subtitles inside a composition are part of the reference text", () => {
  const doc = { clips: [{ id: "k", kind: "comp", compId: "c1", start: 10, duration: 5 }], comps: [{ id: "c1", clips: [{ start: 1, duration: 2, props: { text: "inside the comp" } }] }] };
  assert.match(skeleton(doc, 9, 16), /11\.00-13\.00s text \(in a composition\): inside the comp/);
});

/* ---- PG's scope decision on #321 (6871888446): what the page says, what prepare keeps and what goes out are the same ---- */
const scopeDoc = () => { const d = DOC(); d.clips.push(
  { id: "x1", start: 20, duration: 3, kind: "text", props: { text: "CROSS-START-LINE" } },
  { id: "x2", start: 25, duration: 5, kind: "text", props: { text: "CROSS-END-LINE" } },
  { id: "x3", start: 40, duration: 2, kind: "text", props: { text: "OUTSIDE-LINE" } }); return d; };
const allPrompts = (S) => fs.readFileSync(S.calls, "utf8").trim().split("\n").map((l) => JSON.parse(l).prompt).join("\n");

test("window (send only these seconds): no taste notes, no project text, at ready and in every request that goes out; a full question's token does not send a window", { skip }, async (t) => {
  const S = setup(t, "pass"); S.setDoc(scopeDoc());
  S.store.tasteAdd("p1", { kind: "negative", text: "HISTORIC-NOTE-WINDOW" });
  const F = setup(t, "pass"); F.setDoc(scopeDoc()); F.store.tasteAdd("p1", { kind: "negative", text: "HISTORIC-NOTE-WINDOW" });
  const full = F.svc.prepare({ start: 24, end: 26, lead: 2, scope: "full" });
  await until(() => F.svc.status(full.reviewId).state === "ready");
  assert.equal(F.svc.status(full.reviewId).willSend.tasteNotes, 1, "a full check shows its note");
  const fullToken = F.svc.tokenFor(full.reviewId);
  const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope: "window", mode: "two_pass" });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const w = S.svc.status(v.reviewId).willSend;
  assert.equal(w.tasteNotes, 0); assert.deepEqual(w.notes, []); assert.equal(w.projectText, "");
  assert.doesNotMatch(w.what, /plus your|plus the subtitles/i);
  await assert.rejects(S.svc.send(v.reviewId, fullToken), (e) => e.status === 403, "the old confirmation is not this one's");
  await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const sent = allPrompts(S);
  for (const w2 of ["HISTORIC-NOTE-WINDOW", "CROSS-START-LINE", "CROSS-END-LINE", "OUTSIDE-LINE"]) assert.ok(!sent.includes(w2), w2 + " did not go out");
  assert.ok(S.store.get("p1", v.reviewId) === null || S.store.get("p1", v.reviewId).tasteNotes === 0, "the record says no notes were sent");
});

test("full: whole subtitle lines that touch the clip go, shown as they are, with the plain warning; lines that do not touch it never go", { skip }, async (t) => {
  const S = setup(t, "pass"); S.setDoc(scopeDoc());
  S.store.tasteAdd("p1", { kind: "negative", text: "HISTORIC-NOTE-FULL" });
  const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope: "full" });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const w = S.svc.status(v.reviewId).willSend;
  assert.match(w.projectText, /CROSS-START-LINE/); assert.match(w.projectText, /CROSS-END-LINE/);
  assert.doesNotMatch(w.projectText, /OUTSIDE-LINE/);
  assert.match(w.what, /may include text from before or after the clip/i);
  assert.equal(w.notes[0].text, "HISTORIC-NOTE-FULL");
  await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const sent = allPrompts(S);
  assert.ok(sent.includes("CROSS-START-LINE") && sent.includes("CROSS-END-LINE") && sent.includes("HISTORIC-NOTE-FULL"), "what was shown went");
  assert.ok(!sent.includes("OUTSIDE-LINE"), "a line that does not touch the clip did not");
});

test("a lead-in is shown with its real range and length; the total is not called the clip's length", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29, lead: 3 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const w = S.svc.status(v.reviewId).willSend;
  assert.deepEqual(w.leadIn, { from: 21, to: 24, seconds: 3 });
  assert.equal(w.seconds, 8);
  assert.match(w.what, /lead-in of 3 s \(21\.00-24\.00 s\)/);
});

/* ---- PG #321 (6871936322): taste aspects, textAvailable, limits ---- */
test("taste: aspect is fact/subtitle/pacing/packaging; 'caption' becomes subtitle; a positive without a real aspect (other, missing, unknown) is refused; a negative may have none", (t) => {
  const s = createReviewStore({ dir: tmp(t) });
  for (const bad of ["other", "", undefined, "overall", "Pacing "]) assert.throws(() => s.tasteAdd("p", { kind: "positive", aspect: bad, text: "x" }), (e) => e.status === 400 && e.code === "BAD_TASTE", String(bad));
  assert.equal(s.tasteAdd("p", { kind: "positive", aspect: "caption", text: "one-word reaction" }).aspect, "subtitle");
  assert.equal(s.tasteAdd("p", { kind: "positive", aspect: "fact", text: "names right" }).aspect, "fact");
  assert.equal(s.tasteAdd("p", { kind: "negative", text: "no explaining" }).aspect, null);
  assert.equal(s.tasteAdd("p", { kind: "negative", aspect: "packaging", text: "too many plates" }).aspect, "packaging");
  assert.throws(() => s.tasteAdd("p", { kind: "negative", aspect: "vibes", text: "x" }), (e) => e.code === "BAD_TASTE");
});

test("taste: 30 per project and 200 UTF-16 units per note; a full list says so and drops nothing; after a restart the note is there without words and is not sent", (t) => {
  const d = tmp(t), s = createReviewStore({ dir: d });
  const n = s.tasteAdd("p", { kind: "negative", text: "😀".repeat(150) });
  assert.ok(n.text.length <= 200 && !/[\ud800-\udbff]$/.test(n.text));
  for (let i = 1; i < 30; i++) s.tasteAdd("p", { kind: "negative", text: "n" + i });
  assert.throws(() => s.tasteAdd("p", { kind: "negative", text: "31st" }), (e) => e.status === 400 && e.code === "TASTE_FULL");
  assert.equal(s.tasteList("p").length, 30, "nothing was dropped to make room");
  const again = createReviewStore({ dir: d });          // a new process: the words are gone
  assert.equal(again.tasteList("p").length, 30);
  assert.ok(again.tasteList("p").every((x) => x.textAvailable === false && x.text === ""));
  assert.deepEqual(again.tasteSendable("p"), [], "nothing without words is sent");
  assert.ok(!fs.readFileSync(path.join(d, "p.json"), "utf8").includes("n1"), "the words are not on disk");
});

test("taste: what is sent counts only notes whose words are here and only in a full check; the page is told the words last for this run only", { skip }, async (t) => {
  const S = setup(t, "pass");
  S.store.tasteAdd("p1", { kind: "negative", text: "NOTE-ONE" });
  const v = S.svc.prepare({ start: 24, end: 29, scope: "full" });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const w = S.svc.status(v.reviewId).willSend;
  assert.equal(w.tasteNotes, 1); assert.equal(w.tasteNotice, "文字只在本次运行保留，重启后需重新填写");
});

/* ---- PG v4.1 (6871970875): the window wording is exact; how many notes lost their words is told ---- */
test("window wording is the adopted sentence and matches the payload; the page is told how many notes lost their words at a restart", { skip }, async (t) => {
  const S = setup(t, "pass"); S.setDoc(scopeDoc());
  const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope: "window" });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const w = S.svc.status(v.reviewId).willSend;
  assert.ok(w.what.includes("No subtitle text, edit points, or good/bad examples are attached; subtitles already burned into the picture still go out with the video."), w.what);
  assert.equal(w.tasteLost, 0);
  /* a note whose words a restart took away: kept as a record, not sent, and counted for the page */
  const d = path.join(S.d, "reviews2"), first = createReviewStore({ dir: d });
  first.tasteAdd("p1", { kind: "negative", text: "LOST-WORDS" });
  const again = createReviewStore({ dir: d });
  const svc2 = createReviewService({ store: again, bridge: VB, readProject: () => scopeDoc(), activeProject: () => "p1", pollMs: 20,
    requestSample: () => ({ id: "x" }), getJob: () => ({ status: "done", progress: 1, src: "/previews/s.mp4" }), cancelJob() { }, sampleFile: () => makeSample(S.d),
    ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"), env: envFor("pass", { report: S.report, calls: S.calls }) });
  const f = svc2.prepare({ start: 24, end: 26, scope: "full" });
  await until(() => svc2.status(f.reviewId).state === "ready");
  const fw = svc2.status(f.reviewId).willSend;
  assert.equal(fw.tasteNotes, 0); assert.equal(fw.tasteLost, 1);
  assert.doesNotMatch(fw.what, /saved taste note/, "no note is announced that will not go");
});

/* ---- Deja: the fixed standards and questions are in willSend, and are what is sent ---- */
test("willSend carries the five standards, the five questions and the fixed ask, and they are exactly what the request carries; in two passes only the second one has them", { skip }, async (t) => {
  for (const mode of ["single", "two_pass"]) {
    const S = setup(t, "pass");
    const v = S.svc.prepare({ start: 24, end: 29, mode });
    await until(() => S.svc.status(v.reviewId).state === "ready");
    const st = S.svc.status(v.reviewId).willSend.standards;
    assert.ok(st && st.rules.length === 5 && st.questions.length === 5 && typeof st.ask === "string", mode);
    assert.equal(st.carriedBy, mode === "two_pass" ? "second" : "only");
    await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
    const calls = fs.readFileSync(S.calls, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const main = calls[calls.length - 1].prompt;
    const rules = st.rules.map((r, i) => `${i + 1}. ${r}`).join("\n"), questions = st.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    assert.ok(main.includes(rules + "\n"), mode + ": the five standards, as shown, are in the request in this order");
    assert.ok(main.includes(questions + "\n" + st.ask), mode + ": the five questions and the ask, as shown, are in the request");
    if (mode === "two_pass") for (const x of [...st.rules, ...st.questions, st.ask]) assert.ok(!calls[0].prompt.includes(x), "the blind first look has none of it");
  }
});

/* ---- PG (#321 6872473697): "only these seconds": the actual payload is checked against the English sentence the API returns ---- */
test("window: the request itself carries 0 good/bad examples, no edit points, no project text, no subtitle text of its own; willSend.what is the adopted sentence", { skip }, async (t) => {
  for (const mode of ["single", "two_pass"]) {
    const S = setup(t, "pass"); S.setDoc(scopeDoc());
    S.store.tasteAdd("p1", { kind: "negative", text: "HISTORIC-NOTE-WINDOW" });
    S.store.tasteAdd("p1", { kind: "positive", aspect: "pacing", text: "HISTORIC-PRAISE-WINDOW" });
    const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope: "window", mode });
    await until(() => S.svc.status(v.reviewId).state === "ready");
    const w = S.svc.status(v.reviewId).willSend;
    assert.ok(w.what.includes("No subtitle text, edit points, or good/bad examples are attached; subtitles already burned into the picture still go out with the video."), w.what);
    assert.equal(w.tasteNotes, 0); assert.deepEqual(w.notes, []); assert.equal(w.projectText, "");
    const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
    assert.equal(rec.tasteNotes, 0, mode + ": the record says no examples went");
    const calls = fs.readFileSync(S.calls, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(calls.length, mode === "two_pass" ? 2 : 1);
    for (const c of calls) {
      for (const bad of ["APPROVED before", "REJECTED before", "HISTORIC-NOTE-WINDOW", "HISTORIC-PRAISE-WINDOW", "text from the project", "clip starts", "cut points", "CROSS-START-LINE", "CROSS-END-LINE", "OUTSIDE-LINE", "text:"])
        assert.ok(!c.prompt.includes(bad), mode + ": the request has no \"" + bad + "\"");
    }
  }
});

/* ---- Deja: whatever willSend says about a scope is what the request carries, for every scope; change one, change all three (engine, page, test) ---- */
test("scope contract: for window and for full, what willSend claims (what / tasteNotes / notes / projectText) is exactly what the request carries", { skip }, async (t) => {
  const claim = { window: /No subtitle text, edit points, or good\/bad examples are attached/, full: /plus the subtitles and cut points that touch it .*saved taste note|plus the subtitles and cut points that touch it/ };
  for (const scope of ["window", "full"]) {
    const S = setup(t, "pass"); S.setDoc(scopeDoc());
    S.store.tasteAdd("p1", { kind: "negative", text: "CONTRACT-NOTE" });
    const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope });
    await until(() => S.svc.status(v.reviewId).state === "ready");
    const w = S.svc.status(v.reviewId).willSend;
    assert.match(w.what, claim[scope], scope);
    await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
    const prompt = JSON.parse(fs.readFileSync(S.report, "utf8")).prompt;
    const hasNote = prompt.includes("CONTRACT-NOTE"), hasLines = prompt.includes("CROSS-START-LINE") && prompt.includes("CROSS-END-LINE"), hasCuts = prompt.includes("clip starts");
    assert.equal(hasNote, w.notes.some((n) => n.text === "CONTRACT-NOTE"), scope + ": notes shown = notes sent");
    assert.equal(hasNote, /saved taste note/.test(w.what), scope + ": the sentence about examples appears exactly when examples go");
    assert.equal(w.tasteNotes, hasNote ? 1 : 0);
    assert.equal(hasLines, w.projectText.includes("CROSS-START-LINE") && w.projectText.includes("CROSS-END-LINE"), scope + ": subtitle lines shown = lines sent");
    assert.equal(hasCuts, w.projectText.includes("clip starts"), scope + ": cut points shown = cut points sent");
    assert.equal(hasLines, scope === "full"); assert.equal(hasNote, scope === "full");
    assert.ok(!prompt.includes("OUTSIDE-LINE"), scope);
  }
});

/* ---- #334 / #333 (QQ's review of #328, "may be a problem"): what has been sent is counted on its own, not from the records that happen to be left ---- */
test("#334: a send whose record could not be saved (STORE_FAILED) still counts toward the project's cap", { skip }, async (t) => {
  const S = setup(t, "pass");
  S.store.add = () => { throw Object.assign(new Error("disk full"), { status: 500, code: "LEDGER_UNWRITABLE" }); };
  const v = S.svc.prepare({ start: 24, end: 29 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  await assert.rejects(S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId)), (e) => e.code === "STORE_FAILED");
  assert.ok(S.store.sentTotal("p1") > 0, "the video went out, so it is counted");
});

test("#334: records rolling off the end of the ledger do not make the total smaller", (t) => {
  const s = createReviewStore({ dir: tmp(t) });
  for (let i = 0; i < 205; i++) { s.countSent("p", 1000); s.add("p", { reviewId: "r" + i, status: "issues", range: { start: 0, end: 1 }, contentKey: "k", sentBytes: 1000, findings: [] }); }
  assert.equal(s.list("p", 500).length, 200, "only 200 records are kept");
  assert.equal(s.sentTotal("p"), 205_000, "but all 205 sends are counted");
});

test("#333/#334: a ledger removed because its old words could not be cleaned away takes the sent total with it only on disk; this process keeps counting", (t) => {
  const d = tmp(t), s = createReviewStore({ dir: d });
  s.countSent("p", 5000);
  const f = path.join(d, "p.json");
  fs.writeFileSync(f, JSON.stringify({ version: 1, sentBytesTotal: 5000, records: [{ reviewId: "r", status: "issues", range: { start: 0, end: 1 }, contentKey: "k", sentBytes: 5000, summary: NICK, findings: [] }] }));
  fs.mkdirSync(f + "." + process.pid + ".tmp");           // the cleaned copy cannot be written
  assert.equal(s.list("p").length, 0, "nothing is read from a file that could not be cleaned");
  assert.equal(fs.existsSync(f), false, "the file with the old words is gone");
  assert.equal(s.sentTotal("p"), 5000, "the count is kept by this process");
});

/* QQ's ruling on #321 (6874674433): an agent may send without a click, and every such send is written to the local record: where, which kinds, how many bytes, who started it, when; no free text */
test("an agent's send (switch on) is recorded on disk with service and domain, kinds, bytes, initiator and time, and no free text", { skip }, async (t) => {
  const S = setup(t, "issues", { agentSend: true });
  const v = S.svc.prepare({ start: 24, end: 29, scope: "full", agent: true, autoSend: true });
  const rec = await until(() => { const x = S.store.list("p1", 5)[0]; return x && x.reviewId === v.reviewId ? x : null; });
  const disk = JSON.parse(fs.readFileSync(path.join(S.d, "reviews", "p1.json"), "utf8")), onDisk = disk.records.find((r) => r.reviewId === v.reviewId);
  assert.equal(onDisk.source, "agent");
  assert.deepEqual({ service: onDisk.destination.service, host: onDisk.destination.host }, { service: "Google Gemini", host: "daily-cloudcode-pa.googleapis.com" });
  assert.ok(onDisk.sentBytes > 0 && onDisk.sentBytes <= 3_355_443);
  assert.ok(Array.isArray(onDisk.passes) && onDisk.passes.length >= 1 && onDisk.passes.every((p) => typeof p.kind === "string" && p.clipBytes > 0));
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(onDisk.at));
  assert.ok(disk.sentBytesTotal >= onDisk.sentBytes, "the send is counted");
  const text = JSON.stringify(disk);
  for (const w of ["The name plates look swapped", "Host on the left", "Swap the two name plates"]) assert.ok(!text.includes(w), "no free text on disk: " + w);
  assert.equal(rec.source, "agent");
});

/* QQ on #339: a ledger that cannot be read stops the send before anything goes out; no ledger at all is just the first send */
test("a ledger that cannot be read stops a send before anything leaves: the tool is not started, the sample is dropped, the ledger is not touched", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  fs.mkdirSync(path.join(S.d, "reviews"), { recursive: true });
  const f = path.join(S.d, "reviews", "p1.json"); fs.writeFileSync(f, "{ not json");
  await assert.rejects(S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId)), (e) => e.status === 500 && e.code === "LEDGER_UNREADABLE" && !String(e.message).includes(S.d));
  assert.equal(fs.existsSync(S.report), false, "the tool was never started");
  assert.equal(fs.readFileSync(f, "utf8"), "{ not json", "what was there is still there");
  assert.throws(() => S.store.sentTotal("p1"), (e) => e.code === "LEDGER_UNREADABLE", "the total is not guessed as 0");
});
test("with no ledger yet the first send goes as usual, and is counted", { skip }, async (t) => {
  const S = setup(t, "pass");
  assert.equal(S.store.sentTotal("p1"), 0, "nothing sent yet");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await until(() => S.svc.status(v.reviewId).state === "ready");
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.equal(rec.status, "passed"); assert.equal(fs.existsSync(S.report), true, "the tool ran");
  assert.ok(S.store.sentTotal("p1") > 0);
});
