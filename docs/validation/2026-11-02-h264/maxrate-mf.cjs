'use strict';
// Does a delivery preset's maxrate hold when h264_mf encodes in quality mode?
//   node docs/validation/2026-11-02-h264/maxrate-mf.cjs
// The ffmpeg arguments are MontClip's own (Delivery.normalize + Delivery.ffmpegArgs, as an export
// builds them), with the browser's frame pipe replaced by a lossless synthetic file. The footage is
// made hard on purpose (moving test pattern under heavy moving grain), so an encoder that ignores the
// cap goes past it. Reported: the average bitrate and the highest bitrate over any 1 s window,
// against the cap. Writes maxrate.json and maxrate.md next to this file.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const FF = require('../../../server/ffmpeg-path'), Delivery = require('../../../shared/delivery');
if (!FF.available('ffmpeg')) throw new Error('bundled ffmpeg not installed: ' + FF.reason('ffmpeg'));
const SECONDS = 8, W = 1920, H = 1080, FPS = 30;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-maxrate-'));
const run = (bin, args) => {
  const r = cp.spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 << 20, windowsHide: true });
  if (r.status !== 0) throw new Error(path.basename(bin) + ' failed: ' + (r.stderr || '').slice(-1500));
  return r.stdout;
};
// two sources: camera-like grain, and an extreme one (heavy grain everywhere) no real recording reaches
const SOURCES = { grain: 12, extreme: 40 };
const srcs = {};
for (const [k, n] of Object.entries(SOURCES)) {
  srcs[k] = path.join(work, k + '.mkv');
  run(FF.path('ffmpeg'), ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i',
    `testsrc2=s=${W}x${H}:r=${FPS}:d=${SECONDS},noise=alls=${n}:allf=t+u,format=yuv420p`, '-c:v', 'ffv1', srcs[k]]);
}

const cases = [
  { name: 'tiktok', spec: { preset: 'tiktok' } },
  { name: 'instagram-reels', spec: { preset: 'instagram-reels' } },
  { name: 'youtube (no cap)', spec: { preset: 'youtube' } },
  { name: 'custom CRF 18, cap 3 Mb/s', spec: { preset: 'custom', video: { codec: 'h264', crf: 18, maxrate: 3000 } } },
];
const rows = [];
for (const [source, src] of Object.entries(srcs)) for (const c of cases) {
  const { spec } = Delivery.normalize(c.spec, { available: new Set(['h264_mf']) });
  const out = path.join(work, c.name.replace(/\W+/g, '_') + '.mp4');
  const args = Delivery.ffmpegArgs(spec, { fps: FPS, input: 'jpeg', canvasW: W, canvasH: H, frame: Delivery.reframe(spec, W, H), outPath: out });
  const i = args.indexOf('-i');                         // swap the browser's frame pipe for the file
  const real = ['-hide_banner', '-v', 'error', '-y', '-i', src, ...args.slice(i + 2)];
  const video = real.slice(real.indexOf('-c:v'), real.indexOf('-pix_fmt') + 2).join(' ');
  run(FF.path('ffmpeg'), real);
  const pk = run(FF.path('ffprobe'), ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time,size', '-of', 'csv=p=0', out])
    .trim().split(/\r?\n/).map((l) => l.split(',').map(Number)).sort((a, b) => a[0] - b[0]);
  const total = pk.reduce((s, p) => s + p[1], 0), dur = pk.length / FPS;
  let peak = 0;
  for (let s = 0; s + FPS <= pk.length; s++) { let b = 0; for (let k = s; k < s + FPS; k++) b += pk[k][1]; peak = Math.max(peak, b * 8); }
  const cap = spec.video.maxrate ? spec.video.maxrate / 1000 : null;
  const avg = +(total * 8 / dur / 1e6).toFixed(2), pk1 = +(peak / 1e6).toFixed(2);
  rows.push({ source, name: c.name, video, size: `${spec.width || W}×${spec.height || H}`, capMbps: cap, avgMbps: avg, peak1sMbps: pk1,
    held: cap == null ? null : pk1 <= cap * 1.05 });
}
fs.writeFileSync(path.join(__dirname, 'maxrate.json'), JSON.stringify({ date: new Date().toISOString(), seconds: SECONDS, rows }, null, 1) + '\n');
const md = ['| source | preset | output | cap | average | highest 1 s | cap held? | video args |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.source} | ${r.name} | ${r.size} | ${r.capMbps == null ? '—' : r.capMbps + ' Mb/s'} | ${r.avgMbps} Mb/s | ${r.peak1sMbps} Mb/s | ${r.held == null ? '—' : r.held ? 'yes' : '**no**'} | \`${r.video}\` |`)].join('\n');
fs.writeFileSync(path.join(__dirname, 'maxrate.md'), md + '\n');
fs.rmSync(work, { recursive: true, force: true });
console.log(md);
