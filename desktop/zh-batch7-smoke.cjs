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
  ['Relink to another copy…', '重新链接到另一份文件…'], ['Create proxy (540p)', '创建代理（540p）'], ['Create proxy (720p)', '创建代理（720p）'],
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
  r.groups = [...document.querySelectorAll('#binFilter optgroup')].map((g) => g.label);
  syncSequenceButton();
  r.seqTitle = document.getElementById('btnSequences').title;
  r.snapTitle = document.getElementById('btnSnapMenu').title;
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
  mediaOffline.delete('m_zh7'); // the made-up file reads as present, so the menu offers "Relink to another copy…"
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
    await read(`(()=>{project.collections=[{id:'col_g',name:'Picks',media:['m_zh7']}];project.media.push({id:'m_zh7',name:'zh7.mp4',kind:'video',src:'/media/zh7.mp4',duration:5,width:320,height:240,tags:['day1']},
      {id:'m_zh7i',name:'zh7.png',kind:'image',src:'/media/zh7.png',width:320,height:240});renderBin();return true;})()`);
    for (const [language, mode] of [['zh-CN', 'advanced'], ['zh-CN', 'simple'], ['en', 'advanced'], ['en', 'simple'], ['zh-CN', 'advanced']]) {
      await read(`updateMontClipView(${JSON.stringify({ language, mode })}); true`); await wait();
      const r = await read(READ), zh = language === 'zh-CN', at = language + ' ' + mode, L = (p) => p[zh ? 1 : 0];
      seen[at] = true;
      for (const [row, en, cn] of HELP) assert.equal(r.help[row], zh ? cn : en, `${at} help ${row}`);
      for (const h of HEADS) assert.ok(r.heads.some(([t, s]) => t === L(h)[0] && s === L(h)[1]), `${at} heading ${JSON.stringify(L(h))}: ${JSON.stringify(r.heads)}`);
      for (const k of ['w', 'pc', 'sp']) assert.ok(r['search_' + k] >= 1, `${at} English search ${k} still finds its row`);
      for (const [v, p] of Object.entries(FILTER)) assert.equal(r.filter[v], L(p), `${at} filter ${v}`);
      // JJ: the group headings (a collection and a tag are put in for this)
      assert.deepEqual(r.groups, zh ? ['类型', '分组', '标签'] : ['Kind', 'Collections', 'Tags'], at + ' filter groups');
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
      assert.equal(r.snapTitle, zh ? '吸附目标 — 片段边缘、播放头、标记、入点/出点、关键帧、每一帧' : 'Snap targets — clip edges, playhead, markers, IN/OUT, keyframes, frame grid', at + ' snap button tooltip');
      assert.equal(r.seqTitle, zh ? '序列：主序列 — 打开别的序列，或新建、复制一份、重命名' : 'Sequence: Main — open another one, or add, duplicate, rename', at + ' sequence button tooltip');
      assert.equal(r.markersEmpty, zh ? '还没有标记 — 按 M 在播放头处加一个。' : 'No markers yet — press M at the playhead.', at + ' markers');
      assert.equal(r.markersKbd, 'M', at + ' markers key cap');
      for (const p of MEDIA) assert.ok(r.media.some(([t]) => t === L(p)), `${at} bin menu ${L(p)}: ${JSON.stringify(r.media)}`);
      const rm = r.media.find(([t]) => t === L(MEDIA[9]));
      if (zh) assert.equal(rm[1], REMOVE_TITLE_ZH, at + ' remove tooltip');
      else assert.ok(rm[1] && !/[一-鿿]/.test(rm[1]), at + ' remove tooltip in English: ' + rm[1]);
      assert.equal(r.track, zh ? '删除轨道' : 'Remove track', at + ' track menu');
    }
    // Rea's review of #148 (069663e3): the Pen buttons of a shape layer and of a title's text path; the export range row
    // follows a language switch with the dialog open
    const PEN = String.raw`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
      if (!window.__zh7Shape) {
        const sh = { id: 'c_zh7shape', mediaId: null, kind: 'shape', track: 'V3', start: 0, in: 0, duration: 4, name: 'Shape', props: { ...DEFAULT_PROPS, shapes: [{ type: 'rect', w: 100, h: 60, fill: '#ffffff' }] } };
        const tt = { id: 'c_zh7text', mediaId: null, kind: 'text', track: 'V2', start: 0, in: 0, duration: 4, name: 'Title', props: { ...DEFAULT_PROPS, text: 'Hello' } };
        project.clips.push(sh, tt); window.__zh7Shape = sh.id; window.__zh7Text = tt.id;
      }
      const r = {};
      setSelection([window.__zh7Shape]); renderInspector(); await wait(30);
      r.shapePen = txt(document.querySelector('#inspector [data-stool="pen"]'));
      setSelection([window.__zh7Text]); renderInspector(); await wait(30);
      r.textPen = txt(document.querySelector('#inspector [data-tpath="pen"]'));
      setSelection([]); renderInspector();
      return r;
    })()`;
    for (const language of ['zh-CN', 'en', 'zh-CN']) {
      await read(`updateMontClipView(${JSON.stringify({ language, mode: 'advanced' })}); true`); await wait();
      const r = await read(PEN), zh = language === 'zh-CN';
      assert.equal(r.shapePen, zh ? '钢笔' : 'Pen', language + ' shape layer Pen');
      assert.equal(r.textPen, zh ? '钢笔' : 'Pen', language + ' text path Pen');
    }
    for (const mode of ['simple', 'advanced']) {
    const range = await read(`(async()=>{const wait=(ms)=>new Promise((r)=>setTimeout(r,ms)),out={};
      updateMontClipView({language:'zh-CN',mode:${JSON.stringify(mode)}});setSelection([window.__zh7Text]);await wait(100);await openExportSetup();
      for(const until=Date.now()+8000;Date.now()<until&&els.exportSetup.classList.contains('hidden');)await wait(50);
      const row=()=>{const s=document.getElementById('exportRangeSel');return [s.options[s.selectedIndex].textContent,document.getElementById('exportRangeNote').textContent];};
      out.zh=row();updateMontClipView({language:'en'});await wait(100);out.en=row();updateMontClipView({language:'zh-CN'});await wait(100);out.zh2=row();closeExportSetup();return out;})()`);
    seen['range ' + mode] = range;
    for (const k of ['zh', 'zh2']) assert.ok(range[k][0] === '整条时间线' && range[k][1].startsWith('整条时间线 · '), mode + ' ' + k + ' export range: ' + JSON.stringify(range[k]));
    assert.ok(range.en[0] === 'Entire timeline' && range.en[1].startsWith('Full timeline · ') && !/[一-鿿]/.test(range.en.join('')), mode + ' en export range: ' + JSON.stringify(range.en));
    }
    // one view failing to redraw (here the Inspector) must not leave the export range row in the old language
    const robust = await read(`(async()=>{const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
      updateMontClipView({language:'zh-CN',mode:'advanced'});await wait(100);await openExportSetup();
      for(const until=Date.now()+8000;Date.now()<until&&els.exportSetup.classList.contains('hidden');)await wait(50);
      const keep=window.renderInspector;window.renderInspector=()=>{throw Error('zh7: a view that fails to redraw');};
      try{updateMontClipView({language:'en'});}catch(e){}
      window.renderInspector=keep;await wait(100);
      const s=document.getElementById('exportRangeSel'),out=[s.options[s.selectedIndex].textContent,document.getElementById('exportRangeNote').textContent];
      closeExportSetup();updateMontClipView({language:'zh-CN'});return out;})()`);
    assert.ok(robust[0] === 'Entire timeline' && robust[1].startsWith('Full timeline · '), 'export range after a failing redraw: ' + JSON.stringify(robust));
    await read(`updateMontClipView({mode:'advanced'}); setSelection([]); true`);
    // VV's review of #148: the Show filter shows its whole choice at the desktop width (1283 px) and at 360 px, with room
    // for the native arrow; the sort row wraps rather than squeezing. And "Full canvas" in the player bar.
    const FIT = String.raw`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), sel = document.getElementById('binFilter'), sort = document.getElementById('binSort');
      renderBin(); await wait(60);
      // narrow window: the bin sits behind the 素材 / Media button
      if (!sel.offsetParent && document.getElementById('mcMediaToggle')?.offsetParent) { document.getElementById('mcMediaToggle').click(); await wait(200); }
      if (!sel.offsetParent) return { hidden: true };
      const cs = getComputedStyle(sel), ctx = document.createElement('canvas').getContext('2d'); ctx.font = cs.font;
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const was = sel.value, cut = [];
      for (const o of [...sel.options].filter((o) => !/^(col|tag):/.test(o.value))) {
        sel.value = o.value; await wait(5);
        const need = Math.ceil(ctx.measureText(o.textContent).width + pad + 20), have = sel.getBoundingClientRect().width;
        if (need > have || sel.scrollWidth > sel.clientWidth) cut.push([o.textContent, need, Math.round(have), sel.scrollWidth, sel.clientWidth]);
      }
      sel.value = was;
      const tools = document.getElementById('binTools');
      return { width: Math.round(sel.getBoundingClientRect().width), cut, sortWidth: Math.round(sort.getBoundingClientRect().width),
        overflow: tools.scrollWidth > tools.clientWidth, frame0: document.querySelector('#exportFrameSel option[value="0"]')?.textContent };
    })()`;
    // a long collection name must not stretch the filter past the panel
    await read(`(()=>{project.collections=[{id:'col_zh7',name:'A very long collection name that keeps going and going',media:[]}];renderBin();return true;})()`);
    for (const [w, h] of [[1283, 800], [360, 740]]) {
      win.setContentSize(w, h); await wait(500);
      for (const language of ['zh-CN', 'en']) {
        await read(`updateMontClipView(${JSON.stringify({ language, mode: 'advanced' })}); true`); await wait();
        const r = await read(FIT), at = `fit ${w}px ${language}`;
        seen[at] = r;
        assert.ok(r.hidden || r.cut.length === 0, at + ' filter text cut: ' + JSON.stringify(r));
        assert.ok(r.hidden || r.sortWidth >= 60, at + ' the sort box keeps a usable width: ' + JSON.stringify(r));
        assert.ok(r.hidden || !r.overflow, at + ' nothing runs out of the bin tools row: ' + JSON.stringify(r));
        if (w === 1283) assert.equal(r.frame0, language === 'en' ? 'Full canvas' : '完整画布', at + ' export frame: Full canvas');
      }
    }
    win.setContentSize(1283, 800); await wait(300);
    // 插件试用 P7: a stored default project name, the empty Inspector, and the export file name, rendered
    const P7 = String.raw`(async (stored) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
      project.media = [{ id: 'm_p7', name: '回放 0105.mp4', kind: 'video', src: '/media/p7.mp4', duration: 5, width: 320, height: 240 }];
      project.name = stored; setSelection([]); renderInspector(); refreshLanguageText(); await wait(30);
      const r = { top: txt(document.getElementById('projectName')), empty: txt(document.querySelector('#inspector .inspector-empty')),
        file: exportBaseName('export'), stored: project.name };
      await openProjects();
      for (const until = Date.now() + 8000; Date.now() < until && !document.querySelector('#projectsOverlay .pj-card.open, #projectsOverlay .pj-card');) await wait(50);
      const card = document.querySelector('#projectsOverlay .pj-card.open') || document.querySelector('#projectsOverlay .pj-card');
      r.card = txt(card?.querySelector('.pj-card-name'));
      closeProjects();
      return r;
    })`;
    for (const language of ['en', 'zh-CN']) for (const stored of ['未命名项目', 'Untitled Project', 'Untitled project']) {
      await read(`updateMontClipView(${JSON.stringify({ language, mode: 'advanced' })}); true`); await wait();
      const r = await read(`${P7}(${JSON.stringify(stored)})`), at = `P7 ${language} stored ${stored}`, shownName = language === 'en' ? 'Untitled project' : '未命名项目';
      assert.ok(r.top.startsWith(shownName + ' '), at + ' top bar: ' + r.top);
      assert.ok(!/未命名项目|Untitled/.test(r.top.replace(shownName, '')), at + ' top bar: one name only');
      assert.equal(r.empty, language === 'en' ? 'Select a clip to edit its picture, effects and audio.' : '选中一个片段以编辑它的画面、特效与音频。', at + ' empty Inspector');
      assert.match(r.file, /^回放 0105 \d\d-\d\d$/, at + ' export file name');
      assert.equal(r.stored, stored, at + ' the stored name is kept');
      if (r.card != null) assert.ok(r.card.startsWith(shownName), at + ' project card: ' + r.card);
      seen[at] = r;
    }
    // a name of its own is the export name and is shown as it is
    const own = await read(`${P7}("Untitled Project copy")`);
    assert.ok(own.top.startsWith('Untitled Project copy ') && own.file === 'Untitled Project copy', 'own name: ' + JSON.stringify(own));
    ok = true;
  } catch (e) { seen.error = String(e && e.message || e).slice(0, 1500); }
  finally { out(ok ? 'ZH7_PASS' : 'ZH7_FAIL', ok ? { checked: Object.keys(seen), fit: Object.fromEntries(Object.entries(seen).filter(([k]) => k.startsWith('fit')).map(([k, v]) => [k, v.hidden ? 'hidden' : { width: v.width, sort: v.sortWidth }])) } : { error: seen.error }); process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) { if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow { constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; } return load.call(this, id, ...args); }; }
require('./main');
