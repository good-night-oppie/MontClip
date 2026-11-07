'use strict';
// No H.264 encoder when export is clicked (Deja on #129, merging main's #125 precheck): the toast, the export queue's
// line and 自动出切片's end page all say JJ v2's export sentence h264Refuse — never Settings' h264None* sentence and
// never the last row errOther. The precheck and /api/export/begin refusals carry the code EXPORT_NO_H264 for that.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const V = require('../ui-preferences');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const fn = (head) => { const i = app.indexOf(head); a.ok(i >= 0, head); return app.slice(i, app.indexOf('\n}\n', i) + 3); };
const line = (head) => { const i = app.indexOf(head); a.ok(i >= 0, head); return app.slice(i, app.indexOf('\n', i) + 1); };
const LANGS = ['zh-CN', 'en'];

function world(language) {
  const said = { toasts: [], actions: [] };
  const el = () => ({ textContent: '', innerHTML: '', disabled: false, hidden: false, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} });
  const els = {};
  const context = {
    MontClipView: V, mcView: { get: () => ({ language }) }, console: { warn() {} },
    toast: (m) => said.toasts.push(m), toastAction: (m) => said.actions.push(m),
    $: (id) => (els[id] ||= el()), exportQueue: [], queueRunning: false, AUTO: {},
    Delivery: { CONTAINERS: { mp4: { ext: '.mp4' } }, describe: () => '1920×1080' }, deliveryFrame: () => ({ outW: 1920, outH: 1080 }),
    projectFps: () => 30, fmt: (t) => String(t), window: {},
  };
  vm.createContext(context);
  vm.runInContext([line('const uiText = '), fn('function escapeHtml('), line('const autoSay = '), fn('function sayError('), fn('function toastProblem('),
    fn('function renderQueue('), line('const autoDoneItems = '), fn('function autoDoneHtml('), line('const exportRefusalCode = ')].join('\n')
    + '\nthis.uiText = uiText; this.sayError = sayError; this.toastProblem = toastProblem; this.renderQueue = renderQueue; this.autoDoneHtml = autoDoneHtml; this.exportRefusalCode = exportRefusalCode;', context);
  return { context, said, els };
}

test('the toast: the precheck\'s refusal and /api/export/begin\'s say h264Refuse, with no 〔复制问题信息〕', () => {
  for (const l of LANGS) {
    const { context: c, said } = world(l), refuse = V.text[l].h264Refuse;
    // what fastExport throws when the precheck refuses (the message is h264Refusal's), then sayExportFailure
    c.toastProblem(c.sayError(Object.assign(new Error(refuse), { code: 'EXPORT_NO_H264' }), 'export'));
    // what /api/export/begin answers on its own (the server refuses too)
    for (const code of ['h264NoneWin', 'h264NoneOther'])
      c.toastProblem(c.sayError(Object.assign(new Error(V.h264Refusal(l, { code })), { code: c.exportRefusalCode(code), featurePack: true }), 'export'));
    a.deepEqual(said.toasts, [refuse, refuse, refuse], l);
    a.deepEqual(said.actions, [], l + ': a sentence of its own, not the last row');
    a.notEqual(refuse, V.text[l].errOther);
  }
});

test('the export queue\'s line and 自动出切片\'s end page say h264Refuse', () => {
  for (const l of LANGS) {
    const { context: c, els } = world(l), t = V.text[l], refuse = t.h264Refuse;
    // what runQueue's precheck marks every waiting H.264 output with
    const mark = (id, name) => ({ id, name, label: 'YouTube', spec: { container: 'mp4' }, range: 'entire', status: 'failed', error: refuse, code: 'EXPORT_NO_H264', noH264: true });
    c.exportQueue.push(mark('q1', 'a'), mark('q2', 'b'));
    c.renderQueue();
    const rows = els.exportQueueList.innerHTML;
    a.equal(rows.split((c.uiText('qFailed') + refuse).replace(/'/g, '&#39;')).length - 1, 2, l + ': ' + rows);
    a.ok(!rows.includes(t.errOther.slice(0, 12)), l);
    // the end page: none made it — the title gives the reason
    c.autoState = () => ({ exportIds: ['q1', 'q2'] });
    const none = c.autoDoneHtml();
    const why = (l === 'en' ? refuse.charAt(0).toLowerCase() + refuse.slice(1) : refuse).replace(/[。.]$/, '');
    a.ok(none.includes(V.exportResult(l, { done: 0, failed: 2, why: refuse }).replace(/'/g, '&#39;')), l + ': ' + none);
    a.ok(none.includes(why.replace(/'/g, '&#39;')), l);
    a.ok(!none.includes(t.errOther.slice(0, 12)), l + ': not the last row');
    // one made it: each failed one with its reason
    c.exportQueue.push({ id: 'q3', name: 'c', status: 'done' });
    c.autoState = () => ({ exportIds: ['q1', 'q2', 'q3'] });
    const some = c.autoDoneHtml();
    a.equal(some.split(refuse.replace(/'/g, '&#39;')).length - 1, 2, l + ': ' + some);
    a.ok(!some.includes(t.errOther.slice(0, 12)), l);
  }
});

test('the precheck and the begin refusals carry EXPORT_NO_H264; other refusals keep their code', () => {
  const { context: c } = world('zh-CN');
  a.equal(c.exportRefusalCode('h264NoneWin'), 'EXPORT_NO_H264');
  a.equal(c.exportRefusalCode('h264NoneOther'), 'EXPORT_NO_H264');
  a.equal(c.exportRefusalCode('frameTooSmall'), 'frameTooSmall');
  a.match(fn('async function fastExport('), /if \(refused\) throw Object\.assign\(new Error\(refused\), \{ code: "EXPORT_NO_H264" \}\)/);
  a.match(fn('async function runQueue('), /status: "failed", error: refused, code: "EXPORT_NO_H264", noH264: true/);
  a.equal(app.split('{ code: exportRefusalCode(begin.code), params: begin.params, featurePack: begin.featurePack }').length - 1, 2, 'both /api/export/begin refusals');
  a.equal(app.split('MontClipView.h264Refusal(mcView.get().language, begin)').length - 1, 2);
  a.ok(V.ERROR_CODES.includes('EXPORT_NO_H264'));
});
