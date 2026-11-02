'use strict';
/* The editor's own downloads (an export from /exports/, captions or a mapping from a blob). VV, package fccc225: the
   Save dialog's title was the download URL, and every export stayed behind as a hidden copy in workspace/exports.
   attach() gives the dialog a plain title in the interface language and the file name, and once this session's export
   is saved, removes its copy (see attach). */
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

/* The copy is removed only when all three hold (QQ / Deja, 0a2c13b): `expected` — the page's own export download asked
   for this file; `claim(name)` — the server says it is this session's new export (registered by /api/export/end, once);
   and the save completed somewhere other than the copy itself. A cancel or a failed save keeps it: it may be the only
   copy of a long render. onDone hears every outcome ({state, name, removed}). */
function attach(item, { origin, exportsDir, language, downloadsDir, onDone, expected = false, claim = async () => false } = {}) {
  const name = item.getFilename();
  item.setSaveDialogOptions(saveDialogOptions(name, language, downloadsDir));
  const copy = exportCopy(item.getURL(), { origin, exportsDir });
  item.once('done', async (_e, state) => {
    let removed = false;
    const saved = state === 'completed' ? item.getSavePath() : '';
    if (copy && expected && saved && path.resolve(saved).toLowerCase() !== path.resolve(copy).toLowerCase()) {
      let fresh = false; try { fresh = (await claim(name)) === true; } catch { fresh = false; }
      // the server may still be closing its read of the file: try again for a few seconds, then leave it
      if (fresh) removed = await new Promise((resolve) => { const remove = (tries) => { try { fs.rmSync(copy, { force: true }); resolve(true); } catch { if (tries > 0) setTimeout(() => remove(tries - 1), 500); else resolve(false); } }; remove(10); });
    }
    if (onDone) onDone({ state, name, removed });
  });
}

module.exports = { saveDialogOptions, exportCopy, attach };
