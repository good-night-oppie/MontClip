'use strict';
/* A/V sync of the FLV transcode path (QQ, #28 5c986adf): the encoder changed from libx264 to the graphics card or
   Windows' h264_mf, and an import / export encoder change needs the flash + beep check (≤ 40 ms).

     node desktop/flv-transcode-av-sync.cjs [--seconds 90] [--json <out.json>]

   With MontClip's own ffmpeg (ffmpeg-path.js: vendor/ or MONTCLIP_FFMPEG_DIR; never PATH):
   1. A synthetic FLV that needs transcoding: Sorenson Spark (flv1) 320×180 at 30 fps + AAC 48 kHz mono, black, and
      every 15 frames from frame 6 (0.2 s, 0.7 s, …) one white frame with a 20 ms 1 kHz beep starting at the same
      instant. Written into a folder whose name has Chinese characters and a space.
   2. prepareMedia(file, {allowTranscode:true, acceptReadable:true}) twice: in its own order (the first encoder that
      works here) and with h264_mf only (the encoder every Windows machine has).
   3. Every flash in the source and in each MP4 is paired with its beep (desktop/av-sync-measure.cjs); the limit is
      40 ms, and every flash must still be where it was in the source (within one frame).
   Prints MONTCLIP_FLV_AV_SYNC {…}; exit code 0 only if every check passes. The temporary folder is deleted. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const FF = require('../ffmpeg-path');
const { prepareMedia, usableH264 } = require('../prepare-media');
const { measure } = require('./av-sync-measure.cjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const seconds = Number(arg('--seconds', 90)), LIMIT = 0.04;
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function main() {
  const ffmpeg = FF.path('ffmpeg');
  if (!FF.available('ffmpeg') || !FF.available('ffprobe')) throw Error("MontClip's ffmpeg is not installed (node desktop/fetch-ffmpeg.cjs)");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-flv-sync-')), dir = path.join(tmp, '录播 转码');
  fs.mkdirSync(dir);
  const out = { seconds, limitMs: LIMIT * 1000, ffmpeg: { sha256: sha(ffmpeg), version: (spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true }).stdout || '').split('\n')[0] }, runs: [] };
  try {
    const src = path.join(dir, '闪光 提示音.flv');
    const video = `color=c=black:size=320x180:rate=30:duration=${seconds},format=yuv420p,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n\\,6)*eq(mod(n-6\\,15)\\,0)'`;
    const audio = `aevalsrc=exprs='gte(t\\,0.2)*lt(mod(t-0.2\\,0.5)\\,0.02)*0.8*sin(2*PI*1000*t)':s=48000:d=${seconds}`;
    const mk = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', audio,
      '-map', '0:v', '-map', '1:a', '-c:v', 'flv', '-q:v', '3', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-ac', '1', '-ar', '48000', src], { windowsHide: true });
    if (mk.status !== 0) throw Error('fixture: ' + String(mk.stderr).slice(0, 300));
    const probe = JSON.parse(spawnSync(FF.path('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt', '-of', 'json', src], { encoding: 'utf8', windowsHide: true }).stdout);
    out.source = { codecs: probe.streams.map((s) => [s.codec_type, s.codec_name, s.pix_fmt].filter(Boolean).join(' ')), bytes: fs.statSync(src).size, sha256: sha(src) };
    const s = measure(src, { ffmpeg, limit: LIMIT });
    out.source.sync = { ok: s.ok, pairs: s.pairs.length, worstMs: +(s.worst * 1000).toFixed(2), unpaired: s.unpaired };
    out.usableH264 = await usableH264();
    for (const [label, opts] of [['default order', {}], ['h264_mf only', { chooseEncoder: async () => ['h264_mf'] }]]) {
      const t0 = Date.now();
      const r = await prepareMedia(src, { allowTranscode: true, acceptReadable: true, ...opts });
      const mp4 = path.join(dir, decodeURIComponent(r.src.slice('/media/'.length)));
      const m = measure(mp4, { ffmpeg, limit: LIMIT });
      const shift = m.flashes.length === s.flashes.length ? Math.max(...m.flashes.map((f, i) => Math.abs(f - s.flashes[i]))) : null;
      const info = JSON.parse(spawnSync(FF.path('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt:format=duration', '-of', 'json', mp4], { encoding: 'utf8', windowsHide: true }).stdout);
      out.runs.push({ label, encoder: label === 'h264_mf only' ? 'h264_mf' : out.usableH264[0] + ' (first that works; prepareMedia falls back down the list on failure)',
        preparation: r.preparation, seconds: +((Date.now() - t0) / 1000).toFixed(1), codecs: info.streams.map((x) => [x.codec_type, x.codec_name, x.pix_fmt].filter(Boolean).join(' ')),
        duration: Number(info.format.duration), frames: m.frames, ok: m.ok, pairs: m.pairs.length, worstMs: +(m.worst * 1000).toFixed(2),
        meanMs: +(m.pairs.reduce((a, p) => a + Math.abs(p.offset), 0) / Math.max(1, m.pairs.length) * 1000).toFixed(2),
        flashShiftMs: shift == null ? null : +(shift * 1000).toFixed(2), unpaired: m.unpaired, offsetsMs: m.pairs.map((p) => +(p.offset * 1000).toFixed(2)) });
    }
    out.ok = out.source.sync.ok && out.runs.every((r) => r.ok && r.preparation === 'transcode' && r.flashShiftMs != null && r.flashShiftMs <= 1000 / 30 + 0.01);
    const json = arg('--json');
    if (json) fs.writeFileSync(json, JSON.stringify(out, null, 1) + '\n');
    process.stdout.write('MONTCLIP_FLV_AV_SYNC ' + JSON.stringify({ ok: out.ok, source: out.source.sync, runs: out.runs.map(({ offsetsMs, ...r }) => r) }) + '\n');
    process.exitCode = out.ok ? 0 : 1;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
