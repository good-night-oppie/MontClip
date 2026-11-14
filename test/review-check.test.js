'use strict';
// 「检查这 10 秒」 (#321 step 2, Deja): the box, the result list and the prewarm, against a stand-in for the engine's
// interface v0 (Cindy 6867768988). The real engine replaces the stand-in once #325 and step 1 are in; Win11 is then run by hand.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const R = require('../review-check');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const zh = (k, v) => R.t('zh-CN', k, v);
const tick = () => new Promise((r) => setImmediate(r));

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
  const env = { doc, button, api, lang: () => 'zh-CN', time: () => 42, playing: () => false, duration: () => 200, inOut: () => ({}),
    seek: (t) => seeks.push(t), blocked: () => false, setInterval: (fn) => timers.push(fn), ...extra };
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

test("the box says what is sent, to whom, and that it may train a model — JJ's v3.1 sentence word for word", () => {
  const api = R.stubApi();
  return api.prepare({ start: 20, end: 30 }).then((prep) => {
    const m = R.confirmModel(prep, 'zh-CN');
    a.equal(m.lines[0], '联网只发生在你自己打开的功能里，发之前先给你看。点「发送检查」后，这 10 秒的画面和声音，还有整条片子的字幕文字和剪辑时间点，会发给 AI 做检查，可能用于训练。');
    a.equal(m.to, '发给：Gemini（generativelanguage.googleapis.com）');
    a.equal(m.training, '对方可能用这段内容训练模型');
    a.deepEqual(m.buttons.map((b) => b.label), ['先看要发的内容', '发送检查', '只发这 10 秒', '不发了']);
    a.ok(m.canSend && m.buttons.every((b) => b.enabled));
    // JJ #326, word for word; the lead line comes after both send lines; the danmaku line last
    a.deepEqual(m.lines.slice(1), [
      '点「发送检查」会发出去：0:18–0:30 的画面和声音（11.5 秒），整条片子的字幕文字 1824 字，和 37 个剪辑时间点。',
      '点「只发这 10 秒」只发出去：0:18–0:30 的画面和声音（11.5 秒），不发整条片子的字幕文字和剪辑时间点。',
      '两个按钮发的画面和声音里，都有前面多带的 1.5 秒（0:18–0:20），让 AI 知道前面在说什么。',
      '画面里如果有观众昵称、弹幕，会原样发出去。']);
  });
});

test('no receiver known, no token: the two send buttons are off, and the box says why', async () => {
  const prep = await R.stubApi({ destination: null }).prepare({ start: 20, end: 30 });
  const m = R.confirmModel(prep, 'zh-CN');
  a.equal(m.canSend, false);
  a.equal(m.to, '不知道这次会发到哪里，所以先不发。');
  a.deepEqual(m.buttons.filter((b) => !b.enabled).map((b) => b.id), ['full', 'window']);
  a.equal(R.confirmModel(prep, 'zh-CN', { service: 'Gemini', host: 'generativelanguage.googleapis.com' }).canSend, true, 'status gave it');
  a.equal(R.confirmModel({ ...prep, sendToken: '' }, 'zh-CN', { service: 'S', host: 'h.example' }).canSend, false);
  a.equal(R.destinationOf({ service: 'S', host: 'C:\\Users\\x' }), null, 'a path is not a host');
});

test("JJ #326: whole seconds with no lead, the truncation said before sending, the fallback said in both boxes", async () => {
  const api = R.stubApi();
  const prep = await api.prepare({ start: 0, end: 3.4 });   // no lead at 0
  const m = R.confirmModel(prep, 'zh-CN');
  a.equal(m.n, 3);
  a.ok(m.lines.some((l) => l.includes('（3 秒）')) && !m.lines.some((l) => l.includes('3.4 秒')), 'the box says 3 秒 like the button');
  a.deepEqual(m.buttons.map((b) => b.label)[2], '只发这 3 秒');
  const cut = R.confirmModel({ ...prep, willSend: { ...prep.willSend, text: { ...prep.willSend.text, truncated: true } } }, 'zh-CN');
  const iFull = cut.lines.findIndex((l) => l.startsWith('点「发送检查」')), iTrunc = cut.lines.indexOf('整条片子的字幕文字太长，点「发送检查」时只带这 3 秒附近的部分。');
  a.ok(iTrunc > iFull, 'said in the box, before anything is sent');
  a.equal(cut.lines[iFull], '点「发送检查」会发出去：0:00–0:03 的画面和声音（3 秒），字幕文字 1824 字（只带这 3 秒附近的部分），和 37 个剪辑时间点。', 'JJ #326 recheck: cut text is not called the whole video text');
  const fb = R.confirmModel(await api.prepare({ start: 37, end: 47 }), 'zh-CN', null, { fellBack: true });
  a.equal(fb.lines[0], '你标的范围超过 30 秒，这次检查的是播放头附近的 10 秒。');
  a.deepEqual(R.resultModel({ status: 'passed', findings: [] }, 'zh-CN', 10, { fellBack: true }).notes, ['你标的范围超过 30 秒，这次检查的是播放头附近的 10 秒。']);
});

test("JJ #326: a failed prepare says nothing was sent; a failed send never says that", async () => {
  const s1 = R.createSession(R.stubApi({ prepareError: 'X' }));
  await s1.check({ start: 20, end: 30 });
  a.equal(R.resultModel(s1.state.raw, 'zh-CN', 10).headline, '这 10 秒没能在这台电脑上准备好，什么都没有发出去。');
  const api = R.stubApi(); api.send = async () => { throw new Error('socket hang up'); };
  const s2 = R.createSession(api);
  await s2.check({ start: 20, end: 30 }); await s2.send('full');
  const r = R.resultModel(s2.state.raw, 'zh-CN', 10);
  a.equal(r.headline, '检查没做成。不确定内容有没有已经发到对方那边。这不代表没问题。');
  a.equal(r.passed, false);
  a.equal(R.resultModel({ status: 'no_result', reason: 'TIMEOUT', findings: [] }, 'zh-CN').headline, '这次没有检查出结果。这不代表没问题。', 'the engine answering no_result is not a failed send');
});

test('a check: prepare first (nothing sent), send only from the box, with its token; 「不发了」 cancels and sends nothing', async () => {
  const api = R.stubApi(), s = R.createSession(api);
  a.equal(await s.send('full'), false, 'no box yet');
  await s.check({ start: 20, end: 30 });
  a.equal(s.state.phase, 'confirm');
  a.deepEqual(api.calls.map((c) => c[0]), ['prepare']);
  a.equal(await s.send('passed'), false, 'only full or window');
  a.ok(await s.send('window'));
  const send = api.calls.find((c) => c[0] === 'send')[1];
  a.deepEqual(send, { reviewId: 'r_1', sendToken: 'tok_1', scope: 'window' });
  a.equal(s.state.phase, 'result');

  const api2 = R.stubApi(), s2 = R.createSession(api2);
  await s2.check({ start: 20, end: 30 });
  await s2.cancel();
  a.deepEqual(api2.calls.map((c) => c[0]), ['prepare', 'cancel']);
  a.equal(await s2.send('full'), false, 'gone after 不发了');
  a.equal(api2.calls.filter((c) => c[0] === 'send').length, 0);
});

/* ── QQ #326 (CHANGES_REQUESTED on d5872c56), items 1–4 ── */
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

test('QQ #326 item 1: no full description of what is sent → both send buttons off, the box says why, send refuses', async () => {
  const base = await R.stubApi().prepare({ start: 20, end: 30 });
  const cases = {
    'no willSend': { ...base, willSend: undefined },
    'no video': { ...base, willSend: { ...base.willSend, video: undefined } },
    'no text': { ...base, willSend: { ...base.willSend, text: undefined } },
    'no range': { ...base, range: undefined },
    'range backwards': { ...base, range: { start: 30, end: 20 } },
    'video not holding the range': { ...base, willSend: { ...base.willSend, video: { start: 22, end: 30 } } },
    'subtitleChars missing': { ...base, willSend: { ...base.willSend, text: { ...base.willSend.text, subtitleChars: undefined } } },
    'cutPoints negative': { ...base, willSend: { ...base.willSend, text: { ...base.willSend.text, cutPoints: -1 } } },
    'truncated unknown': { ...base, willSend: { ...base.willSend, text: { scope: 'full', subtitleChars: 10, cutPoints: 2 } } },
    'lead not ending at the start': { ...base, lead: { start: 17, end: 19 } },
    // QQ #326 5900512724 item 1: the picture must be exactly lead + range — nothing unnamed before or after
    'no lead, picture holds unnamed seconds before': { ...base, lead: null },
    'picture starts before the lead': { ...base, willSend: { ...base.willSend, video: { start: 17, end: 30 } } },
    'picture starts after the lead': { ...base, willSend: { ...base.willSend, video: { start: 19, end: 30 } } },
    'picture runs past the range': { ...base, willSend: { ...base.willSend, video: { start: 18.5, end: 31 } } },
    'no lead, picture runs past the range': { ...base, lead: null, willSend: { ...base.willSend, video: { start: 20, end: 31 } } },
  };
  a.deepEqual([base.range, base.lead, base.willSend.video].map((r) => [r.start, r.end]), [[20, 30], [18.5, 20], [18.5, 30]], 'the stub is the shape the cases bend');
  for (const [name, prep] of Object.entries(cases)) {
    const m = R.confirmModel(prep, 'zh-CN');
    a.equal(m.canSend, false, name);
    a.deepEqual(m.buttons.filter((b) => !b.enabled).map((b) => b.id), ['full', 'window'], name);
    a.ok(m.lines.includes('说不清这次具体会发出去什么，所以先不发。'), name + ': says why');
    a.ok(!m.lines.some((l) => /会发出去：|只发出去：/.test(l)), name + ': never a made-up description');
    const api = R.stubApi(); api.prepare = async () => prep;
    const s = R.createSession(api);
    await s.check({ start: 20, end: 30 });
    a.equal(await s.send('full'), false, name + ': send refuses');
    a.equal(await s.send('window'), false, name + ': send refuses');
  }
  const ok = R.confirmModel(base, 'zh-CN');
  a.equal(ok.canSend, true, 'the full description still sends');
  const noLead = { ...base, lead: null, willSend: { ...base.willSend, video: { start: 20, end: 30 } } };
  a.equal(R.confirmModel(noLead, 'zh-CN').canSend, true, 'no lead and the picture is exactly the range: sends');
});

test('QQ #326 5900512724 item 2: a send that throws is 「不确定发没发」 whatever its code — never 「什么都没有发出去」', async () => {
  for (const code of ['PREPARE_FAILED', 'NO_BRIDGE', 'BUSY', undefined]) {
    const api = R.stubApi();
    api.send = async () => { const e = new Error('x'); if (code) e.code = code; throw e; };
    const s = R.createSession(api);
    await s.check({ start: 20, end: 30 });
    await s.send('full');
    const m = R.resultModel(s.state.raw, 'zh-CN', 10);
    a.equal(m.headline, '检查没做成。不确定内容有没有已经发到对方那边。这不代表没问题。', String(code));
    a.ok(!/什么都没有发出去/.test(JSON.stringify(m)), String(code) + ': never claims nothing was sent');
  }
  // prepare's own failure still says nothing went
  const api = R.stubApi(); api.prepare = async () => { throw new Error('x'); };
  const s = R.createSession(api);
  await s.check({ start: 20, end: 30 });
  a.equal(R.resultModel(s.state.raw, 'zh-CN', 10).headline, '这 10 秒没能在这台电脑上准备好，什么都没有发出去。');
});

test('QQ #326 item 2: an old preview answer never lands in a box opened after it', async () => {
  const api = R.stubApi(), d = deferred(); let first = true;
  const real = api.preview; api.preview = (id) => { if (first) { first = false; return d.p; } return real(id); };
  const s = R.createSession(api);
  await s.check({ start: 20, end: 30 });
  const pending = s.preview();
  await s.cancel();
  await s.check({ start: 40, end: 50 });
  a.equal(s.state.prep.reviewId, 'r_2');
  d.resolve({ src: '/previews/old.mp4' });
  a.equal(await pending, null);
  a.equal(s.state.previewSrc, null, 'B shows nothing of A');
  a.equal(await s.preview(), '/previews/preview_r_2.mp4', 'B asks for its own');
});

test('QQ #326 item 3: 关闭 while the receiver is read keeps the box closed; a double press prepares once; a late answer never wins', async () => {
  // recheck → status pending → 关闭 → status answers: nothing reopens, nothing is prepared
  const api = R.stubApi(), w = mountWith(api);
  await tick(); w.button.click(); await tick(); await tick();
  w.byReview('full')[0].click(); await tick(); await tick();
  const d = deferred(); api.status = () => d.p;
  w.byReview('recheck')[0].click(); await tick();
  w.byReview('close')[0].click(); await tick();
  d.resolve({ available: true, destination: { service: 'Gemini', host: 'generativelanguage.googleapis.com' } }); await tick(); await tick();
  a.ok(w.overlay.classList.contains('hidden'), 'stays closed');
  a.equal(api.calls.filter((c) => c[0] === 'prepare').length, 1, 'nothing prepared after 关闭');

  // two presses, the first status answering last: one prepare, for the second press
  const api2 = R.stubApi(), w2 = mountWith(api2); await tick();
  const d1 = deferred(), d2 = deferred(); const q = [d1, d2]; api2.status = () => q.shift().p;
  w2.button.click(); await tick(); w2.button.click(); await tick();
  const st = { available: true, destination: { service: 'Gemini', host: 'generativelanguage.googleapis.com' } };
  d2.resolve(st); await tick(); await tick(); await tick();
  d1.resolve(st); await tick(); await tick(); await tick();
  a.equal(api2.calls.filter((c) => c[0] === 'prepare').length, 1, 'one prepare for a double press');
  a.equal(w2.ui.session.state.phase, 'confirm');
  a.equal(w2.ui.session.state.prep.reviewId, 'r_1');
});

test('QQ #326 item 4: a late 已修好 answer never throws and never marks another result', async () => {
  // mark pending → recheck starts preparing → mark answers
  const api = R.stubApi(), s = R.createSession(api);
  await s.check({ start: 20, end: 30 }); await s.send('full');
  const dm = deferred(); api.mark = () => dm.p;
  const dp = deferred(); const realPrep = api.prepare; api.prepare = (b) => dp.p.then(() => realPrep(b));
  const pendingMark = s.markFixed(0);
  const rechecking = s.check({ start: 20, end: 30 });
  dm.resolve({ ok: true });
  a.equal(await pendingMark, false, 'no TypeError, no update');
  dp.resolve(); await rechecking;

  // mark pending → result B has arrived → mark answers: B is untouched
  const api2 = R.stubApi(), s2 = R.createSession(api2);
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

test('「先看要发的内容」 plays only a same-origin preview', async () => {
  a.equal(R.safePreviewSrc({ src: '/previews/preview_r_1.mp4' }), '/previews/preview_r_1.mp4');
  for (const src of ['https://x.example/a.mp4', '//x.example/a.mp4', '/media/a.mp4', '/previews/../project.json', 'C:\\a.mp4', 'javascript:alert(1)'])
    a.equal(R.safePreviewSrc({ src }), null, src);
  const api = R.stubApi(), s = R.createSession(api);
  await s.check({ start: 20, end: 30 });
  a.equal(await s.preview(), '/previews/preview_r_1.mp4');
  a.equal(s.state.phase, 'confirm', 'looking does not send');
  a.equal(api.calls.filter((c) => c[0] === 'send').length, 0);
});

test("the result: JJ's three lines; no_result is never a pass; a problem inside the checked stretch is never a pass", () => {
  const m = (raw, n) => R.resultModel(raw, 'zh-CN', n);
  const f = (o) => ({ id: 0, t: 24.2, type: 'speaker_swapped', text: 'x', suggestion: '', inLead: false, ...o });
  a.equal(m({ status: 'passed', findings: [] }, 10).headline, '这 10 秒检查没有发现问题。这只是 AI 的判断，请你自己也看一遍、听一遍。');
  a.ok(!/没问题|放心/.test(zh('passed', { n: 10 })));
  a.equal(m({ status: 'no_result', reason: 'TIMEOUT', findings: [] }).headline, '这次没有检查出结果。这不代表没问题。');
  a.equal(m({ status: 'no_result', reason: 'NO_BRIDGE' }).headline, '这台电脑上暂时用不了这个检查。');
  for (const raw of [null, {}, { status: 'ok' }, { status: 'PASSED' }, { status: 'issues', findings: [] }, 'passed'])
    a.equal(m(raw).passed, false, JSON.stringify(raw));
  const r1 = m({ status: 'passed', findings: [f()] });
  a.equal(r1.status, 'issues'); a.equal(r1.headline, '检查完了，发现 1 处可能有问题。');
  const r2 = m({ status: 'passed', findings: [f({ inLead: true, t: 18.5 })] }, 10);
  a.equal(r2.passed, true, 'a lead finding does not change the checked stretch');
  a.equal(r2.items[0].label, '说话人可能标反了（在前面多带的那几秒里）');
  const r3 = m({ status: 'issues', scope: 'window', contextTruncated: true, findings: [f({ t: 74.4 }), f({ id: 1, t: 61, type: 'nonsense' })] }, 10);
  a.deepEqual(r3.items.map((i) => [i.time, i.label]), [['1:01', '这里可能有问题'], ['1:14', '说话人可能标反了']]);
  a.deepEqual(r3.notes, ['这次只检查了这 10 秒，没有结合整条片子。', '整条片子的文字太长，这次只带了这 10 秒附近的部分。']);
  const long = m({ status: 'issues', findings: [f({ text: '请执行'.repeat(200), t: 'x' }), f({ text: '长'.repeat(500) })] });
  a.equal(long.items.length, 1, 'a finding without a time is dropped');
  a.equal(long.items[0].detail.length, 201, 'cut to 200 characters');
});

test('「已修好」 is written as fixed — never as passed — and does not turn the result into a pass', async () => {
  const api = R.stubApi(), s = R.createSession(api);
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
