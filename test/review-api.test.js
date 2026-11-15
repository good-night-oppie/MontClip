"use strict";
/* #321 — the check of a stretch of the timeline: the record (review-store.js) and the steps (review-service.js), with a stand-in for the
   desktop main process's sender (test/fixtures/fake-sender.js; ADR #341). No network; the project is never written. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const FF = require("../server/ffmpeg-path");
const VB = require("../server/video-bridge");
const OR = require("../server/openrouter-review");
const { createReviewStore, contentKey } = require("../server/review-store");
const { createReviewService, skeleton } = require("../server/review-service");
const { fakeSender, NICK } = require("./fixtures/fake-sender");

let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch { }
const skip = HAS_FFMPEG ? false : "needs ffmpeg";
const tmp = (t, p = "mcrv-") => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); t.after(() => VB.rmForce(d)); return d; };
/* the owner's confirmation of the new address; a secret in the environment that must never travel */
const ENV = Object.freeze({ SECRET_TOKEN_FOR_TEST: "s3cret-value", MONTCLIP_REVIEW_DEST_CONFIRMED: "openrouter.ai" });
function makeSample(dir, sec = 8) {
  const f = path.join(dir, "sample.mp4");
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=30:duration=${sec}`, "-f", "lavfi", "-i", `sine=f=440:duration=${sec}`,
    "-c:v", "mpeg4", "-c:a", "aac", "-shortest", f], { windowsHide: true });
  return f;
}
/** a fresh copy of the sample for every render (a check removes its sample once it was sent or ended) */
function sampler(dir) { const master = makeSample(dir); let n = 0; return () => { const f = path.join(dir, `render_${++n}.mp4`); fs.copyFileSync(master, f); return f; }; }
const DOC = () => ({ revision: 7, inPoint: 2, outPoint: 9, agentLog: [{ a: 1 }], clips: [
  { id: "c1", start: 20, duration: 4, kind: "video" }, { id: "c2", start: 24, duration: 5, kind: "video" },
  { id: "t1", start: 21, duration: 2, kind: "text", props: { text: "大家好 hello" } }] });
const hashOf = (svc, id) => { try { const w = svc.status(id).willSend; return w ? w.hash : undefined; } catch { return undefined; } };
/** createReviewService with the test's defaults (switch on, the owner's confirmation, a done render); send() fills in the hash the page was shown */
function mk(opts) {
  const svc = createReviewService({ pollMs: 20, sendSwitch: () => true, env: ENV, requestSample: () => ({ id: "x" }), getJob: () => ({ status: "done", progress: 1, src: "/previews/s.mp4" }),
    cancelJob() { }, ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"), ...opts });
  const send = svc.send;
  svc.send = (id, token, ...h) => send(id, token, h.length ? h[0] : hashOf(svc, id));
  return svc;
}

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

test("store: a DESTINATION_MISMATCH stop is kept in the ledger (a restart does not lift it) until unblock; a ledger that cannot be read throws", (t) => {
  const dir = tmp(t), s = createReviewStore({ dir });
  assert.equal(s.blocked("p"), null);
  s.block("p", { reason: "DESTINATION_MISMATCH" });
  assert.equal(s.blocked("p").reason, "DESTINATION_MISMATCH");
  assert.equal(createReviewStore({ dir }).blocked("p").reason, "DESTINATION_MISMATCH", "after a restart too");
  assert.deepEqual(s.unblock("p"), { unblocked: true });
  assert.equal(s.blocked("p"), null);
  fs.writeFileSync(path.join(dir, "q.json"), "{ not json");
  assert.throws(() => s.blocked("q"), (e) => e.code === "LEDGER_UNREADABLE");
});

/* ---- the steps ---- */
function setup(t, mode, extra = {}) {
  const d = tmp(t), sampleFile = sampler(d), calls = [];
  const store = createReviewStore({ dir: path.join(d, "reviews") });
  let doc = DOC(), jobs = 0, cancelled = [], sendCancels = [];
  const svc = mk({
    store, bridge: extra.bridge || VB, readProject: () => doc, activeProject: () => (extra.active ? extra.active() : "p1"), agentSendEnabled: () => !!extra.agentSend,
    requestSample: ({ range }) => { jobs++; return { id: "x_" + jobs, range }; },
    getJob: () => ({ status: extra.jobStatus || "done", progress: 1, src: "/previews/sample.mp4" }),
    cancelJob: (id) => cancelled.push(id), sampleFile, tmpRoot: d, cancelSend: (id) => sendCancels.push(id),
    sender: extra.sender === undefined ? fakeSender(mode, { calls, ...(extra.senderOpts || {}) }) : extra.sender,
    ...(extra.sendSwitch ? { sendSwitch: extra.sendSwitch } : {}), ...(extra.cap ? { sendCapBytes: extra.cap } : {}),
  });
  return { d, svc, store, calls, sampleFile, setDoc: (x) => { doc = x; }, doc: () => doc, cancelled, sendCancels, jobsMade: () => jobs };
}
const until = async (fn, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 25)); } };
const ready = (S, id) => until(() => S.svc.status(id).state === "ready");

test("a person's check: ready with what is sent and to whom, sent only with the one-time token and the hash, the project untouched", { skip }, async (t) => {
  const S = setup(t, "issues"), before = JSON.stringify(S.doc());
  const v = S.svc.prepare({ start: 24, end: 29 });
  assert.ok(["rendering", "ready"].includes(v.state), "the stand-in's job is done at once");
  await ready(S, v.reviewId);
  const st = S.svc.status(v.reviewId);
  assert.equal(st.willSend.to.host, "openrouter.ai");
  assert.equal(st.willSend.to.host, "openrouter.ai");
  assert.match(st.willSend.what, /No subtitle text, edit points, or good\/bad examples are attached/);
  assert.match(st.willSend.what, /no sound in the video\) and its sound as a separate WAV \(48 kHz, stereo\)/);
  assert.ok(st.willSend.videoBytes > 0 && st.willSend.videoBytes <= VB.MAX_SAMPLE_BYTES && st.willSend.audioBytes > 0 && st.willSend.audio === true);
  assert.match(st.willSend.hash, /^[0-9a-f]{64}$/);
  assert.equal(st.sendToken, undefined, "the token is not in the shared view");
  assert.equal(st.range.start, 24); assert.equal(st.lead, 3);
  const token = S.svc.tokenFor(v.reviewId);
  assert.match(token, /^[0-9a-f]{48}$/);
  await assert.rejects(S.svc.send(v.reviewId, "wrong"), (e) => e.status === 403 && e.code === "NOT_CONFIRMED");
  await assert.rejects(S.svc.send(v.reviewId, undefined), (e) => e.status === 403);
  assert.equal(S.calls.length, 0, "nothing was sent without the token");
  const rec = await S.svc.send(v.reviewId, token);
  assert.equal(rec.status, "issues");
  assert.equal(rec.findings.find((f) => f.type === "speaker_swapped").t, 25, "sample second 4.0 + the sample's start 21 (24 minus the 3 s lead-in)");
  assert.ok(rec.findings.some((f) => f.inLead), "the lead-in problem is marked");
  assert.equal(S.calls.length, 1); assert.equal(S.calls[0].meta.agent, false); assert.equal(S.calls[0].meta.reviewId, v.reviewId);
  const vid = S.calls[0].req.messages[0].content[1].video_url.url.replace(/^data:video\/mp4;base64,/, "");
  assert.equal(Buffer.from(vid, "base64").length, st.willSend.videoBytes, "the video that went is the one shown");
  await assert.rejects(S.svc.send(v.reviewId, token), (e) => e.status === 409, "the token works once");
  assert.equal(JSON.stringify(S.doc()), before, "revision, IN/OUT, clips and the log are exactly as they were");
  assert.equal(S.store.get("p1", v.reviewId).status, "issues");
});

test("HASH_MISMATCH: a send that names another hash than the one shown (or none) is refused and nothing goes", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  const token = S.svc.tokenFor(v.reviewId);
  for (const h of ["0".repeat(64), "", null, 12]) await assert.rejects(S.svc.send(v.reviewId, token, h), (e) => e.status === 403 && e.code === "HASH_MISMATCH", String(h));
  assert.equal(S.calls.length, 0, "nothing was sent");
  assert.equal((await S.svc.send(v.reviewId, token)).status, "passed", "the hash that was shown sends");
});

test("the streamer's switch: off (the default), prepare is refused before anything is rendered; switched off after it was shown, nothing goes", { skip }, async (t) => {
  let on = false;
  const S = setup(t, "pass", { sendSwitch: () => on });
  assert.throws(() => S.svc.prepare({ start: 24, end: 29 }), (e) => e.status === 409 && e.code === "REVIEW_SEND_OFF");
  assert.throws(() => S.svc.prepare({ start: 24, end: 29, agent: true, autoSend: true }), (e) => e.code === "REVIEW_SEND_OFF");
  assert.equal(S.jobsMade(), 0, "nothing was rendered");
  const d = createReviewService({ store: S.store, bridge: VB, readProject: S.doc, activeProject: () => "p1", requestSample: () => { throw new Error("must not render"); },
    getJob: () => null, cancelJob() { }, sampleFile: () => null, ffmpeg: () => "x", ffprobe: () => "x", env: ENV, sender: fakeSender("pass") });
  assert.throws(() => d.prepare({ start: 24, end: 29 }), (e) => e.code === "REVIEW_SEND_OFF", "the service's own default is off");
  on = true;
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  on = false;
  await assert.rejects(S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId)), (e) => e.status === 409 && e.code === "REVIEW_SEND_OFF");
  assert.equal(S.calls.length, 0); assert.equal(S.svc.status(v.reviewId).state, "failed");
});

test("DESTINATION_MISMATCH: an answer from anyone but Google AI Studio is recorded as such, and this project's later sends stop until the streamer confirms again", { skip }, async (t) => {
  const S = setup(t, "pass", { senderOpts: { provider: "Some Other" } });
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.equal(rec.status, "no_result"); assert.equal(rec.reason, "DESTINATION_MISMATCH"); assert.equal(rec.audioVerified, false);
  assert.deepEqual(rec.receipts.map((r) => r.provider), ["Some Other"]);
  assert.ok(rec.sentBytes > 0 && S.store.sentTotal("p1") >= rec.sentBytes, "what went is counted all the same");
  assert.equal(S.store.blocked("p1").reason, "DESTINATION_MISMATCH");
  assert.throws(() => S.svc.prepare({ start: 24, end: 29 }), (e) => e.status === 409 && e.code === "DESTINATION_BLOCKED");
  assert.equal(S.svc.status(v.reviewId).state, "done");
  assert.deepEqual(S.svc.unblock(), { unblocked: true });
  const w = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, w.reviewId);
  assert.equal(S.svc.status(w.reviewId).state, "ready", "after the streamer's confirmation it may go again");
});

test("picture only (audio:false): no WAV is made or sent, the page is told so, and the result says the sound was not checked", { skip }, async (t) => {
  const S = setup(t, "pass");
  assert.throws(() => S.svc.prepare({ start: 24, end: 29, audio: "yes" }), (e) => e.status === 400 && e.code === "BAD_AUDIO");
  const v = S.svc.prepare({ start: 24, end: 29, audio: false });
  await ready(S, v.reviewId);
  const w = S.svc.status(v.reviewId).willSend;
  assert.equal(w.audio, false); assert.equal(w.audioBytes, 0); assert.match(w.what, /picture only \(no sound sent\)/);
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.deepEqual(S.calls[0].req.messages[0].content.map((c) => c.type), ["text", "video_url"], "no input_audio went");
  assert.ok(rec.states.includes("sound_not_checked")); assert.notEqual(rec.status, "passed"); assert.equal(rec.audioVerified, false);
});

test("timeline seconds: the sample starts lead seconds before the stretch", { skip }, async (t) => {
  const S = setup(t, "issues");
  const v = S.svc.prepare({ start: 24, end: 29, lead: 2 });
  await ready(S, v.reviewId);
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const swapped = rec.findings.find((f) => f.type === "speaker_swapped"), lead = rec.findings.find((f) => f.type === "cut_jump");
  assert.equal(swapped.t, 26, "sample second 4.0 is timeline second 22 + 4");
  assert.equal(swapped.inLead, false);
  assert.equal(lead.t, 22.5); assert.equal(lead.inLead, true);
  /* the stand-in render is the same 8 s file whatever the range, so the end is the sample's own length on the timeline */
  assert.deepEqual(rec.reviewed && [rec.reviewed.start, Math.round(rec.reviewed.end)], [22, 30], "the stretch that was looked at, on the timeline");
});

test("an agent's request with send:true is OFF by default; with the switch on it is sent when ready, as an agent's; a page cannot ask for that", { skip }, async (t) => {
  const off = setup(t, "pass");
  assert.throws(() => off.svc.prepare({ start: 24, end: 29, agent: true, autoSend: true }), (e) => e.status === 403 && e.code === "AGENT_SEND_OFF");
  assert.equal(off.jobsMade(), 0, "nothing is rendered either");
  const S = setup(t, "pass", { agentSend: true });
  assert.throws(() => S.svc.prepare({ start: 24, end: 29, agent: false, autoSend: true }), (e) => e.status === 403 && e.code === "CLICK_REQUIRED");
  const v = S.svc.prepare({ start: 24, end: 29, agent: true, autoSend: true });
  const done = await until(() => { const s = S.svc.status(v.reviewId); return s.state === "done" && s; });
  assert.equal(done.result.status, "passed");
  assert.equal(done.result.source, "agent");
  assert.equal(S.calls[0].meta.agent, true, "the main process is told it is the dev-side agent's send");
  assert.equal(S.svc.tokenFor(v.reviewId), null);
});

test("one check of a project at a time; cancelling ends it and revokes the token", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29 });
  assert.throws(() => S.svc.prepare({ start: 1, end: 5 }), (e) => e.status === 409 && e.code === "BUSY");
  await ready(S, v.reviewId);
  const token = S.svc.tokenFor(v.reviewId);
  const c = S.svc.cancel(v.reviewId);
  assert.equal(c.state, "cancelled");
  assert.equal(S.svc.tokenFor(v.reviewId), null);
  await assert.rejects(S.svc.send(v.reviewId, token, "0".repeat(64)), (e) => e.status === 409);
  assert.equal(S.calls.length, 0, "nothing was sent");
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

test("without a sender (not started by the desktop app): NO_SENDER before rendering", { skip }, (t) => {
  const S = setup(t, "pass");
  const svc = mk({ store: S.store, bridge: VB, readProject: S.doc, activeProject: () => "p1", requestSample: () => { throw new Error("must not render"); },
    getJob: () => null, sampleFile: () => null, sender: null });
  assert.throws(() => svc.prepare({ start: 1, end: 5 }), (e) => e.status === 409 && e.code === "NO_SENDER");
});

test("scope window sends no project text; scope full sends the subtitles and cut points of the stretch, as reference", { skip }, async (t) => {
  const W = setup(t, "pass");
  const w = W.svc.prepare({ start: 21, end: 26, scope: "window" });
  await ready(W, w.reviewId);
  await W.svc.send(w.reviewId, W.svc.tokenFor(w.reviewId));
  const wp = W.calls[0].prompt;
  assert.ok(!/REFERENCE/.test(wp) && !wp.includes("大家好"), "no project text");
  const F = setup(t, "pass");
  const f = F.svc.prepare({ start: 21, end: 26, scope: "full" });
  await ready(F, f.reviewId);
  await F.svc.send(f.reviewId, F.svc.tokenFor(f.reviewId));
  assert.match(F.calls[0].prompt, /<<<REFERENCE[\s\S]*大家好 hello[\s\S]*REFERENCE>>>/);
});

test("nothing secret reaches the request, the record or the answer", { skip }, async (t) => {
  const S = setup(t, "issues");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const body = JSON.stringify(S.calls[0].req);
  assert.ok(!body.includes("s3cret-value") && !/Authorization|Bearer|sk-/.test(body), "no secret and no key in what goes out (the key is the main process's)");
  assert.ok(!body.includes(S.d) && !body.includes(os.userInfo().username), "no path or user name in what goes out");
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
  await ready(S, v.reviewId);
  const w = S.svc.status(v.reviewId).willSend;
  assert.equal(w.requests, 2); assert.equal(w.tasteNotes, 2);
  assert.match(w.what, /2 requests/); assert.match(w.what, /2 saved taste notes/);
  assert.deepEqual(w.to, { ...VB.destination({ MONTCLIP_REVIEW_DEST_CONFIRMED: "openrouter.ai" }) }, "what is shown is the one decision");
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.deepEqual(rec.destination, w.to, "the record says what was shown");
  assert.equal(rec.mode, "two_pass"); assert.equal(rec.requests, 2); assert.equal(rec.tasteNotes, 2);
  assert.equal(rec.dimensions.fact.state, "passed");
  assert.deepEqual(S.calls.map((c) => c.kind), ["blind", "main"], "the clip really went in 2 requests");
  assert.ok(S.calls[1].prompt.includes("the pause before the reply") && !S.calls[0].prompt.includes("the pause before the reply"));
  assert.throws(() => S.svc.prepare({ start: 1, end: 5, mode: "three" }), (e) => e.status === 400 && e.code === "BAD_MODE");
});

test("where it goes is checked again at the moment of sending: a change since it was shown stops the send", { skip }, async (t) => {
  let host = "openrouter.ai";
  const moving = { ...VB, destination: () => Object.freeze({ ...OR.DESTINATION_INFO, host, source: "owner-confirmed", verified: true }) };
  const S = setup(t, "pass", { bridge: moving });
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  const token = S.svc.tokenFor(v.reviewId);
  host = "somewhere.else.example";
  await assert.rejects(S.svc.send(v.reviewId, token), (e) => e.status === 409 && e.code === "DESTINATION_CHANGED");
  assert.equal(S.calls.length, 0, "nothing was sent");
  assert.equal(S.svc.status(v.reviewId).state, "failed");
});

test("hard rule over the four verdicts, through the whole check: names right but packaging issues is not a pass and the gate says no", { skip }, async (t) => {
  const S = setup(t, "packaging");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
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
test("a cancel that comes while the request is being made keeps it from ever going", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  const sending = S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  const c = S.svc.cancel(v.reviewId);       // the main process is told (cancelSend) and the flag is set
  const rec = await sending;
  assert.equal(c.state === "cancelled" || c.state === "sending", true);
  assert.deepEqual(S.sendCancels, [v.reviewId], "the main process was told to stop it");
  assert.equal(rec.status, "no_result"); assert.equal(rec.reason, "CANCELLED");
  assert.equal(S.calls.length, 0, "the request was never handed to the sender");
  assert.equal(S.svc.status(v.reviewId).state, "cancelled");
});

test("what goes out is what was shown: a project switched, a word edited or a note added after prepare is not sent", { skip }, async (t) => {
  let active = "p1";
  const S = setup(t, "pass", { active: () => active });
  /* the project's words are the ones at prepare */
  const a = S.svc.prepare({ start: 21, end: 26, scope: "full" });
  await ready(S, a.reviewId);
  assert.ok(S.svc.status(a.reviewId).willSend.projectText.includes("大家好 hello"), "the page is shown the words that will go");
  S.store.tasteAdd("p1", { kind: "negative", text: "NOTE-ADDED-AFTER-THE-QUESTION" });
  assert.equal(S.svc.status(a.reviewId).willSend.tasteNotes, 0);
  await S.svc.send(a.reviewId, S.svc.tokenFor(a.reviewId));
  const prompt = S.calls[0].prompt;
  assert.ok(prompt.includes("大家好 hello"), "the words that were shown");
  assert.ok(!prompt.includes("NOTE-ADDED-AFTER-THE-QUESTION"), "a note added since is not sent");
  /* an edit after the sample was made: the picture is stale, so nothing is sent */
  const e = S.svc.prepare({ start: 21, end: 26, scope: "full" });
  await ready(S, e.reviewId);
  const tokenE = S.svc.tokenFor(e.reviewId), hashE = hashOf(S.svc, e.reviewId);
  const doc2 = JSON.parse(JSON.stringify(S.doc())); doc2.clips.find((c) => c.id === "t1").props.text = "SECRET-OF-ANOTHER-EDIT"; S.setDoc(doc2);
  await assert.rejects(S.svc.send(e.reviewId, tokenE, hashE), (x) => x.status === 409 && x.code === "PROJECT_EDITED");
  assert.equal(S.calls.length, 1, "nothing more was sent");
  /* another project open now: the old token is refused and nothing starts */
  S.setDoc(JSON.parse(JSON.stringify(DOC())));
  const b = S.svc.prepare({ start: 21, end: 26, scope: "full" });
  await ready(S, b.reviewId);
  const token = S.svc.tokenFor(b.reviewId), hash = hashOf(S.svc, b.reviewId);
  active = "p2";
  await assert.rejects(S.svc.send(b.reviewId, token, hash), (e) => e.status === 409 && e.code === "PROJECT_CHANGED");
  assert.equal(S.calls.length, 1, "nothing more was sent");
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

test("fail closed: an address nobody confirmed means nothing is rendered or sent; a wrong confirmation (the old address's included) confirms nothing; 409 carries the destination", { skip }, async (t) => {
  for (const bad of [undefined, "", "somewhere.else.example", "OPENROUTER.AI", "openrouter.ai ", "daily-cloudcode-pa.googleapis.com"]) {
    const d = tmp(t), calls = [];
    const env = { SECRET_TOKEN_FOR_TEST: "s3cret-value", ...(bad === undefined ? {} : { MONTCLIP_REVIEW_DEST_CONFIRMED: bad }) };
    let jobs = 0;
    const svc = mk({ store: createReviewStore({ dir: path.join(d, "reviews") }), bridge: VB, readProject: DOC, activeProject: () => "p1", agentSendEnabled: () => true,
      requestSample: () => { jobs++; return { id: "x" }; }, sampleFile: () => null, env, sender: fakeSender("pass", { calls }) });
    assert.throws(() => svc.prepare({ start: 24, end: 29 }), (e) => e.status === 409 && e.code === "DESTINATION_UNVERIFIED"
      && JSON.stringify(e.destination) === JSON.stringify({ ...OR.DESTINATION_INFO, source: "docs", verified: false }), String(bad));
    assert.throws(() => svc.prepare({ start: 24, end: 29, agent: true, autoSend: true }), (e) => e.code === "DESTINATION_UNVERIFIED");
    assert.equal(jobs, 0, "nothing was rendered"); assert.equal(calls.length, 0, "and nothing was sent");
  }
  const d = VB.destination({});
  assert.deepEqual([d.verified, d.source], [false, "docs"]);
  const ok = VB.destination({ MONTCLIP_REVIEW_DEST_CONFIRMED: "openrouter.ai" });
  assert.deepEqual([ok.verified, ok.source], [true, "owner-confirmed"]);
});

/* ---- QQ (#328): the model's words never reach the disk ---- */
const filesUnder = (dir) => fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
test("a viewer's name the model quotes is shown for this check but never written to disk; a restart keeps only structured fields", { skip }, async (t) => {
  const S = setup(t, "nick");
  const v = S.svc.prepare({ start: 24, end: 29, mode: "two_pass", scope: "full" });
  await ready(S, v.reviewId);
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
  assert.deepEqual(Object.keys(disk.findings[0]).sort(), ["id", "inLead", "mark", "state", "t", "type"]);
  for (const k of ["summary", "windowDigest", "observation"]) assert.ok(!(k in disk), k + " is not stored");
  assert.deepEqual(disk.dimensions.packaging, { state: "issues" });
  assert.ok(disk.marks.every((m) => !("note" in m)) && !("text" in disk.correction));
  assert.ok(!JSON.stringify(disk.receipts).includes(NICK) && disk.receipts.every((r) => Object.keys(r).sort().join() === "audioTokens,kind,model,provider"), "receipts: who answered and the counts only");
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
  await ready(S, v.reviewId);
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
  const d = tmp(t), sampleFile = sampler(d), store = createReviewStore({ dir: path.join(d, "reviews") });
  const make = (st) => mk({ store: st, bridge: VB, readProject: DOC, activeProject: () => "p1", now: () => clock, sampleFile, tmpRoot: d, sender: fakeSender("pass") });
  const svc = make(store);
  const a = svc.prepare({ start: 24, end: 29 });
  await until(() => svc.status(a.reviewId).state === "ready");
  assert.throws(() => svc.prepare({ start: 1, end: 5 }), (e) => e.code === "BUSY");
  clock += 11 * 60 * 1000;   // the token ran out
  const b = svc.prepare({ start: 1, end: 5 });   // not BUSY any more
  assert.equal(svc.status(a.reviewId).state, "expired");
  await until(() => svc.status(b.reviewId).state === "ready");
  /* the record cannot be saved (disk full): the check ends failed with a fixed code, the project is free again */
  const broken = Object.create(store); broken.add = () => { throw new Error("ENOSPC: no space left on device, open 'C:\\secret\\path'"); };
  const svc2 = make(broken);
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

test("what is sent is capped per project, counted in request bytes: past the cap nothing is handed to the sender", { skip }, async (t) => {
  /* one send, to learn how big this request is */
  const M = setup(t, "pass");
  const m = M.svc.prepare({ start: 24, end: 29 });
  await ready(M, m.reviewId);
  const one = (await M.svc.send(m.reviewId, M.svc.tokenFor(m.reviewId))).sentBytes;
  assert.equal(one, M.calls[0].bytes, "what is counted is the request body that went");
  const S = setup(t, "pass", { cap: Math.floor(one * 1.5) });
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.ok(rec.sentBytes > 0 && rec.sentBytes <= OR.MAX_BODY_BYTES && Array.isArray(rec.passes) && rec.passes[0].kind === "check", JSON.stringify(rec.passes));
  assert.ok(rec.passes[0].bodyBytes > 0 && rec.passes[0].videoBytes > 0 && rec.passes[0].audioBytes > 0, "kinds and sizes");
  assert.ok(!JSON.stringify(rec.passes).includes("SENTINEL"), "kinds and sizes only");
  const w = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, w.reviewId);
  await assert.rejects(S.svc.send(w.reviewId, S.svc.tokenFor(w.reviewId)), (e) => e.status === 409 && e.code === "SEND_LIMIT");
  assert.equal(S.calls.length, 1, "the second one was never handed to the sender");
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
const allPrompts = (S) => S.calls.map((c) => c.prompt).join("\n");

test("window (send only these seconds): no taste notes, no project text, at ready and in every request that goes out; a full question's token does not send a window", { skip }, async (t) => {
  const S = setup(t, "pass"); S.setDoc(scopeDoc());
  S.store.tasteAdd("p1", { kind: "negative", text: "HISTORIC-NOTE-WINDOW" });
  const F = setup(t, "pass"); F.setDoc(scopeDoc()); F.store.tasteAdd("p1", { kind: "negative", text: "HISTORIC-NOTE-WINDOW" });
  const full = F.svc.prepare({ start: 24, end: 26, lead: 2, scope: "full" });
  await ready(F, full.reviewId);
  assert.equal(F.svc.status(full.reviewId).willSend.tasteNotes, 1, "a full check shows its note");
  const fullToken = F.svc.tokenFor(full.reviewId);
  const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope: "window", mode: "two_pass" });
  await ready(S, v.reviewId);
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
  await ready(S, v.reviewId);
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
  await ready(S, v.reviewId);
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
  await ready(S, v.reviewId);
  const w = S.svc.status(v.reviewId).willSend;
  assert.equal(w.tasteNotes, 1); assert.equal(w.tasteNotice, "文字只在本次运行保留，重启后需重新填写");
});

/* ---- PG v4.1 (6871970875): the window wording is exact; how many notes lost their words is told ---- */
test("window wording is the adopted sentence and matches the payload; the page is told how many notes lost their words at a restart", { skip }, async (t) => {
  const S = setup(t, "pass"); S.setDoc(scopeDoc());
  const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope: "window" });
  await ready(S, v.reviewId);
  const w = S.svc.status(v.reviewId).willSend;
  assert.ok(w.what.includes("No subtitle text, edit points, or good/bad examples are attached; subtitles already burned into the picture still go out with the video."), w.what);
  assert.equal(w.tasteLost, 0);
  /* a note whose words a restart took away: kept as a record, not sent, and counted for the page */
  const d = path.join(S.d, "reviews2"), first = createReviewStore({ dir: d });
  first.tasteAdd("p1", { kind: "negative", text: "LOST-WORDS" });
  const again = createReviewStore({ dir: d });
  const svc2 = mk({ store: again, bridge: VB, readProject: () => scopeDoc(), activeProject: () => "p1", sampleFile: S.sampleFile, tmpRoot: S.d, sender: fakeSender("pass", { calls: S.calls }) });
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
    await ready(S, v.reviewId);
    const st = S.svc.status(v.reviewId).willSend.standards;
    assert.ok(st && st.rules.length === 5 && st.questions.length === 5 && typeof st.ask === "string", mode);
    assert.equal(st.carriedBy, mode === "two_pass" ? "second" : "only");
    await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
    const main = S.calls[S.calls.length - 1].prompt;
    const rules = st.rules.map((r, i) => `${i + 1}. ${r}`).join("\n"), questions = st.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    assert.ok(main.includes(rules + "\n"), mode + ": the five standards, as shown, are in the request in this order");
    assert.ok(main.includes(questions + "\n" + st.ask), mode + ": the five questions and the ask, as shown, are in the request");
    if (mode === "two_pass") for (const x of [...st.rules, ...st.questions, st.ask]) assert.ok(!S.calls[0].prompt.includes(x), "the blind first look has none of it");
  }
});

/* ---- PG (#321 6872473697): "only these seconds": the actual payload is checked against the English sentence the API returns ---- */
test("window: the request itself carries 0 good/bad examples, no edit points, no project text, no subtitle text of its own; willSend.what is the adopted sentence", { skip }, async (t) => {
  for (const mode of ["single", "two_pass"]) {
    const S = setup(t, "pass"); S.setDoc(scopeDoc());
    S.store.tasteAdd("p1", { kind: "negative", text: "HISTORIC-NOTE-WINDOW" });
    S.store.tasteAdd("p1", { kind: "positive", aspect: "pacing", text: "HISTORIC-PRAISE-WINDOW" });
    const v = S.svc.prepare({ start: 24, end: 26, lead: 2, scope: "window", mode });
    await ready(S, v.reviewId);
    const w = S.svc.status(v.reviewId).willSend;
    assert.ok(w.what.includes("No subtitle text, edit points, or good/bad examples are attached; subtitles already burned into the picture still go out with the video."), w.what);
    assert.equal(w.tasteNotes, 0); assert.deepEqual(w.notes, []); assert.equal(w.projectText, "");
    const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
    assert.equal(rec.tasteNotes, 0, mode + ": the record says no examples went");
    assert.equal(S.calls.length, mode === "two_pass" ? 2 : 1);
    for (const c of S.calls) {
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
    await ready(S, v.reviewId);
    const w = S.svc.status(v.reviewId).willSend;
    assert.match(w.what, claim[scope], scope);
    await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
    const prompt = S.calls[S.calls.length - 1].prompt;
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
  await ready(S, v.reviewId);
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

/* QQ's ruling on #321 (6874674433), owner 2026-11-14 (#341 6882174429): the dev-side agent may send without a click; every send is written to the local record */
test("an agent's send (switch on) is recorded on disk with service and domain, kinds, bytes, who answered, initiator and time, and no free text", { skip }, async (t) => {
  const S = setup(t, "issues", { agentSend: true });
  const v = S.svc.prepare({ start: 24, end: 29, scope: "full", agent: true, autoSend: true });
  const rec = await until(() => { const x = S.store.list("p1", 5)[0]; return x && x.reviewId === v.reviewId ? x : null; });
  const disk = JSON.parse(fs.readFileSync(path.join(S.d, "reviews", "p1.json"), "utf8")), onDisk = disk.records.find((r) => r.reviewId === v.reviewId);
  assert.equal(onDisk.source, "agent");
  assert.deepEqual({ service: onDisk.destination.service, host: onDisk.destination.host }, { service: "OpenRouter", host: "openrouter.ai" });
  assert.ok(onDisk.sentBytes > 0 && onDisk.sentBytes <= OR.MAX_BODY_BYTES);
  assert.ok(Array.isArray(onDisk.passes) && onDisk.passes.length >= 1 && onDisk.passes.every((p) => typeof p.kind === "string" && p.bodyBytes > 0 && p.videoBytes > 0));
  assert.deepEqual(onDisk.receipts, [{ kind: "check", provider: "Google AI Studio", model: "google/gemini-4-carbon", audioTokens: 300 }]);
  assert.equal(onDisk.audioVerified, true);
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(onDisk.at));
  assert.ok(disk.sentBytesTotal >= onDisk.sentBytes, "the send is counted");
  const text = JSON.stringify(disk);
  for (const w of ["The name plates look swapped", "Host on the left", "Swap the two name plates"]) assert.ok(!text.includes(w), "no free text on disk: " + w);
  assert.equal(rec.source, "agent");
});

/* QQ on #339: a ledger that cannot be read stops the send before anything goes out; no ledger at all is just the first send */
test("a ledger that cannot be read stops a send before anything leaves: the sender is not called, the sample is dropped, the ledger is not touched", { skip }, async (t) => {
  const S = setup(t, "pass");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  fs.mkdirSync(path.join(S.d, "reviews"), { recursive: true });
  const f = path.join(S.d, "reviews", "p1.json"); fs.writeFileSync(f, "{ not json");
  await assert.rejects(S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId)), (e) => e.status === 500 && e.code === "LEDGER_UNREADABLE" && !String(e.message).includes(S.d));
  assert.equal(S.calls.length, 0, "the sender was never called");
  assert.equal(fs.readFileSync(f, "utf8"), "{ not json", "what was there is still there");
  assert.throws(() => S.store.sentTotal("p1"), (e) => e.code === "LEDGER_UNREADABLE", "the total is not guessed as 0");
});
test("with no ledger yet the first send goes as usual, and is counted", { skip }, async (t) => {
  const S = setup(t, "pass");
  assert.equal(S.store.sentTotal("p1"), 0, "nothing sent yet");
  const v = S.svc.prepare({ start: 24, end: 29 });
  await ready(S, v.reviewId);
  const rec = await S.svc.send(v.reviewId, S.svc.tokenFor(v.reviewId));
  assert.equal(rec.status, "passed"); assert.equal(S.calls.length, 1, "it was sent");
  assert.equal(S.store.sentTotal("p1"), S.calls[0].bytes, "counted in request bytes");
});
