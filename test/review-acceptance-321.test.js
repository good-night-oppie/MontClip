"use strict";
/* MontClip#321 — RED TESTS, written before the implementation (Deja, 2026-11-14). Synthetic fixtures only: every input is a
   string in this file; nothing is sent anywhere and no streamer material is used.

   Order and scope are PG's (#321 6878569226, adopting 6878540535):
     1. ① sound not checked: audio was sent but usage says 0 audio tokens, or there is no usage → 「声音没检查」.
     2. ③ missed subtitle line: ONLY "the model returns a missing line → shown as a suggestion the streamer confirms,
        nothing changed by itself". Whether the model can hear it is left to the same-clip real run.
     3. ⑤④ one rule — anything uncertain is only a prompt: picture text read differently, subtitle change time not
        matching the speech → 「这里请你确认」. With C7/C8 from attempt-07 (PG 6878593931):
        C7  what the model says about the picture is first checked against the frames decoded on this computer; a claim
            the frames contradict is suppressed — not shown at all (not even as 「这里请你确认」);
        C8  when picture text is the only basis, the most it can be is 「这里请你确认」, never 「建议你改这里」.
     4. ⑥ nothing concluded outside the clip: the result says which stretch was reviewed, and makes no cut proposal outside it.

   The streamer sees only three plain states; none of them changes the video by itself. The tests assert on the state ids
   and on "no automatic change"; the wording below is a placeholder until JJ finalizes it.
   Interface (proposed with ADR #341): parseVerdict(text, {durationSec, sentAudio, usage, frames}) →
     findings[].state ∈ {"suggest","confirm"}, result.states (the states shown for this result, findings' and sound's),
     result.reviewed = {start, end} (seconds of the sample), and never `edits` / `recut`.
   The implementation waits for QQ's verification of the ADR; until then these tests are expected to fail. */
const test = require("node:test");
const assert = require("node:assert/strict");
const VB = require("../server/video-bridge");

/* the three states (ids → placeholder wording; JJ finalizes the wording) */
const STATES = Object.freeze({ suggest: "建议你改这里", confirm: "这里请你确认", sound_not_checked: "声音没检查" });
const FINDING_STATES = ["suggest", "confirm"];

const DIMS_OK = { fact: { state: "passed", reason: "ok" }, subtitle: { state: "passed", reason: "ok" }, pacing: { state: "passed", reason: "ok" }, packaging: { state: "passed", reason: "ok" } };
const SUB_ISSUE = (reason) => ({ ...DIMS_OK, subtitle: { state: "issues", reason } });
const answer = (o) => JSON.stringify({ verdict: "pass", summary: "synthetic", windowDigest: "synthetic", dimensions: DIMS_OK, findings: [], ...o });
const AUDIO_SEEN = { prompt_tokens: 2000, prompt_tokens_details: { audio_tokens: 380, video_tokens: 1200 } };
const AUDIO_ZERO = { prompt_tokens: 1600, prompt_tokens_details: { audio_tokens: 0, video_tokens: 1200 } };
/* what this computer decoded from the actual frames of the synthetic 12 s sample: when the burned-in subtitle changes,
   and what the picture text says */
const FRAMES = Object.freeze({ subtitleChanges: [3.1, 9.0, 11.4], text: [{ t: 4.0, text: "（甲）" }] });
const parse = (o, opts = {}) => VB.parseVerdict(answer(o), { durationSec: 12, sentAudio: true, usage: AUDIO_SEEN, frames: FRAMES, ...opts });

/** the common promise of all three states: nothing in the result changes the video by itself */
function noAutoChange(v) {
  assert.equal(v.edits, undefined, "no edit to apply");
  assert.equal(v.recut, undefined, "nothing that starts a re-cut");
  for (const f of v.findings) {
    assert.ok(FINDING_STATES.includes(f.state), `every finding is shown as one of the states, got ${f.state}`);
    assert.notEqual(f.apply, true, "no finding applies itself");
  }
}

/* ---- 1. ① sound not checked ---- */
test("1 ①: audio sent, usage says 0 audio tokens → 「声音没检查」, and a model 'pass' is not a pass", () => {
  const v = parse({}, { usage: AUDIO_ZERO });
  assert.ok(v, "the answer parses");
  assert.ok(Array.isArray(v.states) && v.states.includes("sound_not_checked"), `shown as ${STATES.sound_not_checked}`);
  assert.notEqual(v.verdict, "pass", "never shown as heard-and-fine");
  assert.notEqual(v.dimensions.subtitle.state, "passed", "words that were never heard cannot be passed");
  noAutoChange(v);
});

test("1 ①: audio sent, no usage at all → 「声音没检查」 too (unknown is not heard)", () => {
  const v = parse({}, { usage: null });
  assert.ok(v, "the answer parses");
  assert.ok(Array.isArray(v.states) && v.states.includes("sound_not_checked"));
  assert.notEqual(v.verdict, "pass");
});

test("1 ① control: audio tokens > 0 and nothing found → no state shown at all", () => {
  const v = parse({});
  assert.ok(v, "the answer parses");
  assert.deepEqual(v.states, [], "sound reached the model (which is not the same as understood) and nothing was found");
});

/* ---- 2. ③ missed subtitle line: model returns it → a suggestion the streamer confirms ---- */
test("2 ③: the model returns a missing subtitle line → one finding at its time, 「建议你改这里」, nothing changed by itself", () => {
  const v = parse({ verdict: "issues", dimensions: SUB_ISSUE("a line is not subtitled"),
    findings: [{ t: 6.4, type: "subtitle_missing_line", dimension: "subtitle", basis: "audio", text: "subtitles may have missed a line",
      suggestion: "add a subtitle for 6.4–8.6 s" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings.length, 1);
  const f = v.findings[0];
  assert.equal(f.type, "subtitle_missing_line", "kept as its own kind (today it is folded into 'other')");
  assert.ok(Math.abs(f.t - 6.4) < 0.01, "with its time");
  assert.equal(f.state, "suggest", `shown as ${STATES.suggest}`);
  assert.ok(v.states.includes("suggest"));
  noAutoChange(v);
});

/* ---- 3. ⑤④ (+C7/C8): anything uncertain is only 「这里请你确认」 ---- */
test("3 ⑤: the same picture text read two different ways → one 「这里请你确认」, no replacement wording", () => {
  const v = parse({ verdict: "issues", dimensions: SUB_ISSUE("unclear"), findings: [
    { t: 4.0, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture_text", reads: "（乙）", text: "reads as 乙", suggestion: "change to 乙" },
    { t: 4.1, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture_text", reads: "（丙）", text: "reads as 丙", suggestion: "change to 丙" },
  ] }, { frames: null });
  assert.ok(v, "the answer parses");
  const at4 = v.findings.filter((f) => Math.abs(f.t - 4) < 0.5);
  assert.equal(at4.length, 1, "one prompt at that spot, not two different fixes");
  assert.equal(at4[0].state, "confirm", `shown as ${STATES.confirm}`);
  assert.ok(!/乙|丙|change|改成/.test(at4[0].suggestion || ""), "no replacement wording");
  noAutoChange(v);
});

test("3 ④: the subtitle change time does not match the speech → 「这里请你确认」, no time is moved", () => {
  const v = parse({ verdict: "issues", dimensions: SUB_ISSUE("maybe early"),
    findings: [{ t: 11.4, type: "subtitle_mismatch", dimension: "subtitle", basis: "audio", screenChangeAt: 11.4,
      text: "the change may come before the line ends", suggestion: "move the change to 11.6 s" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings[0].state, "confirm");
  assert.ok(!/move|11\.6|挪|改到/.test(v.findings[0].suggestion || ""), "the model's time is never used as a cut point");
  noAutoChange(v);
});

/* C7: the frames say the subtitle changes at 11.4 s and the bracket reads （甲）. A model claim that contradicts them is
   suppressed: no finding at that spot, nothing shown, nothing changed. */
test("3 C7: the model says the subtitle changed at 11.0 s, the actual frames change at 11.4 s → suppressed, not shown", () => {
  const v = parse({ verdict: "issues", dimensions: SUB_ISSUE("screen changes early"),
    findings: [{ t: 11.0, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture", screenChangeAt: 11.0,
      text: "the subtitle has already changed while the line is still being said", suggestion: "move the change to 11.6 s" }] });
  assert.ok(v, "the answer parses (a suppressed finding does not throw the whole answer away)");
  assert.equal(v.findings.filter((f) => Math.abs(f.t - 11) < 0.5).length, 0, "the contradicted claim is not shown at all");
  assert.ok(!v.states.includes("suggest") && !v.states.includes("confirm"), "nothing is shown for it");
  noAutoChange(v);
});

test("3 C7: the frame reads （甲）, the model reads （乙） → suppressed, not shown, no change of words", () => {
  const v = parse({ verdict: "issues", dimensions: SUB_ISSUE("bracket text"),
    findings: [{ t: 4.0, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture_text", reads: "（乙）",
      text: "the bracket reads 乙", suggestion: "change 「甲」 to 「乙」" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings.filter((f) => Math.abs(f.t - 4) < 0.5).length, 0, "a reading the frame contradicts is not shown");
  noAutoChange(v);
});

test("3 C7 control: the model's change time agrees with the frames (11.4 s) → still shown, as 「这里请你确认」", () => {
  const v = parse({ verdict: "issues", dimensions: SUB_ISSUE("maybe early"),
    findings: [{ t: 11.4, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture", screenChangeAt: 11.4,
      text: "the change may come before the line ends", suggestion: "" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings.length, 1, "a claim the frames support is not suppressed");
  assert.equal(v.findings[0].state, "confirm");
  noAutoChange(v);
});

/* C8: no decoded frame text at that spot, so the picture text is the only basis: at most 「这里请你确认」. */
test("3 C8: picture text is the only basis and the model proposes a change → 「这里请你确认」, never 「建议你改这里」, no replacement", () => {
  const v = parse({ verdict: "issues", dimensions: SUB_ISSUE("bracket text"),
    findings: [{ t: 7.0, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture_text", reads: "（乙）",
      text: "the bracket reads 乙, the subtitle says 甲", suggestion: "change 「甲」 to 「乙」" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings.length, 1);
  assert.equal(v.findings[0].state, "confirm", `at most ${STATES.confirm}`);
  assert.notEqual(v.findings[0].state, "suggest");
  assert.ok(!/甲|乙|change|改成/.test(v.findings[0].suggestion || ""), "no replacement wording survives");
  noAutoChange(v);
});

test("3 guard: parsing never changes the frames or anything else it was given", () => {
  const frames = JSON.parse(JSON.stringify(FRAMES));
  parse({ findings: [] }, { frames });
  assert.deepEqual(frames, JSON.parse(JSON.stringify(FRAMES)));
});

/* ---- 4. ⑥ nothing concluded outside the clip ---- */
test("4 ⑥: the result says which stretch was reviewed", () => {
  const v = parse({});
  assert.ok(v, "the answer parses");
  assert.deepEqual(v.reviewed, { start: 0, end: 12 });
});

test("4 ⑥: a finding about what comes after the clip is dropped, not moved onto its last second", () => {
  const v = parse({ verdict: "issues", dimensions: { ...DIMS_OK, pacing: { state: "issues", reason: "later half" } },
    findings: [{ t: 14.0, type: "cut_jump", dimension: "pacing", text: "the second half of the sentence is wrong", suggestion: "cut at 14 s" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings.length, 0, "no conclusion about what was not reviewed (today it is clamped to 12 s and kept)");
  assert.ok(!v.findings.some((f) => /14/.test(f.suggestion || "")), "no cut proposal outside the clip");
});

test("4 ⑥ control: a finding inside the clip stays, shown as one of the states", () => {
  const v = parse({ verdict: "issues", dimensions: { ...DIMS_OK, pacing: { state: "issues", reason: "jump" } },
    findings: [{ t: 5.0, type: "cut_jump", dimension: "pacing", text: "a jump cut", suggestion: "" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings.length, 1);
  noAutoChange(v);
});
