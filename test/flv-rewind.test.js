'use strict';
// Rea's review of #130 @076ee672: a recording whose decode clock runs back (DTS to 8 s, then 0.5 s again) was imported
// as readable and remuxed with its sound copied; read as a whole, picture and sound came out up to 2.5 s apart. Deja,
// 2026-11-07: such a recording is refused (FLV_SOURCE_DAMAGED), never imported, converted or "accepted as readable".
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { accumulator } = require('../flv-readable-range');

const streams = [{ codec_type: 'video', avg_frame_rate: '30/1', time_base: '1/1000' }, { codec_type: 'audio', sample_rate: '48000', time_base: '1/1000' }];
const packet = (type, t, d = type === 'video' ? 0.033 : 0.021) => `codec_type=${type}|pts_time=${t}|dts_time=${t}|duration_time=${d}`;

test('a decode clock that runs back is reported as a rewind; a steady clock and B-frame pts without dts are not', () => {
  const back = accumulator(streams, 10);
  for (let t = 0; t < 8; t += 0.5) { back.frame(packet('video', t)); back.frame(packet('audio', t)); }
  back.frame(packet('video', 0.5)); back.frame(packet('audio', 0.5));
  const r = back.finish();
  a.equal(r.rewinds.length, 2, 'one rewind in each stream');
  a.ok(r.rewinds.every((x) => Math.abs(x.back - 7) < 0.1), JSON.stringify(r.rewinds));

  const steady = accumulator(streams, 4);
  for (let t = 0; t < 4; t += 0.5) { steady.frame(packet('video', t)); steady.frame(packet('audio', t)); }
  a.deepEqual(steady.finish().rewinds, []);

  // packets without a dts: pts runs back and forth with B-frames, which is not a rewind
  const bframes = accumulator([streams[0]], 1);
  for (const t of [0, 0.1, 0.033, 0.066, 0.2, 0.133, 0.166]) bframes.frame(`codec_type=video|pts_time=${t}|dts_time=N/A|duration_time=0.033`);
  a.deepEqual(bframes.finish().rewinds, []);
});

test('a synthetic FLV whose clock runs back is refused, even with acceptReadable, fixGaps and allowTranscode', async (t) => {
  const FF = require('../ffmpeg-path');
  if (!FF.available('ffmpeg') || !FF.available('ffprobe')) { t.skip('ffmpeg/ffprobe unavailable'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flv-rewind-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { make } = require('./flv-fixtures');
  const { file } = make(dir, 'rewind.flv', [['rewind', { at: 8000, to: 500 }]]);
  const P = require('../prepare-media');
  for (const opts of [{}, { acceptReadable: true }, { acceptReadable: true, fixGaps: true, allowTranscode: true }]) {
    const e = await P.prepareMedia(file, opts).then(() => null, (x) => x);
    a.ok(e, 'refused with ' + JSON.stringify(opts));
    a.equal(e.code, 'FLV_SOURCE_DAMAGED');
    a.ok(e.rewinds && e.rewinds.length, 'says where the clock ran back');
  }
  a.deepEqual(fs.readdirSync(dir).filter((f) => f !== 'rewind.flv'), [], 'nothing was written next to it');
});
