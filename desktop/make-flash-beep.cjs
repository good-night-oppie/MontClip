'use strict';
// QQ (#36): a synthetic source for the A/V sync check, made the way #46 makes desktop/make-fixture-av.cjs: fixed
// arguments, MontClip's own ffmpeg (or one named explicitly; never the system PATH by accident), bitexact, never
// overwriting, and a record of the hash next to the file. Black 320×180 at 30 fps for 10 s; every 15 frames from
// frame 6 (0.2 s, 0.7 s, …) one frame is white and a 20 ms 1 kHz beep starts at the same instant.
//   node desktop/make-flash-beep.cjs <out.mp4> [--ffmpeg <path>]
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const { resolveFfmpeg, displayPath } = require('./make-fixture-av.cjs');

const SPEC = { seconds: 10, width: 320, height: 180, fps: 30, first: 6, every: 15, beepMs: 20, beepHz: 1000, video: 'vp9', audio: 'aac' };
const eventTimes = () => {
  const out = [];
  for (let n = SPEC.first; n < SPEC.seconds * SPEC.fps; n += SPEC.every) out.push(Math.round(n / SPEC.fps * 1e6) / 1e6);
  return out;
};

function flashBeepArgs(out) {
  const { width, height, fps, seconds, first, every, beepMs, beepHz } = SPEC;
  const t0 = first / fps, period = every / fps, len = beepMs / 1000;
  const video = `color=c=black:size=${width}x${height}:rate=${fps}:duration=${seconds},format=yuv420p,` +
    `drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n\\,${first})*eq(mod(n-${first}\\,${every})\\,0)'`;
  const audio = `aevalsrc=exprs='gte(t\\,${t0})*lt(mod(t-${t0}\\,${period})\\,${len})*0.8*sin(2*PI*${beepHz}*t)':s=48000:d=${seconds}`;
  return ['-hide_banner', '-nostdin', '-loglevel', 'error', '-n',
    '-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', audio,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-deadline', 'good', '-cpu-used', '4',
    '-row-mt', '0', '-threads', '1', '-tile-columns', '0', '-g', String(fps), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '1', '-ar', '48000',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1',
    '-movflags', '+faststart', out];
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function makeFlashBeep(out, opts = {}) {
  if (fs.existsSync(out) || fs.existsSync(out + '.json')) throw Error('FIXTURE_EXISTS: ' + displayPath(out) + ' or its record already exists; nothing is overwritten');
  const ffmpeg = opts.ffmpeg || resolveFfmpeg();
  const r = cp.spawnSync(ffmpeg, flashBeepArgs(out), { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('FFMPEG_FAILED: ' + String(r.stderr || r.error || '').trim().slice(0, 400));
  const version = (cp.spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true }).stdout || '').split(/\r?\n/)[0];
  const record = { spec: SPEC, events: eventTimes(), sha256: sha256(out), bytes: fs.statSync(out).size, ffmpeg: version };
  fs.writeFileSync(out + '.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  return record;
}

if (require.main === module) {
  const out = process.argv[2];
  if (!out || out.startsWith('--')) { console.error('usage: node desktop/make-flash-beep.cjs <out.mp4> [--ffmpeg <path>]'); process.exit(2); }
  const r = makeFlashBeep(path.resolve(out));
  process.stdout.write(`MONTCLIP_FLASH_BEEP ${JSON.stringify({ file: displayPath(out), sha256: r.sha256, bytes: r.bytes, ffmpeg: r.ffmpeg })}\n`);
}
module.exports = { SPEC, eventTimes, flashBeepArgs, makeFlashBeep };
