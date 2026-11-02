'use strict';
// QQ (#36): measure A/V sync in an exported file — every white flash frame against the beep that goes with it.
// Decodes with MontClip's own ffmpeg (or one named explicitly; never the system PATH by accident).
//   node desktop/av-sync-measure.cjs <exported.mp4> [--ffmpeg <path>] [--expect 0.2,0.7,…] [--limit 0.04]
const cp = require('node:child_process'), fs = require('node:fs'), path = require('node:path');

/** A flash is a run of frames brighter than `threshold` (0–255); its time is the run's first frame. */
function flashTimes(luma, fps, threshold = 128) {
  const out = [];
  for (let i = 0; i < luma.length; i++) if (luma[i] > threshold && !(i > 0 && luma[i - 1] > threshold)) out.push(i / fps);
  return out;
}
/** A beep onset is the first sample above `level` after at least `quiet` seconds below it. */
function beepOnsets(samples, rate, level = 0.3, quiet = 0.1) {
  const out = [], gap = Math.round(quiet * rate);
  let last = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) <= level) continue;
    if (i - last > gap) out.push(i / rate);
    last = i;
  }
  return out;
}
/** Each flash with its nearest beep (each beep used once). Fails on any offset over `limit`, or on a flash or a beep
 *  left without a partner within half a second. */
function pair(flashes, beeps, limit = 0.04) {
  const left = [...beeps], pairs = [], unpaired = { flashes: [], beeps: [] };
  for (const f of flashes) {
    let best = -1;
    for (let j = 0; j < left.length; j++) if (best < 0 || Math.abs(left[j] - f) < Math.abs(left[best] - f)) best = j;
    if (best < 0 || Math.abs(left[best] - f) > 0.5) { unpaired.flashes.push(f); continue; }
    const b = left.splice(best, 1)[0];
    pairs.push({ flash: f, beep: b, offset: b - f });
  }
  unpaired.beeps = left;
  const worst = pairs.reduce((m, p) => Math.max(m, Math.abs(p.offset)), 0);
  return { pairs, unpaired, worst, ok: pairs.length > 0 && !unpaired.flashes.length && !unpaired.beeps.length && worst <= limit };
}

function decode(ffmpeg, file) {
  const run = (args) => {
    const r = cp.spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', file, ...args, '-'], { maxBuffer: 1 << 28, windowsHide: true });
    if (r.status !== 0) throw Error('FFMPEG_FAILED: ' + String(r.stderr || r.error || '').trim().slice(0, 400));
    return r.stdout;
  };
  // the mean of a 16×9 grey copy of each frame; frames as stored (passthrough: no frames added or dropped)
  const raw = run(['-map', '0:v:0', '-vf', 'scale=16:9,format=gray', '-fps_mode', 'passthrough', '-f', 'rawvideo']);
  const luma = [];
  for (let i = 0; i + 144 <= raw.length; i += 144) { let s = 0; for (let k = 0; k < 144; k++) s += raw[i + k]; luma.push(s / 144); }
  const pcm = run(['-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  const probe = cp.spawnSync(ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m, e) => 'ffprobe' + (e || '')),
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,start_time:format=duration', '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
  const info = JSON.parse(probe.stdout || '{}'), [num, den] = String(info.streams?.[0]?.r_frame_rate || '30/1').split('/').map(Number);
  return { luma, samples, rate: 48000, fps: num / (den || 1), duration: Number(info.format?.duration) || null, videoStart: Number(info.streams?.[0]?.start_time) || 0 };
}

function measure(file, { ffmpeg, limit = 0.04, expect = null } = {}) {
  const d = decode(ffmpeg, file);
  const flashes = flashTimes(d.luma, d.fps).map((t) => t + d.videoStart), beeps = beepOnsets(d.samples, d.rate);
  const result = { fps: d.fps, duration: d.duration, frames: d.luma.length, flashes, beeps, limit, ...pair(flashes, beeps, limit) };
  if (expect) {
    // where the events should be in the output, from the kept ranges; a flash more than one frame off is a timing error
    result.expected = expect;
    result.placement = expect.map((t) => { const f = flashes.reduce((b, x) => (b == null || Math.abs(x - t) < Math.abs(b - t) ? x : b), null); return { expected: t, flash: f, error: f == null ? null : f - t }; });
    result.placementOk = result.placement.every((p) => p.error != null && Math.abs(p.error) <= 1 / d.fps + 1e-6) && flashes.length === expect.length;
    result.ok = result.ok && result.placementOk;
  }
  return result;
}

if (require.main === module) {
  const { resolveFfmpeg, displayPath } = require('./make-fixture-av.cjs');
  const file = process.argv[2], arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  if (!file || file.startsWith('--')) { console.error('usage: node desktop/av-sync-measure.cjs <file> [--ffmpeg <path>] [--expect t,t,…] [--limit s]'); process.exit(2); }
  const r = measure(path.resolve(file), { ffmpeg: resolveFfmpeg(), limit: Number(arg('--limit') || 0.04), expect: arg('--expect') ? arg('--expect').split(',').map(Number) : null });
  process.stdout.write('MONTCLIP_AV_SYNC ' + JSON.stringify({ file: displayPath(file), ...r }) + '\n');
  process.exitCode = r.ok ? 0 : 1;
}
module.exports = { flashTimes, beepOnsets, pair, decode, measure };
