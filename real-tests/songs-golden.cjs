#!/usr/bin/env node
/* Local evaluation of songs.js against a golden set kept outside the repo (P2, Deja 2026-11-03: the golden set never
   enters the repo, and the evaluation prints numbers only — no titles, labels, case names or paths).
     node real-tests/songs-golden.cjs <golden dir>
   <golden dir>/cases/<case>/audio-features.json  {step, keys:[t, rms, …], rows}   (ffmpeg astats + aspectralstats)
   <golden dir>/cases/<case>/labels.json          {labels:[{start_sec, category, unaligned?}]}   singing / dancing count
   <golden dir>/split.json (optional)             {train:[…], holdout:[…]}   — reported apart, by count only
   recall@10: labelled song starts with a found start within 10 s. precision@15: found songs with a labelled start
   within 15 s. Offsets: found start − labelled start, for matches within 15 s, split by sure / estimated. */
"use strict";
const fs = require("fs");
const path = require("path");
const Songs = require("../songs");

const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, "cases"))) { console.error("usage: songs-golden.cjs <golden dir with cases/>"); process.exit(2); }
const SONG = /演唱|舞蹈/;
const median = (v) => { if (!v.length) return NaN; const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");

function evaluate(name) {
  const dir = path.join(root, "cases", name);
  const F = JSON.parse(fs.readFileSync(path.join(dir, "audio-features.json"), "utf8"));
  const k = Array.isArray(F.keys) ? F.keys.indexOf("rms") : 1;
  const labels = JSON.parse(fs.readFileSync(path.join(dir, "labels.json"), "utf8")).labels
    .filter((l) => SONG.test(String(l.category)) && !l.unaligned && Number.isFinite(l.start_sec)).map((l) => l.start_sec);
  const found = Songs.find(F.rows.map((r) => r[k]), { step: F.step || 0.5, complete: true });
  const nearest = (t) => found.reduce((best, s) => (Math.abs(s.from - t) < Math.abs(best ? best.from - t : Infinity) ? s : best), null);
  const r = { n: labels.length, hit10: 0, pred: found.length, tp15: 0, est: found.filter((s) => s.confidence === "estimated").length, offSure: [], offEst: [] };
  for (const t of labels) {
    const s = nearest(t);
    if (s && Math.abs(s.from - t) <= 10) r.hit10++;
    if (s && Math.abs(s.from - t) <= 15) (s.marks.some((m) => m.at === "start") ? r.offEst : r.offSure).push(s.from - t);
  }
  r.tp15 = found.filter((s) => labels.some((t) => Math.abs(s.from - t) <= 15)).length;
  return r;
}
function line(label, rs) {
  const s = rs.reduce((a, r) => ({ n: a.n + r.n, hit10: a.hit10 + r.hit10, pred: a.pred + r.pred, tp15: a.tp15 + r.tp15, est: a.est + r.est,
    offSure: a.offSure.concat(r.offSure), offEst: a.offEst.concat(r.offEst) }), { n: 0, hit10: 0, pred: 0, tp15: 0, est: 0, offSure: [], offEst: [] });
  const abs = (v) => v.map(Math.abs);
  console.log(`${label} cases ${rs.length} labelled ${s.n} found ${s.pred} recall@10 ${f(s.hit10 / s.n)} precision@15 ${f(s.tp15 / s.pred)}` +
    ` estimated ${s.est}/${s.pred} median|start offset| sure ${f(median(abs(s.offSure)), 1)} s (${s.offSure.length})` +
    ` start-estimated ${f(median(abs(s.offEst)), 1)} s (${s.offEst.length})`);
}
const names = fs.readdirSync(path.join(root, "cases")).filter((c) => fs.existsSync(path.join(root, "cases", c, "audio-features.json")) && fs.existsSync(path.join(root, "cases", c, "labels.json"))).sort();
const res = new Map(names.map((c) => [c, evaluate(c)]));
names.forEach((c, i) => line(`case ${String(i + 1).padStart(2)}`, [res.get(c)]));
let split = null;
try { split = JSON.parse(fs.readFileSync(path.join(root, "split.json"), "utf8")); } catch { /* no split */ }
if (split) for (const part of ["train", "holdout"]) if (Array.isArray(split[part])) line(part.padEnd(7), split[part].filter((c) => res.has(c)).map((c) => res.get(c)));
line("TOTAL  ", [...res.values()]);
