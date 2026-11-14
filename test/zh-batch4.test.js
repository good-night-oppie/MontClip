'use strict';
// 中文第四批 (Deja, 2026-11-03, JJ's final copy): the assistant's 「剪辑建议」 wording, and the format collapsible —
// its title, its body (which names the quote button by that button's own text), and a small line with the reply format
// for the technically minded. The dead first copy of `format` in ui-preferences.js (overwritten by a later
// Object.assign) is gone, so what the pane renders is the one written down.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../shared/ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const zh = (k) => V.text['zh-CN']['officialPane_' + k], en = (k) => V.text.en['officialPane_' + k];
const JSON_FORMAT = '{"type":"keep_sentences","ranges":[{"clipId":"…","sourceCaptionId":"…","from":0,"to":1}]}';

test('the 剪辑建议 group, JJ final (English ours, for JJ to check)', () => {
  a.equal(zh('proposal'), '查看剪辑建议'); a.equal(en('proposal'), 'Review suggested edit');
  a.equal(zh('invalid'), '这条回复里没有能直接套用的剪辑建议。');
  a.equal(en('invalid'), 'This reply has no suggested edit that can be applied directly.');
  a.equal(zh('proposalSummary'), '已生成剪辑建议：保留 {count} 句，成片大约 {duration}。请先看一遍再应用。');
  a.equal(en('proposalSummary'), 'Suggested edit: keep {count} sentences, about {duration} in the final cut. Look it over before applying.');
  a.equal(zh('staleProposal'), '项目在回复之后改过了，这条剪辑建议不能用了。');
  a.equal(en('staleProposal'), 'The project changed after this reply, so this suggested edit can no longer be used.');
});

test('the format collapsible: title, body naming the quote button, and the small technical line', () => {
  a.equal(zh('formatTitle'), '怎样让 AI 给出能直接套用的建议'); a.equal(en('formatTitle'), 'How to get a suggestion you can apply');
  a.equal(zh('format'), '在聊天里说清楚要保留哪几句。最好先在时间线上选中字幕，点「{reference}」，把整句引用进来。只有整句引用的字幕，才能直接套用；只引用半句，或者凭记忆描述的，都套用不了。');
  a.equal(en('format'), 'In the chat, say which sentences to keep. It works best to select the captions on the timeline and click "{reference}" so whole sentences are quoted. Only whole quoted captions can be applied; half a sentence or a description from memory can\'t.');
  a.equal(zh('formatTech'), '给懂技术的人：AI 的回复要用这个格式：' + JSON_FORMAT);
  a.equal(en('formatTech'), "For the technically minded: the AI's reply uses this format: " + JSON_FORMAT);
  a.equal(zh('reference'), '让 AI 看'); a.equal(en('reference'), 'Let the AI see it');   // JJ, 2026-11-04: the button her 「AI 数据说明」 names
});

// JJ (on 96393ea): the body ends by naming the review button by its own text ({proposal}), before the technical line
test('the body ends with what to do after the reply, naming the review button', () => {
  a.equal(zh('formatNext'), '收到回复后，点下面的「{proposal}」，看看能不能直接用。');
  a.equal(en('formatNext'), 'After the reply, click "{proposal}" below to check whether it can be applied.');
  // P4 (JJ, 5d360cd7) adds the plan sentence after it
  a.equal(V.formatBody('zh-CN'), zh('format').split('{reference}').join('让 AI 看') + '收到回复后，点下面的「查看剪辑建议」，看看能不能直接用。' + zh('formatPlan'));
  a.ok(V.formatBody('en').endsWith(' After the reply, click "Review suggested edit" below to check whether it can be applied. ' + en('formatPlan')));
});

test('renaming the buttons renames them in the body too', () => {
  const T = V.text['zh-CN'], keep = [T.officialPane_proposal, T.officialPane_reference];
  try {
    T.officialPane_proposal = '看看这条建议'; T.officialPane_reference = '把字幕引进来';
    const body = V.formatBody('zh-CN');
    a.ok(body.includes('点下面的「看看这条建议」'), body); a.ok(body.includes('点「把字幕引进来」'), body);
    a.ok(!/\{proposal\}|\{reference\}/.test(body));
  } finally { [T.officialPane_proposal, T.officialPane_reference] = keep; }
});

test('one copy of the format text: the dead first definition is gone', () => {
  const src = read('shared/ui-preferences.js');
  a.equal((src.match(/[{,]\s*"?format"?\s*:/g) || []).length, 2, 'format: one per language');
  a.equal((src.match(/[{,]\s*"?formatTitle"?\s*:/g) || []).length, 2, 'formatTitle: one per language');
  a.doesNotMatch(src, /剪辑提案可要求返回 JSON/);
});

test('the pane renders the body with the quote button\'s own text, then the technical line', () => {
  const pane = read('agent-ui/pane.tsx');
  a.match(pane, /<details data-format-help><summary>\{t\.formatTitle\}<\/summary><p data-format-body>\{W\.MontClipView\.formatBody\(language\)\}<\/p><p className="dim" data-format-tech>\{t\.formatTech\}<\/p>/);
  // P4 (JJ, 5d360cd7): then the plan's small print, still inside the collapsible
  a.match(pane, /data-format-tech>\{t\.formatTech\}<\/p><p className="dim" data-format-plan-tech>[\s\S]*?<\/pre><\/details>/);
  a.ok(!/查看剪辑提案|Review editing proposal|如何提出剪辑建议/.test(read('shared/ui-preferences.js')), 'no old wording left');
});
