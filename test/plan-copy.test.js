'use strict';
// JJ's final words (Deja, 2026-11-04) for two lines of the plan list (#84): the help's last sentence, and the plan summary's
// English by the number of steps — through the interface's plural forms (MontClipView.tp, Intl.PluralRules: _one / _other),
// never a string put together in code.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const View = require('../ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the help ends with JJ\'s sentence about the mode', () => {
  a.ok(View.text['zh-CN'].officialPane_formatPlan.endsWith('再点「开始」。每一步怎么做，还是看你选的模式。'));
  a.ok(View.text.en.officialPane_formatPlan.endsWith('then click "Start". Each step still follows the mode you chose.'));
  for (const l of ['zh-CN', 'en']) a.ok(View.formatBody(l).endsWith(View.text[l].officialPane_formatPlan), l + ': in the help');
});

test('the plan summary: 1 step and several, in English; Chinese has one form', () => {
  const s = (l, n) => View.tp(l, 'officialPane_planSummary', { count: n }, { count: n });
  a.equal(s('en', 1), 'Made a plan of 1 step. See the list below.');
  a.equal(s('en', 3), 'Made a plan of 3 steps. See the list below.');
  a.equal(s('en', 30), 'Made a plan of 30 steps. See the list below.');
  a.equal(s('zh-CN', 1), '已排好计划，共 1 步，见下面的清单。');
  a.equal(s('zh-CN', 3), '已排好计划，共 3 步，见下面的清单。');
});

test('tp: the plural form for each count, in order; a language without it uses its one form, then English', () => {
  View.text.en.__t_x_one = 'one'; View.text.en.__t_x_other = 'other'; View.text['zh-CN'].__t_x = '一种';
  View.text.en.__t_y_one_other = '1 and many'; View.text.en.__t_y = 'fallback';
  try {
    a.equal(View.tp('en', '__t_x', { n: 1 }), 'one');
    a.equal(View.tp('en', '__t_x', { n: 2 }), 'other');
    a.equal(View.tp('en', '__t_x', { n: 0 }), 'other');
    a.equal(View.tp('zh-CN', '__t_x', { n: 1 }), '一种', 'Chinese: its own one form, not the English plural');
    a.equal(View.tp('en', '__t_y', { n: 1, m: 5 }), '1 and many');
    a.equal(View.tp('en', '__t_y', { n: 2, m: 5 }), 'fallback');
    a.equal(View.tp('zh-CN', '__t_y', { n: 1, m: 5 }), '1 and many', 'no Chinese at all: English, by its forms');
  } finally { for (const k of ['__t_x_one', '__t_x_other', '__t_y_one_other', '__t_y']) delete View.text.en[k]; delete View.text['zh-CN'].__t_x; }
});

test('the pane asks for the summary through tp, not by replacing {count} itself', () => {
  const pane = read('agent-ui/pane.tsx');
  a.match(pane, /W\.MontClipView\.tp\(language,'officialPane_planSummary',\{count:plan\.steps\.length\},\{count:plan\.steps\.length\}\)/);
  a.doesNotMatch(pane, /t\.planSummary\.replace/);
  a.match(read('app/cindy-official.js'), /officialPane_planSummary/, 'the bundle was rebuilt');
});

test('the approval card: its first line is what the step changes (stepDetail), the plain sentence second (VV on #84; v7.2; step 3)', () => {
  const app = read('app/app.js'), Approval = require('../app/agent-approval');
  // both callers give it, from MontClipPlan.stepDetail in the interface language, with the reply it is about
  a.ok(app.includes("askAgentApproval(d,{result,summary:agentProposalText(result),detail:MontClipPlan.stepDetail({capability:response.type,args:response},mcView.get().language)})"));
  a.ok(app.includes("askAgentApproval(d,{result,summary:uiText('own.pl-step-of',{n:s.index+1,total:entry.run.list().length}),detail:MontClipPlan.stepDetail(s,mcView.get().language)})"));
  const Plan = require('../app/agent-plan'), s = { capability: 'keep_ranges', args: { output_mode: 'one_file', ranges: [{ clipId: 'v1', from: 0, to: 115 }] } };
  a.equal(Plan.stepDetail(s, 'zh-CN'), '保留 0:00–1:55');
  a.equal(Plan.stepDetail(s, 'en'), 'Keep 0:00–1:55');
  // the card: the detail first, the capability's sentence second; without a detail, the sentence first
  for (const lang of ['zh-CN', 'en']) {
    const say = (k, v) => View.t(lang, k, v), cards = Approval.create(), result = {};
    void cards.ask({ ticket: 't', label: 'L', risk: 'project', choices: ['once', 'session', 'deny'] }, { result, detail: Plan.stepDetail(s, lang) });
    const [c] = cards.view(result, say, 'P');
    a.equal(c.first, Plan.stepDetail(s, lang)); a.equal(c.second, 'L');
  }
  const plain = Approval.create(), r2 = {};
  void plain.ask({ ticket: 't', label: 'L', risk: 'project', choices: ['once', 'deny'] }, { result: r2 });
  a.equal(plain.view(r2, (k) => k)[0].first, 'L'); a.equal(plain.view(r2, (k) => k)[0].second, '');
  // 15 px and small, in the card itself
  const card = read('agent-ui/HostCard.tsx');
  a.match(card, /className="text-\[15px\][^"]*"[^>]*data-host-card-first/);
  a.match(card, /className="mt-1 text-12 [^"]*"[^>]*data-host-card-second/);
});

test('the four modes, in JJ\'s final words from the frozen prototype c604fd65 (MODES), full stops included (Deja, 2026-11-04)', () => {
  const T = (l, k) => View.text[l]['officialPane_' + k];
  a.equal(T('zh-CN', 'modePlanTip'), '只出计划，不改项目。');
  a.equal(T('zh-CN', 'modeManualTip'), '改项目前先问你；撤不回的每次都问。默认是这个。');
  a.equal(T('zh-CN', 'modeAutoTip'), '能撤销的直接做，撤不回的先问你。');
  a.equal(T('zh-CN', 'modeYoloTip'), '每一步都直接做，不问你；往外发的内容照样先给你看。打开前会再确认一次。');
  a.equal(T('en', 'modePlanTip'), 'Only plans; changes nothing.');
  a.equal(T('en', 'modeManualTip'), "Asks before changing the project; asks every time for anything that can't be undone. This is the default.");
  a.equal(T('en', 'modeAutoTip'), "Does what can be undone; asks before what can't.");
  a.equal(T('en', 'modeYoloTip'), "Does every step without asking you; anything sent out is still shown to you first. You'll be asked once more before it turns on.");
  // the Yolo bar is another sentence, as it was
  a.equal(T('zh-CN', 'yoloOn'), '全自动开着：AI 每一步都直接做，不问你；往外发的内容照样先给你看。');
  a.equal(T('en', 'yoloOn'), 'Full auto is on: the AI does every step without asking you; anything sent out is still shown to you first.');
});
