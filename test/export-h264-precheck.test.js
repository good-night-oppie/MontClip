'use strict';
// No H.264 encoder on this computer (europa, 2026-11-04: Linux, the bundled LGPL FFmpeg, no graphics card): 3 slices
// failed only after ~147 s, because the page mixed each one's audio before /api/export/begin said no, and the queue did
// that once per slice. ADR 2026-11-02 point 3 / Deja C: clicking export refuses at once, in plain words, before any
// audio mix or frame is rendered. Exports that don't use H.264 still go out.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences'), X = require('../external-ffmpeg');
const ROOT = path.join(__dirname, '..'), app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const body = (src, head) => { const i = src.indexOf(head); a.ok(i >= 0, head); return src.slice(i, src.indexOf('\n}', i)); };

// JJ, europa-aws ~/montclip-labels/jj/2026-11-04-错误白话表-默认条数-发到手机-JJ.md v2 (sha256 d99c25d1…),
// row 「FLV_ENCODER_MISSING，以及导出时没有可用的编码器」, the export variant. One sentence on every platform.
const JJ_ZH = '这台电脑上找不到 MontClip 能用的视频编码器，所以这次没能导出。可以先更新显卡驱动再试。';
const JJ_EN = "This computer has no video encoder MontClip can use, so it couldn't export this time. Update the graphics driver and try again.";

test('the refusal is JJ\'s sentence, word for word, in both languages; other codes are said as before', () => {
  for (const r of [{ code: 'h264NoneWin' }, { code: 'h264NoneOther' }, { code: 'h264NoneWin', featurePack: true }]) {
    a.equal(V.h264Refusal('zh-CN', r), JJ_ZH, JSON.stringify(r));
    a.equal(V.h264Refusal('en', r), JJ_EN, JSON.stringify(r));
  }
  a.equal(V.h264Refusal('zh-CN', { code: 'frameTooSmall', params: { w: 120, h: 40 } }), V.h264Message('zh-CN', { code: 'frameTooSmall', params: { w: 120, h: 40 } }));
  a.equal(V.h264Refusal('en', { code: 'nonsense' }), null, 'an unknown code is not shown as text');
});

test('raw encoding profiles: which encode H.264', () => {
  a.equal(X.argsUseH264(['-c:v', 'libx264', '-crf', '18']), true);
  a.equal(X.argsUseH264(['-c:v', 'h264_nvenc']), true);
  a.equal(X.argsUseH264(['-vcodec', 'h264_mf']), true);
  a.equal(X.argsUseH264(['-c:v', 'prores_ks']), false);
  a.equal(X.argsUseH264(['-c:v', 'hevc_nvenc']), false);
  for (const p of Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'encoding-profiles.json'), 'utf8')).profiles))
    a.equal(X.argsUseH264(p.args), p.args.some((x) => /^(libx264|h264_)/.test(x)), p.label);
});

test('the page asks before the audio mix: the Export dialog, the export queue and 自动出切片', () => {
  const fast = body(app, 'async function fastExport(');
  const ask = fast.indexOf('await exportH264Refusal('), mix = fast.indexOf('renderAudioMix(');
  a.ok(ask > 0 && ask < mix, 'fastExport asks before mixing the audio');
  a.ok(fast.indexOf('fetch("/api/export/begin"') > mix, 'and so before /api/export/begin');
  const helper = body(app, 'async function exportH264Refusal(');
  a.match(helper, /fetch\("\/api\/export\/h264"/); a.match(helper, /MontClipView\.h264Refusal\(mcView\.get\(\)\.language, st\.reason\)/);
  const queue = body(app, 'async function runQueue(');
  const qAsk = queue.indexOf('exportH264Refusal('), loop = queue.indexOf('while (!queueStop)');
  a.ok(qAsk > 0 && qAsk < loop, 'the queue refuses every waiting H.264 output once, before rendering any');
  a.match(queue, /status: "failed", error: refused, noH264: true/);
  a.match(queue, /if \(!quiet\) alert\(refused\)/, 'said once, not per file');
  const confirm = body(app, 'function autoExportConfirm(');
  a.match(confirm, /exportH264Refusal\(deliveryIsH264\(sliceDeliverySpec\(\)\)\)/); a.match(confirm, /go\.disabled = true/);
  a.match(confirm, /data-as-ex-noh264 role="alert"/, 'a lasting line on the page, not a toast that flashes');
  const ex = body(app, 'async function autoExport(');
  a.ok(ex.indexOf('exportH264Refusal(') < ex.indexOf('placeAutoSlices('), 'nothing goes on the timeline when it cannot export');
  a.match(body(app, 'async function autoExportRun('), /runQueue\(\{ quiet: true \}\)/, '自动出切片 says it on its own page');
  a.match(body(app, 'function queueSlices('), /const spec = sliceDeliverySpec\(\);/, 'the check looks at the spec the slices are queued with');
});

test('server: every H.264 export path refuses with the same code before rendering', () => {
  a.match(body(server, 'async function noH264Error('), /\.\.\.X\.noH264\(noH264Where\(\)\)/);
  a.match(body(server, 'async function beginDeliveryExport('), /await noH264Error\(\)/);
  const raw = body(server, 'async function beginExport(');
  a.ok(raw.indexOf('X.argsUseH264(profile.args) && await noH264Error()') < raw.indexOf('exportBinary('), 'a raw H.264 profile: no encoder at all comes before "choose your own FFmpeg"');
});

test('server, no H.264 encoder: H.264 refused at begin with a code, Archive (FFV1) still starts', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  if (!require('../ffmpeg-path').available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  // no H.264 anywhere: hidden in the bundled build, and nothing on PATH (JJ P1 looks there too)
  const nowhere = path.join(dir, 'no-such-folder');
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_TEST_NO_H264: '1', MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: path.join(dir, 'no-setting.json'), MONTCLIP_FFMPEG: require('../ffmpeg-path').path('ffmpeg'), MONTCLIP_FFPROBE: require('../ffmpeg-path').path('ffprobe'), PATH: nowhere, Path: nowhere });
  const st = await (await fetch(base + '/api/export/h264')).json();
  a.equal(st.encoder, null); a.match(st.reason.code, /^h264None(Win|Other)$/);
  const begin = (b) => fetch(base + '/api/export/begin', { method: 'POST', body: JSON.stringify(b) });
  const canvas = { fps: 30, duration: 1, canvasW: 640, canvasH: 360, hasAudio: false };
  for (const req of [{ ...canvas, deliveries: [{ delivery: { preset: 'youtube' }, name: 'a' }, { delivery: { preset: 'web' }, name: 'b' }] },
    { fps: 30, name: 'x', profile: 'delivery', hasAudio: false }]) {
    const r = await begin(req); a.equal(r.status, 400); const j = await r.json();
    a.match(j.code, /^h264None(Win|Other)$/, JSON.stringify(j)); a.ok(!/[一-鿿]/.test(j.error), 'English for agents and logs');
    // node server.js without the desktop app is server mode; the desktop app keeps JJ's sentence
    a.equal(j.setup, 'server'); a.equal(V.h264Refusal('zh-CN', j), V.text['zh-CN'].h264RefuseServer);
    a.equal(V.h264Refusal('zh-CN', { code: j.code }), JJ_ZH);
  }
  const r = await begin({ ...canvas, deliveries: [{ delivery: { preset: 'archive' }, name: 'c' }] });
  const j = await r.json(); a.equal(r.status, 200, JSON.stringify(j)); a.ok(j.id);
  await fetch(base + '/api/export/end?id=' + j.id + '&discard=1', { method: 'POST' });
});

test('server, an H.264 encoder present but no local FFmpeg: a libx264 profile still asks for your own FFmpeg (extNeeded)', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  if (!require('../ffmpeg-path').available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  // "no local FFmpeg": nothing chosen and nothing on PATH (JJ P1 looks there too)
  const nowhere = path.join(dir, 'no-such-folder');
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: path.join(dir, 'no-setting.json'), PATH: nowhere, Path: nowhere });
  const st = await (await fetch(base + '/api/export/h264')).json();
  if (!st.encoder) return t.skip('this computer has no H.264 encoder (covered above)');
  const r = await fetch(base + '/api/export/begin', { method: 'POST', body: JSON.stringify({ fps: 30, name: 'x', profile: 'draft', hasAudio: false }) });
  a.equal(r.status, 400); const j = await r.json(); a.equal(j.code, 'extNeeded', JSON.stringify(j));
});

// QQ on 1d3e289: while the precheck is out, 〔返回选择页〕 still works; when it answered, autoExport placed the slices and
// exported anyway. The real autoExport / autoExportConfirm and the real 〔返回〕 handlers, on a fake dialog, with the
// precheck answering only after 〔返回〕 was clicked.
function autoSlicesHarness({loadingEncoders=false}={}) {
  const fn = (head) => { const i = app.indexOf(head); a.ok(i >= 0, head); return app.slice(i, app.indexOf('\n}', i) + 2); };
  // the request-number helpers right above autoExportConfirm (absent before QQ's fix: then the test is red, not broken)
  const h0 = app.indexOf('function autoExNext('), helpers = h0 >= 0 ? app.slice(h0, app.indexOf('function autoExportConfirm(')) : '';
  const handler = (act) => app.match(new RegExp(`if \\(act === "${act}"\\) \\{([^}]*)\\}`))[1];
  const calls = { place: 0, queue: 0, run: 0, notices: 0 }, pending = [];
  let page = 'review';
  const go = { disabled: false, closest: () => ({ insertAdjacentHTML: () => { calls.notices++; } }) };
  const body = { set innerHTML(h) { page = h.includes('as-ex') ? 'confirm' : 'review'; go.disabled = false; } };
  const el = { open: true, querySelector: (s) => s === '[data-as-body]' ? body : s === '[data-as-footer]' ? {} : s === '[data-as-body] .as-ex' ? (page === 'confirm' ? {} : null)
    : s === '[data-as-act="ex-go"]' ? (page === 'confirm' ? go : null) : null };
  const st = { step: 'review', clips: [{ on: true, s: 0, e: 5 }, { on: true, s: 9, e: 12 }], subs: false };
  const encoderInfo={encoders:loadingEncoders?null:[]}, encoderPending=[];
  const env = {
    deliveryInfo:encoderInfo, fetchDeliveryInfo:()=>new Promise(resolve=>encoderPending.push(resolve)),
    AUTO: { el }, autoState: () => st, autoSay: () => 'x', escapeHtml: (s) => s, autoName: () => 'n', autoDur: () => '1', autoSubMode: () => 'auto',
    exportH264Refusal: () => new Promise((resolve) => pending.push(resolve)), deliveryIsH264: () => true, sliceDeliverySpec: () => ({}),
    placeAutoSlices: () => { calls.place++; return { ok: true, at0: 0 }; }, queueSlices: () => { calls.queue++; }, autoExportRun: () => { calls.run++; },
    autoRender: (step) => { st.step = step; page = 'review'; }, exportQueue: [], exportBaseName: () => 'S', autoToast() {}, uiText: () => '',
    MontClipAutoSlices: { numbered: (x) => x }, Delivery: { fileSafeName: (n) => n },
  };
  const make = new Function(...Object.keys(env), `${helpers}\n${fn('function autoExportConfirm(')}\n${fn('async function autoExport(')}
    return { confirm: autoExportConfirm, exportNow: autoExport, back: () => { ${handler('ex-cancel')} } };`);
  return { ...make(...Object.values(env)), calls, pending, encoderPending, el, page: () => page };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('auto-slices: 〔返回〕 while the precheck is out — nothing placed, nothing exported, no notice on the page it left', async () => {
  const h = autoSlicesHarness();
  h.confirm(); a.equal(h.page(), 'confirm');
  const going = h.exportNow();            // 〔导出〕: the precheck is out (pending[1]; pending[0] is the confirm page's own)
  h.back(); a.equal(h.page(), 'review');  // 〔返回选择页〕 meanwhile
  for (const answer of h.pending) answer(null);   // then the precheck answers "go ahead"
  await going; await tick();
  a.deepEqual(h.calls, { place: 0, queue: 0, run: 0, notices: 0 }, 'the timeline and the queue are left as they were');
});

test('auto-slices: the dialog closed, or the page left, while the precheck is out — nothing happens; otherwise it exports once', async () => {
  const closed = autoSlicesHarness();
  closed.confirm(); const going = closed.exportNow(); closed.el.open = false;
  for (const answer of closed.pending) answer(null);
  await going; await tick();
  a.deepEqual(closed.calls, { place: 0, queue: 0, run: 0, notices: 0 });
  // the confirm page's own precheck answers "no encoder" after 〔返回〕: no notice is put on the selection page
  const left = autoSlicesHarness();
  left.confirm(); left.back(); left.pending[0]('no encoder'); await tick();
  a.equal(left.calls.notices, 0);
  // still on the page and nothing clicked in between: the export goes ahead, once
  const stay = autoSlicesHarness();
  stay.confirm(); const ok = stay.exportNow(); for (const answer of stay.pending) answer(null); await ok; await tick();
  a.deepEqual([stay.calls.place, stay.calls.queue, stay.calls.run], [1, 1, 1]);
});

test('auto-slices: cancellation during encoder discovery leaves timeline and queue untouched',async()=>{
  const h=autoSlicesHarness({loadingEncoders:true});h.confirm();const going=h.exportNow();h.back();
  h.encoderPending[0]();await going;
  a.deepEqual(h.calls,{place:0,queue:0,run:0,notices:0});
});

test('auto-slices: an old precheck cannot act on a newly opened confirmation page',async()=>{
  const h=autoSlicesHarness();h.confirm();const old=h.exportNow();h.back();h.confirm();
  h.pending[0](null);h.pending[1](null);await old;await tick();
  a.deepEqual(h.calls,{place:0,queue:0,run:0,notices:0});
});
