'use strict';
// VV (real window, 2026-11-05): a recording moved or deleted from disk, as the page shows it. Fresh profile, hidden
// offscreen window, two synthetic sources (a test pattern with a 440 Hz / 660 Hz tone, 2 s each; MontClip's own ffmpeg),
// V1 + A1 back to back. The second file's sound is decoded first, then the file is deleted, so the export can't lean on
// what was cached. Checked, in the Chinese interface and then the English one: the bin's strip (one file by name with
// 〔找到它…〕, several by number with 〔一个个找回来…〕, no Show button), the card's badge and hover, the Relink dialog's
// 「正在找：…（第 k 个，共 n 个）」 in order, the export reminder and its two buttons (〔先找回来…〕 opens the dialog,
// 〔照样导出〕 exports), the export's sound (the missing part silent, the other one not), and the empty filter.
//   [MONTCLIP_SHOTS_OUT=<folder>] electron desktop/offline-media-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// ffmpeg: MONTCLIP_FFMPEG_DIR (MontClip's own build). Prints OFFLINE_PASS / OFFLINE_FAIL with every check.
const electron = require('electron'), { app, BrowserWindow } = electron, fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), os = require('node:os');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const shotsDir = process.env.MONTCLIP_SHOTS_OUT || null;
if (shotsDir && !path.isAbsolute(shotsDir)) throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
const ffmpeg = require('../server/ffmpeg-path').path('ffmpeg');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');
const ZH = {
  barOne: '⚠ 「tone-b.mp4」找不到了，可能被移走或删掉了。你剪好的都还在，把文件找回来就能接着用。',
  barMany: '⚠ 有 2 个素材找不到了，可能被移走或删掉了。你剪好的都还在，把文件找回来就能接着用。',
  exportOne: '有 1 个素材找不到了，导出时这一段会显示「找不到」的画面、没有声音。先把它找回来再导出吧。',
};
const EN_BAR = '⚠ Can\'t find “tone-b.mp4”. It may have been moved or deleted. Your edits are still there; find the file and you can carry on.';

function sources(dir) {
  const make = (name, hz, color) => {
    const file = path.join(dir, name);
    cp.execFileSync(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-n',
      '-f', 'lavfi', '-i', `color=c=${color}:size=320x180:rate=30:duration=2,format=yuv420p`,
      '-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=48000:duration=2`,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libvpx-vp9', '-b:v', '200k', '-deadline', 'realtime', '-g', '30',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-shortest', '-movflags', '+faststart', file], { windowsHide: true, timeout: 120000 });
    return file;
  };
  return { a: make('tone-a.mp4', 440, 'navy'), b: make('tone-b.mp4', 660, 'teal') };
}
/** mean / max volume (dB) of a stretch of a file's sound. */
function volume(file, from, len) {
  const r = cp.spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-ss', String(from), '-t', String(len), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  const num = (k) => { const m = new RegExp(k + ': (-?[\\d.]+|-inf) dB').exec(r.stderr || ''); return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : null; };
  return { mean: num('mean_volume'), max: num('max_volume') };
}

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  const checks = [], check = (name, ok, seen) => { checks.push({ name, ok: !!ok, ...(ok ? {} : { seen }) }); };
  const shot = async (name, selector) => {
    if (!shotsDir) return;
    await wait(300);
    const rect = selector ? await read(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r?{x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.ceil(r.height)}:null})()`) : null;
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(path.join(shotsDir, name + '.png'), (await (rect ? win.webContents.capturePage(rect) : win.webContents.capturePage())).toPNG());
  };
  const offlineIs = (ids) => read(`(async()=>{scheduleOfflineCheck(0);const want=${JSON.stringify(ids)};const until=Date.now()+15000;
    while(Date.now()<until){if(mediaOffline.size===want.length&&want.every((id)=>mediaOffline.has(id)))return true;await new Promise(r=>setTimeout(r,100));}return false;})()`);
  const view = (language) => read(`updateMontClipView({language:${JSON.stringify(language)},mode:'advanced'}); renderBin(); true`);
  const strip = () => read(`(()=>{const b=document.querySelector('.bin-offline-bar');return b?{text:b.querySelector('span').textContent,buttons:[...b.querySelectorAll('button')].map(x=>x.textContent)}:null})()`);
  const dialogRows = () => read(`[...document.querySelectorAll('#relinkOverlay .relink-row b')].map(b=>b.textContent)`);
  const exportOpen = () => read(`(async()=>{openExportSetup();const until=Date.now()+15000;while(els.exportSetup.classList.contains('hidden')&&Date.now()<until)await new Promise(r=>setTimeout(r,50));await new Promise(r=>setTimeout(r,300));return !els.exportSetup.classList.contains('hidden');})()`);
  let made = null, pass = false;
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    made = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-off-'));
    const src = sources(made), media = path.join(profile, 'workspace', 'media');
    fs.mkdirSync(media, { recursive: true });
    fs.copyFileSync(src.a, path.join(media, 'tone-a.mp4')); fs.copyFileSync(src.b, path.join(media, 'tone-b.mp4'));
    await read(`(async()=>{for(let i=0;i<200&&!runtime.projectId;i++)await new Promise(r=>setTimeout(r,50));
      const doc=projectJSON();
      Object.assign(doc,{name:'合成素材演示',width:320,height:180,fps:30,
        media:[{id:'ma',src:'/media/tone-a.mp4',kind:'video',name:'tone-a.mp4',duration:2,width:320,height:180},
               {id:'mb',src:'/media/tone-b.mp4',kind:'video',name:'tone-b.mp4',duration:2,width:320,height:180}],
        clips:[{id:'va',kind:'video',mediaId:'ma',track:'V1',start:0,in:0,duration:2,props:{volume:0}},
               {id:'aa',kind:'audio',mediaId:'ma',track:'A1',start:0,in:0,duration:2,props:{volume:1}},
               {id:'vb',kind:'video',mediaId:'mb',track:'V1',start:2,in:0,duration:2,props:{volume:0}},
               {id:'ab',kind:'audio',mediaId:'mb',track:'A1',start:2,in:0,duration:2,props:{volume:1}}]});
      applyProject(doc); scheduleSave(); if(!await flushSave())throw Error('save failed');
      await getAudioBuffer(getMedia('mb')); await getAudioBuffer(getMedia('ma')); return true;})()`);
    check('both files are there at first', await offlineIs([]));

    // ── one file missing
    fs.rmSync(path.join(media, 'tone-b.mp4'));
    check('the deleted file is found missing', await offlineIs(['mb']));
    await view('zh-CN'); await wait();
    const s1 = await strip();
    check('zh strip: that file by name', s1 && s1.text === ZH.barOne, s1);
    check('zh strip: one button, 〔找到它…〕 (no Show)', s1 && s1.buttons.length === 1 && s1.buttons[0] === '找到它…', s1);
    const badge = await read(`(()=>{const e=document.querySelector('.bin-item.offline .bin-offline');const it=document.querySelector('.bin-item.offline');return e?{text:e.textContent,title:e.title,item:it.title}:null})()`);
    check('zh badge 「找不到」 and its hover', badge && badge.text === '找不到' && badge.title === '这个文件找不到了。右键选〔重新链接…〕，把它找回来。' && badge.item.split('\n').includes('这个文件找不到了。右键选〔重新链接…〕，把它找回来。'), badge);
    check('zh hover: no path, no user folder', badge && !/[\\/]|Users|home/i.test(badge.item), badge && badge.item);
    const toasts = await read(`[...document.querySelectorAll('.toast, #toast, .toasts > *')].map(t=>t.textContent).join(' | ')`);
    check('no corner toast about it', !/offline|Relink/i.test(toasts), toasts);
    await shot('offline-strip-zh', '#binList');
    await read(`document.querySelector('.bin-offline-bar [data-relink]')?.click(); true`); await wait(600);
    const r1 = await dialogRows();
    check('〔找到它…〕 opens Relink with that file', r1.length === 1 && r1[0] === '正在找：「tone-b.mp4」（第 1 个，共 1 个）', r1);
    await read(`document.getElementById('relinkOverlay')?.remove(); true`);

    // ── the export reminder
    check('the export dialog opens', await exportOpen());
    const ex = await read(`(()=>{const w=document.getElementById('exportOfflineWarn');return w&&w.offsetParent&&!w.classList.contains('hidden')?{text:w.querySelector('span').textContent,buttons:[...w.querySelectorAll('button')].map(b=>b.textContent)}:null})()`);
    check('zh export reminder, JJ\'s second round', ex && ex.text === ZH.exportOne, ex);
    check('zh export reminder buttons 〔先找回来…〕〔照样导出〕', ex && ex.buttons.join('|') === '先找回来…|照样导出', ex);
    await shot('offline-export-zh', '#exportSetup .dialog');
    await read(`document.querySelector('#exportOfflineWarn [data-off-find]')?.click(); true`); await wait(600);
    const afterFind = await read(`({setupHidden:els.exportSetup.classList.contains('hidden'),rows:[...document.querySelectorAll('#relinkOverlay .relink-row b')].map(b=>b.textContent),exporting:!!window.__mcExport})`);
    check('〔先找回来…〕 closes export and opens Relink, no export', afterFind.setupHidden && afterFind.rows.join() === '正在找：「tone-b.mp4」（第 1 个，共 1 个）' && !afterFind.exporting, afterFind);
    await read(`document.getElementById('relinkOverlay')?.remove(); true`);

    // ── 〔照样导出〕: the export runs, and the missing part is silent
    await read(`window.__mcExport=null; { const f=fastExport; fastExport=(...a)=>(window.__mcExport=f(...a)); } true`); await exportOpen();
    const res = await read(`(async()=>{const b=document.querySelector('#exportOfflineWarn [data-off-go]');if(b)b.click();else startChosenExport();
      for(let i=0;i<50&&!window.__mcExport;i++)await new Promise(r=>setTimeout(r,100));
      if(!window.__mcExport)return {error:'no export started',button:!!b};const r=await window.__mcExport;return {button:!!b,src:r&&r.outputs&&r.outputs[0]&&r.outputs[0].src,ok:!!(r&&r.outputs&&r.outputs.every(o=>o.ok)),raw:r&&!r.outputs?JSON.stringify(r).slice(0,300):undefined};})()`);
    check('〔照样导出〕 exports', res && res.button && res.ok && res.src, res);
    if (res && res.src) {
      const file = path.join(profile, 'workspace', 'exports', decodeURIComponent(res.src.replace(/^\/exports\//, '').split('?')[0]));
      const here = volume(file, 0.3, 1.4), gone = volume(file, 2.3, 1.4);
      check('the file that is there is heard (mean > −40 dB)', here.mean != null && here.mean > -40, here);
      check('the missing part is silent (max < −60 dB)', gone.max != null && gone.max < -60, gone);
    }

    // ── English: JJ's sentence
    await view('en'); await wait();
    const s2 = await strip();
    check('en strip, JJ\'s English', s2 && s2.text === EN_BAR && s2.buttons.join() === 'Find it…', s2);
    const enHover = await read(`document.querySelector('.bin-item.offline')?.title || ''`);
    check('en hover: the file\'s name, no path, no user folder', enHover.includes('⚠ Offline: tone-b.mp4 is missing') && !/[\\/]|Users|home/i.test(enHover), enHover);

    // ── several missing: by number, and the dialog goes through them in order
    fs.rmSync(path.join(media, 'tone-a.mp4'));
    check('both files are found missing', await offlineIs(['ma', 'mb']));
    await view('zh-CN'); await wait();
    const s3 = await strip();
    check('zh strip: how many, 〔一个个找回来…〕', s3 && s3.text === ZH.barMany && s3.buttons.join() === '一个个找回来…', s3);
    await read(`document.querySelector('.bin-offline-bar [data-relink]')?.click(); true`); await wait(600);
    const r3 = await dialogRows();
    check('Relink marks each one in order', r3.join('|') === '正在找：「tone-a.mp4」（第 1 个，共 2 个）|正在找：「tone-b.mp4」（第 2 个，共 2 个）', r3);
    await shot('offline-relink-zh', '#relinkOverlay .dialog');
    await read(`document.getElementById('relinkOverlay')?.remove(); true`);
    // what Show did: the filter lists the missing ones
    await read(`setBinFilter('offline'); true`); await wait();
    const listed = await read(`({names:[...document.querySelectorAll('#binList .bin-item .bin-name')].map(n=>n.textContent),option:[...els.binFilter.options].find(o=>o.value==='offline')?.textContent})`);
    check('the filter still lists the missing ones', listed.names.join() === 'tone-a.mp4,tone-b.mp4' && listed.option === '⚠ 找不到（2）', listed);
    const zhText = await read(`[...document.querySelectorAll('#binList .bin-item, #binList [data-relink-all]')].map(e=>e.innerText+' '+e.title+' '+[...e.querySelectorAll('.bin-offline')].map(b=>b.title).join(' ')).join(' ')`);
    check('nothing on the Chinese cards or the find button says offline / Relink / Show', !/offline|relink|\bshow\b/i.test(zhText), zhText.slice(0, 400));
    // put them back: the filter says nothing is missing
    fs.copyFileSync(src.a, path.join(media, 'tone-a.mp4')); fs.copyFileSync(src.b, path.join(media, 'tone-b.mp4'));
    check('the files are back', await offlineIs([]));
    await read(`renderBin(); true`); await wait();
    const none = await read(`document.querySelector('#binList .bin-noresult')?.textContent || null`);
    check('the empty filter says 「素材都在，没有找不到的。」', none === '素材都在，没有找不到的。', none);
    // the bin's two other English lines VV saw (Chinese drafts, for JJ)
    const binLines = await read(`(()=>{setBinFilter('');project.folders.push({id:'f_smoke',name:'B-roll',parentId:null,open:true});renderBin();
      return {root:document.querySelector('#binList .bin-drop-root')?.textContent||null,hint:document.querySelector('#binEmpty .hint')?.textContent||null};})()`);
    check('zh bin: 「拖到这里，移出文件夹」 and 「双击可以先预览…」', binLines.root === '拖到这里，移出文件夹' && binLines.hint === '双击可以先预览，或者直接拖到时间线上。', binLines);
    // JJ: three missing, two of them found under the same name (copies in media/moved/): those two are linked without
    // asking, the dialog asks about the third only, and when the round ends she is told 「已经自动找回 2 个」
    fs.copyFileSync(src.b, path.join(media, 'tone-c.mp4'));
    await read(`project.media.push({id:'mc',src:'/media/tone-c.mp4',kind:'video',name:'tone-c.mp4',duration:2,width:320,height:180});
      project.clips.push({id:'vc',kind:'video',mediaId:'mc',track:'V1',start:4,in:0,duration:2,props:{volume:0}}); renderBin(); scheduleSave(); true`);
    check('the third file is there', await offlineIs([]));
    for (const f of ['tone-a.mp4', 'tone-b.mp4', 'tone-c.mp4']) fs.rmSync(path.join(media, f));
    fs.mkdirSync(path.join(media, 'moved'), { recursive: true });
    fs.copyFileSync(src.a, path.join(media, 'moved', 'tone-a.mp4')); fs.copyFileSync(src.b, path.join(media, 'moved', 'tone-b.mp4'));
    check('three files are found missing', await offlineIs(['ma', 'mb', 'mc']));
    await view('zh-CN'); await read(`setBinFilter(''); document.getElementById('toast').textContent=''; true`); await wait();
    await read(`document.querySelector('.bin-offline-bar [data-relink]')?.click(); true`);
    const r4 = await read(`(async()=>{const until=Date.now()+15000;while(!document.getElementById('relinkOverlay')&&Date.now()<until)await new Promise(r=>setTimeout(r,50));
      return {rows:[...document.querySelectorAll('#relinkOverlay .relink-row b')].map(b=>b.textContent),a:getMedia('ma').src,b:getMedia('mb').src,toast:document.getElementById('toast').textContent};})()`);
    check('the two found by name are linked without asking; the dialog asks only about the third', r4.rows.join('|') === '正在找：「tone-c.mp4」（第 1 个，共 1 个）' && r4.a === '/media/moved/tone-a.mp4' && r4.b === '/media/moved/tone-b.mp4', r4);
    check('no toast while she is still being asked', !/自动找回|Relinked/.test(r4.toast), r4.toast);
    await read(`document.querySelector('#relinkOverlay [data-cancel]').click(); true`); await wait(400);
    const t4 = await read(`document.getElementById('toast').textContent`);
    check('the round ends with 「已经自动找回 2 个」', t4 === '已经自动找回 2 个', t4);
    pass = checks.every((c) => c.ok);
  } catch (e) { checks.push({ name: 'error', ok: false, seen: String(e && e.message || e).slice(0, 600) }); }
  finally {
    if (made) try { fs.rmSync(made, { recursive: true, force: true }); } catch {}
    out(pass ? 'OFFLINE_PASS' : 'OFFLINE_FAIL', { passed: checks.filter((c) => c.ok).length, of: checks.length, failed: checks.filter((c) => !c.ok) });
    process.exitCode = pass ? 0 : 1;
    app.exit(pass ? 0 : 1);
  }
  await new Promise(() => {});
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
