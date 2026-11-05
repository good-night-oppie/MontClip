'use strict';
// Fast export's audio mix decoded the WHOLE source in the browser (fetch → arrayBuffer → decodeAudioData). On europa
// (2026-11-04) a 30 s export from a 2-hour, 8.2 GB recording read 5.4 GB, took the renderer to 4.5 GB, failed, and the
// file came out with no sound at all. For long or large files the mix now asks the server for just the part it plays:
// GET /api/audio-window?src=&from=&to= → WAV (32-bit float, the file's own channels, 48 kHz), decoded by the bundled FFmpeg.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'), app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
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
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../ffmpeg-path');
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
  a.match(helper, /getAudioBuffer\(m\)/, 'no server: the whole-file decode');
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
    const { exportAudioHeard, exportMixFailure } = new Function('uiText', src + '\nreturn { exportAudioHeard, exportMixFailure };')(uiText);
    const vid = { kind: 'video', props: {} }, pic = { kind: 'video', props: { volume: 0 } }, aud = { kind: 'audio', name: '直播录像', props: {} };
    a.equal(exportAudioHeard(aud, { audioChannels: 2 }), true);
    a.equal(exportAudioHeard(vid, { audioChannels: 2 }), true);
    a.equal(exportAudioHeard(pic, { audioChannels: 2 }), false, 'the picture of a linked video is silent');
    a.equal(exportAudioHeard(aud, { audioChannels: 0 }), false, 'a file with no audio stream');
    a.equal(exportMixFailure([{ c: aud, buf: {} }]), null);
    const e = exportMixFailure([{ c: aud, buf: {} }, { c: aud, failed: new Error('decode failed'), heard: true }, { c: pic, failed: new Error('x'), heard: false }]);
    a.ok(e instanceof Error); a.equal(e.code, 'EXPORT_AUDIO_FAILED');
    a.ok(e.message.includes('直播录像'), e.message);
    a.match(e.message, language === 'en' ? /no sound/ : /没有声音/);
    a.equal(exportMixFailure([{ c: pic, failed: new Error('x'), heard: false }]), null, 'an unheard failure is not one');
  }
  const mix = body(app, 'async function renderAudioMix(');
  a.match(mix, /const failed = exportMixFailure\(results\);/); a.match(mix, /if \(failed && !opts\.raw\) throw failed;/, 'export stops; highlight signals (raw) carry on');
  // both export paths call it without raw, so the error reaches the export's own failure handling (queue: failed)
  a.equal((app.match(/const wav = await renderAudioMix\(t0, t1\);/g) || []).length, 2);
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
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../ffmpeg-path');
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
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const route = server.slice(server.indexOf('if (p === "/api/audio-window"'), server.indexOf('if (p === "/api/frame"'));
  a.ok(!/Buffer\.concat\(chunks\)|indexOf\("data"/.test(route), 'no buffering, no indexOf("data")');
  a.match(route, /fs\.createReadStream\(/); a.match(route, /wavChunks\(/);
  const { wavChunks } = require('../audio-window');
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
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../ffmpeg-path');
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
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const route = server.slice(server.indexOf('if (p === "/api/audio-window"'), server.indexOf('if (p === "/api/frame"'));
  a.match(route, /spawn\(FF\.path\("ffmpeg"\), AudioWindow\.windowArgs\(/);
  a.ok(!/externalFfmpeg|exportBinary/.test(route));
});
