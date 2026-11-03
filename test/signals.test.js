'use strict';
// P2 on a real-length recording (Deja, #52): reading the timeline's mix decoded every whole file in the page — a
// 2-hour recording took 705 s, 3.1 GB, and gave no sound at all. The server now streams each file's sound once
// through ffmpeg (8 kHz mono, one dBFS value per 0.5 s), caches it per file version, and the page maps it onto the
// timeline through each clip's start, in point, speed, volume and gain.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { makeDataDir, startServer } = require('./helpers');
const H = require('../highlight-candidates');
// MontClip's own ffmpeg (vendor/, via ffmpeg-path.js) — never one found on PATH
const FF = require('../ffmpeg-path');
const hasFfmpeg = () => FF.resolveTool('ffmpeg').ok;

function wav(seconds, loud = [], rate = 16000) {
  const n = seconds * rate, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) { const t = i / rate, amp = loud.some(([f, to]) => t >= f && t < to) ? 0.6 : 0.04; data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * t) * amp * 32767), i * 2); }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40); return Buffer.concat([h, data]);
}

test('GET /api/signals/loudness streams one file once and answers dBFS per 0.5 s, cached per file version', { skip: !hasFfmpeg() && "MontClip's ffmpeg is not in vendor/ (node desktop/fetch-ffmpeg.cjs)" }, async (t) => {
  const dir = makeDataDir(t);
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'media', '合成 响度.wav'), wav(20, [[10, 14]]));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const get = async () => (await fetch(base + '/api/signals/loudness?src=' + encodeURIComponent('/media/合成 响度.wav'))).json();
  const r = await get();
  a.equal(r.step, 0.5);
  a.ok(Math.abs(r.values.length - 40) <= 1, 'one value per 0.5 s: ' + r.values.length);
  const at = (s) => r.values[Math.floor(s / 0.5)];
  a.ok(at(12) - at(4) > 15, `the loud stretch stands out: ${at(4)} → ${at(12)}`);
  a.ok(at(4) > -40 && at(4) < -25, 'the quiet part reads as quiet sound, not silence: ' + at(4));
  const cached = fs.readdirSync(path.join(dir, 'analysis', 'signals'));
  a.equal(cached.length, 1, 'cached once');
  a.deepEqual(await get(), r, 'the cache answers the same');
  const missing = await fetch(base + '/api/signals/loudness?src=' + encodeURIComponent('/media/none.wav'));
  a.equal(missing.status, 404);
  const outside = await fetch(base + '/api/signals/loudness?src=' + encodeURIComponent('/media/../project.json'));
  a.equal(outside.status, 404, 'only files under media/ or library/');
});

test('mapLoudness puts each file\'s loudness on the timeline through start, in point, speed, volume and gain', () => {
  const file = { step: 0.5, values: Array.from({ length: 40 }, (_, i) => (i >= 20 && i < 28 ? -10 : -30)) };   // loud 10–14 s
  const clips = [{ mediaId: 'm', start: 100, in: 8, duration: 10, speed: 1, volume: 1, gain: 0 }];
  const out = H.mapLoudness(clips, { m: file }, { duration: 120, step: 0.5 });
  a.equal(out.values.length, 240);
  const at = (s) => out.values[Math.floor(s / 0.5)];
  a.equal(at(50), -90, 'no clip: silence');
  a.equal(at(101), -30, 'media 9 s');
  a.equal(at(103), -10, 'media 11 s: the loud part, 100 + (11 − 8)');
  a.equal(at(111), -90, 'after the clip');
  const quieter = H.mapLoudness([{ ...clips[0], volume: 0.5, gain: -6 }], { m: file }, { duration: 120, step: 0.5 });
  a.ok(Math.abs(quieter.values[Math.floor(103 / 0.5)] - (-10 - 6.02 - 6)) < 0.1, 'volume and gain lower it');
  const fast = H.mapLoudness([{ ...clips[0], speed: 2 }], { m: file }, { duration: 120, step: 0.5 });
  a.equal(fast.values[Math.floor(101.6 / 0.5)], -10, 'at 2× speed media 11.2 s is at timeline 101.6 s');
  const both = H.mapLoudness([clips[0], { ...clips[0] }], { m: file }, { duration: 120, step: 0.5 });
  a.ok(Math.abs(both.values[Math.floor(101 / 0.5)] - (-30 + 3.01)) < 0.05, 'two clips at once add up in power');
});
