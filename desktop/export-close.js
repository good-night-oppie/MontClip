'use strict';
// Closing MontClip during an export asks first (Deja, 2026-11-03; VV's spec §5, §7 items 10–11; JJ's 「追加 3」).
// × and Alt+F4 are the same window close, so both ask; when nothing is exporting the window closes without asking.
// The text comes from the shared table (ui-preferences.js, the page's uiText keys), in the language the user chose.
const View = require('../ui-preferences');

const STOP = 0, KEEP = 1;
const UNSAVED = { DELETE: 0, KEEP: 1, SAVE: 2 }, FAILED = { RETRY: 0, GIVE_UP: 1 };

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

/** Not exporting, n videos exported and not saved: 先去保存 is the default, and Enter and Esc both mean it. One video has
 *  its own wording (JJ's 预备稿 4 补充: 这个视频…它…, 删掉它并关闭); the buttons keep the same order (VV's image 16). */
function unsavedDialogOptions(language, unsaved) {
  const t = (key, vars) => View.t(language, 'own.' + key, vars);
  const n = Math.max(1, Math.floor(Number(unsaved) || 0)), f = n === 1 ? '1' : 'n';
  return { type: 'warning', title: 'MontClip', message: t('export-unsaved-title-' + f, { n }), detail: t('export-unsaved-body-' + f),
    buttons: [t('export-unsaved-delete-' + f), t('export-unsaved-keep'), t('export-unsaved-save')],
    defaultId: UNSAVED.SAVE, cancelId: UNSAVED.SAVE, noLink: true };
}

/** Copies that could not be deleted (their names, one per line, then what to do first — JJ): the window stays; Enter and
 *  Esc try again (not close). */
function deleteFailedOptions(language, names) {
  const t = (key, vars) => View.t(language, 'own.' + key, vars);
  const list = (Array.isArray(names) ? names : []).map(String), k = Math.max(1, list.length);
  return { type: 'warning', title: 'MontClip', message: t('export-delete-failed-' + (k === 1 ? '1' : 'n'), { k }), detail: [...list, t('export-delete-hint-' + (k === 1 ? '1' : 'n'))].join('\n'),
    buttons: [t('export-delete-retry'), t('export-delete-giveup')], defaultId: FAILED.RETRY, cancelId: FAILED.RETRY, noLink: true };
}

/** What a window close does: true closes, false keeps the window. Exporting: the export prompt (stopping never deletes
 *  finished copies). Not exporting with unsaved copies: the unsaved prompt — 先去保存 opens the queue and keeps the window;
 *  删掉它们并关闭 deletes them (deleteFiles: this session's copies only) and, while some cannot be deleted, asks again
 *  with only those. ask(options) answers a message box with the button's index. */
async function decideClose({ language, state, ask, deleteFiles, openQueue }) {
  if (state.exporting) return (await ask(dialogOptions(language, state.unsaved))) === STOP;
  const files = Array.isArray(state.files) ? state.files : [];
  if (!state.unsaved || !files.length) return true;
  const answer = await ask(unsavedDialogOptions(language, files.length));
  if (answer === UNSAVED.KEEP) return true;
  if (answer !== UNSAVED.DELETE) { await openQueue(); return false; }
  let left = files;
  for (;;) {
    const r = await deleteFiles(left);
    left = (r && Array.isArray(r.failed)) ? r.failed : [];
    if (!left.length) return true;
    if ((await ask(deleteFailedOptions(language, left))) === FAILED.GIVE_UP) return true;
  }
}

const within = (promise, ms) => Promise.race([Promise.resolve().then(promise).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);

/** Is an export running? The server's sessions (begun, not ended), or the page's own flag: it mixes the audio before
 *  it opens a session. Neither answering in time never blocks closing. */
async function exportState({ server, renderer, timeoutMs = 1000 }) {
  const [active, page] = await Promise.all([within(server, timeoutMs), within(renderer, timeoutMs)]);
  const files = page && Array.isArray(page.files) ? page.files.filter((f) => typeof f === 'string') : [];
  return { exporting: Number(active) > 0 || !!(page && page.exporting), unsaved: Math.max(0, Number(page && page.unsaved) || 0), ...(files.length ? { files } : {}) };
}

module.exports = { STOP, KEEP, UNSAVED, FAILED, unsavedCount, dialogOptions, unsavedDialogOptions, deleteFailedOptions, decideClose, exportState };
