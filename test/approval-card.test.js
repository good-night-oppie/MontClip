'use strict';
// 助手面板 step 3 (Deja, 2026-11-04; v7.2 §2 「要你点头的卡」): the host's approval card in the message stream, no longer a box
// over the page. The safety rules stay the same and are locked here: the host draws the card; its buttons answer only the
// ticket the main process issued; nothing in a reply can draw it or approve; the AI's step waits for it; a ticket answers once.
// The page itself: desktop/agent-modes-smoke.cjs, agent-plan-smoke.cjs and agent-narrow-smoke.cjs (630×460 and 1280×820).
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const Approval = require('../agent-approval'), View = require('../ui-preferences'), Host = require('../desktop/agent-policy-host');
const say = (lang) => (k, v) => View.t(lang, k, v);
const decision = (over = {}) => ({ action: 'ask', ticket: 't1', label: '按时间保留几段录像', risk: 'project', choices: ['once', 'session', 'deny'], ...over });
const settled = async (p) => { let v = 'pending'; p.then((x) => { v = x; }); await new Promise((r) => setImmediate(r)); return v; };

test('only the host makes a card, and only from a decision with a ticket', async () => {
  const cards = Approval.create(), result = {};
  for (const d of [null, {}, decision({ ticket: undefined }), decision({ choices: [] }), decision({ choices: 'once' })])
    a.equal(await cards.ask(d, { result }), 'deny', 'no ticket, no card: ' + JSON.stringify(d));
  a.deepEqual(cards.view(result, say('zh-CN')), []);
  a.equal(cards.waiting(), false);
  // the pane draws cards from the host's getApprovals only; the reply is plain text (ThinkingText), never HTML
  const pane = read('agent-ui/pane.tsx'), card = read('agent-ui/HostCard.tsx'), text = read('agent-ui/upstream/ThinkingText.tsx');
  a.equal((pane.match(/<HostCard /g) || []).length, 1);
  a.match(pane, /const approvals=result\?options\.getApprovals\?\.\(result\)\|\|\[\]:\[\]/);
  a.match(pane, /<ThinkingText content=\{shown\.text\}\/>/);
  for (const [name, src] of [['pane.tsx', pane], ['HostCard.tsx', card], ['ThinkingText.tsx', text]]) a.doesNotMatch(src, /dangerouslySetInnerHTML|innerHTML/, name);
  // and the host makes them in one place, from the main process's decision
  const app = read('app.js');
  a.equal((app.match(/agentApprovals\.ask\(/g) || []).length, 1);
  // the last toast goes first (VV, #134), then the card
  a.match(app, /function askAgentApproval\(d,options=\{\}\)\{dismissToast\(\);return agentApprovals\.ask\(d,options\);\}/);
});

test('the buttons answer the waiting card only, once; the answer goes to the main process with its ticket', async () => {
  const cards = Approval.create(), result = {}, p = cards.ask(decision(), { result });
  const [c] = cards.view(result, say('zh-CN'));
  a.equal(cards.answer('approval-x', 'once'), false, 'another id');
  a.equal(await settled(p), 'pending', 'the step waits until a button of this card is clicked');
  a.equal(cards.answer(c.id, 'once'), true);
  a.equal(await p, 'once');
  a.equal(cards.answer(c.id, 'session'), false, 'answered once');
  a.equal(cards.view(result, say('zh-CN'))[0].answered, '✓ 你批准了这一次');
  // a choice the main process did not offer counts as 不同意
  const r2 = {}, q = cards.ask(decision({ choices: ['once', 'deny'] }), { result: r2 });
  cards.answer(cards.view(r2, say('zh-CN'))[0].id, 'session');
  a.equal(await q, 'deny');
  // app.js: each card's answer is sent with its own ticket, nothing else approves
  const app = read('app.js');
  // onAgentReply, agentReframeFlow (#175) and runAgentPlanStep
  a.equal((app.match(/window\.montclipAgentPolicy\.answer\(\{ticket:d\.ticket,choice\}\)/g) || []).length, 3);
  a.match(app, /answerApproval:\(id,choice\)=>agentApprovals\.answer\(id,choice\)/);
  // the main process: a ticket answers once
  const host = Host.createPolicyHost({ confirmYolo: async () => true });
  const d = host.decide({ sessionId: 's', capability: 'keep_ranges', target: { kind: 'project', value: 'p' } });
  a.equal(d.action, 'ask');
  a.equal(host.answer({ ticket: d.ticket, choice: 'once' }).ok, true);
  a.equal(host.answer({ ticket: d.ticket, choice: 'once' }).code, 'TICKET_UNKNOWN');
});

test('the AI waits: nothing after the step runs before its card is answered', () => {
  const app = read('app.js');
  for (const fn of ['async function onAgentReply', 'async function runAgentPlanStep']) {
    const body = app.slice(app.indexOf(fn), app.indexOf('\n}\n', app.indexOf(fn)));
    const ask = body.indexOf('await askAgentApproval('), answer = body.indexOf('await window.montclipAgentPolicy.answer(');
    a.ok(ask > 0 && answer > ask, fn + ': asks, then sends the answer');
    a.ok(body.indexOf('commitRangePlan(') > answer, fn + ': the edit only after the answer');
    a.match(body.slice(answer, answer + 200), /if\(!a\|\|!a\.ok\|\|!a\.run\)/, fn + ': only a run from the main process goes on');
  }
  // nothing can be sent while a card waits
  const pane = read('agent-ui/pane.tsx');
  a.match(pane, /if\(options\.approvalPending\?\.\(\)\)\{setNotice\('approvalWaiting'\);return;\}/);
  a.match(pane, /<SendButton disabled=\{\(!session\.draft\.trim\(\)\|\|waiting\)&&!conversation\.busy\(\)\}/);
});

test('leaving the chat, the project changing, or a newer card while one waits: 不同意', async () => {
  let ctx = 'p1', redraws = 0;
  const cards = Approval.create({ context: () => ctx, onChange: () => { redraws++; } }), r = {};
  const p1 = cards.ask(decision(), { result: r });
  a.equal(cards.waiting(), true);
  a.equal(cards.check(), false, 'same project');
  ctx = 'p2'; a.equal(cards.check(), true); a.equal(await p1, 'deny');
  ctx = 'p1';
  const p2 = cards.ask(decision(), { result: r });
  a.equal(cards.leave(), true); a.equal(await p2, 'deny');
  const p3 = cards.ask(decision(), { result: r }), p4 = cards.ask(decision({ ticket: 't2' }), { result: r });
  a.equal(await p3, 'deny', 'one card waits at a time');
  a.equal(cards.waiting(), true);
  cards.answer(cards.view(r, say('en')).at(-1).id, 'once');
  a.equal(await p4, 'once');
  a.ok(redraws >= 6);
  // the page: only leaving the chat settles the card (QQ/DD on #120: a save-retry or a reference click must not);
  // the project is checked twice a second
  const paneSrc = read('agent-ui/pane.tsx');
  a.match(paneSrc, /const act=\(f:\(\)=>void,leaveChat=false\)=>\{try\{host\.sync\(\);if\(leaveChat\)options\.approvalLeave\?\.\(\);f\(\);/);
  a.match(paneSrc, /act\(\(\)=>state\.newSession\(\),true\)/);
  a.match(paneSrc, /act\(\(\)=>state\.select\(s\.id\),true\)/);
  a.doesNotMatch(paneSrc, /act\(\(\)=>state\.retry\(\),true\)/, 'a save retry does not settle the card');
  a.match(read('app.js'), /setInterval\(\(\)=>\{agentApprovals\.check\(\);mcAgent\.sync\(\);\},500\);/);
});

test('settled by the host, not clicked: the line says what happened, not 「你没有同意」 (QQ/DD on #120)', async () => {
  // the project changed under the waiting card → stale
  let ctx = 'p1';
  const cards = Approval.create({ context: () => ctx }), r = {};
  const p1 = cards.ask(decision(), { result: r });
  ctx = 'p2'; cards.check();
  a.equal(await p1, 'deny', 'the wire answer is still deny');
  a.equal(cards.view(r, say('zh-CN'))[0].answered, '项目改过了，这一步没有做');
  // leaving the chat → left
  const p2 = cards.ask(decision(), { result: r });
  cards.leave();
  a.equal(cards.view(r, say('zh-CN')).slice(-1)[0].answered, '你离开了这个聊天，这一步没有做');
  a.equal(await p2, 'deny');
  // a newer card settles the older one → stale, not 「你没有同意」
  const p3 = cards.ask(decision(), { result: r });
  void cards.ask(decision({ ticket: 't2' }), { result: r });
  a.equal(await p3, 'deny');
  a.equal(cards.view(r, say('zh-CN')).slice(-2)[0].answered, '项目改过了，这一步没有做');
  // and in English
  const en = Approval.create({ context: () => 'x' }), re = {};
  void en.ask(decision(), { result: re }); en.leave();
  a.equal(en.view(re, say('en')).slice(-1)[0].answered, 'You left this chat; this step was not done');
});

test('what the card says: what changes, the sentence under it, the buttons; answered, one line (zh-CN and en, for JJ)', () => {
  const words = {
    'zh-CN': { title: 'AI 想做这一步', once: '只批准这次', session: '这个聊天中都批准', deny: '不同意', done: ['✓ 你批准了这一次', '✓ 这个聊天中你都批准了', '你没有同意，这一步没有做'], waiting: '等你点头' },
    en: { title: 'The AI wants to do this step', once: 'Allow this once', session: 'Allow for this chat', deny: "Don't allow", done: ['✓ You allowed this once', '✓ You allowed this for this chat', "You didn't allow it; this step was not done"], waiting: 'Waiting for your answer' },
  };
  for (const [lang, w] of Object.entries(words)) {
    const cards = Approval.create(), r = {};
    void cards.ask(decision(), { result: r, detail: lang === 'en' ? 'Keep 0:00–1:55' : '保留 0:00–1:55' });
    const [c] = cards.view(r, say(lang));
    a.equal(c.title, w.title); a.equal(c.first, lang === 'en' ? 'Keep 0:00–1:55' : '保留 0:00–1:55'); a.equal(c.second, '按时间保留几段录像');
    a.deepEqual(c.actions.map((x) => x.label), [w.once, w.session, w.deny]);
    a.deepEqual(c.more, []);
    ['once', 'session', 'deny'].forEach((k, i) => a.equal(View.t(lang, 'own.ap-done-' + k), w.done[i]));
    a.equal(View.text[lang].officialPane_approvalWaiting, w.waiting);
  }
  // a step that sends something out: where to, what is sent, and (no 都批准) that it asks every time
  const cards = Approval.create(), r = {};
  void cards.ask(decision({ risk: 'external', target: 'openrouter.ai', choices: ['once', 'deny'] }), { result: r, content: '第 12 句' });
  const [c] = cards.view(r, say('zh-CN'));
  a.deepEqual(c.more, ['发往：openrouter.ai', '这类操作撤不回，所以每次都会问你。']);
  a.equal(c.content, '第 12 句'); a.equal(c.contentLabel, '要发出去的内容：');
});

test('the card: Cindy\'s card shell and buttons; focus lands on the card itself, never an approve button (QQ/DD on #120)', () => {
  const card = read('agent-ui/HostCard.tsx');
  a.match(card, /import \{ InteractionPromptCardShell \} from '\.\/cindy-43001ea\/apps\/desktop\/src\/renderer\/components\/interaction-portal';/);
  a.match(card, /import \{ Button \} from '\.\/cindy-43001ea\/apps\/desktop\/src\/renderer\/components\/ui\/button';/);
  a.match(card, /role="group" aria-labelledby=\{ids \+ 't'\} aria-describedby=\{ids \+ 'f'\}/);
  // the card is scrolled into view; the focus goes to the card (tabIndex=-1), so a stray Space hits no button —
  // and while the user is typing in an editor or input, their focus stays put
  a.match(card, /root\.current\?\.scrollIntoView\(\{ block: 'nearest' \}\);/);
  a.match(card, /tabIndex=\{-1\}/);
  a.match(card, /root\.current\?\.focus\(\{ preventScroll: true \}\);/);
  a.match(card, /el\.tagName === 'INPUT' \|\| el\.tagName === 'TEXTAREA' \|\| el\.isContentEditable/);
  a.equal((card.match(/\.focus\(/g) || []).length, 1, 'the card is the only focus target — no button is focused');
  // Esc on the card is 〔不同意〕 (and does not bubble to the pane's own Esc, which would only hide the panel)
  a.match(card, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); onAction\('deny'\); \}/);
  // outside the conversation's live log, so it is not read out again with every message
  const pane = read('agent-ui/pane.tsx'), log = pane.indexOf('<div role="log" aria-live="polite">'), end = pane.indexOf('</div>\n', log);
  a.ok(pane.indexOf('<HostCard ') > end, 'after the log');
  // the Tailwind classes it uses are generated, inside the parts' scope; MontClip's pane rules leave its paragraphs and buttons alone
  a.match(read('agent-ui/styles.cjs'), /path\.join\(__dirname, 'HostCard\.tsx'\)\]/);
  const css = read('style.css');
  for (const rule of ['#mcAgentContent p:where(:not([data-cindy-parts] *))', '.cindy-port p:where(:not([data-cindy-parts] *))', '.cindy-port button:where(:not([data-cindy-parts] *))', '.cindy-port.compact button:where(:not([data-cindy-parts] *))', '.mc-assistant p:where(:not([data-cindy-parts] *))'])
    a.ok(css.includes(rule), rule);
  // while a card waits, the proposal and reference rows step aside so the card fits the stream whole
  a.ok(css.includes('#mcAgentContent .cindy-port:has([data-host-card="approval"]) > :is(.cindy-proposal-actions, .cindy-ref-actions, .cindy-references) { display: none; }'));
  a.match(read('cindy-official.js'), /data-host-card/, 'the bundle was rebuilt');
  a.ok(read('index.html').indexOf('agent-approval.js') < read('index.html').indexOf('app.js'));
});
