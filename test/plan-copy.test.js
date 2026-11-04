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
  a.match(read('cindy-official.js'), /officialPane_planSummary/, 'the bundle was rebuilt');
});

test('the approval box: its first line is what the step changes (stepDetail), the plain sentence second (VV on #84; v7.2)', () => {
  const app = read('app.js'), ask = app.slice(app.indexOf('function askAgentApproval('), app.indexOf('\n}\n', app.indexOf('function askAgentApproval(')));
  // first after the title: the detail when there is one; the capability's sentence under it, small
  a.match(ask, /'<form method="dialog"><h3>'\+say\('own\.ap-title'\)\+'<\/h3>'\+\(detail\?'<p class="agent-approval-detail" data-ap-detail><\/p>':''\)\+'<p data-ap-label'\+\(detail\?' class="agent-approval-what"':''\)\+'><\/p>/);
  a.match(ask, /if\(detail\)dialog\.querySelector\('\[data-ap-detail\]'\)\.textContent=detail;/);
  // both callers give it, from MontClipPlan.stepDetail in the interface language
  a.match(app, /askAgentApproval\(d,\{summary:agentProposalText\(result\),detail:MontClipPlan\.stepDetail\(\{capability:response\.type,args:response\},mcView\.get\(\)\.language\)\}\)/);
  a.match(app, /askAgentApproval\(d,\{summary:uiText\('own\.pl-step-of',\{n:s\.index\+1,total:entry\.run\.list\(\)\.length\}\),detail:MontClipPlan\.stepDetail\(s,mcView\.get\(\)\.language\)\}\)/);
  const Plan = require('../agent-plan'), s = { capability: 'keep_ranges', args: { output_mode: 'one_file', ranges: [{ clipId: 'v1', from: 0, to: 115 }] } };
  a.equal(Plan.stepDetail(s, 'zh-CN'), '保留 0:00–1:55');
  a.equal(Plan.stepDetail(s, 'en'), 'Keep 0:00–1:55');
  const css = read('style.css');
  a.match(css, /\.agent-approval-detail \{[^}]*font-size: 15px/);
  a.match(css, /\.agent-approval-what \{[^}]*font-size: 12px/);
});
