'use strict';
// Audio/video sync of an h264_mf export over a long timeline, through MontClip's own export API.
//   node docs/validation/2026-11-02-h264/sync-mf.cjs [minutes=10]
// A temporary server (its own data folder) takes the same requests the editor sends: begin a delivery
// with h264_mf, upload the audio mix, stream the frames, end. The frames are black, with one white
// frame every 2 s; the mix is silent, with a 20 ms 1 kHz beep at the same moments. The exported file
// is then decoded by the bundled ffmpeg: every flash and every beep onset is found, and each beep is
// compared with its flash. Requirement (Deja, 2026-11-02): |offset| ≤ 40 ms everywhere.
// Writes sync.json and sync.md, and a 6 s stream-copied sample into samples/.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), net = require('node:net');
const FF = require('../../../ffmpeg-path');
if (!FF.available('ffmpeg')) throw new Error('bundled ffmpeg not installed: ' + FF.reason('ffmpeg'));
const ROOT = path.join(__dirname, '..', '..', '..');
const MINUTES = Number(process.argv[2]) || 10, FPS = 30, W = 1280, H = 720, PERIOD = 2, FIRST = 0.5, RATE = 48000;
const SECONDS = MINUTES * 60, FRAMES = SECONDS * FPS;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sync-'));
const ff = (args, opts = {}) => {
  const r = cp.spawnSync(FF.path('ffmpeg'), ['-hide_banner', '-v', 'error', ...args], { maxBuffer: 1 << 30, windowsHide: true, ...opts });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + String(r.stderr).slice(-1500));
  return r.stdout;
};
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });

(async () => {
  // the inputs: two JPEG frames and the mix
  const black = ff(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}`, '-frames:v', '1', '-f', 'mjpeg', '-q:v', '3', '-']);
  const white = ff(['-f', 'lavfi', '-i', `color=c=white:s=${W}x${H}`, '-frames:v', '1', '-f', 'mjpeg', '-q:v', '3', '-']);
  const wav = path.join(work, 'mix.wav');
  ff(['-f', 'lavfi', '-i', `aevalsrc='if(lt(mod(t-${FIRST}+${PERIOD}\\,${PERIOD})\\,0.02)\\,0.8*sin(2*PI*1000*t)\\,0)':s=${RATE}:d=${SECONDS}:c=stereo`,
    '-c:a', 'pcm_s16le', wav]);
  const flashFrame = (n) => n >= FIRST * FPS && (n - FIRST * FPS) % (PERIOD * FPS) === 0;

  // a server of its own
  const data = path.join(work, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'project.json'), JSON.stringify({ name: 'sync', width: W, height: H, fps: FPS, revision: 1, media: [], clips: [] }));
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const server = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', FABLECUT_DATA_DIR: data, FABLECUT_NO_FS_WATCH: '1', FABLECUT_NO_AUTOSTART: '1',
      MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: path.join(work, 'none.json') } });
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(base + '/api/export/ffmpeg')).ok) break; } catch {} if (i > 100) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 200)); }
    const delivery = { preset: 'custom', width: W, height: H, video: { codec: 'h264', encoder: 'h264_mf', crf: 18 }, audio: { codec: 'aac', bitrate: 192 } };
    const begin = await (await fetch(base + '/api/export/begin', { method: 'POST', body: JSON.stringify({ fps: FPS, hasAudio: true, duration: SECONDS,
      canvasW: W, canvasH: H, deliveries: [{ delivery, name: 'sync' }] }) })).json();
    if (!begin.id) throw new Error('begin: ' + JSON.stringify(begin));
    const args = begin.outputs[0].spec.video;
    if ((await fetch(base + '/api/export/audio?id=' + begin.id, { method: 'POST', body: fs.readFileSync(wav) })).status !== 200) throw new Error('audio upload');
    const t0 = Date.now();
    for (let n = 0; n < FRAMES; n += 300) {
      const chunk = [];
      for (let k = n; k < Math.min(FRAMES, n + 300); k++) chunk.push(flashFrame(k) ? white : black);
      const r = await fetch(base + '/api/export/frame?id=' + begin.id, { method: 'POST', body: Buffer.concat(chunk) });
      if (r.status !== 200) throw new Error('frame upload ' + r.status + ' ' + await r.text());
    }
    const end = await (await fetch(base + '/api/export/end?id=' + begin.id, { method: 'POST' })).json();
    const o = end.outputs && end.outputs[0];
    if (!o || !o.ok) throw new Error('end: ' + JSON.stringify(end));
    const file = path.join(data, 'exports', path.basename(o.src));
    const renderSecs = (Date.now() - t0) / 1000;

    // flashes: the frames whose average brightness is high, at their decoded timestamps
    const vstats = String(ff(['-i', file, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8' }));
    const flashes = [];
    let pts = null;
    for (const line of vstats.split(/\r?\n/)) {
      const m = /pts_time:([\d.]+)/.exec(line); if (m) pts = +m[1];
      const y = /YAVG=([\d.]+)/.exec(line); if (y && +y[1] > 128) flashes.push(pts);
    }
    // beeps: the first sample over 0.3 after at least 0.5 s of silence, from the decoded audio
    const pcm = ff(['-i', file, '-map', '0:a', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-']);
    const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
    const beeps = [];
    let quiet = RATE;
    for (let i = 0; i < s.length; i++) { if (Math.abs(s[i]) > 0.3) { if (quiet >= RATE / 2) beeps.push(i / RATE); quiet = 0; } else quiet++; }
    const probe = cp.spawnSync(FF.path('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration', '-of', 'json', file], { encoding: 'utf8' });
    const streams = JSON.parse(probe.stdout).streams;

    const pairs = flashes.map((f) => { let best = null; for (const b of beeps) if (best == null || Math.abs(b - f) < Math.abs(best - f)) best = b; return { t: f, offsetMs: Math.round((best - f) * 1000 * 10) / 10 }; });
    const abs = pairs.map((p) => Math.abs(p.offsetMs));
    const result = {
      date: new Date().toISOString(), minutes: MINUTES, fps: FPS, size: `${W}×${H}`, encoder: args.encoder,
      renderSeconds: Math.round(renderSecs), expectedEvents: Math.floor((SECONDS - FIRST) / PERIOD) + 1, flashes: flashes.length, beeps: beeps.length,
      streams, maxAbsOffsetMs: Math.max(...abs), meanOffsetMs: +(pairs.reduce((a, p) => a + p.offsetMs, 0) / pairs.length).toFixed(1),
      first: pairs.slice(0, 3), last: pairs.slice(-3), pass: pairs.length > 0 && Math.max(...abs) <= 40 && flashes.length === beeps.length,
      report: o.report && o.report.line,
    };
    fs.writeFileSync(path.join(__dirname, 'sync.json'), JSON.stringify(result, null, 1) + '\n');
    const md = `${MINUTES} min, ${W}×${H} ${FPS} fps, ${result.encoder} through /api/export (render ${result.renderSeconds} s).\n\n` +
      `| events expected | flashes found | beeps found | max abs offset | mean offset | first three | last three | ≤ 40 ms |\n|---|---|---|---|---|---|---|---|\n` +
      `| ${result.expectedEvents} | ${result.flashes} | ${result.beeps} | ${result.maxAbsOffsetMs} ms | ${result.meanOffsetMs} ms | ` +
      `${result.first.map((p) => p.offsetMs).join(' / ')} ms | ${result.last.map((p) => p.offsetMs).join(' / ')} ms | ${result.pass ? 'yes' : '**no**'} |\n\n` +
      `Streams: ${streams.map((x) => `${x.codec_type} start ${x.start_time} s, ${(+x.duration).toFixed(3)} s`).join('; ')}.\n`;
    fs.writeFileSync(path.join(__dirname, 'sync.md'), md);
    fs.mkdirSync(path.join(__dirname, 'samples'), { recursive: true });
    ff(['-y', '-ss', String(SECONDS - 6), '-i', file, '-c', 'copy', '-movflags', '+faststart', path.join(__dirname, 'samples', 'sync-last-6s.mp4')]);
    ff(['-y', '-i', file, '-t', '6', '-c', 'copy', '-movflags', '+faststart', path.join(__dirname, 'samples', 'sync-first-6s.mp4')]);
    console.log(md);
    if (!result.pass) process.exitCode = 1;
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(work, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
