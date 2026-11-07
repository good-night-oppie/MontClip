'use strict';
// AI background removal at export (#154) in #129's plain words (Deja, 2026-11-07): the refusal carries a code, the
// plain-words table says JJ's #154 sentence for it, as it is, and no export path pops an alert for it. Fast and WebCodecs
// say "this clip's AI background removal isn't ready"; realtime recording says it can't do AI background removal.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const V = require('../ui-preferences.js');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const slice = (from, to) => { const i = app.indexOf(from), j = app.indexOf(to, i); a.ok(i >= 0 && j > i, from); return app.slice(i, j); };
const errorFn = slice('function bgRemoveExportError(', '/* A fresh/headless page');

test('the codes say JJ\'s #154 sentences, word for word, as known rows', () => {
  for (const language of ['zh-CN', 'en']) {
    const r = V.errorText(language, { code: 'BG_REMOVE_UNAVAILABLE', message: 'BG_REMOVE_UNAVAILABLE: … (c1)' });
    a.deepEqual([r.code, r.text, r.known], ['BG_REMOVE_UNAVAILABLE', V.t(language, 'own.bgremove-export-unavailable'), true]);
    const q = V.errorText(language, { code: 'BG_REMOVE_REALTIME', message: 'BG_REMOVE_UNAVAILABLE: … (c1)' });
    a.deepEqual([q.code, q.text, q.known], ['BG_REMOVE_REALTIME', V.t(language, 'own.bgremove-export-realtime'), true]);
  }
  a.ok(V.ERROR_CODES.includes('BG_REMOVE_UNAVAILABLE') && V.ERROR_CODES.includes('BG_REMOVE_REALTIME'));
});

for (const language of ['zh-CN', 'en']) for (const engine of ['Fast', 'WebCodecs']) test(engine + ' export, ' + language + ': a clip whose AI background removal isn\'t ready is said in JJ\'s sentence, no alert', async () => {
  const said = [], alerts = [], noop = () => {};
  const box = { AbortController, state: { webCodecs: true }, runtime: {}, renderCancelled: false, exportAbort: null, exportFullCanvas: false,
    els: { exportOverlay: { classList: { add: noop, remove: noop } }, exportProgress: { style: {} }, exportNote: {}, exportTitle: {} },
    pause: noop, restoreExportVideoState: noop, projectFps: () => 30, beginExportWindow: () => ({ start: 0, end: 1, frames: 30 }),
    detectWebCodecs: async () => {}, startExport: noop, effectiveEncodeProfileId: () => 'prores422',
    mediaClips: () => [{ id: 'c1', kind: 'video', start: 0, duration: 1 }], clipRenders: () => true, clipEnd: (c) => c.start + c.duration,
    evalProps: () => ({ bgRemove: true }), bgSeg: { seg: null }, exportRange: () => ({ start: 0, end: 1 }),
    uiText: (k) => V.t(language, k), mcView: { get: () => ({ language }) }, MontClipView: V,
    renderAudioMix: async () => { throw new Error('the audio mix must not start'); },
    fetch: async () => { throw new Error('nothing is asked of the server'); },
    sayExportFailure: (e) => said.push(V.errorText(language, e)), alert: (s) => alerts.push(s),
    reportExportJob: async () => {}, exportDecodeEnd: noop, endExportWindow: noop, releaseOriginalPlayers: noop };
  vm.createContext(box);
  vm.runInContext(errorFn + slice('function noteExportBgRemove(', '/* Serialize sends') +
    (engine === 'Fast' ? slice('async function fastExport(opts = {})', '/* ── Export queue') : slice('async function webCodecsExport(', 'function pickMime(')), box);
  await (engine === 'Fast' ? box.fastExport({}) : box.webCodecsExport());
  a.deepEqual(alerts, []);
  a.equal(said.length, 1);
  a.deepEqual([said[0].code, said[0].text, said[0].known], ['BG_REMOVE_UNAVAILABLE', V.t(language, 'own.bgremove-export-unavailable'), true]);
});

test('realtime recording: said in plain words with the realtime sentence, not an alert', () => {
  const start = slice('async function startExport(', '\n}');
  a.match(start, /try \{ noteExportBgRemove\(exportRange\(\), true\); \}\s*catch \(e\) \{ sayExportFailure\(e\); return; \}/);
  a.ok(!/alert\(uiText\("own\.export-failed-prefix"\)/.test(app));
  const box = { uiText: (k) => k };
  vm.createContext(box); vm.runInContext(errorFn, box);
  a.equal(box.bgRemoveExportError('c1', true).code, 'BG_REMOVE_REALTIME');
  a.equal(box.bgRemoveExportError('c1').code, 'BG_REMOVE_UNAVAILABLE');
  a.match(box.bgRemoveExportError('c1').message, /^BG_REMOVE_UNAVAILABLE: /, 'the message stays for the log');
});
