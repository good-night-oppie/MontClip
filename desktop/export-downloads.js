'use strict';
/* The editor's own downloads (an export from /exports/, captions or a mapping from a blob). VV, package fccc225: the
   Save dialog's title was the download URL, and every export stayed behind as a hidden copy in workspace/exports.
   attach() gives the dialog a plain title in the interface language and the file name, and once the download is done —
   saved or cancelled — removes the one export file it came from. An interrupted save keeps it, so nothing is lost. */
const fs = require('node:fs'), path = require('node:path');

const TITLES = {
  'zh-CN': { video: '保存导出的视频', captions: '保存字幕', file: '保存导出的文件' },
  en: { video: 'Save the exported video', captions: 'Save captions', file: 'Save the exported file' },
};
const VIDEO = new Set(['.mp4', '.mov', '.mkv', '.webm', '.mxf', '.m4v']), CAPTIONS = new Set(['.srt', '.vtt']);

function saveDialogOptions(filename, language, downloadsDir) {
  const t = TITLES[language] || TITLES['zh-CN'], ext = path.extname(filename).toLowerCase();
  const title = VIDEO.has(ext) ? t.video : CAPTIONS.has(ext) ? t.captions : t.file;
  return { title, defaultPath: downloadsDir ? path.join(downloadsDir, filename) : filename };
}

// The workspace file behind an /exports/<name> download of this origin; null for anything else.
function exportCopy(url, { origin, exportsDir }) {
  let u; try { u = new URL(url); } catch { return null; }
  if (u.origin !== origin || !u.pathname.startsWith('/exports/')) return null;
  const raw = u.pathname.slice('/exports/'.length);
  if (!raw || raw.includes('/')) return null;
  let name; try { name = decodeURIComponent(raw); } catch { return null; }
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name) || path.basename(name) !== name) return null;
  return path.join(exportsDir, name);
}

function attach(item, { origin, exportsDir, language, downloadsDir, onRemoved } = {}) {
  item.setSaveDialogOptions(saveDialogOptions(item.getFilename(), language, downloadsDir));
  const copy = exportCopy(item.getURL(), { origin, exportsDir });
  if (!copy) return;
  item.once('done', (_e, state) => {
    if (state !== 'completed' && state !== 'cancelled') return;
    const saved = state === 'completed' ? item.getSavePath() : '';
    if (saved && path.resolve(saved).toLowerCase() === path.resolve(copy).toLowerCase()) return;
    // the server may still be closing its read of the file: try again for a few seconds, then leave it
    const remove = (tries) => { try { fs.rmSync(copy, { force: true }); if (onRemoved) onRemoved(copy); } catch { if (tries > 0) setTimeout(() => remove(tries - 1), 500); } };
    remove(10);
  });
}

module.exports = { saveDialogOptions, exportCopy, attach };
