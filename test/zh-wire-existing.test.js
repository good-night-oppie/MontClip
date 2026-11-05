'use strict';
/* Test first (red on ea06ff37), then implementation. Rea's second scan of the zh-CN interface
   (2026-11-05 第二批程序扫描初稿, sha256 513725212760b38343433409888d2fa88bf19672e90e2ee1b139e8c3e473ad45) lists 63 strings
   whose Chinese already exists in ui-terms.js / ui-preferences.js but which the page still shows in English (「已有中文」).
   This file locks the help layer's part of them (41 left-column cells and headings) by replaying the page markup the way
   applyI18n does (test/zh-shown.js), in both languages, and the two display helpers the rest uses. The parts built in
   app.js are rendered for real in desktop/zh-batch6-smoke.cjs. No Chinese is written or changed here: each expected
   string is the existing term, checked against Rea's table. */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const view = require('../ui-preferences');
const Z = require('./zh-shown');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const help = html.slice(html.indexOf('id="helpKeys"'), html.indexOf('id="helpEmpty"'));

// [Rea #, where (the row's own.help-N key, or "h3:" + the heading's English), term key, Rea's English, Rea's Chinese]
const HELP = [
  [2, 'own.help-8', 'term.limit-toolbar', 'Limit (toolbar)', '上限（工具栏）'],
  [3, 'own.help-9', 'term.dbl-click-bin-clip', 'Dbl-click bin / clip', '双击素材库 / 片段'],
  [5, 'own.help-23', 'term.drag-empty-area', 'Drag empty area', '拖动空白区域'],
  [7, 'own.help-26', 'term.right-click-clip', 'Right-click clip', '右键片段'],
  [8, 'own.help-34', 'term.marker-on-ruler', 'Marker on ruler', '标尺上的标记'],
  [10, 'own.help-41', 'term.click-track-name', 'Click track name', '点击轨道名称'],
  [11, 'own.help-42', 'term.track', 'Track', '轨道'],
  [12, 'own.help-43', 'term.track-padlock', 'Track padlock', '轨道锁'],
  [13, 'own.help-44', 'term.right-click-track', 'Right-click track', '右键轨道'],
  [16, 'own.help-48', 'term.motion-presets', 'Motion → Presets', '运动 → 预设'],
  [17, 'own.help-49', 'term.volume-line', 'Volume line', '音量线'],
  [19, 'own.help-52', 'term.right-click', 'Right-click', '右键'],
  [21, 'own.help-53', 'term.bin-search', 'Bin search', '搜索素材库'],
  [22, 'own.help-54', 'term.right-click-a-bin-file', 'Right-click a bin file', '右键素材库文件'],
  [22, 'own.help-58', 'term.right-click-a-bin-file', 'Right-click a bin file', '右键素材库文件'],
  [25, 'own.help-57', 'term.right-click-a-clip', 'Right-click a clip', '右键片段'],
  [26, 'own.help-59', 'term.right-click-a-bin-video', 'Right-click a bin video', '右键素材库视频'],
  [27, 'own.help-60', 'term.comp-clip-bin-comp', 'Comp clip / bin comp', '复合片段 / 素材库复合片段'],
  [28, 'own.help-61', 'term.right-click-clips', 'Right-click clips', '右键多个片段'],
  [29, 'own.help-62', 'term.inside-a-comp', 'inside a comp', '位于复合片段内'],
  [30, 'h3:Projects', 'term.projects', 'Projects', '项目'],
  [32, 'own.help-66', 'term.project-2', 'Project →', '项目 →'],
  [33, 'own.help-67', 'term.timeline-toolbar', 'Timeline toolbar →', '时间线工具栏 →'],
  [37, 'own.help-71', 'term.archived-2', '(Archived)', '（已归档）'],
  [38, 'own.help-72', 'term.colour-wheel', 'Colour wheel', '色轮'],
  [39, 'own.help-73', 'term.wb-pick-pick', 'WB pick / Pick', '白平衡取样 / 取样'],
  [40, 'own.help-74', 'term.curves', 'Curves', '曲线'],
  [41, 'own.help-75', 'term.layer-mask-on-monitor', 'Layer mask on monitor', '监视器上的图层蒙版'],
  [42, 'h3:Masks', 'term.masks', 'Masks', '蒙版'],
  [43, 'own.help-76', 'term.pen', 'Pen', '钢笔'],
  [44, 'own.help-77', 'term.draw', 'Draw', '绘制'],
  [45, 'own.help-78', 'term.mask-on-monitor', 'Mask on monitor', '监视器上的蒙版'],
  [46, 'h3:Shapes and transforms', 'term.shapes-and-transforms', 'Shapes and transforms', '形状与画面'],
  [48, 'own.help-79', 'term.shape-item-on-monitor', 'Shape item on monitor', '监视器上的形状对象'],
  [49, 'own.help-80', 'term.shape-text-path-pen', 'Shape / text-path pen', '形状 / 文字路径钢笔'],
  [50, 'own.help-81', 'term.motion-path', 'Motion path', '运动路径'],
  [51, 'own.help-82', 'term.anchor-move', 'Anchor ✥ Move', '锚点 ✥ 移动'],
  [52, 'h3:Tracking', 'term.tracking', 'Tracking', '跟踪'],
  [54, 'own.help-83', 'term.track-point', 'Track point', '轨道点'],
  [55, 'h3:Transcript', 'term.transcript', 'Transcript', '文稿'],
  [57, 'own.help-86', 'term.find-words', 'Find words', '查找词'],
  [58, 'own.help-87', 'term.captions', 'Captions', '字幕'],
];

/** The markup of the help layer's left cell (the row whose right cell is `rowKey`), or of a heading. */
function spot(where) {
  if (where.startsWith('h3:')) {
    const name = where.slice(3);
    const m = help.match(new RegExp(`<h3(?:\\s[^>]*)?>\\s*(?:<span[^>]*>)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:</span>)?\\s*(?:<span[\\s\\S]*?</span>)?\\s*</h3>`));
    a.ok(m, where + ' found');
    return m[0].replace(/<span[\s\S]*?<\/span>/g, ''); // the heading itself, not the note beside it
  }
  const m = help.match(new RegExp(`<tr>(<td(?:\\s[^>]*)?>[\\s\\S]*?</td>)<td data-i18n-html="${where}"`));
  a.ok(m, where + ' found');
  return m[1];
}
/** What the page shows of a piece of markup in a language (applyI18n replayed). */
const shown = (markup, language) => Z.shown(markup, language).map((x) => x.text).join(' ');

test('Rea\'s 41 help entries: the Chinese is the existing term, unchanged', () => {
  a.equal(new Set(HELP.map((h) => h[0])).size, 41, '41 distinct entries (Right-click a bin file shows twice)');
  for (const [n, , key, en, zh] of HELP) {
    a.equal(view.t('zh-CN', key), zh, `#${n} ${key} zh`);
    a.equal(view.t('en', key), en, `#${n} ${key} en`);
  }
});

test('the help layer shows those 41 in Chinese, left column and headings included', () => {
  for (const [n, where, key, en, zh] of HELP) {
    const m = spot(where), cn = shown(m, 'zh-CN'), eng = shown(m, 'en');
    a.ok(cn.includes(zh), `#${n} ${where}: zh shows ${JSON.stringify(zh)}, got ${JSON.stringify(cn)}`);
    a.ok(!cn.includes(en), `#${n} ${where}: no ${JSON.stringify(en)} left in zh, got ${JSON.stringify(cn)}`);
    a.ok(eng.includes(en), `#${n} ${where}: en still shows ${JSON.stringify(en)}, got ${JSON.stringify(eng)}`);
  }
});

test('englishShown() now looks at the help layer\'s first column and its headings', () => {
  const left = Z.englishShown();
  // a left cell Rea marked 新写 (not in this batch) is reported: proof the first column is checked
  a.ok(Object.entries(left).some(([k, w]) => k.startsWith('help:') && k.includes('☰ in the bin') && /\bbin\b/.test(w)),
    'help "☰ in the bin" is reported: ' + JSON.stringify(Object.keys(left).filter((k) => k.startsWith('help')).slice(0, 8)));
  // so is a heading still in English (Editing, 新写)
  a.ok(Object.entries(left).some(([k, w]) => k.startsWith('help-head:') && /Editing/.test(w)), 'the Editing heading is reported');
  // and none of the 41 wired ones is
  const helpLeft = Object.entries(left).filter(([k]) => k.startsWith('help'));
  const words = helpLeft.map(([, w]) => w).join(',').split(',');
  for (const [n, , , en] of HELP) for (const w of (en.match(/[A-Za-z]{3,}/g) || [])) {
    if (['Track', 'Project', 'Projects', 'clip', 'bin', 'comp', 'Pick', 'Move', 'path', 'pen', 'Shape', 'click',
      'Shapes', 'Tracking', 'mask', 'Transcript', 'wheel', 'file'].includes(w)) continue; // also in cells Rea marked 新写
    a.ok(!words.includes(w), `#${n}: "${w}" no longer shown in English (${JSON.stringify(helpLeft.filter(([, v]) => v.split(',').includes(w)))})`);
  }
});

test('display names: the stored defaults Main / Title read as 主序列 / 标题 in Chinese, nothing else changes', () => {
  a.equal(typeof view.defaultName, 'function');
  a.equal(view.defaultName('zh-CN', 'Main'), view.t('zh-CN', 'term.main'));
  a.equal(view.defaultName('zh-CN', 'Main'), '主序列');
  a.equal(view.defaultName('zh-CN', 'Title'), '标题');
  a.equal(view.defaultName('en', 'Main'), 'Main');
  a.equal(view.defaultName('en', 'Title'), 'Title');
  for (const own of ['main', 'Main ', 'Main 2', 'My cut', 'title', '主序列', '', 'Title\nsecond line'])
    a.equal(view.defaultName('zh-CN', own), own, JSON.stringify(own) + ' is the user\'s own name');
  a.equal(view.defaultName('zh-CN', null), null);
});

test('export encoders: the Chinese names ui-preferences already has; English keeps delivery.js\'s labels', () => {
  const Delivery = require('../delivery');
  a.equal(typeof view.encoderLabel, 'function');
  a.equal(view.encoderLabel('zh-CN', 'h264_nvenc', Delivery.ENCODERS.h264_nvenc.label), '显卡编码（NVIDIA）');
  a.equal(view.encoderLabel('en', 'h264_nvenc', Delivery.ENCODERS.h264_nvenc.label), 'NVIDIA NVENC');
  for (const [id, e] of Object.entries(Delivery.ENCODERS)) a.equal(view.encoderLabel('en', id, e.label), e.label, id + ' en unchanged');
  // an encoder without a Chinese name keeps its label (hevc_nvenc is not in this batch)
  a.equal(view.encoderLabel('zh-CN', 'hevc_nvenc', Delivery.ENCODERS.hevc_nvenc.label), Delivery.ENCODERS.hevc_nvenc.label);
});
