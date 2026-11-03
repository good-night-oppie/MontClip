'use strict';
// Deja (after #57): the package smoke runs a second round as if the streamer's computer had no FFmpeg at all — every
// PATH folder holding ffmpeg or ffprobe is taken out before the packaged app starts (this machine has gyan 9.0.1 on
// PATH). It records the exported file's encoder tag (the packaged libavcodec, Lavc63.1.102 — PATH's is 63.1.101) and
// whether the highlight candidates could read the sound.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const P = require('../desktop/smoke-no-path.cjs');

test('PATH without FFmpeg: every folder holding ffmpeg or ffprobe goes, the rest stay in order', () => {
  const has = new Set(['C:\\gyan\\bin\\ffmpeg.exe', 'C:\\tools\\ffprobe.exe', 'D:\\x\\FFMPEG.EXE']);
  const exists = (f) => has.has(f) || [...has].some((h) => h.toLowerCase() === f.toLowerCase());
  const r = P.pathWithoutFfmpeg(['C:\\Windows\\system32', 'C:\\gyan\\bin', '', 'C:\\tools', 'D:\\x\\', 'C:\\node'].join(';'), { exists, platform: 'win32' });
  a.equal(r.path, ['C:\\Windows\\system32', 'C:\\node'].join(';'));
  a.deepEqual(r.removed, ['C:\\gyan\\bin', 'C:\\tools', 'D:\\x\\']);
  a.deepEqual(P.pathWithoutFfmpeg('', { exists, platform: 'win32' }), { path: '', removed: [] });
});

test('the libavcodec version, from ffmpeg -version and from an encoder tag', () => {
  const version = 'ffmpeg version n9.0.2-montclip1 Copyright (c) 2000-2026\n  libavutil      61.  3.100 / 61.  3.100\n  libavcodec     63.  1.102 / 63.  1.102\n  libavformat    63.  0.100 / 63.  0.100\n';
  a.equal(P.lavcFromVersion(version), 'Lavc63.1.102');
  a.equal(P.lavcFromVersion('nothing'), null);
  a.equal(P.lavcFromTag('Lavc63.1.102 h264_mf'), 'Lavc63.1.102');
  a.equal(P.lavcFromTag('Lavf63.0.100'), null);
});

test('the package smoke has the no-FFmpeg round and records what Deja asked for', () => {
  const smoke = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'package-smoke.cjs'), 'utf8');
  a.match(smoke, /--no-path-ffmpeg/);
  a.match(smoke, /pathWithoutFfmpeg\(/);
  a.match(smoke, /env: launchEnv/, 'the app is started with that PATH');
  a.match(smoke, /out\.encoderTags/);
  a.match(smoke, /out\.highlightSound/);
});
