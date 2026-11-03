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

module.exports = { pathWithoutFfmpeg, lavcFromVersion, lavcFromTag };
