'use strict';
/* For the package smoke's no-FFmpeg round (Deja): a PATH with every folder holding ffmpeg or ffprobe taken out, as on a
   streamer's computer with no FFmpeg installed; and the libavcodec version ("Lavc63.1.102") from `ffmpeg -version`
   and from an exported file's encoder tag, to tell the packaged FFmpeg's output from one on PATH. */
const fs = require('node:fs'), path = require('node:path');

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };

function pathWithoutFfmpeg(value, { exists = isFile, platform = process.platform } = {}) {
  const sep = platform === 'win32' ? ';' : ':', join = platform === 'win32' ? path.win32.join : path.posix.join;
  const names = platform === 'win32' ? ['ffmpeg.exe', 'ffprobe.exe'] : ['ffmpeg', 'ffprobe'];
  const keep = [], removed = [];
  for (const dir of String(value || '').split(sep)) {
    if (!dir) continue;
    if (names.some((n) => exists(join(dir.replace(/^"|"$/g, ''), n)))) removed.push(dir); else keep.push(dir);
  }
  return { path: keep.join(sep), removed };
}

function lavcFromVersion(text) {
  const m = /libavcodec\s+(\d+)\.\s*(\d+)\.\s*(\d+)/.exec(String(text || ''));
  return m ? `Lavc${Number(m[1])}.${Number(m[2])}.${Number(m[3])}` : null;
}
function lavcFromTag(tag) {
  const m = /\bLavc(\d+\.\d+\.\d+)/.exec(String(tag || ''));
  return m ? 'Lavc' + m[1] : null;
}

/** Which FFmpeg the packaged app ran (Deja, 2026-11-03): only the processes whose parents lead to the app (root, its pid)
 *  count — an FFmpeg someone else runs on the computer at the same time is listed apart and does not fail the check —
 *  and each of the app's must be one of the packaged exes, by its full path (case and slashes aside), never its name.
 *  procs: [{pid, path, ancestors: [parent pid, its parent, …]}]. → {ok, why, ours, others} */
function ffmpegInTree({ root, packaged, procs }) {
  const norm = (p) => (typeof p === 'string' && p ? path.win32.normalize(p.replace(/\//g, '\\')).toLowerCase() : null);
  const allowed = new Set((packaged || []).map(norm));
  const mine = (procs || []).filter((p) => p.pid === root || (p.ancestors || []).includes(root));
  const ours = mine.map((p) => p.path || null), others = (procs || []).filter((p) => !mine.includes(p)).map((p) => p.path || null);
  if (!mine.length) return { ok: false, why: 'no FFmpeg of the app was seen', ours, others };
  const bad = mine.filter((p) => !allowed.has(norm(p.path)));
  if (bad.length) return { ok: false, why: 'the app ran an FFmpeg that is not the packaged one: ' + bad.map((p) => p.path || '(path unreadable)').join(', '), ours, others };
  return { ok: true, why: '', ours, others };
}

module.exports = { pathWithoutFfmpeg, lavcFromVersion, lavcFromTag, ffmpegInTree };
