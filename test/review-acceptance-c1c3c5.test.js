"use strict";
/* MontClip#321 — RED TESTS, written before the implementation (Deja, 2026-11-14).
   PG's acceptance for the next embedded review (#321 6878540535; Deja's schedule 6878599482) is three things:
     1. C3  a sentence the model heard that the subtitles do not have → "the subtitles may have missed a line",
            as a suggestion the streamer confirms (advice "suggest"), never applied by itself;
     2. C1  audio was sent but usage says audio_tokens is 0 (or there is no usage) → "sound not checked"
            (audio "not_checked"), never shown as heard;
     3. C5  recognition that disagrees with the subtitles (picture text read differently) → no automatic change of words:
            advice "confirm", no replacement text, no edit.
   They sit on the result-parsing layer (`parseVerdict`) because that is where the model's answer becomes what the page and the
   MCP tool show. The engine returns identifiers; the page turns them into 「建议你改这里 / 这里请你确认 / 声音没检查」 (#326).
   The interface used here is the one proposed for the OpenRouter path (ADR #341): parseVerdict(text, {durationSec, sentAudio,
   usage, subtitles}), an optional "transcript" in the model's JSON, and an `advice` on each finding. Nothing here is sent
   anywhere: every input is a synthetic string in this file, with no real streamer material.
   The implementation waits for QQ's verification of the ADR; until then these tests are expected to fail. */
const test = require("node:test");
const assert = require("node:assert/strict");
const VB = require("../server/video-bridge");

const DIMS_OK = { fact: { state: "passed", reason: "ok" }, subtitle: { state: "passed", reason: "ok" }, pacing: { state: "passed", reason: "ok" }, packaging: { state: "passed", reason: "ok" } };
const answer = (o) => JSON.stringify({ verdict: "pass", summary: "synthetic", windowDigest: "synthetic", dimensions: DIMS_OK, findings: [], ...o });
/* synthetic subtitles of a 12 s synthetic clip: three lines; the sound (per the synthetic transcript below) has four */
const SUBS = Object.freeze([
  { start: 0.5, end: 3.0, text: "合成句一：今天测试第一段" },
  { start: 3.2, end: 6.0, text: "合成句二：画面左边是甲" },
  { start: 9.0, end: 11.5, text: "合成句四：测试到此结束" },
]);
const TRANSCRIPT = [
  { t: 0.6, end: 2.9, text: "合成句一：今天测试第一段" },
  { t: 3.3, end: 5.9, text: "合成句二：画面左边是甲" },
  { t: 6.4, end: 8.6, text: "合成句三：灯塔在第七格" },   // heard, but no subtitle covers 6.0–9.0
  { t: 9.1, end: 11.4, text: "合成句四：测试到此结束" },
];
const AUDIO_SEEN = { prompt_tokens: 2000, prompt_tokens_details: { audio_tokens: 380, video_tokens: 1200 } };
const AUDIO_ZERO = { prompt_tokens: 1600, prompt_tokens_details: { audio_tokens: 0, video_tokens: 1200 } };
const parse = (o, opts = {}) => VB.parseVerdict(answer(o), { durationSec: 12, sentAudio: true, usage: AUDIO_SEEN, subtitles: SUBS, ...opts });

/* ---- 1. C3: a missed subtitle line becomes a suggestion ---- */
test("C3: a sentence in the transcript that no subtitle covers → one 'subtitle_missing_line' finding at its time, advice 'suggest'", () => {
  const v = parse({ transcript: TRANSCRIPT });
  assert.ok(v, "the answer parses");
  const miss = v.findings.filter((f) => f.type === "subtitle_missing_line");
  assert.equal(miss.length, 1, "exactly the one missing line is reported");
  assert.equal(miss[0].dimension, "subtitle");
  assert.ok(Math.abs(miss[0].t - 6.4) < 0.01, "at the time the line is heard");
  assert.equal(miss[0].advice, "suggest", "shown as 'suggest you change this' — the streamer confirms before anything changes");
  assert.notEqual(v.dimensions.subtitle.state, "passed", "a missed line cannot leave the subtitle dimension passed");
});

test("C3: the model's own 'subtitle_missing_line' finding keeps its type and dimension (today it is folded into 'other')", () => {
  const v = parse({ verdict: "issues", dimensions: { ...DIMS_OK, subtitle: { state: "issues", reason: "a line is not subtitled" } },
    findings: [{ t: 6.4, type: "subtitle_missing_line", dimension: "subtitle", text: "subtitles may have missed a line", suggestion: "add a subtitle for 6.4–8.6 s" }] });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings[0].type, "subtitle_missing_line");
  assert.equal(v.findings[0].advice, "suggest");
});

test("C3 control: every heard sentence has a subtitle → no missing-line finding", () => {
  const all = [...SUBS.slice(0, 2), { start: 6.2, end: 8.8, text: "合成句三：灯塔在第七格" }, SUBS[2]];
  const v = parse({ transcript: TRANSCRIPT, findings: [] }, { subtitles: all });
  assert.ok(v, "the answer parses");
  assert.equal(v.findings.filter((f) => f.type === "subtitle_missing_line").length, 0);
  assert.equal(v.audio, "checked");
});

/* ---- 2. C1: sound sent but not received is "not checked" ---- */
test("C1: audio sent, usage audio_tokens 0 → audio 'not_checked', and a model 'pass' is not a pass", () => {
  const v = parse({}, { usage: AUDIO_ZERO });
  assert.ok(v, "the answer parses");
  assert.equal(v.audio, "not_checked", "shown as 「声音没检查」");
  assert.notEqual(v.dimensions.subtitle.state, "passed", "words that were never heard cannot be passed");
  assert.notEqual(v.verdict, "pass");
});

test("C1: audio sent, no usage at all → audio 'not_checked' too (unknown is not heard)", () => {
  const v = parse({}, { usage: null });
  assert.ok(v, "the answer parses");
  assert.equal(v.audio, "not_checked");
});

test("C1 control: audio sent and audio_tokens > 0 → audio 'checked' (received, which is not the same as understood)", () => {
  const v = parse({});
  assert.ok(v, "the answer parses");
  assert.equal(v.audio, "checked");
});

/* ---- 3. C5: recognition that disagrees with the subtitles never changes words by itself ---- */
test("C5: a mismatch based on picture text only → advice 'confirm', no replacement wording, no edit", () => {
  const v = parse({ verdict: "issues", dimensions: { ...DIMS_OK, subtitle: { state: "issues", reason: "bracket text read differently" } },
    findings: [{ t: 4.0, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture_text", text: "the bracketed word reads as 乙 here",
      suggestion: "change 「甲」 to 「乙」" }] });
  assert.ok(v, "the answer parses");
  const f = v.findings[0];
  assert.equal(f.advice, "confirm", "shown as 「这里请你确认」, never as 'suggest you change this'");
  assert.ok(!/甲|乙|change|改成/.test(f.suggestion || ""), "no replacement wording survives from a picture-only reading");
  assert.equal(v.edits, undefined, "the parse never carries an edit to apply");
});

test("C5: two readings of the same spot that disagree → one 'confirm' finding, not two different fixes", () => {
  const v = parse({ verdict: "issues", dimensions: { ...DIMS_OK, subtitle: { state: "issues", reason: "unclear" } },
    findings: [
      { t: 4.0, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture_text", text: "reads as 乙", suggestion: "change to 乙" },
      { t: 4.1, type: "subtitle_mismatch", dimension: "subtitle", basis: "picture_text", text: "reads as 丙", suggestion: "change to 丙" },
    ] });
  assert.ok(v, "the answer parses");
  const at4 = v.findings.filter((f) => Math.abs(f.t - 4) < 0.5);
  assert.equal(at4.length, 1, "the disagreement is one 'please confirm' at that spot");
  assert.equal(at4[0].advice, "confirm");
});

test("C5 control: parsing never changes the subtitles it was given", () => {
  const subs = JSON.parse(JSON.stringify(SUBS));
  parse({ transcript: TRANSCRIPT }, { subtitles: subs });
  assert.deepEqual(subs, JSON.parse(JSON.stringify(SUBS)));
});
