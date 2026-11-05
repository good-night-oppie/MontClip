'use strict';
// 中文第七批 (JJ's 第 1 批定稿 of Rea's second scan): what the page really shows, read off the rendered DOM in Chinese and in
// English, in both modes, and again after switching back — the help layer's left column and heading notes, the bin's
// Show filter, and the right-click menus (sequence menu, the Auto short dialog it opens, Snap, Markers, a bin file, a
// track). Fresh profile, hidden offscreen window, no provider call.
//   electron desktop/zh-batch7-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → ZH7_PASS / ZH7_FAIL
const electron = require('electron'), { app, BrowserWindow } = electron, assert = require('node:assert/strict');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');

// [right cell's own.help-N key, English shown, Chinese shown] (key caps written out as the page shows them)
const HELP = [
  ['own.help-7', '0 – 9 / click timecode', '0 – 9 / 点击时间码'], ['own.help-24', 'Ctrl +click clip', 'Ctrl +点击片段'],
  ['own.help-36', 'Ctrl +wheel', 'Ctrl +滚动滚轮'], ['own.help-46', 'Ctrl/Cmd +click inspector label or slider', 'Ctrl/Cmd +点击属性面板的名称或滑块'],
  ['own.help-47', '⇧ +click label', '⇧ +点击名称'], ['own.help-51', 'Ctrl +click bin', 'Ctrl +点击素材库'],
  ['own.help-52', 'Right-click Project tab', '右键项目标签页'], ['own.help-63', 'Templates tab', '模板标签页'],
  ['own.help-55', '☆ / uses badge on a bin file', '素材上的 ☆ / 用了几次的小标'], ['own.help-56', '☰ in the bin', '素材库里的 ☰'],
  ['own.help-67', 'Timeline toolbar → sequence menu', '时间线工具栏 → 序列菜单'], ['own.help-68', 'Project card', '项目卡片'],
  ['own.help-69', 'Enter on a card', 'Enter 在卡片上'], ['own.help-83', 'Track point', '跟踪点'],
];
const HEADS = [ // [heading, its note] in each language
  [['Editing', null], ['编辑', null]], [['Projects', 'top bar → Projects'], ['项目', '顶栏 → 〔项目〕']],
  [['Shapes and transforms', 'bin → Shapes · Inspector'], ['形状与画面', '素材库 → 形状 · 属性面板']],
  [['Tracking', 'Inspector → Tracking · a mask’s Track buttons'], ['跟踪', '属性面板 → 跟踪 · 蒙版上的〔跟踪〕按钮']],
  [['Transcript', 'side panel → Transcript'], ['文稿', '侧边栏 → 文稿']],
];
const FILTER = { '': ['All media', '全部素材'], fav: ['★ Favorites', '★ 收藏'], used: ['Used in the edit', '时间线上用到的'],
  unused: ['Unused', '时间线上没用到的'], proxy: ['Has a proxy', '有代理的'], noproxy: ['Video without a proxy', '还没做代理的视频'],
  'kind:image': ['Image', '图片'], 'kind:video': ['Video', '视频'], 'kind:svg': ['SVG', 'SVG'] };
const SEQ = [['Auto short…', '自动拼短片…'], ['Duplicate “Main”', '复制一份「主序列」'], ['Rename “Main”…', '重命名「主序列」…'], ['Delete “Main”…', '删除「主序列」…']];
const SNAP = [['Snap to', '吸附到'], ['Clip edges', '片段边缘'], ['Playhead', '播放头'], ['Markers', '标记'], ['IN / OUT', '入点 / 出点'], ['Keyframes', '关键帧'], ['Frame grid', '每一帧']];
const MEDIA = [['Open in Source', '在源监视器中打开'], ['Find timeline instances (0)', '在时间线上找到它（0 处）'], ['Media info…', '素材信息…'],
  ['Relink to another copy…', '重新链接到另一份文件…'], ['Create proxy (540p)', '生成代理（540p）'], ['Create proxy (720p)', '生成代理（720p）'],
  ['Add to favorites', '加入收藏'], ['Tags…', '标签…'], ['New collection…', '新建分组…'], ['Remove from project', '从项目里移除']];
const REMOVE_TITLE_ZH = '只从这个项目里拿掉，时间线上用到它的片段也会一起拿掉（可以撤销）。电脑上的原文件不动。';
const HL_DESC_ZH = '从选中的片段里（没选就用整条时间线），挑出画面动得多、声音大的几段，拼成一个新序列。原来的序列不动。';

const READ = String.raw`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const r = {};
  document.getElementById('btnHelp').click(); await wait(50);
  r.help = {};
  for (const td of document.querySelectorAll('#helpKeys td[data-i18n-html]')) {
    const c = td.parentElement.querySelector('td').cloneNode(true);
    for (const k of c.querySelectorAll('kbd')) k.replaceWith(' ' + k.textContent + ' ');
    r.help[td.dataset.i18nHtml] = txt(c);
  }
  r.heads = [...document.querySelectorAll('#helpKeys h3')].map((h) => { const c = h.cloneNode(true), s = c.querySelector('span'); s?.remove(); return [txt(c), txt(s)]; });
  const f = document.getElementById('helpFilter');
  for (const [q, k] of [['wheel', 'w'], ['project card', 'pc'], ['side panel', 'sp']]) {
    f.value = q; f.dispatchEvent(new Event('input'));
    r['search_' + k] = document.querySelectorAll('#helpKeys tr:not(.hidden)').length;
  }
  f.value = ''; f.dispatchEvent(new Event('input')); closeHelp();
  r.filter = Object.fromEntries([...document.querySelectorAll('#binFilter option')].map((o) => [o.value, o.textContent]));
  showSequenceMenu(10, 10); await wait(30);
  r.seq = [...document.querySelectorAll('.seq-menu .ctx-item')].map((b) => [txt(b), b.title || '']);
  // the Auto short dialog the menu item opens
  [...document.querySelectorAll('.seq-menu .ctx-item')].find((b) => /Auto short|自动拼短片/.test(b.textContent))?.click();
  hideTrackCtxMenu();
  // main's own bug (not this batch): highlight-candidates.js takes over the global MontClipHighlights, so the dialog's
  // Highlights.sourcesOf is missing and it cannot open. A stand-in lets the dialog render so its words can be read.
  if (typeof Highlights.sourcesOf !== 'function') { Highlights.sourcesOf = () => ({ take: [], skip: [] }); r.hlStub = true; }
  promptHighlights(10, 10); await wait(30);
  const hl = document.querySelector('.bin-pop.seq-new');
  r.hlTitle = txt(hl?.querySelector('label[for="hlLen"]'));
  r.hlDesc = txt(hl?.querySelector('[data-hl-status]'));
  r.hlButtons = [txt(hl?.querySelector('[data-cancel]')), txt(hl?.querySelector('[data-ok]'))];
  hideTrackCtxMenu();
  openSnapMenu(document.getElementById('btnSnap')); await wait(30);
  const snap = document.querySelector('.snap-menu');
  r.snap = [txt(snap.querySelector('.snap-menu-head')), ...[...snap.querySelectorAll('.snap-opt span')].map(txt)];
  snap.remove();
  openMarkerList(document.getElementById('btnMarkers')); await wait(30);
  const ml = document.querySelector('.marker-list');
  r.markersEmpty = txt(ml?.querySelector('.marker-empty')); r.markersKbd = txt(ml?.querySelector('.marker-empty kbd'));
  ml?.remove();
  showMediaMenu(10, 10, getMedia('m_zh7')); await wait(30);
  r.media = [...document.querySelectorAll('#trackCtxMenu .ctx-item')].map((b) => [txt(b), b.title || '']);
  hideTrackCtxMenu();
  showTrackCtxMenu(10, 10, { id: 'V1', kind: 'video' }); await wait(30);
  r.track = txt(document.querySelector('#trackCtxMenu .ctx-item'));
  hideTrackCtxMenu();
  return r;
})()`;

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  let ok = false; const seen = {};
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    // a video in the bin (so the proxy rows and the Show filter's proxy entries appear) and an image
    await read(`(()=>{project.media.push({id:'m_zh7',name:'zh7.mp4',kind:'video',src:'/media/zh7.mp4',duration:5,width:320,height:240},
      {id:'m_zh7i',name:'zh7.png',kind:'image',src:'/media/zh7.png',width:320,height:240});renderBin();return true;})()`);
    for (const [language, mode] of [['zh-CN', 'advanced'], ['zh-CN', 'simple'], ['en', 'advanced'], ['en', 'simple'], ['zh-CN', 'advanced']]) {
      await read(`updateMontClipView(${JSON.stringify({ language, mode })}); true`); await wait();
      const r = await read(READ), zh = language === 'zh-CN', at = language + ' ' + mode, L = (p) => p[zh ? 1 : 0];
      seen[at] = true;
      for (const [row, en, cn] of HELP) assert.equal(r.help[row], zh ? cn : en, `${at} help ${row}`);
      for (const h of HEADS) assert.ok(r.heads.some(([t, s]) => t === L(h)[0] && s === L(h)[1]), `${at} heading ${JSON.stringify(L(h))}: ${JSON.stringify(r.heads)}`);
      for (const k of ['w', 'pc', 'sp']) assert.ok(r['search_' + k] >= 1, `${at} English search ${k} still finds its row`);
      for (const [v, p] of Object.entries(FILTER)) assert.equal(r.filter[v], L(p), `${at} filter ${v}`);
      for (const p of SEQ) assert.ok(r.seq.some(([t]) => t === L(p)), `${at} sequence menu ${L(p)}: ${JSON.stringify(r.seq)}`);
      const del = r.seq.find(([t]) => t === L(SEQ[3]));
      assert.equal(del[1], zh ? '一个项目至少要留一个序列' : 'A project keeps at least one sequence', at + ' delete tooltip');
      // the menu item and the dialog it opens have the same name
      assert.equal(r.hlTitle, zh ? '自动拼短片' : 'Auto short', at + ' dialog title');
      assert.equal(r.hlTitle + '…', L(SEQ[0]), at + ' menu item = dialog title');
      if (zh) assert.equal(r.hlDesc, HL_DESC_ZH, at + ' dialog description');
      else assert.ok(r.hlDesc && !/[一-鿿]/.test(r.hlDesc), at + ' dialog description in English: ' + r.hlDesc);
      assert.deepEqual(r.hlButtons, zh ? ['取消', '拼好'] : ['Cancel', 'Make'], at + ' dialog buttons');
      assert.deepEqual(r.snap, SNAP.map(L), at + ' snap menu');
      assert.equal(r.markersEmpty, zh ? '还没有标记 — 按 M 在播放头处加一个。' : 'No markers yet — press M at the playhead.', at + ' markers');
      assert.equal(r.markersKbd, 'M', at + ' markers key cap');
      for (const p of MEDIA) assert.ok(r.media.some(([t]) => t === L(p)), `${at} bin menu ${L(p)}: ${JSON.stringify(r.media)}`);
      const rm = r.media.find(([t]) => t === L(MEDIA[9]));
      if (zh) assert.equal(rm[1], REMOVE_TITLE_ZH, at + ' remove tooltip');
      else assert.ok(rm[1] && !/[一-鿿]/.test(rm[1]), at + ' remove tooltip in English: ' + rm[1]);
      assert.equal(r.track, zh ? '删除轨道' : 'Remove track', at + ' track menu');
    }
    ok = true;
  } catch (e) { seen.error = String(e && e.message || e).slice(0, 1500); }
  finally { out(ok ? 'ZH7_PASS' : 'ZH7_FAIL', ok ? { checked: Object.keys(seen) } : { error: seen.error }); process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) { if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow { constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; } return load.call(this, id, ...args); }; }
require('./main');
