'use strict';
// Fast export's audio mix decoded the WHOLE source in the browser (fetch → arrayBuffer → decodeAudioData). On europa
// (2026-11-04) a 30 s export from a 2-hour, 8.2 GB recording read 5.4 GB, took the renderer to 4.5 GB, failed, and the
// file came out with no sound at all. For long or large files the mix now asks the server for just the part it plays:
// GET /api/audio-window?src=&from=&to= → WAV (32-bit float, the file's own channels, 48 kHz), decoded by the bundled FFmpeg.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'), app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
const body = (src, head) => { const i = src.indexOf(head); a.ok(i >= 0, head); return src.slice(i, src.indexOf('\n}', i)); };

/** WAV (RIFF, fmt, data) → {format, channels, rate, bits, frames, samples(ch)} */
function readWav(buf) {
  a.equal(buf.toString('ascii', 0, 4), 'RIFF'); a.equal(buf.toString('ascii', 8, 12), 'WAVE');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4); let size = buf.readUInt32LE(off + 4);
    if (id === 'data' && (size === 0xffffffff || off + 8 + size > buf.length)) size = buf.length - off - 8;
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  a.ok(fmt && data, 'fmt and data chunks');
  const frames = data.length / (fmt.channels * fmt.bits / 8);
  const ch = (c) => { const out = new Float32Array(frames); for (let i = 0; i < frames; i++) out[i] = data.readFloatLE((i * fmt.channels + c) * 4); return out; };
  return { ...fmt, frames, ch };
}

test('server: /api/audio-window decodes only the asked part, sample-accurately, keeping the channels', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  // 10 s, stereo: silence, then from 5.000 s a tone on the LEFT channel only
  execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30:d=10',
    '-f', 'lavfi', '-i', "aevalsrc='if(gte(t,5),0.5*sin(2*PI*1000*t),0)|0':s=48000:d=10",
    '-c:v', 'mpeg4', '-c:a', 'pcm_s16le', '-shortest', path.join(dir, 'media', 'beep.mov')]);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const r = await fetch(base + '/api/audio-window?src=/media/beep.mov&from=4&to=6');
  a.equal(r.status, 200, await r.clone().text()); a.match(r.headers.get('content-type'), /audio\/wav/);
  const w = readWav(Buffer.from(await r.arrayBuffer()));
  a.equal(w.format, 3, '32-bit float'); a.equal(w.channels, 2); a.equal(w.rate, 48000);
  a.ok(Math.abs(w.frames - 96000) <= 48, `2 s of audio, got ${w.frames} frames`);
  const L = w.ch(0), R = w.ch(1);
  const onset = L.findIndex((v) => Math.abs(v) > 0.05);
  a.ok(Math.abs(onset - 48000) <= 48, `the tone starts 1.000 s into the window (±1 ms), got ${onset / 48} ms`);
  a.ok(R.every((v) => Math.abs(v) < 1e-3), 'the right channel stays silent');
  // bad requests
  for (const q of ['src=/media/nope.mov&from=0&to=1', 'src=/etc/passwd&from=0&to=1'])
    a.equal((await fetch(base + '/api/audio-window?' + q)).status, 404, q);
  for (const q of ['src=/media/beep.mov&from=2&to=1', 'src=/media/beep.mov&from=x&to=1', 'src=/media/beep.mov&from=0&to=99999'])
    a.equal((await fetch(base + '/api/audio-window?' + q)).status, 400, q);
});

test('the export mix asks for a window for every local file (with a server), and offsets the clip into it', () => {
  const mix = body(app, 'async function renderAudioMix(');
  a.match(mix, /exportAudioSource\(m, c, a, b, windows\)/, 'each clip gets its source through the window helper');
  a.match(mix, /src\.start\(mixWhen, Math\.max\(0, mediaTimeAt\(c, a\) - at\)\)/, 'speed ramp: offset into the window');
  a.match(mix, /src\.start\(mixWhen, Math\.max\(0, c\.in \+ local0 \* sp - at\), mixDur \* sp\)/, 'steady speed: offset into the window');
  const helper = body(app, 'async function exportAudioSource(');
  a.match(helper, /\/api\/audio-window\?src=/);
  // QQ 2026-11-05: every local file goes through the window (container clock); the whole-file decode is only the
  // fallback without a server, so one project never mixes two offsets
  a.ok(!/AUDIO_WINDOW_MIN_SEC|AUDIO_WINDOW_MIN_BYTES/.test(app), 'no size / length split any more');
  a.match(helper, /if \(state\.connected && !isCrossOriginSrc\(m\.src\)\)/);
  a.match(helper, /getAudioBuffer\(m\)/, 'no server: the whole-file decode (MC-14: never in place of a failed window)');
});

test('a headless export page (?exportJob=) draws no waveforms, so it never decodes whole files for them', () => {
  a.match(app, /const EXPORT_JOB_PAGE = typeof location !== "undefined" && new URLSearchParams\(location\.search\)\.has\("exportJob"\);/);
  const wave = body(app, 'function ensureWave(');
  a.ok(wave.indexOf('if (EXPORT_JOB_PAGE) return;') > 0 && wave.indexOf('if (EXPORT_JOB_PAGE) return;') < wave.indexOf('getAudioBuffer('), 'before any decode');
});

/* Deja 2026-11-05: a failed audio mix must not export a silent file shown as a success. The export stops, with the
   reason in the interface language (drafts for JJ). Only clips that are actually heard count: a silent picture
   (volume 0, the linked-video layout) or a file with no audio stream never stops an export. */
test('a clip whose sound cannot be decoded stops the export, said in plain words; silent clips never do', () => {
  const head = 'function exportAudioHeard(', end = 'async function exportAudioSource(';
  const src = app.slice(app.indexOf(head), app.indexOf(end));
  a.ok(src.length > 50, 'helpers found');
  const V = require('../ui-preferences');
  for (const language of ['zh-CN', 'en']) {
    const uiText = (k, v) => V.t(language, k, v);
    const { exportAudioHeard, exportMixFailure } = new Function('uiText', 'mcView', 'MontClipAutoSlices', src + '\nreturn { exportAudioHeard, exportMixFailure };')(uiText, { get: () => ({ language }) }, require('../auto-slices'));
    const vid = { kind: 'video', props: {} }, pic = { kind: 'video', props: { volume: 0 } }, aud = { kind: 'audio', name: '直播录像', props: {} };
    a.equal(exportAudioHeard(aud, { audioChannels: 2 }), true);
    a.equal(exportAudioHeard(vid, { audioChannels: 2 }), true);
    a.equal(exportAudioHeard(pic, { audioChannels: 2 }), false, 'the picture of a linked video is silent');
    a.equal(exportAudioHeard(aud, { audioChannels: 0 }), false, 'a file with no audio stream');
    a.equal(exportMixFailure([{ c: aud, buf: {} }]), null);
    const e = exportMixFailure([{ c: aud, n: 1, t: 0, buf: {} }, { c: aud, n: 2, t: 10, failed: new Error('decode failed'), heard: true }, { c: pic, failed: new Error('x'), heard: false }]);
    a.ok(e instanceof Error); a.equal(e.code, 'EXPORT_AUDIO_FAILED');
    // MC-14 (JJ 2026-11-07): the clip is said by its number on the timeline, 第 N 段 (test/export-clip-sound.test.js)
    a.equal(e.message, V.t(language, 'own.export-audio-failed', { n: 2, time: '0:10' }));
    a.match(e.message, language === 'en' ? /clip 2/ : /第 2 段/);
    a.equal(exportMixFailure([{ c: pic, failed: new Error('x'), heard: false }]), null, 'an unheard failure is not one');
  }
  const mix = body(app, 'async function renderAudioMix(');
  a.match(mix, /const failed = exportMixFailure\(results\);/); a.match(mix, /if \(failed && !opts\.raw\) throw failed;/, 'export stops; highlight signals (raw) carry on');
  // both export paths call it without raw, so the error reaches the export's own failure handling (queue: failed)
  a.equal((app.match(/const wav = await renderAudioMix\(t0, t1, \{ silent \}\);/g) || []).length, 2);
});

/* Deja 2026-11-05: auto-slices on a machine whose only H.264 encoder is libx264 (no graphics card) export with x264
   veryfast instead of the master preset's slow — frame phase 67 s → 36 s on europa, CRF unchanged. A graphics-card
   encoder, or a preset the user (or the project) chose, is left as it is. */
test('auto-slice default: libx264 only → veryfast, same CRF; a graphics card or a chosen preset is left alone', () => {
  const Delivery = require('../delivery');
  const src = app.slice(app.indexOf('function sliceDeliverySpec('), app.indexOf('function queueSlices('));
  const run = (choice, encoders) => new Function('exportChoice', 'deliveryInfo', 'Delivery', 'normalizeDelivery',
    src + '\nreturn sliceDeliverySpec();')(() => choice, { encoders }, Delivery, (x) => Delivery.normalize(x, { available: encoders ? new Set(encoders) : null }));
  const dflt = { kind: 'delivery', spec: 'master', source: 'default' };
  const x264 = run(dflt, ['libx264', 'ffv1', 'aac']), master = Delivery.normalize('master', { available: new Set(['libx264']) }).spec;
  a.equal(x264.video.encoder, 'libx264'); a.equal(x264.video.speed, 'fast'); a.equal(x264.video.crf, master.video.crf, 'CRF unchanged');
  const args = Delivery.ffmpegArgs(x264, { fps: 30, input: 'jpeg', canvasW: 1080, canvasH: 1920, frame: Delivery.reframe(x264, 1080, 1920), hasAudio: false, outPath: 'o.mp4' });
  a.equal(args[args.indexOf('-preset') + 1], 'veryfast');
  a.equal(run(dflt, ['libx264', 'h264_nvenc']).video.speed, master.video.speed, 'a graphics-card encoder: unchanged');
  a.equal(run(dflt, ['h264_mf']).video.speed, master.video.speed, "Windows' encoder: unchanged");
  a.equal(run(dflt, null).video.speed, master.video.speed, 'encoders not known yet: unchanged');
  a.equal(run({ kind: 'delivery', spec: 'master', source: 'browser' }, ['libx264']).video.speed, master.video.speed, 'the user chose it');
  a.equal(run({ kind: 'delivery', spec: { preset: 'youtube' }, source: 'project' }, ['libx264']).video.speed, 'balanced', 'the project pins it');
  a.match(body(app, 'function queueSlices('), /const spec = sliceDeliverySpec\(\);/);
  a.match(body(app, 'async function autoExport('), /if \(!deliveryInfo\.encoders\) await fetchDeliveryInfo\(\);[\s\S]*queueSlices\(/, 'the encoders are known before the slices are queued');
});


/* QQ 2026-11-05: audio that starts 80 ms after the video. The window puts the beep where the container (and <video>)
   has it — 5.080 s — for a window from 0 as well as from inside the file, in FLV and MKV. (The whole-file
   decodeAudioData put it at 5.021 / 5.000 s, so every local file now goes through the window.) */
test('server: audio starting 80 ms late lands on the container clock, from 0 and mid-file, FLV and MKV (±1 ms)', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const beep = "aevalsrc='if(gte(t,5)*lt(t,5.2),0.5*sin(2*PI*1000*t),0)|0':s=48000:d=10";
  const make = (name, vcodec, acodec) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30:d=10',
    '-itsoffset', '0.08', '-f', 'lavfi', '-i', beep, '-map', '0:v', '-map', '1:a', '-c:v', vcodec, '-c:a', acodec, path.join(dir, 'media', name)]);
  make('late.flv', 'flv', 'aac'); make('late.mkv', 'mpeg4', 'flac');
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  for (const name of ['late.flv', 'late.mkv']) for (const [from, to] of [[0, 10], [4, 6]]) {
    const r = await fetch(`${base}/api/audio-window?src=/media/${name}&from=${from}&to=${to}`);
    a.equal(r.status, 200, name);
    const w = readWav(Buffer.from(await r.arrayBuffer())), L = w.ch(0);
    const onset = L.findIndex((v) => Math.abs(v) > 0.05) / 48000;
    a.ok(Math.abs(onset - (5.08 - from)) <= 0.001, `${name} from ${from}: beep at ${(onset + from).toFixed(4)} s in the file, want 5.0800`);
  }
});

/* QQ 2026-11-05: the server never holds a whole window in memory; the WAV header is read chunk by chunk. */
test('server: the window is written to disk and streamed, its WAV header walked chunk by chunk', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server/server.js'), 'utf8');
  const route = server.slice(server.indexOf('if (p === "/api/audio-window"'), server.indexOf('if (p === "/api/frame"'));
  a.ok(!/Buffer\.concat\(chunks\)|indexOf\("data"/.test(route), 'no buffering, no indexOf("data")');
  a.match(route, /fs\.createReadStream\(/); a.match(route, /wavChunks\(/);
  const { wavChunks } = require('../server/audio-window');
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(3, 0); fmt.writeUInt16LE(2, 2); fmt.writeUInt32LE(48000, 4); fmt.writeUInt16LE(32, 14);
  const chunk = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'ascii'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, b.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  // a LIST chunk whose text contains "data" sits before the real data chunk
  const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), chunk('LIST', Buffer.from('INFOdata?x')), chunk('data', Buffer.alloc(64))]);
  const head = Buffer.alloc(8); head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(body.length, 4);
  const c = wavChunks(Buffer.concat([head, body]));
  a.deepEqual({ format: c.fmt.format, channels: c.fmt.channels, rate: c.fmt.rate, bits: c.fmt.bits }, { format: 3, channels: 2, rate: 48000, bits: 32 });
  a.equal(c.data.size, 64); a.equal(c.data.offset, 12 + 8 + 16 + 8 + 10 + 8);
  a.equal(wavChunks(Buffer.from('nope')), null);
});

/* QQ 2026-11-05 (d): the window is the one path now, so a short and a long recording with the same late audio give the
   same answer. Both FLV (aac), audio starting 80 ms after the video, a beep at 5.000 s of the audio (5.080 s on the
   container clock); the long one, 10 minutes, has a second beep near its end (595.080 s) so drift would show. */
test('server: a short and a long FLV with audio 80 ms late put the beep at the same place, to ±1 ms, and the long one does not drift', { timeout: 180000 }, async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const make = (name, d, beeps) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=160x90:r=10:d=${d}`,
    '-itsoffset', '0.08', '-f', 'lavfi', '-i', `aevalsrc='${beeps.map((b) => `gte(t,${b})*lt(t,${b + 0.2})`).join('+')}*0.5*sin(2*PI*1000*t)|0':s=48000:d=${d}`,
    '-map', '0:v', '-map', '1:a', '-c:v', 'flv', '-c:a', 'aac', path.join(dir, 'media', name)]);
  make('short.flv', 10, [5]); make('long.flv', 600, [5, 595]);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const beepAt = async (name, from, to) => {
    const r = await fetch(`${base}/api/audio-window?src=/media/${name}&from=${from}&to=${to}`);
    a.equal(r.status, 200, name);
    const L = readWav(Buffer.from(await r.arrayBuffer())).ch(0);
    return from + L.findIndex((v) => Math.abs(v) > 0.05) / 48000;
  };
  const short = await beepAt('short.flv', 4, 6), long = await beepAt('long.flv', 4, 6), late = await beepAt('long.flv', 594, 596);
  for (const [what, v, want] of [['short', short, 5.08], ['long', long, 5.08], ['long, near its end', late, 595.08]])
    a.ok(Math.abs(v - want) <= 0.001, `${what}: beep at ${v.toFixed(4)} s, want ${want.toFixed(4)}`);
  t.diagnostic(`beep: short ${short.toFixed(4)} s, long ${long.toFixed(4)} s, long near its end ${late.toFixed(4)} s`);
  a.ok(Math.abs(short - long) <= 0.001, `short ${short.toFixed(4)} and long ${long.toFixed(4)} agree`);
});

/* QQ 2026-11-05 (b), the audio-window side: the window is decoded by the bundled build, never a local FFmpeg. */
test('the audio window is decoded by the bundled FFmpeg', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server/server.js'), 'utf8');
  const route = server.slice(server.indexOf('if (p === "/api/audio-window"'), server.indexOf('if (p === "/api/frame"'));
  a.match(route, /spawn\(FF\.path\("ffmpeg"\), AudioWindow\.windowArgs\(/);
  a.ok(!/externalFfmpeg|exportBinary/.test(route));
});

/* Rea on #149 (comment 6651791873, measured on bf5820a5): audio starting 59 / 80 ms after the video came out early by that
   much when the clip starts within 0.5 s of the file's head — the window is clamped to from = 0 and its first sample was
   the audio's first sample, not container time 0. The window must start at container time `from` whatever `from` is.
   Clips from 0 s, 0.3 s and the middle, with the page's own rule for `from`; ±1 ms. Plus the 录播姬 direction (picture
   late, sound from 0), which must stay at 0 ms. */
test('server: audio 59 / 80 ms late, clip from 0 s, 0.3 s or mid-file — the window starts on the container clock (±1 ms)', { timeout: 120000 }, async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
  if (!FF.available('ffmpeg') || !FF.available('ffprobe')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 })), media = path.join(dir, 'media');
  fs.mkdirSync(media, { recursive: true });
  const ff = (args) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', ...args]);
  const beeps = [1, 7.5];   // seconds of the audio's own clock
  const tone = `aevalsrc='(${beeps.map((b) => `gte(t,${b})*lt(t,${b + 0.1})`).join('+')})*0.5*sin(2*PI*1000*t)|0':s=48000:d=12`;
  const src = (vOff, aOff, vcodec, acodec, out) => ff(['-itsoffset', String(vOff), '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30:d=12',
    '-itsoffset', String(aOff), '-f', 'lavfi', '-i', tone, '-map', '0:v', '-map', '1:a', '-c:v', vcodec, '-c:a', acodec, path.join(media, out)]);
  src(0, 0.08, 'mpeg4', 'aac', 'late80.mkv');
  src(0, 0.08, 'flv', 'aac', 'late.flv');
  ff(['-i', path.join(media, 'late.flv'), '-c:v', 'mpeg4', '-c:a', 'copy', '-movflags', '+faststart', path.join(media, 'compat.mp4')]);   // prepare-media's remux of the audio (flv1 pictures can't go in MP4)
  src(0.058, 0, 'mpeg4', 'aac', 'picture-late.mkv');
  // where the container puts the audio's first sample (59 ms for the remuxed FLV, as Rea measured)
  const audioStart = (f) => {
    const j = JSON.parse(execFileSync(FF.path('ffprobe'), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=start_time', '-of', 'json', path.join(media, f)], { encoding: 'utf8' }));
    return +j.streams[0].start_time;
  };
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const PAD = 0.5, fromFor = (m0) => Math.max(0, Math.floor((m0 - PAD) * 1000) / 1000);   // app.js exportAudioSource
  a.match(app, /const AUDIO_WINDOW_PAD = 0\.5;/); a.match(app, /const from = Math\.max\(0, Math\.floor\(\(m0 - AUDIO_WINDOW_PAD\) \* 1000\) \/ 1000\)/);
  a.match(app, /return \{ buf, at: from, m0, m1 \};/, 'the page plays sample 0 of the window at container time `from`');
  const seen = [];
  // [file, where the container says the audio starts, where the sound really is (what the flash is aligned to)]. The
  // remuxed FLV's audio "starts" at 0.059 s: its first samples are AAC priming, 21 ms before the sound at 0.080 s — the
  // −59 ms Rea measured on the whole-file path is this.
  for (const [file, start, off] of [['late80.mkv', 0.08, 0.08], ['compat.mp4', 0.059, 0.08], ['picture-late.mkv', 0, 0]]) {
    a.ok(Math.abs(audioStart(file) - start) <= 0.002, `${file}: audio starts at ${audioStart(file)} s in the container, want ${start}`);
    for (const [clipIn, beep] of [[0, 1], [0.3, 1], [7, 7.5]]) {
      const from = fromFor(clipIn), to = Math.ceil((clipIn + 2 + PAD) * 1000) / 1000;
      const r = await fetch(`${base}/api/audio-window?src=/media/${file}&from=${from}&to=${to}`);
      a.equal(r.status, 200, file);
      const L = readWav(Buffer.from(await r.arrayBuffer())).ch(0);
      const at = from + L.findIndex((v) => Math.abs(v) > 0.05) / 48000, expect = beep + off;
      seen.push(`${file} in=${clipIn}: ${((at - expect) * 1000).toFixed(2)} ms`);
      a.ok(Math.abs(at - expect) <= 0.001, `${file}, clip from ${clipIn} s (window from ${from}): beep at ${at.toFixed(4)} s, the picture has it at ${expect.toFixed(4)} s`);
    }
  }
  t.diagnostic(seen.join(' · '));
});

/* Rea on #149 (comment 6650099788): a recording with a timestamp gap — 录播姬 files have them, up to about 101 ms — put
   the sound after the gap early by the gap. The window's n-th sample must be the file at from + n/48000: silence in the
   gap, the WAV exactly to − from long. Gaps of 0.05, 0.1 and 0.5 s at 6 s; beeps at 3 s and after the gap. */
test('server: a timestamp gap in the audio leaves the sound after it on time (±1 ms), and the window keeps its length', { timeout: 120000 }, async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 })), media = path.join(dir, 'media');
  fs.mkdirSync(media, { recursive: true });
  const tone = "aevalsrc='(gte(t,3)*lt(t,3.1)+gte(t,9)*lt(t,9.1))*0.5*sin(2*PI*1000*t)|0':s=48000:d=12";
  const gaps = [0.05, 0.1, 0.5];
  for (const g of gaps) execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', tone,
    '-af', `asetpts='PTS+if(gte(T,6),${g}/TB,0)'`, '-c:a', 'pcm_s16le', path.join(media, `gap${g}.mkv`)]);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const seen = [];
  for (const g of gaps) {
    const from = 2, to = 12;
    const r = await fetch(`${base}/api/audio-window?src=/media/gap${g}.mkv&from=${from}&to=${to}`);
    a.equal(r.status, 200);
    const w = readWav(Buffer.from(await r.arrayBuffer())), L = w.ch(0);
    const onsets = []; let last = -1;
    for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) > 0.05) { if (i - last > 4800) onsets.push(from + i / 48000); last = i; }
    seen.push(`gap ${g}: ${onsets.map((v) => v.toFixed(4)).join(' / ')} · ${(w.frames / 48000).toFixed(4)} s`);
    a.equal(onsets.length, 2, `gap ${g}: two beeps, got ${onsets.map((v) => v.toFixed(4))}`);
    a.ok(Math.abs(onsets[0] - 3) <= 0.001, `gap ${g}: the beep before the gap at ${onsets[0].toFixed(4)} s, want 3.0000`);
    a.ok(Math.abs(onsets[1] - (9 + g)) <= 0.001, `gap ${g}: the beep after the gap at ${onsets[1].toFixed(4)} s, want ${(9 + g).toFixed(4)}`);
    a.ok(Math.abs(w.frames / 48000 - (to - from)) <= 0.001, `gap ${g}: the window is ${(w.frames / 48000).toFixed(4)} s, want ${to - from}`);
  }
  t.diagnostic(seen.join(' · '));
});

/* Rea on #165 (2026-11-05): with `-ss 0`, a window read from the file's head disagreed with one read further in —
   FLV lost its first ~1.2 s of sound, MP3 with the picture 92 ms late came out −105 ms, AAC −21 ms. The window must
   put a sound at the same place however it is read: from 0, from 0.3, from 2.9 or the whole file. Samples as Rea's:
   MP3 from 0 with the picture 92 ms late (MKV, FLV), MP3 55 ms late (FLV), AAC 0.5 s late (MKV, MP4), AAC from 0. */
test('server: a window from 0, from 0.3, from 2.9 or the whole file puts the same beep at the same place (±1 ms), FLV and MP3 too', { timeout: 180000 }, async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 })), media = path.join(dir, 'media');
  fs.mkdirSync(media, { recursive: true });
  const tone = "aevalsrc='(gte(t,1)*lt(t,1.1)+gte(t,3.5)*lt(t,3.6)+gte(t,6)*lt(t,6.1)+gte(t,8.5)*lt(t,8.6))*0.5*sin(2*PI*1000*t)|0':s=48000:d=10";
  const make = (name, vOff, aOff, vcodec, acodec) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y',
    '-itsoffset', String(vOff), '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30:d=10', '-itsoffset', String(aOff), '-f', 'lavfi', '-i', tone,
    '-map', '0:v', '-map', '1:a', '-c:v', vcodec, '-c:a', acodec, ...(acodec === 'libmp3lame' ? ['-ar', '44100'] : []), path.join(media, name)]);
  const samples = [['mp3-pic92.mkv', 0.092, 0, 'mpeg4', 'libmp3lame'], ['mp3-pic92.flv', 0.092, 0, 'flv', 'libmp3lame'],
    ['mp3-late55.flv', 0, 0.055, 'flv', 'libmp3lame'], ['aac-late500.mkv', 0, 0.5, 'mpeg4', 'aac'], ['aac-late500.mp4', 0, 0.5, 'mpeg4', 'aac'],
    ['aac0.mkv', 0, 0, 'mpeg4', 'aac']];
  for (const s of samples) make(...s);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const beepNear = async (name, from, to, want) => {
    const r = await fetch(`${base}/api/audio-window?src=/media/${name}&from=${from}&to=${to}`);
    a.equal(r.status, 200, name);
    const L = readWav(Buffer.from(await r.arrayBuffer())).ch(0), i0 = Math.max(0, Math.round((want - 0.3 - from) * 48000));
    for (let i = i0; i < L.length; i++) if (Math.abs(L[i]) > 0.05) return from + i / 48000;
    return null;
  };
  const seen = [];
  for (const [name, , aOff] of samples) {
    const want = 3.5 + aOff, got = {};
    for (const [from, to] of [[0, 5], [0.3, 5], [2.9, 7], [0, 10]]) got[`${from}-${to}`] = await beepNear(name, from, to, want);
    const vals = Object.values(got);
    seen.push(`${name}: ${Object.entries(got).map(([k, v]) => `${k} ${v == null ? '—' : v.toFixed(4)}`).join(', ')}`);
    a.ok(vals.every((v) => v != null), `${name}: the beep is in every window ${JSON.stringify(got)}`);
    a.ok(Math.max(...vals) - Math.min(...vals) <= 0.001, `${name}: windows disagree ${JSON.stringify(got)}`);
    a.ok(Math.abs(vals[0] - want) <= 0.03, `${name}: beep at ${vals[0].toFixed(4)} s, the picture has it at ${want} s (codec delay aside)`);
  }
  t.diagnostic(seen.join(' · '));
});

test('the container-clock filter is one exported string, and the window uses it', () => {
  const W = require('../server/audio-window');
  a.equal(W.CLOCK_FILTER, 'aresample=async=1:min_hard_comp=0.01:first_pts=0');
  const args = W.windowArgs('x.flv', 0, 5, 'o.wav');
  a.equal(args[args.indexOf('-af') + 1], W.CLOCK_FILTER);
});
