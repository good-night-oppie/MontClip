'use strict';
// H.264 through Windows Media Foundation (h264_mf): picture quality by region, bitrate and speed.
//   node docs/validation/2026-11-02-h264/measure-mf.cjs [seconds=10]
// Uses MontClip's bundled ffmpeg (ffmpeg-path.js), never one on PATH. Writes mf-quality.json and
// mf-quality.md next to this file, and small samples into samples/. The source is synthetic and
// lossless (FFV1), built here, so anyone can rerun it:
//   - "scene": testsrc2 (moving detail and colour bars), the whole frame behind the rest;
//   - "skin": a 640×480 skin-tone patch with fine moving grain and a soft gradient;
//   - "subtitle": a 1920×200 bottom band, white Chinese text with a black outline on a dark bar,
//     changing every 2 s, the place a streamer's captions sit.
// PSNR (Y, U, V averaged as ffmpeg's psnr filter reports "average") is measured on the whole frame and
// on each region, against the source. Conditions: the software MFT (MontClip's, -hw_encoding unset)
// and the hardware MFT (-hw_encoding 1), each at quality 65 (the old CRF 18 mapping) and 75 (the new).
// This is our own setup: VV's report was not available on this machine, so compare rows within this
// file rather than with VV's numbers.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const FF = require('../../../ffmpeg-path');
const ffmpeg = FF.path('ffmpeg');
if (!FF.available('ffmpeg')) throw new Error('bundled ffmpeg not installed: ' + FF.reason('ffmpeg'));
const SECONDS = Number(process.argv[2]) || 10, W = 1920, H = 1080, FPS = 30;
const OUT = __dirname, SAMPLES = path.join(OUT, 'samples');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-mf-'));
const run = (args) => {
  const r = cp.spawnSync(ffmpeg, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' ') + '\n' + (r.stderr || '').slice(-2000));
  return r.stderr || '';
};
const REGIONS = { whole: [W, H, 0, 0], skin: [640, 480, 160, 300], subtitle: [W, 200, 0, H - 200] };
const font = 'C\\:/Windows/Fonts/msyh.ttc';

function source() {
  const src = path.join(work, 'source.mkv');
  // drawtext reads the caption from a file, so it needs no filtergraph escaping; %{eif:…} still expands
  const textFile = path.join(work, 'caption.txt');
  fs.writeFileSync(textFile, '第 %{eif:floor(t/2)+1:d} 句：主播说的话会显示在这里，MontClip 字幕清晰度测试');
  const tf = textFile.replace(/\\/g, '/').replace(/:/g, '\\:');
  const skin = `color=c=0xD9A07E:s=640x480:r=${FPS}:d=${SECONDS},format=yuv444p,` +
    `geq=lum=lum(X\\,Y)+12*sin(Y/90+T):cb=cb(X\\,Y):cr=cr(X\\,Y),noise=alls=7:allf=t,gblur=sigma=0.6`;
  const graph = `testsrc2=s=${W}x${H}:r=${FPS}:d=${SECONDS},format=yuv444p[bg];${skin}[skin];` +
    `[bg][skin]overlay=160:300[a];` +
    `[a]drawbox=x=0:y=${H - 200}:w=${W}:h=200:color=black@0.6:t=fill,` +
    `drawtext=fontfile='${font}':textfile='${tf}':expansion=normal:` +
    `fontsize=64:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=${H - 150},format=yuv420p[out]`;
  run(['-y', '-filter_complex', graph, '-map', '[out]', '-c:v', 'ffv1', '-level', '3', src]);
  return src;
}

function encode(src, name, extra) {
  const out = path.join(work, name + '.mp4');
  const t0 = process.hrtime.bigint();
  const log = run(['-v', 'verbose', '-y', '-i', src, '-c:v', 'h264_mf', ...extra, '-rate_control', 'quality', '-g', String(FPS), '-pix_fmt', 'nv12', out]);
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  const mft = (log.match(/MFT name: '([^']+)'/) || [])[1] || '?';
  return { out, mft, fps: Math.round(SECONDS * FPS / secs), mbps: +(fs.statSync(out).size * 8 / SECONDS / 1e6).toFixed(2) };
}

// frames are paired by number: the FFV1 source has millisecond timestamps, the MP4 exact ones, and pairing
// by timestamp (the psnr filter's default) matched every third frame with its neighbour
function psnr(enc, src, [w, h, x, y]) {
  const err = run(['-i', enc, '-i', src, '-lavfi',
    `[0:v]settb=1/${FPS},setpts=N,format=yuv420p,crop=${w}:${h}:${x}:${y}[a];[1:v]settb=1/${FPS},setpts=N,format=yuv420p,crop=${w}:${h}:${x}:${y}[b];[a][b]psnr`, '-f', 'null', '-']);
  const m = err.match(/PSNR y:([\d.inf]+) u:([\d.inf]+) v:([\d.inf]+) average:([\d.inf]+)/);
  if (!m) throw new Error('no PSNR in ffmpeg output');
  return { y: +m[1], average: +m[4] };
}

const conditions = [
  { name: 'sw-q65', label: 'software MFT, quality 65 (old CRF 18)', extra: ['-quality', '65'] },
  { name: 'sw-q75', label: 'software MFT, quality 75 (new CRF 18)', extra: ['-quality', '75'] },
  { name: 'hw-q65', label: 'hardware MFT, quality 65', extra: ['-hw_encoding', '1', '-quality', '65'] },
  { name: 'hw-q75', label: 'hardware MFT, quality 75', extra: ['-hw_encoding', '1', '-quality', '75'] },
];
const version = run(['-version']).length ? cp.spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0] : '';
const src = source();
const rows = [];
for (const c of conditions) {
  let e;
  try { e = encode(src, c.name, c.extra); } catch (err) { rows.push({ ...c, error: String(err.message).split('\n').slice(-3).join(' ') }); continue; }
  const r = { ...c, mft: e.mft, fps: e.fps, mbps: e.mbps };
  for (const [k, reg] of Object.entries(REGIONS)) r[k] = psnr(e.out, src, reg);
  rows.push(r);
  if (c.name.startsWith('sw')) { // a 1 s sample of the real output (stream copy), and the subtitle band of one frame
    fs.mkdirSync(SAMPLES, { recursive: true });
    run(['-y', '-i', e.out, '-t', '1', '-c', 'copy', '-movflags', '+faststart', path.join(SAMPLES, c.name + '-1s.mp4')]);
    run(['-y', '-ss', '3.5', '-i', e.out, '-frames:v', '1', '-vf', `crop=960:200:480:${H - 200}`, path.join(SAMPLES, c.name + '-subtitle.png')]);
    run(['-y', '-ss', '3.5', '-i', e.out, '-frames:v', '1', '-vf', 'crop=320:240:320:420', path.join(SAMPLES, c.name + '-skin.png')]);
  }
}
fs.mkdirSync(SAMPLES, { recursive: true });
run(['-y', '-ss', '3.5', '-i', src, '-frames:v', '1', '-vf', `crop=960:200:480:${H - 200}`, path.join(SAMPLES, 'source-subtitle.png')]);
run(['-y', '-ss', '3.5', '-i', src, '-frames:v', '1', '-vf', 'crop=320:240:320:420', path.join(SAMPLES, 'source-skin.png')]);
const result = { date: new Date().toISOString(), ffmpeg: version, os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0].model,
  source: { seconds: SECONDS, width: W, height: H, fps: FPS }, regions: REGIONS, rows };
fs.writeFileSync(path.join(OUT, 'mf-quality.json'), JSON.stringify(result, null, 1) + '\n');
const f = (p) => (p ? p.average.toFixed(1) : '—');
const md = ['| condition | MFT | Mb/s | encode fps | PSNR whole | skin | subtitle | subtitle Y |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => r.error ? `| ${r.label} | failed: ${r.error} | | | | | | |`
    : `| ${r.label} | ${r.mft} | ${r.mbps} | ${r.fps} | ${f(r.whole)} | ${f(r.skin)} | ${f(r.subtitle)} | ${r.subtitle.y.toFixed(1)} |`)].join('\n');
fs.writeFileSync(path.join(OUT, 'mf-quality.md'), `${result.ffmpeg}; ${result.cpu}; ${SECONDS} s ${W}×${H} ${FPS} fps synthetic source.\n\n${md}\n`);
fs.rmSync(work, { recursive: true, force: true });
console.log(md);
