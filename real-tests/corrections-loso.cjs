#!/usr/bin/env node
/* Local only: do the streamer's corrections (corrections.js) make the next search closer? Leave one streamer out at a time
   (Deja, 2026-11-03): the held-out streamer's recordings are scored with corrections off, then on — the corrections
   simulated from every OTHER streamer's recordings, never the held-out one's (that would leak the answers).
     node real-tests/corrections-loso.cjs <golden dir>
   A streamer is the recordings sharing a video id (labels.json bvid; pages of one stream). The golden set stays outside
   the repo, and this prints numbers only — no titles, labels, case names, video ids or paths.
   Simulated corrections, per recording in time order: a found song with a labelled song start within 15 s → its start
   and end moved to the label's (trim); a found song with none → 「不是唱歌」; a labelled song nothing was found for →
   「是唱歌」 (with the sound of the labelled part). Recordings are taken in the order of their folders. As in the app, only
   the last HABIT_WINDOW of each kind of correction make a habit.
   recall@10: labelled song starts with a found start within 10 s; precision@15: found songs with a labelled start within
   15 s; start / end error: |found − labelled| for songs matched by start within 15 s (an end only where it is labelled —
   few are). */
"use strict";
const fs = require("fs"), path = require("path");
const Songs = require("../songs"), C = require("../corrections");
const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, "cases"))) { console.error("usage: corrections-loso.cjs <golden dir with cases/>"); process.exit(2); }
const SONG = /演唱|舞蹈/;
const median = (v) => { if (!v.length) return NaN; const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");

const cases = fs.readdirSync(path.join(root, "cases")).sort().map((name) => {
  const dir = path.join(root, "cases", name);
  if (!fs.existsSync(path.join(dir, "labels.json")) || !fs.existsSync(path.join(dir, "audio-features.json"))) return null;
  const F = JSON.parse(fs.readFileSync(path.join(dir, "audio-features.json"), "utf8")), L = JSON.parse(fs.readFileSync(path.join(dir, "labels.json"), "utf8"));
  const k = Array.isArray(F.keys) ? F.keys.indexOf("rms") : 1, rms = F.rows.map((r) => r[k]), step = F.step || 0.5;
  // most labels have a start only (end_sec null): an end is used where there is one
  const labels = L.labels.filter((l) => SONG.test(String(l.category)) && !l.unaligned && Number.isFinite(l.start_sec))
    .map((l) => ({ s: l.start_sec, e: Number.isFinite(l.end_sec) ? l.end_sec : null }));
  return { streamer: String(L.bvid), rms, step, duration: rms.length * step, labels };
}).filter(Boolean);

const nearest = (list, t, key) => list.reduce((b, x) => (!b || Math.abs(x[key] - t) < Math.abs(b[key] - t) ? x : b), null);
function search(c, rules) {
  const found = Songs.find(c.rms, { step: c.step, complete: true, ...C.songOptions(rules) }).map((s) => ({ s: s.from, e: s.to }));
  if (!rules) return found;
  return C.apply(found.map((x, i) => ({ id: "s" + i, mediaId: "x", kind: "song", ...x })), rules, { duration: { x: c.duration } }).map((x) => ({ s: x.s, e: x.e }));
}
function simulate(c) {
  const out = [], found = search(c, null), loud = { step: c.step, values: c.rms };
  for (const x of found) {
    const l = nearest(c.labels, x.s, "s");
    if (l && Math.abs(l.s - x.s) <= 15) out.push({ t: x.s, r: C.record({ type: "trim", kind: "song", startShift: l.s - x.s, endShift: l.e == null ? 0 : l.e - x.e, duration: c.duration }) });
    else { const ft = C.features(x, loud); if (ft) out.push({ t: x.s, r: C.record({ type: "kind", from: "song", to: "other", duration: c.duration, features: ft }) }); }
  }
  for (const l of c.labels) {
    const x = nearest(found, l.s, "s");
    // the labelled part's sound; with no labelled end, from its start over songs.js's shortest song (90 s)
    if (!x || Math.abs(x.s - l.s) > 15) { const ft = C.features({ s: l.s, e: l.e == null ? l.s + Songs.DEFAULTS.MIN_SONG : l.e }, loud); if (ft) out.push({ t: l.s, r: C.record({ type: "kind", from: "other", to: "song", duration: c.duration, features: ft }) }); }
  }
  return out.sort((a, b) => a.t - b.t).map((x) => x.r);
}
function score(c, found) {
  const r = { n: c.labels.length, hit10: 0, pred: found.length, tp15: 0, startErr: [], endErr: [] };
  for (const l of c.labels) {
    const x = nearest(found, l.s, "s");
    if (x && Math.abs(x.s - l.s) <= 10) r.hit10++;
    if (x && Math.abs(x.s - l.s) <= 15) { r.startErr.push(Math.abs(x.s - l.s)); if (l.e != null) r.endErr.push(Math.abs(x.e - l.e)); }
  }
  r.tp15 = found.filter((x) => c.labels.some((l) => Math.abs(x.s - l.s) <= 15)).length;
  return r;
}
const sum = (rs) => rs.reduce((a, r) => ({ n: a.n + r.n, hit10: a.hit10 + r.hit10, pred: a.pred + r.pred, tp15: a.tp15 + r.tp15,
  startErr: a.startErr.concat(r.startErr), endErr: a.endErr.concat(r.endErr) }), { n: 0, hit10: 0, pred: 0, tp15: 0, startErr: [], endErr: [] });
const line = (label, s) => console.log(`${label} labelled ${s.n} found ${s.pred} recall@10 ${f(s.hit10 / s.n)} precision@15 ${f(s.tp15 / s.pred)}` +
  ` median|start error| ${f(median(s.startErr), 1)} s (${s.startErr.length} matched) median|end error| ${f(median(s.endErr), 1)} s (${s.endErr.length} with a labelled end)`);

const streamers = [...new Set(cases.map((c) => c.streamer))];
// each rule alone too, to see what each does
const off = [], on = [], shiftOnly = [], barOnly = [];
let withRules = 0;
streamers.forEach((who, i) => {
  const held = cases.filter((c) => c.streamer === who), rest = cases.filter((c) => c.streamer !== who);
  const rules = C.rules(rest.flatMap(simulate));
  const used = Object.keys(rules.shift).length || rules.bar;
  if (used) withRules++;
  const a = sum(held.map((c) => score(c, search(c, null)))), b = sum(held.map((c) => score(c, search(c, rules))));
  off.push(a); on.push(b);
  shiftOnly.push(sum(held.map((c) => score(c, search(c, { shift: rules.shift })))));
  barOnly.push(sum(held.map((c) => score(c, search(c, { shift: {}, bar: rules.bar })))));
  console.log(`fold ${String(i + 1).padStart(2)} recordings ${held.length} rules ${JSON.stringify({ shift: rules.shift, bar: rules.bar || null })}`);
});
console.log(`corrections: simulated, ${streamers.length} streamers left out one at a time; rules in ${withRules} folds`);
line("off", sum(off));
line("on ", sum(on));
line("on, the shift alone", sum(shiftOnly));
line("on, the bar alone  ", sum(barOnly));
