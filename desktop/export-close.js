'use strict';
// Closing MontClip during an export asks first (Deja, 2026-11-03; VV's spec §5, §7 items 10–11; JJ's 「追加 3」).
// × and Alt+F4 are the same window close, so both ask; when nothing is exporting the window closes without asking.
// The text comes from the shared table (ui-preferences.js, the page's uiText keys), in the language the user chose.
const View = require('../ui-preferences');

const STOP = 0, KEEP = 1;

/** Queue entries exported but not saved yet: the queue lives only in the page, their copies stay in exports/. */
function unsavedCount(queue) {
  return (Array.isArray(queue) ? queue : []).filter((q) => q && q.status === 'done' && !q.saved).length;
}

/** The native message box: 「继续导出」 is the default, and Enter and Esc both mean it. */
function dialogOptions(language, unsaved) {
  const t = (key, vars) => View.t(language, 'own.' + key, vars);
  const n = Math.max(0, Math.floor(Number(unsaved) || 0));
  const detail = [t('export-close-body')];
  if (n) detail.push(t(n === 1 ? 'export-close-unsaved-1' : 'export-close-unsaved-n', { n }));
  return { type: 'warning', title: 'MontClip', message: t('export-close-title'), detail: detail.join('\n'),
    buttons: [t('export-close-stop'), t('export-close-keep')], defaultId: KEEP, cancelId: KEEP, noLink: true };
}

const within = (promise, ms) => Promise.race([Promise.resolve().then(promise).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);

/** Is an export running? The server's sessions (begun, not ended), or the page's own flag: it mixes the audio before
 *  it opens a session. Neither answering in time never blocks closing. */
async function exportState({ server, renderer, timeoutMs = 1000 }) {
  const [active, page] = await Promise.all([within(server, timeoutMs), within(renderer, timeoutMs)]);
  return { exporting: Number(active) > 0 || !!(page && page.exporting), unsaved: Math.max(0, Number(page && page.unsaved) || 0) };
}

module.exports = { STOP, KEEP, unsavedCount, dialogOptions, exportState };
