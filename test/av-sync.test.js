'use strict';
// QQ (#36): sentence ranges change what is kept, so the export needs a measured A/V sync check (flash + beep, ≤ 40 ms),
// with a range boundary where audio and video edges differ by no more than half a frame. These test the pieces:
// the synthetic source's fixed arguments, the flash / beep detectors, the pairing, and the smoke's wiring.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const M = require('../desktop/av-sync-measure.cjs'), G = require('../desktop/make-flash-beep.cjs');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the flash/beep source has fixed arguments: frame-aligned events every 15 frames from frame 6, bitexact, never overwrites', () => {
  a.deepEqual(G.SPEC, { seconds: 10, width: 320, height: 180, fps: 30, first: 6, every: 15, beepMs: 20, beepHz: 1000, video: 'vp9', audio: 'aac' });
  const s = G.flashBeepArgs('out.mp4').join(' ');
  a.match(s, /color=c=black:size=320x180:rate=30:duration=10/);
  a.match(s, /drawbox=[^ ]*enable='gte\(n\\,6\)\*eq\(mod\(n-6\\,15\)\\,0\)'/);
  a.match(s, /aevalsrc=/);
  for (const f of ['-n', '-fflags +bitexact', '-flags:v +bitexact', '-flags:a +bitexact', '-map_metadata -1', '-threads 1']) a.ok(s.includes(f), f);
  a.ok(!G.flashBeepArgs('o.mp4').includes('-y'));
  a.deepEqual(G.eventTimes().slice(0, 3), [0.2, 0.7, 1.2]);
  a.equal(G.eventTimes().length, 20);
});

test('flashes: each run of bright frames is one flash at its first frame', () => {
  const luma = new Array(60).fill(10); luma[6] = 250; luma[21] = 240; luma[22] = 200; luma[36] = 250;
  a.deepEqual(M.flashTimes(luma, 30), [6 / 30, 21 / 30, 36 / 30]);
});

test('beeps: onset of each burst after at least 0.1 s of quiet, to the sample', () => {
  const rate = 48000, x = new Float32Array(rate);
  for (const t of [0.2, 0.7]) for (let i = 0; i < 960; i++) x[Math.round(t * rate) + i] = Math.sin(2 * Math.PI * 1000 * i / rate);
  const on = M.beepOnsets(x, rate);
  a.equal(on.length, 2);
  for (const [i, t] of [0.2, 0.7].entries()) a.ok(Math.abs(on[i] - t) < 0.0005, `${on[i]} ≈ ${t}`);
});

test('pairing: each flash with its nearest beep; offset = beep − flash; a missing partner is reported, not skipped', () => {
  const r = M.pair([0.2, 0.7, 1.2], [0.21, 0.69], 0.04);
  a.deepEqual(r.pairs.map((p) => Math.round(p.offset * 1000)), [10, -10]);
  a.deepEqual(r.unpaired.flashes, [1.2]);
  a.equal(r.ok, false, 'an unpaired flash fails');
  a.equal(M.pair([0.2], [0.25], 0.04).ok, false, 'a 50 ms offset fails');
  a.equal(M.pair([0.2], [0.23], 0.04).ok, true, 'a 30 ms offset passes');
});

test('the smoke keeps ranges through the real dialog, saves, exports with fastExport, and needs a fresh profile and a hidden window', () => {
  const s = read('desktop/av-sync-smoke.cjs');
  a.match(s, /throw Error\('A fresh --user-data-dir is required'\)/);
  a.match(s, /show:false,webPreferences:\{\.\.\.o\.webPreferences,offscreen:true/);
  a.match(s, /showSentenceSelection\(\)/);
  // the bundled LGPL ffmpeg has no libx264: MONTCLIP_AV_ENCODER names the H.264 encoder (ADR 2026-11-02-h264-encoder)
  a.match(s, /fastExport\(encoder\?\{silent:true,delivery:\{preset:'master',video:\{codec:'h264',encoder\}\}\}:\{silent:true\}\)/);
  a.doesNotMatch(s, /\.show\(|setAlwaysOnTop|\.focus\(\)/);
});
