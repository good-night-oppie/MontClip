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
   As shipped (Deja, 2026-11-03): the shift on, the singing bar off (BAR_ON), and a part marked 不是唱歌 not a song card
   again when the same recording is searched again. Across streamers no recording is shared, so that mark cannot act in a
   fold; "searched again" scores it apart: each recording searched a second time with only its own 不是唱歌 marks.
   recall@10: labelled song starts with a found start within 10 s; precision@15: found songs with a labelled start within
   15 s; start / end error: |found − labelled| for songs matched by start within 15 s (an end only where it is labelled —
   few are). */
"use strict";
const fs = require("fs"), path = require("path");
const Songs = require("../songs"), C = require("../corrections"), H = require("../highlight-candidates");
const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, "cases"))) { console.error("usage: corrections-loso.cjs <golden dir with cases/>"); process.exit(2); }
const SONG = /演唱|舞蹈/;
const median = (v) => { if (!v.length) return NaN; const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");

// 互动, 聊天 and 整活 (ADR 39a05471; Deja from v12): no rule finds them; each scored apart. A label in both 整活 and 互动 is 互动
const TYPED = [["interaction", "互动", (k) => /互动/.test(k)], ["chat", "聊天", (k) => /聊天/.test(k)], ["stunt", "整活", (k) => /整活/.test(k) && !/互动/.test(k)]];
const nearest = (list, t, key) => list.reduce((b, x) => (!b || Math.abs(x[key] - t) < Math.abs(b[key] - t) ? x : b), null);
const cases = fs.readdirSync(path.join(root, "cases")).sort().map((name) => {
  const dir = path.join(root, "cases", name);
  if (!fs.existsSync(path.join(dir, "labels.json")) || !fs.existsSync(path.join(dir, "audio-features.json"))) return null;
  const F = JSON.parse(fs.readFileSync(path.join(dir, "audio-features.json"), "utf8")), L = JSON.parse(fs.readFileSync(path.join(dir, "labels.json"), "utf8"));
  const k = Array.isArray(F.keys) ? F.keys.indexOf("rms") : 1, rms = F.rows.map((r) => r[k]), step = F.step || 0.5;
  // most labels have a start only (end_sec null): an end is used where there is one
  const labels = L.labels.filter((l) => SONG.test(String(l.category)) && !l.unaligned && Number.isFinite(l.start_sec))
    .map((l) => ({ s: l.start_sec, e: Number.isFinite(l.end_sec) ? l.end_sec : null }));
  // 互动 / 聊天 / 整活: no rule finds them; the streamer marks a highlight candidate as one and moves its ends. Simulated: the
  // candidate nearest each such label (within 15 s) is that card
  const typed = TYPED.map(([kind, , is]) => ({ kind, labels: L.labels.filter((l) => is(String(l.category)) && !l.unaligned && Number.isFinite(l.start_sec)).map((l) => ({ s: l.start_sec, e: Number.isFinite(l.end_sec) ? l.end_sec : null })) }));
  let cards = [];
  if (typed.some((t) => t.labels.length) && fs.existsSync(path.join(dir, "loudness.json"))) {
    const loudness = JSON.parse(fs.readFileSync(path.join(dir, "loudness.json"), "utf8"));
    const dm = fs.existsSync(path.join(dir, "danmaku.json")) ? (JSON.parse(fs.readFileSync(path.join(dir, "danmaku.json"), "utf8")).times || []).map((t) => ({ t })) : [];
    cards = H.candidates({ duration: rms.length * step, sentences: [], loudness, danmaku: dm }).map((c) => ({ s: c.from, e: c.to }));
  }
  for (const t of typed) t.cards = t.labels.map((l) => { const x = nearest(cards, l.s, "s"); return x && Math.abs(x.s - l.s) <= 15 ? { label: l, card: x } : null; }).filter(Boolean);
  const duration = rms.length * step;
  return { streamer: String(L.bvid), rms, step, duration, key: C.recordingKey(duration, { step, values: rms }), labels, typed };
}).filter(Boolean);

function search(c, rules) {
  const found = Songs.find(c.rms, { step: c.step, complete: true, ...C.songOptions(rules) }).map((s) => ({ s: s.from, e: s.to }));
  if (!rules) return found;
  return C.apply(found.map((x, i) => ({ id: "s" + i, mediaId: "x", kind: "song", ...x })), rules, { duration: { x: c.duration }, recKey: { x: c.key } }).map((x) => ({ s: x.s, e: x.e }));
}
function simulate(c) {
  const out = [], found = search(c, null), loud = { step: c.step, values: c.rms };
  for (const x of found) {
    const l = nearest(c.labels, x.s, "s");
    if (l && Math.abs(l.s - x.s) <= 15) out.push({ t: x.s, r: C.record({ type: "trim", kind: "song", startShift: l.s - x.s, endShift: l.e == null ? 0 : l.e - x.e, duration: c.duration }) });
    else { const ft = C.features(x, loud); if (ft) out.push({ t: x.s, r: C.record({ type: "kind", from: "song", to: "other", duration: c.duration, features: ft, rec: c.key, s: x.s, e: x.e }) }); }
  }
  for (const l of c.labels) {
    const x = nearest(found, l.s, "s");
    // the labelled part's sound; with no labelled end, from its start over songs.js's shortest song (90 s)
    if (!x || Math.abs(x.s - l.s) > 15) { const ft = C.features({ s: l.s, e: l.e == null ? l.s + Songs.DEFAULTS.MIN_SONG : l.e }, loud); if (ft) out.push({ t: l.s, r: C.record({ type: "kind", from: "other", to: "song", duration: c.duration, features: ft }) }); }
  }
  for (const t of c.typed) for (const { label, card } of t.cards) {
    out.push({ t: card.s, r: C.record({ type: "kind", from: "moment", to: t.kind, duration: c.duration }) });
    out.push({ t: card.s + 0.001, r: C.record({ type: "trim", kind: t.kind, startShift: label.s - card.s, endShift: label.e == null ? 0 : label.e - card.e, duration: c.duration }) });
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
const off = [], on = [], shiftOnly = [], barOnly = [], both = [], typed = Object.fromEntries(TYPED.map(([k]) => [k, { labels: 0, matched: 0, off: [], on: [], folds: 0 }]));
let withRules = 0;
streamers.forEach((who, i) => {
  const held = cases.filter((c) => c.streamer === who), rest = cases.filter((c) => c.streamer !== who);
  const records = rest.flatMap(simulate), rules = C.rules(records), withBar = C.rules(records, { bar: true });
  const used = Object.keys(rules.shift).length;
  if (used) withRules++;
  const a = sum(held.map((c) => score(c, search(c, null)))), b = sum(held.map((c) => score(c, search(c, rules))));
  off.push(a); on.push(b);
  shiftOnly.push(sum(held.map((c) => score(c, search(c, { shift: rules.shift })))));
  barOnly.push(sum(held.map((c) => score(c, search(c, { shift: {}, bar: withBar.bar })))));
  both.push(sum(held.map((c) => score(c, search(c, { shift: withBar.shift, bar: withBar.bar })))));
  // 互动 / 聊天 / 整活: the start error of the held-out streamer's cards of each kind, before and after that kind's habit
  for (const [kind] of TYPED) if (rules.shift[kind]) typed[kind].folds++;
  for (const c of held) for (const t of c.typed) {
    const out = typed[t.kind];
    out.labels += t.labels.length; out.matched += t.cards.length;
    for (const { label, card } of t.cards) {
      const [x] = C.apply([{ id: "i", mediaId: "x", kind: t.kind, s: card.s, e: card.e }], rules, { duration: { x: c.duration } });
      out.off.push(Math.abs(card.s - label.s)); out.on.push(Math.abs(x.s - label.s));
    }
  }
  console.log(`fold ${String(i + 1).padStart(2)} recordings ${held.length} rules ${JSON.stringify({ shift: rules.shift, bar: withBar.bar || null })}`);
});
console.log(`corrections: simulated, ${streamers.length} streamers left out one at a time; rules in ${withRules} folds`);
line("off", sum(off));
line("on, as shipped (the shift; the bar off)", sum(on));
line("the shift alone", sum(shiftOnly));
line("the bar alone (off as shipped)", sum(barOnly));
line("the shift and the bar", sum(both));
// the same recording searched again, with only its own 不是唱歌 marks (no other rule): what the streamer sees on a re-search
const again = sum(cases.map((c) => { const marks = simulate(c).filter((r) => r.type === "kind" && r.from === "song"); return score(c, search(c, { shift: {}, notSong: C.rules(marks).notSong || [] })); }));
line("searched again, its own 不是唱歌 marks", again);
for (const [kind, name] of TYPED) { const t = typed[kind];
  console.log(`${name} labelled ${t.labels} matched to a candidate ${t.matched} median|start error| off ${f(median(t.off), 1)} s on ${f(median(t.on), 1)} s; folds with a ${name} habit ${t.folds} of ${streamers.length}`); }
