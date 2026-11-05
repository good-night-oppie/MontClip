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

test('the export mix asks for a window on long or large files, and offsets the clip into it', () => {
  const mix = body(app, 'async function renderAudioMix(');
  a.match(mix, /exportAudioSource\(m, c, a, b, windows\)/, 'each clip gets its source through the window helper');
  a.match(mix, /src\.start\(mixWhen, Math\.max\(0, mediaTimeAt\(c, a\) - at\)\)/, 'speed ramp: offset into the window');
  a.match(mix, /src\.start\(mixWhen, Math\.max\(0, c\.in \+ local0 \* sp - at\), mixDur \* sp\)/, 'steady speed: offset into the window');
  const helper = body(app, 'async function exportAudioSource(');
  a.match(helper, /\/api\/audio-window\?src=/);
  a.match(helper, /getAudioBuffer\(m\)/, 'short files keep the whole-file decode (shared with waveforms)');
  a.match(app, /const AUDIO_WINDOW_MIN_SEC = \d+, AUDIO_WINDOW_MIN_BYTES = [\d *]+,/);
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
