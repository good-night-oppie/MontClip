'use strict';
// 「检查这 10 秒」 (#321 step 2, Deja): the box and the result list, against a stand-in with the shapes of Cindy's step 1
// (MontClip#328, /api/review/*). The real server is exercised against #328's own routes before this goes in; Win11 by hand.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const R = require('../review-check');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const zh = (k, v) => R.t('zh-CN', k, v);
const tick = () => new Promise((r) => setImmediate(r));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await tick(); };
const fast = { pollMs: 0, wait: () => Promise.resolve() };
const session = (api) => R.createSession(api, fast);
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
/** a ready view as #328's status returns it (prepare → status until ready) */
async function readyView(opts = {}, range = { start: 20, end: 30 }, scope = 'full') {
  const api = R.stubApi(opts);
  const v = await api.prepare({ ...range, scope });
  return api.status(v.reviewId);
}

/* ── a small DOM, enough for review-check.js ── */
function fakeDoc() {
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this._text = ''; this.className = ''; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.disabled = false; this.title = ''; this.id = '';
      const self = this; this.classList = { add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
        remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
        toggle(c, on) { if (on) this.add(c); else this.remove(c); }, contains(c) { return self.className.split(/\s+/).includes(c); } }; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    get innerHTML() { throw new Error('innerHTML is never used'); }
    set innerHTML(v) { throw new Error('innerHTML is never used'); }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(n, fn) { (this.listeners[n] = this.listeners[n] || []).push(fn); }
    click() { if (!this.disabled) for (const fn of this.listeners.click || []) fn({}); }
    all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  }
  const body = new El('body');
  return { body, documentElement: body, createElement: (t) => new El(t), El };
}
function mountWith(api, extra = {}) {
  const doc = fakeDoc(), button = doc.createElement('button');
  button.className = 'btn review-btn hidden';
  const seeks = [], timers = [];
  const env = { doc, button, api, lang: () => 'zh-CN', time: () => 42, duration: () => 200, inOut: () => ({}),
    seek: (t) => seeks.push(t), setInterval: (fn) => timers.push(fn), ...fast, ...extra };
  const ui = R.mount(env);
  const nodes = () => doc.body.all();
  const byReview = (id) => nodes().filter((n) => n.dataset && n.dataset.review === id);
  return { ui, doc, button, seeks, timers, nodes, byReview, overlay: ui.overlay, text: () => ui.overlay.textContent };
}

test('which seconds: 10 s around the playhead, inside the timeline; a marked IN–OUT of 1–30 s; over 30 s says so; under 1 s is off', () => {
  a.deepEqual(R.pickRange({ time: 42, duration: 200 }), { start: 37, end: 47 });
  a.deepEqual(R.pickRange({ time: 1, duration: 200 }), { start: 0, end: 10 });
  a.deepEqual(R.pickRange({ time: 199, duration: 200 }), { start: 190, end: 200 });
  a.deepEqual(R.pickRange({ time: 3, duration: 6 }), { start: 0, end: 6 });
  a.deepEqual(R.pickRange({ time: 42, duration: 200, inPoint: 20, outPoint: 30 }), { start: 20, end: 30 });
  a.deepEqual(R.pickRange({ time: 42, duration: 200, inPoint: 20, outPoint: 55 }), { start: 37, end: 47, fellBack: true }, 'longer than 30 s: back to 10 s, flagged');
  a.equal(R.pickRange({ time: 0, duration: 0 }), null);
  a.equal(R.pickRange({ time: 42, duration: 200, inPoint: 20, outPoint: 20.6 }), null, 'JJ #326: under 1 s can not be clicked');
  a.equal(R.pickRange({ time: 0, duration: 0.8 }), null, 'a timeline under 1 s');
  const w = mountWith(R.stubApi(), { inOut: () => ({ inPoint: 20, outPoint: 20.6 }) });
  a.equal(w.button.disabled, false, 'not yet labelled');
  w.timers[0]();
  a.equal(w.button.disabled, true);
  a.equal(w.button.title, '这一段不到 1 秒，没法检查', 'JJ #326 recheck: the greyed-out button says why');
  const w0 = mountWith(R.stubApi(), { duration: () => 0 });
  w0.timers[0]();
  a.equal(w0.button.disabled, true, 'nothing loaded: off');
  a.equal(w0.button.title, '', 'JJ #326 (833f73e4): nothing loaded never says 「不到 1 秒」');
  const wn = mountWith(R.stubApi(), { duration: () => undefined });
  wn.timers[0]();
  a.equal(wn.button.title, '', 'no length known: no 「不到 1 秒」 either');
  const ws = mountWith(R.stubApi(), { duration: () => 0.8 });
  ws.timers[0]();
  a.equal(ws.button.title, '这一段不到 1 秒，没法检查', 'a loaded timeline under 1 s does say it');
  a.deepEqual(R.pickRange({ time: 42, duration: 200, inPoint: 20, outPoint: 21 }), { start: 20, end: 21 });
});

test('a check (#328): prepare is local, status is read until the clip is ready, nothing is sent before a click', async () => {
  const api = R.stubApi({ renderPolls: 3 }), s = session(api);
  a.equal(await s.send('full'), false, 'no box yet');
  await s.check({ start: 20, end: 30 });
  a.equal(s.state.phase, 'confirm');
  a.deepEqual(api.calls.map((c) => c[0]), ['prepare', 'status', 'status', 'status'], 'polled until ready');
  a.deepEqual(api.calls[0][1], { start: 20, end: 30, scope: 'full' }, '「发送检查」 is the clip with this stretch\'s text');
  a.equal(s.state.prep.state, 'ready');
  a.equal(s.state.prep.sendToken, 'tok_1');
  a.equal(api.calls.filter((c) => c[0] === 'send').length, 0);
  a.equal(await s.send('passed'), false, 'only full or window');
  a.ok(await s.send('full'));
  a.deepEqual(api.calls.find((c) => c[0] === 'send'), ['send', 'r_1', 'tok_1'], 'POST /api/review/send {id, token}');
  a.equal(s.state.phase, 'result');

  const failing = R.stubApi({ renderFails: true }), s2 = session(failing);
  await s2.check({ start: 20, end: 30 });
  a.equal(R.resultModel(s2.state.raw, 'zh-CN', 10).headline, '这 10 秒没能在这台电脑上准备好，什么都没有发出去。', 'a clip that could not be made');
});

test("the box says what is sent, to whom, and that it may train a model", async () => {
  const m = R.confirmModel(await readyView(), 'zh-CN');
  a.equal(m.lines[0], '联网只发生在你自己打开的功能里，发之前先给你看。点「发送检查」后，这 10 秒的画面和声音，还有这一段里的字幕文字和剪辑时间点，会发给 AI 做检查，可能用于训练。');
  a.equal(m.to, '发给：Google Gemini（daily-cloudcode-pa.googleapis.com）');
  a.equal(m.training, '对方可能用这段内容训练模型');
  a.deepEqual(m.buttons.map((b) => b.label), ['先看要发的内容', '发送检查', '只发这 10 秒', '不发了'], 'the four buttons as before');
  a.ok(m.canSend && m.buttons.every((b) => b.enabled));
  a.deepEqual(m.lines.slice(1), [
    '点「发送检查」会发出去：0:17–0:30 的画面和声音（13 秒），和这一段里的字幕文字、剪辑时间点。',
    '点「只发这 10 秒」只发出去：0:17–0:30 的画面和声音（13 秒），不带字幕文字和剪辑时间点。',
    '两个按钮发的画面和声音里，都有前面多带的 3 秒（0:17–0:20），让 AI 知道前面在说什么。',
    '画面里如果有观众昵称、弹幕，会原样发出去。']);
  const taste = R.confirmModel(await readyView({ taste: 4 }), 'zh-CN');
  a.ok(taste.lines.includes('两个按钮都会带上你记下的 4 条审美笔记（你以前认可或不认可的例子）。'), 'willSend.tasteNotes is always said when there are any');
  const twice = await readyView(); twice.willSend = { ...twice.willSend, requests: 2 };
  a.ok(R.confirmModel(twice, 'zh-CN').lines.includes('同一段会分 2 次发出去。'));
});

test("Deja #328: a domain nobody confirmed says 「未验证」 beside it and is never shown as confirmed; nothing can be sent to it", async () => {
  const dest = { service: 'Google Gemini', host: 'daily-cloudcode-pa.googleapis.com', source: 'docs', verified: false };
  // the engine refuses to prepare (409 DESTINATION_UNVERIFIED): the box still says where it would go, marked 未验证
  const api = R.stubApi({ destination: dest, prepareError: 'DESTINATION_UNVERIFIED' }), s = session(api);
  await s.check({ start: 20, end: 30 });
  a.equal(s.state.phase, 'unverified');
  const u = R.unverifiedModel(s.state.dest, 'zh-CN', s.state.range);
  a.equal(u.to, '发给：Google Gemini（daily-cloudcode-pa.googleapis.com，未验证）');
  a.ok(u.lines.includes('这个地址还没有人确认过，所以先不发。'));
  a.equal(u.training, '对方可能用这段内容训练模型');
  a.deepEqual(u.buttons.map((b) => [b.label, b.enabled]), [['先看要发的内容', false], ['发送检查', false], ['只发这 10 秒', false], ['不发了', true]]);
  a.equal(await s.send('full'), false);
  a.deepEqual(api.calls.map((c) => c[0]), ['prepare'], 'nothing made, nothing sent');
  // a ready view whose receiver is not verified (the engine would refuse anyway): 未验证, and both send buttons off
  const v = await readyView({ destination: dest });
  const m = R.confirmModel(v, 'zh-CN');
  a.equal(m.to, '发给：Google Gemini（daily-cloudcode-pa.googleapis.com，未验证）');
  a.equal(m.canSend, false); a.equal(m.blocked, 'unverified');
  a.deepEqual(m.buttons.filter((b) => !b.enabled).map((b) => b.id), ['preview', 'full', 'window']);
  for (const verified of [undefined, 'true', 1, null]) {
    const d = R.destinationOf({ service: 'S', host: 'h.example', verified });
    a.equal(d.verified, false, 'only verified:true counts as confirmed: ' + String(verified));
    a.match(R.confirmModel({ ...v, willSend: { ...v.willSend, to: { service: 'S', host: 'h.example', verified } } }, 'zh-CN').to, /未验证/);
  }
  a.equal(R.destinationOf({ service: 'S', host: 'C:\\Users\\x', verified: true }), null, 'a path is not a host');
  a.equal(R.confirmModel({ ...v, willSend: { ...v.willSend, to: null } }, 'zh-CN').to, '不知道这次会发到哪里，所以先不发。');
});

test("JJ #326: whole seconds with no lead, the fallback said in both boxes", async () => {
  const v = await readyView({}, { start: 0, end: 3.4 });   // no lead at 0
  const m = R.confirmModel(v, 'zh-CN');
  a.equal(m.n, 3);
  a.ok(m.lines.some((l) => l.includes('（3 秒）')) && !m.lines.some((l) => l.includes('3.4 秒')), 'the box says 3 秒 like the button');
  a.ok(!m.lines.some((l) => l.includes('多带')), 'no lead line without a lead');
  a.equal(m.buttons[2].label, '只发这 3 秒');
  const fb = R.confirmModel(await readyView({}, { start: 37, end: 47 }), 'zh-CN', { fellBack: true });
  a.equal(fb.lines[0], '你标的范围超过 30 秒，这次检查的是播放头附近的 10 秒。');
  a.deepEqual(R.resultModel({ status: 'passed', findings: [], dimensions: allPass() }, 'zh-CN', 10, { fellBack: true }).notes, ['你标的范围超过 30 秒，这次检查的是播放头附近的 10 秒。']);
});

test('「只发这 10 秒」 (#328: scope is fixed at prepare): a clip without the text is made and sent only if it matches what the box said', async () => {
  const api = R.stubApi(), s = session(api);
  await s.check({ start: 20, end: 30 });
  a.ok(await s.send('window'));
  a.deepEqual(api.calls.map((c) => c[0] + (c[1] && c[1].scope ? ':' + c[1].scope : '')), ['prepare:full', 'status', 'cancel', 'prepare:window', 'status', 'send']);
  a.deepEqual(api.calls.find((c) => c[0] === 'cancel'), ['cancel', 'r_1'], 'the clip with text is dropped first');
  a.deepEqual(api.calls.find((c) => c[0] === 'send'), ['send', 'r_2', 'tok_2'], 'the window clip goes, with its own token');
  a.equal(R.resultModel(s.state.raw, 'zh-CN', 10).notes[0], '这次只检查了这 10 秒，没有结合字幕文字。');

  // the window clip comes back different (here: taste notes added in between): the box is shown again, nothing is sent
  let n = 0; const api2 = R.stubApi(); const st = api2.status;
  api2.status = async (id) => { const v = await st(id); if (v.state === 'ready' && ++n === 2) v.willSend = { ...v.willSend, tasteNotes: 2 }; return v; };
  const s2 = session(api2);
  await s2.check({ start: 20, end: 30 });
  a.equal(await s2.send('window'), false);
  a.equal(s2.state.phase, 'confirm'); a.equal(s2.state.changed, true);
  a.equal(api2.calls.filter((c) => c[0] === 'send').length, 0, 'not sent: the box changed');
  const m2 = R.confirmModel(s2.state.prep, 'zh-CN', { changed: true });
  a.ok(m2.lines.includes('要发的内容和刚才说的不一样了，请再看一遍再决定。'));
  a.ok(m2.lines.includes('两个按钮都会带上你记下的 2 条审美笔记（你以前认可或不认可的例子）。'));
  a.equal(m2.buttons.find((b) => b.id === 'full').enabled, false, 'this clip has no text: 「发送检查」 would need its own');
  a.ok(await s2.send('window'), 'a second click sends what is now shown');
  a.deepEqual(api2.calls.filter((c) => c[0] === 'send').map((c) => c[1]), ['r_2']);

  // the window clip's receiver changed (or is no longer confirmed): never sent on the first click
  let k = 0; const api3 = R.stubApi(); const st3 = api3.status;
  api3.status = async (id) => { const v = await st3(id); if (v.state === 'ready' && ++k === 2) v.willSend = { ...v.willSend, to: { ...v.willSend.to, host: 'other.example' } }; return v; };
  const s3 = session(api3);
  await s3.check({ start: 20, end: 30 });
  a.equal(await s3.send('window'), false);
  a.equal(api3.calls.filter((c) => c[0] === 'send').length, 0);
});

test('「不发了」 and 「取消」 cancel the check and send nothing; a slow answer after them never reopens the box', async () => {
  const api = R.stubApi(), s = session(api);
  await s.check({ start: 20, end: 30 });
  await s.cancel();
  a.deepEqual(api.calls.map((c) => c[0]), ['prepare', 'status', 'cancel']);
  a.equal(await s.send('full'), false, 'gone after 不发了');

  // cancelled while the clip is being made: the engine is told, the late status never opens the box
  const slow = R.stubApi(), d = deferred(); const realStatus = slow.status; slow.status = (id) => d.p.then(() => realStatus(id));
  const s2 = session(slow);
  const going = s2.check({ start: 20, end: 30 });
  await settle();
  a.equal(s2.state.phase, 'preparing');
  await s2.cancel();
  a.deepEqual(slow.calls.filter((c) => c[0] === 'cancel'), [['cancel', 'r_1']], 'the clip being made is dropped');
  d.resolve(); await going;
  a.equal(s2.state.phase, 'closed', 'stays closed');
  a.equal(slow.calls.filter((c) => c[0] === 'send').length, 0);
});

test('QQ #326 item 1: no full description of what is sent → both send buttons off, the box says why, send refuses', async () => {
  const base = await readyView();
  const cases = {
    'no willSend': { ...base, willSend: undefined },
    'no seconds': { ...base, willSend: { ...base.willSend, seconds: undefined } },
    'no requests': { ...base, willSend: { ...base.willSend, requests: undefined } },
    'zero requests': { ...base, willSend: { ...base.willSend, requests: 0 } },
    'no taste count': { ...base, willSend: { ...base.willSend, tasteNotes: undefined } },
    'taste count not whole': { ...base, willSend: { ...base.willSend, tasteNotes: 1.5 } },
    'no range': { ...base, range: undefined },
    'range backwards': { ...base, range: { start: 30, end: 20 } },
    'no lead': { ...base, lead: undefined },
    'lead before 0': { ...base, lead: 25 },
    'unknown scope': { ...base, scope: 'all' },
    // QQ #326 5900512724 item 1: the clip must be exactly lead + range — nothing unnamed before or after
    'seconds hold more than lead + range': { ...base, willSend: { ...base.willSend, seconds: 14.5 } },
    'seconds hold less': { ...base, willSend: { ...base.willSend, seconds: 10 } },
    'lead 0 but seconds include a lead': { ...base, lead: 0 },
  };
  a.deepEqual([base.range.start, base.range.end, base.lead, base.willSend.seconds], [20, 30, 3, 13], 'the stub is the shape the cases bend');
  for (const [name, view] of Object.entries(cases)) {
    const m = R.confirmModel(view, 'zh-CN');
    a.equal(m.canSend, false, name);
    a.deepEqual(m.buttons.filter((b) => !b.enabled).map((b) => b.id), ['preview', 'full', 'window'], name);
    a.ok(m.lines.includes('说不清这次具体会发出去什么，所以先不发。'), name + ': says why');
    a.ok(!m.lines.some((l) => /会发出去：|只发出去：/.test(l)), name + ': never a made-up description');
    const api = R.stubApi(); const st = api.status; api.status = async (id) => { const v = await st(id); return { ...view, reviewId: v.reviewId, sendToken: v.sendToken }; };
    const s = session(api);
    await s.check({ start: 20, end: 30 });
    a.equal(await s.send('full'), false, name + ': send refuses');
    a.equal(await s.send('window'), false, name + ': send refuses');
    a.equal(api.calls.filter((c) => c[0] === 'send').length, 0, name);
  }
  a.equal(R.confirmModel(base, 'zh-CN').canSend, true, 'the full description still sends');
  const noLead = { ...base, lead: 0, willSend: { ...base.willSend, seconds: 10 } };
  a.equal(R.confirmModel(noLead, 'zh-CN').canSend, true, 'no lead and the clip is exactly the range: sends');
  a.equal(R.confirmModel({ ...base, sendToken: undefined }, 'zh-CN').canSend, false, 'no token');
  a.equal(R.confirmModel({ ...base, state: 'rendering' }, 'zh-CN').canSend, false, 'not ready');
});

test('QQ #326 5900512724 item 2: a send that throws is 「不确定发没发」 whatever its code — never 「什么都没有发出去」', async () => {
  for (const code of ['PREPARE_FAILED', 'NO_BRIDGE', 'BUSY', 'NOT_CONFIRMED', 'DESTINATION_CHANGED', undefined]) {
    const api = R.stubApi();
    api.send = async () => { const e = new Error('x'); if (code) e.code = code; throw e; };
    const s = session(api);
    await s.check({ start: 20, end: 30 });
    await s.send('full');
    const m = R.resultModel(s.state.raw, 'zh-CN', 10);
    a.equal(m.headline, '检查没做成。不确定内容有没有已经发到对方那边。这不代表没问题。', String(code));
    a.ok(!/什么都没有发出去/.test(JSON.stringify(m)), String(code) + ': never claims nothing was sent');
  }
  // prepare's own failure still says nothing went; the engine's own refusals say what they mean
  for (const [code, headline] of [['X', '这 10 秒没能在这台电脑上准备好，什么都没有发出去。'], ['NO_BRIDGE', '这台电脑上暂时用不了这个检查。'], ['BUSY', '现在正在忙别的，等它忙完再点一次。']]) {
    const s = session(R.stubApi({ prepareError: code }));
    await s.check({ start: 20, end: 30 });
    a.equal(R.resultModel(s.state.raw, 'zh-CN', 10).headline, headline, code);
  }
});

test('QQ #326 item 2: 「先看要发的内容」 plays this box\'s own clip — a same-origin preview only, never an older box\'s', async () => {
  a.equal(R.safePreviewSrc('/previews/preview_r_1.mp4'), '/previews/preview_r_1.mp4');
  a.equal(R.safePreviewSrc('/previews/a%20b.mp4'), '/previews/a%20b.mp4', 'the engine encodes the name');
  for (const src of ['https://x.example/a.mp4', '//x.example/a.mp4', '/media/a.mp4', '/previews/../project.json', 'C:\\a.mp4', 'javascript:alert(1)', ''])
    a.equal(R.safePreviewSrc(src), null, src);
  const api = R.stubApi(), s = session(api);
  await s.check({ start: 20, end: 30 });
  a.equal(s.preview(), '/previews/preview_r_1.mp4', 'previewSrc from status — no request of its own');
  a.equal(s.state.phase, 'confirm', 'looking does not send');
  a.equal(api.calls.filter((c) => c[0] === 'send').length, 0);
  await s.cancel();
  await s.check({ start: 40, end: 50 });
  a.equal(s.state.previewSrc, null, 'B shows nothing of A');
  a.equal(s.preview(), '/previews/preview_r_2.mp4', 'B plays its own');
  const v = await readyView(); v.previewSrc = 'https://evil.example/x.mp4';
  a.equal(R.confirmModel(v, 'zh-CN').buttons[0].enabled, false, 'an address that is not a managed preview: the button is off');
});

test('QQ #326 item 3: 关闭 while the clip is being made keeps the box closed; a double press prepares once', async () => {
  const api = R.stubApi(), w = mountWith(api);
  await settle(); w.button.click(); await settle();
  w.byReview('full')[0].click(); await settle();
  const d = deferred(); const st = api.status; api.status = (id) => d.p.then(() => st(id));
  w.byReview('recheck')[0].click(); await settle();
  a.equal(w.ui.session.state.phase, 'preparing');
  w.byReview('cancel')[0].click(); await settle();
  d.resolve(); await settle();
  a.ok(w.overlay.classList.contains('hidden'), 'stays closed');
  a.equal(api.calls.filter((c) => c[0] === 'send').length, 1, 'only the first, clicked send');

  const api2 = R.stubApi(), d2 = deferred(), w2 = mountWith(api2); await settle();
  const st2 = api2.status; api2.status = (id) => d2.p.then(() => st2(id));
  w2.button.click(); await settle(); w2.button.click(); await settle();
  d2.resolve(); await settle();
  a.equal(api2.calls.filter((c) => c[0] === 'prepare').length, 1, 'one prepare for a double press');
  a.equal(w2.ui.session.state.phase, 'confirm');
  a.equal(w2.ui.session.state.prep.reviewId, 'r_1');
});

test('QQ #326 item 4: a late 已修好 answer never throws and never marks another result', async () => {
  const api = R.stubApi(), s = session(api);
  await s.check({ start: 20, end: 30 }); await s.send('full');
  const dm = deferred(); api.mark = () => dm.p;
  const dp = deferred(); const realPrep = api.prepare; api.prepare = (b) => dp.p.then(() => realPrep(b));
  const pendingMark = s.markFixed(0);
  const rechecking = s.check({ start: 20, end: 30 });
  dm.resolve({ ok: true });
  a.equal(await pendingMark, false, 'no TypeError, no update');
  dp.resolve(); await rechecking;

  const api2 = R.stubApi(), s2 = session(api2);
  await s2.check({ start: 20, end: 30 }); await s2.send('full');
  const dm2 = deferred(); api2.mark = () => dm2.p;
  const pending2 = s2.markFixed(0);
  await s2.check({ start: 20, end: 30 }); await s2.send('full');
  const b = s2.state.raw;
  dm2.resolve({ ok: true });
  a.equal(await pending2, false);
  a.equal(s2.state.raw, b);
  a.equal(s2.state.raw.findings[0].mark, null, 'B finding 0 is not marked');
});

function allPass() { return { fact: { state: 'passed', reason: '' }, subtitle: { state: 'passed', reason: '' }, pacing: { state: 'passed', reason: '' }, packaging: { state: 'passed', reason: '' } }; }

test("the result: no_result is never a pass; a problem in the checked stretch or in any of the four dimensions is never a pass", () => {
  const m = (raw, n) => R.resultModel(raw, 'zh-CN', n);
  const f = (o) => ({ id: 0, t: 24.2, type: 'speaker_swapped', text: 'x', suggestion: '', inLead: false, ...o });
  a.equal(m({ status: 'passed', findings: [], dimensions: allPass() }, 10).headline, '这 10 秒检查没有发现问题。这只是 AI 的判断，请你自己也看一遍、听一遍。');
  a.ok(!/没问题|放心/.test(zh('passed', { n: 10 })));
  a.equal(m({ status: 'no_result', reason: 'TIMEOUT', findings: [] }).headline, '这次没有检查出结果。这不代表没问题。');
  a.equal(m({ status: 'no_result', reason: 'NO_BRIDGE' }).headline, '这台电脑上暂时用不了这个检查。');
  a.equal(m({ status: 'no_result', reason: 'INSUFFICIENT_EVIDENCE', findings: [], dimensions: { ...allPass(), pacing: { state: 'insufficient_evidence', reason: '太短' } } }).headline,
    '这次有的方面看不出来，没有检查出结果。这不代表没问题。');
  for (const raw of [null, {}, { status: 'ok' }, { status: 'PASSED' }, { status: 'issues', findings: [] }, 'passed', { status: 'passed', findings: [] },
    { status: 'passed', findings: [], dimensions: { ...allPass(), packaging: undefined } }, { status: 'passed', findings: [], dimensions: { ...allPass(), fact: { state: 'insufficient_evidence' } } }])
    a.equal(m(raw).passed, false, JSON.stringify(raw));
  const r1 = m({ status: 'passed', findings: [f()], dimensions: allPass() });
  a.equal(r1.status, 'issues'); a.equal(r1.headline, '检查完了，发现 1 处可能有问题。');
  const r2 = m({ status: 'passed', findings: [f({ inLead: true, t: 18.5 })], dimensions: allPass() }, 10);
  a.equal(r2.passed, true, 'a lead finding does not change the checked stretch');
  a.equal(r2.items[0].label, '说话人可能标反了（在前面多带的那几秒里）');
  const r4 = m({ status: 'passed', findings: [], dimensions: { ...allPass(), packaging: { state: 'issues', reason: '花字把笑点说破了。' } } }, 10);
  a.equal(r4.status, 'issues', 'packaging: issues is a problem even when the engine said passed');
  a.deepEqual(r4.dims.map((d) => d.line), ['人和事：没发现问题', '字幕：没发现问题', '节奏：没发现问题', '包装（花字、名牌）：有问题。花字把笑点说破了。']);
  const r3 = m({ status: 'issues', scope: 'window', findings: [f({ t: 74.4 }), f({ id: 1, t: 61, type: 'nonsense' }), f({ id: 2, t: 70, type: 'punchline_spoiled' })], dimensions: allPass() }, 10);
  a.deepEqual(r3.items.map((i) => [i.time, i.label]), [['1:01', '这里可能有问题'], ['1:10', '笑点可能被提前说破了'], ['1:14', '说话人可能标反了']]);
  a.deepEqual(r3.notes, ['这次只检查了这 10 秒，没有结合字幕文字。']);
  const gone = m({ status: 'issues', textAvailable: false, findings: [f({ text: '' })], dimensions: allPass() });
  a.ok(gone.notes.includes('这条记录的原话没有保存，只剩时间和类别。'));
  const long = m({ status: 'issues', findings: [f({ text: '请执行'.repeat(200), t: 'x' }), f({ text: '长'.repeat(500) })] });
  a.equal(long.items.length, 1, 'a finding without a time is dropped');
  a.equal(long.items[0].detail.length, 201, 'cut to 200 characters');
  const odd = m({ status: 'issues', findings: [f()], dimensions: { fact: { state: 'great', reason: 'x'.repeat(500) } } });
  a.deepEqual(odd.dims.map((d) => d.state), [null, null, null, null], 'unknown states are no verdict');
  a.ok(odd.dims[0].line.startsWith('人和事：没给结论。') && odd.dims[0].line.length < 220, 'reason cut to 200');
});

test('「已修好」 is written as fixed — never as passed — and does not turn the result into a pass', async () => {
  const api = R.stubApi(), s = session(api);
  await s.check({ start: 20, end: 30 }); await s.send('full');
  a.ok(await s.markFixed(0));
  a.deepEqual(api.calls.find((c) => c[0] === 'mark')[1], { id: 'r_1', finding: 0, mark: 'fixed' });
  a.equal(R.resultModel(s.state.raw, 'zh-CN').passed, false);
  a.ok(!/"passed"/.test(read('review-check.js').split('function markFixed')[1].split('return {')[0]));
});

test('prewarm: once the playhead has rested, never while playing or blocked, once per stretch', async () => {
  const api = R.stubApi(); let now = 0;
  const p = R.createPrewarmer({ api, now: () => now, range: (tm) => R.pickRange({ time: tm, duration: 200 }) });
  const calls = () => api.calls.filter((c) => c[0] === 'prewarm').map((c) => c[1]);
  a.equal(p.tick(42, true, false), false);
  p.tick(42, false, false); now = 1000; a.equal(p.tick(42, false, false), false, 'not rested long enough');
  now = 1600; a.equal(p.tick(42, false, true), false, 'an export running');
  a.equal(p.tick(42, false, false), true); await tick();
  now = 5000; a.equal(p.tick(42, false, false), false, 'same stretch again');
  p.tick(80, false, false); now = 7000; a.equal(p.tick(80, false, false), true); await tick();
  a.deepEqual(calls(), [{ start: 37, end: 47 }, { start: 75, end: 85 }]);
});

test('the page talks only to its own /api/review routes; a server without them shows no button', async () => {
  const seen = [];
  const fakeFetch = (status, body) => async (url, init) => { seen.push([url, init && init.method || 'GET']); return { ok: status < 300, status, json: async () => body }; };
  a.equal(await R.httpApi(fakeFetch(404, { error: 'x' })).status(), null);
  a.equal(await R.httpApi(fakeFetch(501, { error: 'not available in the playground' })).status(), null);
  a.equal(await R.httpApi(fakeFetch(200, { error: 'x' })).status(), null);
  const ok = R.httpApi(fakeFetch(200, { available: true, destination: {} }));
  await ok.status(); await ok.prepare({ start: 1, end: 2 }); await ok.send({}); await ok.cancel('r'); await ok.prewarm({}); await ok.mark({}); await ok.preview('r 1');
  a.ok(seen.every(([u]) => u.startsWith('/api/review/')), JSON.stringify(seen));
  await a.rejects(R.httpApi(fakeFetch(409, { code: 'BUSY' })).prepare({}), (e) => e.code === 'BUSY');
  const src = read('review-check.js');
  a.ok(!/https?:\/\//.test(src), 'no address outside this server in the page code');
  a.ok(!/agentPolicy|approval|approveAll|都批准/i.test(src.replace(/都批准也照样|whatever the assistant's approval mode is/g, '')), 'the box never depends on the approval mode');
});

test('in the page: the box shows the receiver and the training line before either send button can be clicked', async () => {
  const api = R.stubApi(), w = mountWith(api);
  await tick();
  a.equal(w.button.classList.contains('hidden'), false);
  a.equal(w.button.textContent, '检查这 10 秒');
  w.button.click(); await tick(); await tick();
  a.equal(w.overlay.classList.contains('hidden'), false);
  const to = w.byReview('to')[0], tr = w.byReview('training')[0], full = w.byReview('full')[0], win = w.byReview('window')[0];
  a.equal(to.textContent, '发给：Gemini（generativelanguage.googleapis.com）');
  a.equal(tr.textContent, '对方可能用这段内容训练模型');
  const order = w.nodes();
  a.ok(order.indexOf(to) < order.indexOf(full) && order.indexOf(tr) < order.indexOf(win), 'above the buttons');
  a.deepEqual(api.calls.map((c) => c[0]), ['status', 'status', 'prepare'], 'nothing sent yet');
  full.click(); await tick(); await tick();
  a.equal(api.calls.filter((c) => c[0] === 'send').length, 1);
  a.equal(w.byReview('headline')[0].textContent, '检查完了，发现 1 处可能有问题。');
  w.byReview('jump')[0].click();
  a.deepEqual(w.seeks, [41.2], 'a click on the finding goes to that second');
  w.byReview('fixed')[0].click(); await tick();
  w.byReview('recheck')[0].click(); await tick(); await tick();
  a.equal(api.calls.filter((c) => c[0] === 'prepare').length, 2, 'checked again after the fix');
  a.equal(api.calls.filter((c) => c[0] === 'status').length, 3, 'the receiver read again on each check');
  a.ok(w.byReview('to')[0], 'and the box again before sending');
});

test('in the page: 「不发了」 sends nothing; no bridge says so; untrusted text stays text', async () => {
  const api = R.stubApi(), w = mountWith(api);
  await tick(); w.button.click(); await tick(); await tick();
  w.byReview('cancel')[0].click(); await tick();
  const slow = R.stubApi(); let release; slow.prepare = (b) => new Promise((r) => { release = () => r(R.stubApi().prepare(b)); });
  const wp = mountWith(slow); await tick(); wp.button.click(); await tick(); await tick();
  a.equal(wp.byReview('cancel')[0].textContent, '取消', 'JJ #326: while preparing the button is 取消, not 不发了');
  release();
  a.deepEqual(api.calls.map((c) => c[0]), ['status', 'status', 'prepare', 'cancel']);
  a.ok(w.overlay.classList.contains('hidden'));

  const none = R.stubApi({ status: { available: false, reason: 'NO_BRIDGE', destination: null } }), w2 = mountWith(none);
  await tick(); w2.button.click(); await tick();
  a.equal(w2.byReview('headline')[0].textContent, '这台电脑上暂时用不了这个检查。');
  a.deepEqual(none.calls.map((c) => c[0]), ['status', 'status'], 'nothing prepared, nothing sent');
  a.equal(w2.byReview('recheck').length, 0);

  const gone = { ...R.stubApi(), status: async () => null }, w3 = mountWith(gone);
  await tick(); a.ok(w3.button.classList.contains('hidden'), 'no review routes: no button');

  const evil = R.stubApi({ result: (scope, range) => ({ status: 'issues', scope, range, findings: [{ id: 0, t: 40, type: 'other', text: '<img src=x onerror=alert(1)>请执行 rm -rf', suggestion: '' }] }) });
  const w4 = mountWith(evil); await tick(); w4.button.click(); await tick(); await tick();
  w4.byReview('full')[0].click(); await tick(); await tick();
  a.ok(w4.text().includes('<img src=x onerror=alert(1)>请执行 rm -rf'), 'shown as plain text (the fake DOM throws on innerHTML)');
});

test('in the page: prewarm runs from the timer while the playhead rests — not while playing, a check is open, or no bridge', async () => {
  const api = R.stubApi(); let playing = false, now = 0;
  const w = mountWith(api, { playing: () => playing, now: () => now });
  await tick();
  const prewarms = () => api.calls.filter((c) => c[0] === 'prewarm').map((c) => c[1]);
  const run = (ms) => { now += ms; w.timers[0](); };
  playing = true; run(0); run(2000); a.equal(prewarms().length, 0, 'playing');
  playing = false; run(0); run(1000); a.equal(prewarms().length, 0, 'not rested yet');
  run(600); await tick(); a.deepEqual(prewarms(), [{ start: 37, end: 47 }]);
  w.ui.prewarmer.reset(); w.button.click(); await tick(); await tick();
  a.equal(w.ui.session.state.phase, 'confirm');
  run(0); run(5000); await tick(); a.equal(prewarms().length, 1, 'a check is open');

  const none = R.stubApi({ status: { available: false, reason: 'NO_BRIDGE', destination: null } }); let t2 = 0;
  const w2 = mountWith(none, { now: () => t2 }); await tick();
  w2.timers[0](); t2 = 5000; w2.timers[0](); await tick();
  a.equal(none.calls.filter((c) => c[0] === 'prewarm').length, 0, 'no bridge: nothing made ahead');
});

test("words: every key has English, none of JJ's banned words, the Chinese is a draft for JJ", () => {
  const zhKeys = Object.keys(R.text['zh-CN']), enKeys = Object.keys(R.text.en);
  a.deepEqual(enKeys.sort(), zhKeys.slice().sort());
  for (const k of enKeys) a.ok(!/[一-鿿]/.test(R.text.en[k]), k);
  const all = Object.values(R.text['zh-CN']).join('\n');
  for (const w of ['后台', '无头', '引擎', '预热', '缓存', 'agy', '命令行', 'ticket', '快照', '不会被训练', 'Yolo', '昵称会先去掉'])
    a.ok(!all.includes(w), w);
  a.match(read('review-check.js'), /DRAFT for JJ/);
});

test('the editor loads it and hands it the playhead; the playground copies it', () => {
  const html = read('index.html');
  a.ok(html.indexOf('<script src="review-check.js">') > html.indexOf('<script src="ffmpeg-card.js">'));
  a.ok(html.indexOf('<script src="review-check.js">') < html.indexOf('<script src="app.js">'));
  a.match(html, /<button type="button" class="btn review-btn hidden" id="btnReviewCheck">检查这 10 秒<\/button>/);
  const app = read('app.js'), block = app.slice(app.indexOf('/* ── 「检查这 10 秒」'));
  a.match(block, /MontClipReviewCheck\.mount\(/);
  a.match(block, /seek:t=>\{[^}]*setTime\(t\);revealTime\(t\);\}/);
  a.ok(!/fetch\(/.test(block), 'the wiring calls nothing itself');
  a.equal((app.match(/MontClipReviewCheck/g) || []).length, 2, 'one place in app.js');
  a.match(read('docs/demo/sync.js'), /"review-check\.js"/);
});
