'use strict';
// Development only: make the synthetic A/V input the desktop smokes import (4 s, 320x180, 30 fps,
// mono AAC). Usage: node desktop/make-fixture-av.cjs <out.mp4> [--ffmpeg <path>]
// The arguments are fixed, so one ffmpeg build makes the same bytes every time. The bundled LGPL
// ffmpeg has no software H.264 encoder, so the video is VP9 (in MP4, which Electron plays).
// Next to the file it writes <out>.json: the SHA-256, the ffmpeg version and the arguments.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const SPEC = { seconds: 4, width: 320, height: 180, fps: 30, video: 'vp9', audio: 'aac', channels: 1 };

function fixtureArgs(out) {
  return ['-hide_banner', '-nostdin', '-loglevel', 'error', '-n',
    '-f', 'lavfi', '-i', `testsrc2=size=${SPEC.width}x${SPEC.height}:rate=${SPEC.fps}:duration=${SPEC.seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${SPEC.seconds}`,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-deadline', 'good', '-cpu-used', '4',
    '-row-mt', '0', '-threads', '1', '-tile-columns', '0', '-g', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-ar', '48000',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1',
    '-movflags', '+faststart', out];
}

/** --ffmpeg <path>, else MONTCLIP_FFMPEG, else the vendored build (desktop/fetch-ffmpeg.cjs);
 *  never whatever ffmpeg happens to be on PATH. */
function resolveFfmpeg({ argv = process.argv, env = process.env, exists = fs.existsSync } = {}) {
  const i = argv.indexOf('--ffmpeg');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  if (env.MONTCLIP_FFMPEG) return env.MONTCLIP_FFMPEG;
  const vendor = path.join(ROOT, 'vendor', 'ffmpeg', process.platform + '-' + process.arch, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (exists(vendor)) return vendor;
  throw Error('FFMPEG_NOT_FOUND: run node desktop/fetch-ffmpeg.cjs, or pass --ffmpeg <path> / set MONTCLIP_FFMPEG');
}

/** A path for output and errors: <repo>/… or <user>/…, else only the file name; never the absolute path. */
function displayPath(p) {
  const abs = path.resolve(p), same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  for (const [base, tag] of [[ROOT, '<repo>'], [os.homedir(), '<user>']]) {
    const rel = path.relative(base, abs);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && same(path.join(base, rel), abs)) return path.join(tag, rel);
  }
  return path.join('<path>', path.basename(abs));
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Never overwrites: refuses before running ffmpeg when the clip or its record exists (ffmpeg -n and the
 *  record's wx are the second line). */
function makeFixture(out, opts = {}) {
  if (fs.existsSync(out) || fs.existsSync(out + '.json')) throw Error('FIXTURE_EXISTS: ' + displayPath(out) + ' or its record already exists; nothing is overwritten');
  const ffmpeg = opts.ffmpeg || resolveFfmpeg();
  const args = fixtureArgs(out);
  const run = cp.spawnSync(ffmpeg, args, { encoding: 'utf8', windowsHide: true });
  if (run.status !== 0) throw Error('FIXTURE_FAILED: ' + (run.stderr || run.error || '').toString().trim().slice(0, 500));
  const version = cp.spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true }).stdout.split(/\r?\n/)[0];
  const record = { sha256: sha256(out), bytes: fs.statSync(out).size, ffmpeg: version, spec: SPEC, args: args.slice(0, -1) };
  fs.writeFileSync(out + '.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  return record;
}

/** The file must match the hash recorded when it was made. */
function verifyFixture(file) {
  let record;
  try { record = JSON.parse(fs.readFileSync(file + '.json', 'utf8')); } catch { throw Error('FIXTURE_RECORD_MISSING: ' + displayPath(file) + '.json (make it with desktop/make-fixture-av.cjs)'); }
  if (!/^[0-9a-f]{64}$/.test(record.sha256 || '') || sha256(file) !== record.sha256) throw Error('FIXTURE_HASH: ' + displayPath(file) + ' does not match its record');
  return record;
}

/** Runners: make the input when it does not exist yet, then check it against its record. */
function ensureFixture(file, opts) {
  if (!fs.existsSync(file)) makeFixture(file, opts);
  return verifyFixture(file);
}

module.exports = { SPEC, fixtureArgs, resolveFfmpeg, makeFixture, verifyFixture, ensureFixture, displayPath };

if (require.main === module) {
  const out = process.argv[2];
  if (!out || out.startsWith('--')) { console.error('Usage: node desktop/make-fixture-av.cjs <out.mp4> [--ffmpeg <path>]'); process.exit(2); }
  const record = makeFixture(path.resolve(out));
  process.stdout.write(`MONTCLIP_FIXTURE ${JSON.stringify({ file: displayPath(out), sha256: record.sha256, bytes: record.bytes, ffmpeg: record.ffmpeg })}\n`);
}
