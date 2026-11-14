#!/usr/bin/env node
/* Evaluation of event-bounds.js against the highlight truth table (docs/decisions/2026-11-03-event-boundaries.md).
   The table, the replays and their transcripts never enter the repository; this script reads them by path and prints
   numbers only: case ids (P01…), counts, seconds and shares — no creator, title, BV id, file name or text.

     node dev/real-tests/event-bounds-golden.cjs --table <truth csv> --replays <dir> --work <dir> [--asr <vendor/asr>]
       [--ffmpeg <path>] [--top 12] [--json <out file>]

   <truth csv>  columns used: case_id, start_sec, end_sec, 类型, 回放BV, 回放分P, 进调参 (rows with 进调参 = 是)
   <replays>    <replays>/<回放BV>/p<回放分P>/audio.m4s
   <work>       caches, by file version: signals/ (loudness), transcripts/ (words, made with --asr if missing)

   For every non-song row the engine's card that overlaps the row most (of its top `top` cards for that replay) is the
   prediction; a row with no overlapping card counts as a miss. Four pipelines: old (today: sentences: []), old+snap,
   sent (the transcript's sentences into the engine), sent+snap. Per pipeline: start and end within ±1 / ±3 s over all
   rows (a miss is not within), the same over the matched rows only, and the median error; per case id. For the
   snapped pipelines: moved ends inside a sentence (must be 0), ends not moved and why. VV's drag magnet: each truth end
   dragged from ±0.25 / ±0.5 s; a hit is a pull that lands within ±1 s of the truth; ten pulls are listed for a person
   to check by ear at ±0.6 s. Song rows are counted only (songs are not snapped). */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const H = require("../../highlight-candidates");
const B = require("../../event-bounds");

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const TABLE = arg("table"), REPLAYS = arg("replays"), WORK = arg("work"), ASR = arg("asr"), TOP = +arg("top", 12);
if (!TABLE || !REPLAYS || !WORK) { console.error("usage: event-bounds-golden.cjs --table <csv> --replays <dir> --work <dir> [--asr <dir>]"); process.exit(2); }
const FFMPEG = arg("ffmpeg", process.env.MONTCLIP_FFMPEG || "ffmpeg");
const SONG = /整首歌|唱歌|演唱/;

function csv(text) {
  const rows = [];
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur); rows.push(out);
  }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || "").trim()])));
}
const versionKey = (file) => { const st = fs.statSync(file); return crypto.createHash("sha256").update(path.basename(file) + "\0" + st.size + "\0" + Math.round(st.mtimeMs)).digest("hex").slice(0, 32); };

async function loudness(file) {
  const { createSignals } = require("../../server/signals");
  return createSignals({ dir: path.join(WORK, "signals"), ffmpeg: FFMPEG }).loudness(file);
}
let asr = null;
async function transcript(file) {
  const out = path.join(WORK, "transcripts", versionKey(file) + ".json");
  try { return JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* not made yet */ }
  if (!ASR) return null;
  if (!asr) asr = require("../../server/asr-local").createAsr({ asrDir: ASR, ffmpeg: FFMPEG, threads: 4 });
  const t0 = Date.now();
  let r, skipped = 0;
  try { r = await asr.transcribe(file); }
  catch (e) {
    // asr-local.js gives up on the whole file when one VAD segment makes the recognizer throw (seen on the Linux test
    // server: basic_string::_S_create on 1 segment of 1485; ADR §10). Here the same engine, VAD and word code, one
    // segment at a time, skipping a segment that throws; the count is reported.
    process.stderr.write("product transcription failed, segment by segment instead\n");
    ({ r, skipped } = await bySegment(file));
  }
  const doc = { v: 1, words: r.words, duration: r.duration, punctuated: r.punctuated, skippedSegments: skipped, seconds: Math.round((Date.now() - t0) / 1000) };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc));
  return doc;
}
async function bySegment(file) {
  const { spawn } = require("child_process"), W = require("../../server/asr-words"), { VAD } = require("../../server/asr-local");
  const S = require(path.resolve(ASR, "engine", "node_modules", "sherpa-onnx-node")), RATE = 16000;
  const md = path.resolve(ASR, "models", "asr"), pd = path.resolve(ASR, "models", "punct");
  const rec = await S.OfflineRecognizer.createAsync({ featConfig: { sampleRate: RATE, featureDim: 80 },
    modelConfig: { paraformer: { model: path.join(md, "model.int8.onnx") }, tokens: path.join(md, "tokens.txt"), numThreads: 4, provider: "cpu", debug: 0 } });
  const punct = fs.existsSync(path.join(pd, "model.int8.onnx")) ? new S.OfflinePunctuation({ model: { ctTransformer: path.join(pd, "model.int8.onnx"), numThreads: 1, debug: 0, provider: "cpu" } }) : null;
  const vad = new S.Vad({ sileroVad: { model: path.resolve(ASR, "silero_vad.onnx"), ...VAD }, sampleRate: RATE, debug: false, numThreads: 1 }, 60);
  const proc = spawn(FFMPEG, ["-nostdin", "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-acodec", "pcm_s16le", "-"], { stdio: ["ignore", "pipe", "ignore"] });
  const words = [];
  let skipped = 0, samples = 0, pending = new Float32Array(0), carry = null;
  const drain = async () => {
    while (!vad.isEmpty()) {
      const seg = vad.front(false), start = seg.start / RATE, audio = Float32Array.from(seg.samples);
      vad.pop();
      try {
        const s = rec.createStream(); s.acceptWaveform({ sampleRate: RATE, samples: audio });
        let ws = W.words(await rec.decodeAsync(s), { offset: start, end: start + audio.length / RATE });
        if (punct && ws.length) { try { ws = W.punctuate(ws, punct.addPunct(W.plain(ws))); } catch { } }
        words.push(...ws);
      } catch { skipped++; }
    }
  };
  for await (let chunk of proc.stdout) {
    if (carry) { chunk = Buffer.concat([carry, chunk]); carry = null; }
    if (chunk.length & 1) { carry = chunk.subarray(chunk.length - 1); chunk = chunk.subarray(0, chunk.length - 1); }
    const f = new Float32Array(pending.length + chunk.length / 2);
    f.set(pending);
    for (let i = 0, o = pending.length; i < chunk.length; i += 2, o++) f[o] = chunk.readInt16LE(i) / 32768;
    let k = 0;
    for (; k + 512 <= f.length; k += 512) vad.acceptWaveform(f.subarray(k, k + 512));
    pending = f.slice(k); samples += chunk.length / 2;
    await drain();
  }
  if (pending.length) vad.acceptWaveform(pending);
  vad.flush(); await drain();
  words.sort((x, y) => x[1] - y[1]);
  return { r: { words, duration: samples / RATE, punctuated: !!punct }, skipped };
}
/** Sentences as the engine wants them: {id, start, end, text}. */
function sentencesOf(words) {
  const list = B.sentences(words), out = [];
  let k = 0;
  list.forEach((s, i) => {
    let text = "";
    while (k < words.length && words[k][1] < s.start - 1e-6) k++;
    for (let j = k; j < words.length && words[j][1] <= s.end + 1e-6; j++) text += words[j][0];
    out.push({ id: "s" + i, start: s.start, end: s.end, text });
  });
  return out;
}

const r2 = (x) => Math.round(x * 100) / 100;
const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return r2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const share = (xs, n, lim) => ({ k: xs.filter((e) => e <= lim).length, n, p: n ? r2(xs.filter((e) => e <= lim).length / n) : null });

(async () => {
  const table = fs.readFileSync(TABLE);
  const rows = csv(table.toString("utf8")).filter((r) => r["进调参"] === "是");
  const songs = rows.filter((r) => SONG.test(r["类型"])), talk = rows.filter((r) => !SONG.test(r["类型"]));
  const files = new Map();
  for (const r of rows) {
    const f = path.join(REPLAYS, r["回放BV"], "p" + r["回放分P"], "audio.m4s");
    if (!files.has(f)) files.set(f, { file: f, n: files.size + 1 });
    r._f = f; r._s = +r.start_sec; r._e = +r.end_sec;
  }
  const t0 = Date.now(), perFile = new Map();
  let transcribed = 0, asrSeconds = 0, audioSeconds = 0, skippedSegments = 0;
  for (const { file, n } of files.values()) {
    if (!fs.existsSync(file)) { perFile.set(file, null); continue; }
    const L = await loudness(file), T = await transcript(file);
    if (T) { transcribed++; asrSeconds += T.seconds || 0; skippedSegments += T.skippedSegments || 0; }
    audioSeconds += L.duration;
    const sentences = T ? sentencesOf(T.words) : null;
    const old = H.candidates({ duration: L.duration, sentences: [], loudness: L }, { ...H.DEFAULTS, max: TOP });
    const sent = sentences ? H.candidates({ duration: L.duration, sentences, loudness: L }, { ...H.DEFAULTS, max: TOP }) : null;
    const snapAll = (cards) => cards && cards.map((c) => { const x = B.snap({ s: c.from, e: c.to }, { sentences: sentences || [], duration: L.duration }); return { from: x.s, to: x.e, snap: x }; });
    perFile.set(file, { n, duration: L.duration, sentences, words: T && T.words,
      pipes: { old, "old+snap": sentences ? snapAll(old) : null, sent, "sent+snap": snapAll(sent) } });
    process.stderr.write(`file ${n}/${files.size} read\n`);
  }

  const report = { table: { sha256: crypto.createHash("sha256").update(table).digest("hex"), rows: rows.length, song: songs.length, talk: talk.length,
      cases: [...new Set(rows.map((r) => r.case_id))].sort() },
    files: files.size, transcribed, skippedSegments, audioHours: r2(audioSeconds / 3600), asrMinutes: r2(asrSeconds / 60), minutes: r2((Date.now() - t0) / 60000), pipes: {} };
  for (const name of ["old", "old+snap", "sent", "sent+snap"]) {
    const per = {}, es = [], ee = [], ms = [], me = [], inside = { moved: 0, inside: 0 }, kept = {};
    let missing = 0;
    for (const r of talk) {
      const F = perFile.get(r._f), cards = F && F.pipes[name];
      if (!cards) { missing++; continue; }
      let best = null, ov = 0;
      for (const c of cards) { const o = Math.min(c.to, r._e) - Math.max(c.from, r._s); if (o > ov) { ov = o; best = c; } }
      const p = (per[r.case_id] = per[r.case_id] || { n: 0, s3: 0, e3: 0, s1: 0, e1: 0, matched: 0 });
      p.n++;
      const ds = best ? Math.abs(best.from - r._s) : Infinity, de = best ? Math.abs(best.to - r._e) : Infinity;
      es.push(ds); ee.push(de);
      if (best) { p.matched++; ms.push(ds); me.push(de); }
      p.s3 += ds <= 3; p.e3 += de <= 3; p.s1 += ds <= 1; p.e1 += de <= 1;
      if (best && best.snap) for (const [t, x] of [[best.from, best.snap.start], [best.to, best.snap.end]]) {
        if (x.moved) { inside.moved++; if (B.insideSentence(t, F.sentences)) inside.inside++; }
        else kept[x.why || x.how] = (kept[x.why || x.how] || 0) + 1;
      }
    }
    if (missing === talk.length) { report.pipes[name] = "not run (no transcripts)"; continue; }
    const n = talk.length;
    report.pipes[name] = { rows: n - missing, matched: ms.length,
      all: { start3: share(es, n, 3), end3: share(ee, n, 3), start1: share(es, n, 1), end1: share(ee, n, 1) },
      matchedOnly: { start3: share(ms, ms.length, 3), end3: share(me, me.length, 3), start1: share(ms, ms.length, 1), end1: share(me, me.length, 1),
        startMedian: median(ms), endMedian: median(me) },
      perCase: per, ...(name.endsWith("snap") ? { movedEnds: inside.moved, movedInsideSentence: inside.inside, keptEnds: kept } : {}) };
  }
  // VV's drag magnet, on the truth ends of the non-song rows
  const drags = [], sample = [];
  for (const r of talk) {
    const F = perFile.get(r._f);
    if (!F || !F.words) continue;
    for (const [side, truth] of [["s", r._s], ["e", r._e]]) for (const d of [-0.5, -0.25, 0.25, 0.5]) {
      const m = B.magnet(truth + d, side, F.words);
      drags.push({ snapped: m.snapped, hit: m.snapped && Math.abs(m.t - truth) <= 1 });
      if (m.snapped && sample.length < 10 && d === 0.5) sample.push({ case: r.case_id, row: +r.row || null, side: side === "s" ? "start" : "end", truth: r2(truth), pulledTo: r2(m.t) });
    }
  }
  const pulled = drags.filter((x) => x.snapped).length, hits = drags.filter((x) => x.hit).length;
  report.magnet = { drags: drags.length, pulled, hits, hitRateOfPulls: pulled ? r2(hits / pulled) : null, hitRateOfDrags: drags.length ? r2(hits / drags.length) : null, sample };
  // Diagnostic, no threshold: the snap on its own, from a card whose ends are d seconds off the truth (both ends the same
  // way and opposite ways), so the ranking's misses do not hide what the snap does near an event.
  const near = {};
  for (const d of [2, 4]) {
    const before = [], after = [], perCase = {};
    for (const r of talk) {
      const F = perFile.get(r._f);
      if (!F || !F.sentences) continue;
      for (const [ds, de] of [[-d, d], [d, -d], [-d, -d], [d, d]]) {
        const x = B.snap({ s: r._s + ds, e: r._e + de }, { sentences: F.sentences, duration: F.duration });
        const es = Math.abs(x.s - r._s), ee = Math.abs(x.e - r._e);
        before.push(Math.abs(ds), Math.abs(de)); after.push(es, ee);
        const p = (perCase[r.case_id] = perCase[r.case_id] || { ends: 0, within3: 0, within1: 0 });
        p.ends += 2; p.within3 += (es <= 3) + (ee <= 3); p.within1 += (es <= 1) + (ee <= 1);
      }
    }
    near["off" + d] = { ends: after.length, before: { within3: share(before, before.length, 3), within1: share(before, before.length, 1) },
      after: { within3: share(after, after.length, 3), within1: share(after, after.length, 1), median: median(after) }, perCase };
  }
  report.snapNearTruth = near;
  const out = JSON.stringify(report, null, 1);
  if (arg("json")) fs.writeFileSync(arg("json"), out);
  console.log(out);
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
