'use strict';
/* Test first (red on #147's head 8eed5ab7), then implementation. JJ's 第 1 批定稿 of Rea's second scan
   (2026-11-05-剩余英文第二批-第1批定稿-JJ.md, sha256 5eb9771d086e2c35134f60be92904c45b68381fc16bfd7529d1b9ff7c659818e, the
   version with Deja's 补定): the help layer's left column, the bin's Show filter and the right-click menus. A string JJ
   changed takes JJ's wording; one not listed takes Rea's draft (51372521). The help layer is replayed the way applyI18n
   does it (test/zh-shown.js), in both languages; the menus are rendered for real in desktop/zh-batch7-smoke.cjs. */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const view = require('../ui-preferences');
const Z = require('./zh-shown');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const help = html.slice(html.indexOf('id="helpKeys"'), html.indexOf('id="helpEmpty"'));
const shown = (markup, language) => Z.shown(markup, language).map((x) => x.text).join(' ');
const leftCell = (rowKey) => {
  const m = help.match(new RegExp(`<tr>(<td(?:\\s[^>]*)?>[\\s\\S]*?</td>)<td data-i18n-html="${rowKey}"`));
  a.ok(m, rowKey); return m[1];
};
const heading = (en) => {
  const m = help.match(new RegExp(`<h3[^>]*>\\s*${en}\\s*(?:<span[\\s\\S]*?</span>)?\\s*</h3>`));
  a.ok(m, en); return m[0];
};

// [Rea #, the row (its right cell's key), English shown, Chinese shown (key caps are left out by the replay)]
const LEFT = [
  [1, 'own.help-7', '– / click timecode', '– / 点击时间码'],
  [6, 'own.help-24', '+click clip', '+点击片段'],
  [9, 'own.help-36', '+wheel', '+滚动滚轮'],              // JJ
  [14, 'own.help-46', '+click inspector label or slider', '+点击属性面板的名称或滑块'],
  [15, 'own.help-47', '+click label', '+点击名称'],
  [18, 'own.help-51', '+click bin', '+点击素材库'],
  [20, 'own.help-52', 'Right-click Project tab', '右键项目标签页'],   // JJ / Deja: 右键〈项目〉标签页
  [20, 'own.help-63', 'Templates tab', '模板标签页'],              // 〈模板〉标签页
  [23, 'own.help-55', '☆ / uses badge on a bin file', '素材上的 ☆ / 用了几次的小标'], // JJ
  [24, 'own.help-56', '☰ in the bin', '素材库里的 ☰'],
  [34, 'own.help-67', 'Timeline toolbar → sequence menu', '时间线工具栏 → 序列菜单'],
  [35, 'own.help-68', 'Project card', '项目卡片'],
  [36, 'own.help-69', 'on a card', '在卡片上'],
];
// [Rea #, heading English, its note: English, Chinese] — and #4, the heading Editing itself
const NOTES = [
  [31, 'Projects', 'top bar → Projects', '顶栏 → 〔项目〕'],
  [47, 'Shapes and transforms', 'bin → Shapes · Inspector', '素材库 → 形状 · 属性面板'],
  [53, 'Tracking', 'Inspector → Tracking · a mask’s Track buttons', '属性面板 → 跟踪 · 蒙版上的〔跟踪〕按钮'],
  [56, 'Transcript', 'side panel → Transcript', '侧边栏 → 文稿'],
];
const squash = (s) => s.replace(/\s+/g, ' ').trim();

test('help layer, left column: Rea\'s drafts, JJ\'s changes, in Chinese; English as before', () => {
  for (const [n, row, en, zh] of LEFT) {
    const m = leftCell(row);
    a.ok(squash(shown(m, 'zh-CN')).replace(/ /g, '').includes(zh.replace(/ /g, '')), `#${n} ${row} zh: ${JSON.stringify(shown(m, 'zh-CN'))}`);
    a.ok(squash(shown(m, 'en')).includes(en), `#${n} ${row} en: ${JSON.stringify(shown(m, 'en'))}`);
  }
  // #20 exactly as JJ wrote it: 右键〈项目〉标签页 / 〈模板〉标签页, the 〈〉 parts the existing terms
  a.equal(view.t('zh-CN', 'own.help-l-52'), '右键<b data-i18n="term.project">项目</b>标签页');
  a.equal(view.t('zh-CN', 'own.help-l-63'), '<b data-i18n="term.templates">模板</b>标签页');
  a.equal(view.t('zh-CN', 'term.project'), '项目');
  a.equal(view.t('zh-CN', 'term.templates'), '模板');
});

test('help layer, headings: Editing and the four notes beside the headings', () => {
  const ed = heading('Editing');
  a.equal(squash(shown(ed, 'zh-CN')), '编辑');
  a.equal(squash(shown(ed, 'en')), 'Editing');
  for (const [n, head, en, zh] of NOTES) {
    const h = heading(head);
    a.ok(shown(h, 'zh-CN').includes(zh), `#${n} ${head} zh: ${shown(h, 'zh-CN')}`);
    a.ok(!shown(h, 'zh-CN').includes(en), `#${n} ${head}: no English note left`);
    a.ok(shown(h, 'en').includes(en), `#${n} ${head} en: ${shown(h, 'en')}`);
  }
});

test('the help layer has no English left at all (both columns and the headings)', () => {
  const left = Object.entries(Z.englishShown()).filter(([k]) => k.startsWith('help'));
  a.deepEqual(left, [], JSON.stringify(left));
});

test('Track point is 跟踪点 (JJ: the term is corrected too)', () => {
  a.equal(view.t('zh-CN', 'term.track-point'), '跟踪点');
  a.equal(view.t('en', 'term.track-point'), 'Track point');
  a.ok(shown(leftCell('own.help-83'), 'zh-CN').includes('跟踪点'));
});

// the bin's Show filter and the right-click menus: the wording (rendered in desktop/zh-batch7-smoke.cjs)
const KEYS = {
  'own.bin-all': ['All media', '全部素材'], 'own.bin-fav': ['★ Favorites', '★ 收藏'],
  'own.bin-used': ['Used in the edit', '时间线上用到的'], 'own.bin-unused': ['Unused', '时间线上没用到的'],   // #62 JJ
  'own.bin-proxy': ['Has a proxy', '有代理的'], 'own.bin-noproxy': ['Video without a proxy', '还没做代理的视频'],
  'own.bin-image': ['Image', '图片'],
  'own.bin-group-kind': ['Kind', '类型'], 'own.bin-group-collections': ['Collections', '分组'], 'own.bin-group-tags': ['Tags', '标签'], // JJ
  'own.seq-duplicate': ['Duplicate “{name}”', '复制一份「{name}」'], 'own.seq-rename': ['Rename “{name}”…', '重命名「{name}」…'],
  'own.seq-delete': ['Delete “{name}”…', '删除「{name}」…'], 'own.seq-keep-one': ['A project keeps at least one sequence', '一个项目至少要留一个序列'],
  'own.snap-to': ['Snap to', '吸附到'], 'own.snap-clips': ['Clip edges', '片段边缘'], 'own.snap-playhead': ['Playhead', '播放头'],
  'own.snap-inout': ['IN / OUT', '入点 / 出点'], 'own.snap-keyframes': ['Keyframes', '关键帧'], 'own.snap-frames': ['Frame grid', '每一帧'], // #340 JJ
  'own.markers-empty': ['No markers yet — press <kbd>M</kbd> at the playhead.', '还没有标记 — 按 <kbd>M</kbd> 在播放头处加一个。'],
  'own.mm-open-source': ['Open in Source', '在源监视器中打开'], 'own.mm-instances': ['Find timeline instances ({n})', '在时间线上找到它（{n} 处）'], // #344 JJ
  'own.mm-info': ['Media info…', '素材信息…'], 'own.mm-relink-copy': ['Relink to another copy…', '重新链接到另一份文件…'],
  // Rea's review: back to the existing term 创建代理 (term.create-proxy), as in the help layer
  'own.mm-proxy-540': ['Create proxy (540p)', '创建代理（540p）'], 'own.mm-proxy-720': ['Create proxy (720p)', '创建代理（720p）'],
  // #361 with JJ's 每一帧 (as the Snap menu); #327, Rea's draft
  'own.snap-targets-title': ['Snap targets — clip edges, playhead, markers, IN/OUT, keyframes, frame grid', '吸附目标 — 片段边缘、播放头、标记、入点/出点、关键帧、每一帧'],
  'own.seq-button-title': ['Sequence: {name} — open another one, or add, duplicate, rename', '序列：{name} — 打开别的序列，或新建、复制一份、重命名'],
  'own.mm-fav-add': ['Add to favorites', '加入收藏'], 'own.mm-tags': ['Tags…', '标签…'], 'own.mm-new-collection': ['New collection…', '新建分组…'], // #351 JJ
  'own.mm-remove': ['Remove from project', '从项目里移除'],
  'own.track-remove': ['Remove track', '删除轨道'],
  'own.hl-menu': ['Auto short…', '自动拼短片…'], 'own.hl-title': ['Auto short', '自动拼短片'], 'own.hl-make': ['Make', '拼好'],
};
test('the bin filter and the right-click menus: Rea\'s drafts and JJ\'s changes, English as the page had it', () => {
  for (const [key, [en, zh]] of Object.entries(KEYS)) {
    a.equal(view.t('zh-CN', key), zh, key + ' zh');
    a.equal(view.t('en', key), en, key + ' en');
  }
});

test('the proxy items say 创建代理 like the existing term', () => {
  a.equal(view.t('zh-CN', 'term.create-proxy'), '创建代理');
  for (const k of ['own.mm-proxy-540', 'own.mm-proxy-720']) a.ok(view.t('zh-CN', k).startsWith(view.t('zh-CN', 'term.create-proxy') + '（'), k);
});

test('#352 and #329: JJ\'s sentences; the menu item and the dialog title are the same words', () => {
  a.equal(view.t('zh-CN', 'own.mm-remove-title'), '只从这个项目里拿掉，时间线上用到它的片段也会一起拿掉（可以撤销）。电脑上的原文件不动。');
  a.ok(view.t('en', 'own.mm-remove-title'), 'an English draft (for JJ)');
  a.equal(view.t('zh-CN', 'own.hl-desc'), '从选中的片段里（没选就用整条时间线），挑出画面动得多、声音大的几段，拼成一个新序列。原来的序列不动。');
  a.ok(view.t('en', 'own.hl-desc'), 'an English draft (for JJ)');
  for (const l of ['zh-CN', 'en']) a.equal(view.t(l, 'own.hl-menu'), view.t(l, 'own.hl-title') + '…', l + ': menu item = dialog title + …');
  a.equal(view.t('zh-CN', 'term.cancel'), '取消');
});
