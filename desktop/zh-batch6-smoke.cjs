'use strict';
// 中文第六批 (Rea's second scan, 「已有中文」 rows): what the page really shows, read off the rendered DOM in Chinese and in
// English, in both modes, and again after switching back — the help layer's left column and headings, the bin's Show
// filter, sort tooltips and list-view headings, the Inspector of a new title, the sequence button and menu, the Snap
// menu, the export encoder names, a new title's timeline label, and the three English fixes. The stored names stay
// "Main" / "Title". Fresh profile, hidden offscreen window, no provider call.
//   electron desktop/zh-batch6-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → ZH6_PASS / ZH6_FAIL
const electron = require('electron'), { app, BrowserWindow } = electron, assert = require('node:assert/strict');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');

// [right cell's own.help-N key (or "h3:" + heading English), English shown, Chinese shown]
const HELP = [
  ['own.help-8', 'Limit (toolbar)', '上限（工具栏）'], ['own.help-9', 'Dbl-click bin / clip', '双击素材库 / 片段'],
  ['own.help-23', 'Drag empty area', '拖动空白区域'], ['own.help-26', 'Right-click clip', '右键片段'],
  ['own.help-34', 'Marker on ruler', '标尺上的标记'], ['own.help-41', 'Click track name', '点击轨道名称'],
  ['own.help-42', 'Track S', '轨道 S'], ['own.help-43', 'Track padlock', '轨道锁'], ['own.help-44', 'Right-click track', '右键轨道'],
  ['own.help-48', 'Motion → Presets', '运动 → 预设'], ['own.help-49', 'Volume line', '音量线'],
  ['own.help-52', 'Right-click Project tab', '右键 项目 tab'], ['own.help-53', 'Bin search', '搜索素材库'],
  ['own.help-54', 'Right-click a bin file', '右键素材库文件'], ['own.help-58', 'Right-click a bin file', '右键素材库文件'],
  ['own.help-57', 'Right-click a clip', '右键片段'], ['own.help-59', 'Right-click a bin video', '右键素材库视频'],
  ['own.help-60', 'Comp clip / bin comp', '复合片段 / 素材库复合片段'], ['own.help-61', 'Right-click clips', '右键多个片段'],
  ['own.help-62', 'Esc inside a comp', 'Esc 位于复合片段内'], ['own.help-66', 'Project → Versions…', '项目 → 版本…'],
  ['own.help-67', 'Timeline toolbar → sequence menu', '时间线工具栏 → sequence menu'], ['own.help-71', 'Delete… (Archived)', '删除… （已归档）'],
  ['own.help-72', 'Colour wheel', '色轮'], ['own.help-73', 'WB pick / Pick', '白平衡取样 / 取样'], ['own.help-74', 'Curves', '曲线'],
  ['own.help-75', 'Layer mask on monitor', '监视器上的图层蒙版'], ['own.help-76', 'Pen', '钢笔'], ['own.help-77', 'Draw', '绘制'],
  ['own.help-78', 'Mask on monitor', '监视器上的蒙版'], ['own.help-79', 'Shape item on monitor', '监视器上的形状对象'],
  ['own.help-80', 'Shape / text-path pen', '形状 / 文字路径钢笔'], ['own.help-81', 'Motion path', '运动路径'],
  ['own.help-82', 'Anchor ✥ Move', '锚点 ✥ 移动'], ['own.help-83', 'Track point', '轨道点'], ['own.help-86', 'Find words', '查找词'],
  ['own.help-87', 'Captions', '字幕'],
  ['h3:Projects', 'Projects', '项目'], ['h3:Masks', 'Masks', '蒙版'], ['h3:Shapes and transforms', 'Shapes and transforms', '形状与画面'],
  ['h3:Tracking', 'Tracking', '跟踪'], ['h3:Transcript', 'Transcript', '文稿'],
];
const ZH_ENC = { h264_nvenc: '显卡编码（NVIDIA）', h264_mf: 'Windows 自带编码', h264_qsv: '显卡编码（Intel）', h264_amf: '显卡编码（AMD）' };
const Delivery = require('../delivery');

// Everything the page shows that this batch is about, read from the DOM (one language at a time).
const READ = String.raw`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const r = {};
  // help layer: left cells by their row, headings without their dim span
  document.getElementById('btnHelp').click(); await wait(50);
  r.help = {};
  for (const td of document.querySelectorAll('#helpKeys td[data-i18n-html]')) {
    const left = td.parentElement.querySelector('td');
    const c = left.cloneNode(true); for (const k of c.querySelectorAll('kbd')) k.replaceWith(' ' + k.textContent + ' ');
    (r.help[td.dataset.i18nHtml] = r.help[td.dataset.i18nHtml] || txt(c));
  }
  r.heads = [...document.querySelectorAll('#helpKeys h3')].map((h) => { const c = h.cloneNode(true); c.querySelector('span')?.remove(); return txt(c); });
  r.headSpans = [...document.querySelectorAll('#helpKeys h3')].map((h) => txt(h.querySelector('span')));
  // an English search still finds a translated left cell
  const f = document.getElementById('helpFilter'); f.value = 'marker on ruler'; f.dispatchEvent(new Event('input'));
  r.searchMarker = [...document.querySelectorAll('#helpKeys tr:not(.hidden) td[data-i18n-html]')].map((td) => td.dataset.i18nHtml);
  f.value = 'masks'; f.dispatchEvent(new Event('input'));
  r.searchMasks = [...document.querySelectorAll('#helpKeys .keys-sec:not(.hidden) h3')].length;
  f.value = ''; f.dispatchEvent(new Event('input'));
  closeHelp();
  // the bin: Show filter, sort tooltips, list view headings and the audio cell
  r.filter = Object.fromEntries([...document.querySelectorAll('#binFilter option')].map((o) => [o.value, o.textContent]));
  r.sortDirTitle = document.getElementById('binSortDir').title;
  r.viewBtnTitle = document.getElementById('binViewBtn').title;
  binView.list = true; binView.sort = 'name'; binView.dir = 'asc'; renderBin(); await wait(30);
  r.colhead = [...document.querySelectorAll('.bin-colhead .bin-cell')].map(txt);
  r.audioCell = txt(document.querySelector('.bin-row:not(.bin-colhead) .c-audio'));
  binView.list = false; renderBin();
  // the Inspector of the title
  setSelection([window.__zh6Title]); renderInspector(); await wait(30);
  const insp = document.getElementById('inspector') || els.inspector;
  r.inspHeads = [...insp.querySelectorAll('.insp-section > h3')].map(txt);
  r.inspLabels = [...insp.querySelectorAll('.insp-row > label')].map(txt);
  r.presetPh = insp.querySelector('[data-preset-name]')?.placeholder;
  r.presetSave = txt(insp.querySelector('[data-preset-save]'));
  r.parentNone = txt(insp.querySelector('select[data-parent] option[value=""]'));
  r.arcTitle = insp.querySelector('[data-tpath="arc"]')?.title;
  r.transTitle = insp.querySelector('label.insp-reset[data-reset="transIn"]')?.title;
  // Rea's review of #147: the Masks section of the Inspector (its heading, Pen, Draw), the top bar's tooltip, the Color tab's Draw
  const ms = insp.querySelector('[data-mask-section]');
  r.maskHead = txt(ms?.querySelector('h3'));
  r.maskPen = txt(ms?.querySelector('[data-mtool="pen"]')); r.maskDraw = txt(ms?.querySelector('[data-mtool="draw"]'));
  r.projTitle = document.getElementById('projectName').title;
  if (document.body.dataset.mcMode !== 'simple') {
    setSelection([window.__zh6Adjust]); setSideTab('color'); colorState.layer = 0; renderColorPage(true); await wait(30);
    r.colorDraw = txt(document.querySelector('[data-mdraw]'));
    setSideTab('inspector'); setSelection([window.__zh6Title]); renderInspector(); await wait(30);
  }
  // the timeline label of the title, and the Parent option naming it
  state.dirtyTimeline = true; await wait(120);
  const label = [...document.querySelectorAll('.clip-label')].map(txt).find((l) => l.includes('T · '));
  r.titleLabel = label && label.slice(label.indexOf('T · ')); // after the ⇄ badge of its transition
  // the sequence button and menu
  syncSequenceButton();
  r.seqName = txt(document.querySelector('#btnSequences .seq-name'));
  r.seqTitle = document.getElementById('btnSequences').title;
  showSequenceMenu(10, 10); await wait(30);
  r.seqMenu = [...document.querySelectorAll('.seq-menu .ctx-item')].map(txt);
  hideTrackCtxMenu();
  // the Snap menu
  openSnapMenu(document.getElementById('btnSnap')); await wait(30);
  r.snap = [...document.querySelectorAll('.snap-menu .snap-opt span')].map(txt);
  hideTrackCtxMenu(); document.querySelectorAll('.snap-menu').forEach((m) => m.remove());
  // the export dialog's encoder names
  await openExportSetup();
  for (const until = Date.now() + 8000; Date.now() < until && (els.exportSetup.classList.contains('hidden') || !document.querySelector('#dlvEncoder option'));) await wait(50);
  r.encoders = Object.fromEntries([...document.querySelectorAll('#dlvEncoder option')].map((o) => [o.value, o.textContent]));
  closeExportSetup();
  // the Projects dialog's Name field (the open project's details, and New project)
  await openProjects();
  for (const until = Date.now() + 8000; Date.now() < until && !document.querySelector('#projectsOverlay .pj-card');) await wait(50);
  document.querySelector('#projectsOverlay .pj-card')?.click(); await wait(100);
  r.pjName = txt(document.getElementById('pjName')?.closest('.pj-field')?.querySelector('span'));
  document.getElementById('pjNewBtn')?.click(); await wait(100);
  r.pjNewName = txt(document.getElementById('pjNewName')?.closest('.pj-field')?.querySelector('span'));
  closeProjects();
  // what is stored never changes
  r.storedSeq = (SeqLib.find(seqRoot(), SeqLib.activeId(seqRoot())) || SeqLib.MAIN).name;
  const t = getClip(window.__zh6Title); r.storedTitle = [t.name, t.props.text];
  return r;
})()`;

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  let ok = false; const seen = {};
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    // a title (new, so its stored name and text are the defaults), a stereo file in the bin, a transition to reset
    await read(`(()=>{addTitle();const c=project.clips[project.clips.length-1];window.__zh6Title=c.id;c.transitionIn={type:'fade',duration:1};
      project.media.push({id:'m_zh6',name:'zh6.mp4',kind:'video',src:'/media/zh6.mp4',duration:5,width:320,height:240,audioChannels:2,sampleRate:48000});
      project.clips.push({id:'c_zh6adj',mediaId:null,kind:'adjust',track:'V3',start:0,in:0,duration:4,name:'Adjust',props:{...DEFAULT_PROPS,grade:{layers:[{name:'L1'}]}}});window.__zh6Adjust='c_zh6adj';
      renderBin();return true;})()`);
    for (const [language, mode] of [['zh-CN', 'advanced'], ['zh-CN', 'simple'], ['en', 'advanced'], ['en', 'simple'], ['zh-CN', 'advanced']]) {
      await read(`updateMontClipView(${JSON.stringify({ language, mode })}); true`); await wait();
      const r = await read(READ), zh = language === 'zh-CN', at = language + ' ' + mode;
      seen[at] = r;
      for (const [where, en, cn] of HELP) {
        const got = where.startsWith('h3:') ? r.heads[r.heads.indexOf(zh ? cn : en)] : r.help[where];
        assert.equal(got, zh ? cn : en, `${at} help ${where}`);
      }
      assert.deepEqual(r.searchMarker, ['own.help-34'], `${at} English search "marker on ruler"`);
      assert.ok(r.searchMasks >= 1, `${at} English search "masks" keeps the Masks section`);
      assert.equal(r.filter['kind:video'], zh ? '视频' : 'Video', at + ' filter Video');
      assert.equal(r.filter['kind:audio'], zh ? '音频' : 'Audio', at + ' filter Audio');
      assert.equal(r.filter['kind:svg'], 'SVG', at + ' filter SVG (was "Svg")');
      assert.equal(r.sortDirTitle, zh ? '升序 — 点击改为降序' : 'Ascending — click for descending', at + ' sort direction');
      assert.equal(r.viewBtnTitle, zh ? '列表视图：元数据列' : 'List view: metadata columns', at + ' list view');
      for (const [en, cn] of [['Name ↑', '名称 ↑'], ['Duration', '时长'], ['Resolution', '分辨率'], ['Codec', '编码'], ['Proxy', '代理']])
        assert.ok(r.colhead.includes(zh ? cn : en), `${at} list heading ${en}: ${JSON.stringify(r.colhead)}`);
      assert.equal(r.audioCell, zh ? '立体声 48 kHz' : 'stereo 48 kHz', at + ' audio cell');
      for (const [en, cn] of [['Transform', '画面'], ['Text', '文本']]) assert.ok(r.inspHeads.includes(zh ? cn : en), `${at} Inspector ${en}: ${JSON.stringify(r.inspHeads)}`);
      for (const [en, cn] of [['Name', '名称'], ['Presets', '预设'], ['Save as preset', '保存为预设']])
        assert.ok(r.inspLabels.includes(zh ? cn : en), `${at} Inspector row ${en}: ${JSON.stringify(r.inspLabels)}`);
      assert.equal(r.presetPh, zh ? '名称' : 'Name', at + ' preset name placeholder');
      assert.equal(r.presetSave, zh ? '保存' : 'Save', at + ' preset Save');
      assert.equal(r.parentNone, zh ? '无' : 'None', at + ' Parent None');
      assert.equal(r.maskHead, zh ? '蒙版' : 'Masks', at + ' Inspector Masks heading');
      assert.equal(r.maskPen, zh ? '钢笔' : 'Pen', at + ' Inspector mask Pen');
      assert.equal(r.maskDraw, zh ? '绘制' : 'Draw', at + ' Inspector mask Draw');
      assert.equal(r.projTitle, zh ? '项目' : 'Projects', at + ' top bar tooltip');
      if (mode !== 'simple') assert.equal(r.colorDraw, zh ? '绘制' : 'Draw', at + ' Color tab Draw');
      assert.equal(r.titleLabel, zh ? 'T · 标题' : 'T · Title', at + ' title label');
      assert.equal(r.seqName, zh ? '主序列' : 'Main', at + ' sequence button');
      assert.ok(r.seqTitle.includes(zh ? '主序列' : 'Main') && !(zh && /\bMain\b/.test(r.seqTitle)), at + ' sequence tooltip: ' + r.seqTitle);
      assert.ok(r.seqMenu.includes(zh ? '新建序列…' : 'New sequence…'), `${at} sequence menu: ${JSON.stringify(r.seqMenu)}`);
      assert.ok(r.seqMenu.some((s) => s.includes(zh ? '主序列' : 'Main')), `${at} the sequence row: ${JSON.stringify(r.seqMenu)}`);
      assert.ok(r.snap.includes(zh ? '标记' : 'Markers'), `${at} snap menu: ${JSON.stringify(r.snap)}`);
      for (const [id, label] of Object.entries(r.encoders))
        assert.equal(label, zh && ZH_ENC[id] ? ZH_ENC[id] : (Delivery.ENCODERS[id]?.label || id), `${at} encoder ${id}`);
      assert.ok(Object.keys(r.encoders).length > 0, at + ' encoders listed');
      if (!zh) {
        assert.equal(r.arcTitle, 'Set the title on an arc', at + ' text path arc');
        assert.equal(r.transTitle, 'Ctrl-click or Shift-click: remove the transition', at + ' transition label');
      }
      assert.equal(r.pjName, zh ? '名称' : 'Name', at + ' Projects: Name');
      assert.equal(r.pjNewName, zh ? '名称' : 'Name', at + ' New project: Name');
      assert.equal(r.storedSeq, 'Main', at + ' stored sequence name');
      assert.deepEqual(r.storedTitle, ['Title', 'Title'], at + ' stored title name / text');
    }
    // a name the user typed is shown as it is
    await read(`(()=>{renameSequence(SeqLib.activeId(seqRoot()),'Main cut');const c=getClip(window.__zh6Title);c.props.text='Hello';state.dirtyTimeline=true;return true;})()`); await wait();
    const own = await read(`(()=>{syncSequenceButton();return [document.querySelector('#btnSequences .seq-name').textContent,(s=>s&&s.slice(s.indexOf('T · ')))([...document.querySelectorAll('.clip-label')].map(l=>l.textContent.trim()).find(s=>s.includes('T · ')))];})()`);
    assert.deepEqual(own, ['Main cut', 'T · Hello'], 'the user\'s own names stay');
    seen.own = own;
    // what the transition label promises: Ctrl-click and Shift-click both remove the transition
    const reset = await read(`(async()=>{const c=getClip(window.__zh6Title),res=[];for(const k of ['ctrlKey','shiftKey']){c.transitionIn={type:'fade',duration:1};renderInspector();
      document.querySelector('#inspector label.insp-reset[data-reset="transIn"]').dispatchEvent(new MouseEvent('click',{bubbles:true,[k]:true}));res.push(c.transitionIn===undefined);}return res;})()`);
    assert.deepEqual(reset, [true, true], 'Ctrl-click and Shift-click remove the transition');
    // the export dialog open while the language changes: the encoder names follow
    const live = await read(`(async()=>{updateMontClipView({language:'zh-CN'});await openExportSetup();
      for(const until=Date.now()+8000;Date.now()<until&&(els.exportSetup.classList.contains('hidden')||!document.querySelector('#dlvEncoder option'));)await new Promise(r=>setTimeout(r,50));
      const names=()=>[...document.querySelectorAll('#dlvEncoder option')].map(o=>[o.value,o.textContent]);
      const zh=names();updateMontClipView({language:'en'});const en=names();closeExportSetup();return {zh,en};})()`);
    for (const [id, label] of live.zh) assert.equal(label, ZH_ENC[id] || Delivery.ENCODERS[id]?.label || id, 'open dialog zh ' + id);
    for (const [id, label] of live.en) assert.equal(label, Delivery.ENCODERS[id]?.label || id, 'open dialog en ' + id);
    seen.encoders = live;
    ok = true;
  } catch (e) { seen.error = String(e && e.message || e).slice(0, 1500); }
  finally { out(ok ? 'ZH6_PASS' : 'ZH6_FAIL', ok ? { checked: Object.keys(seen), encoders: seen.encoders } : { error: seen.error }); process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) { if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow { constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; } return load.call(this, id, ...args); }; }
require('./main');
