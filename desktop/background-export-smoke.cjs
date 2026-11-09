'use strict';
// Background export (MontClip#263): the real main.js and page, a fresh profile, a hidden offscreen window, a synthetic
// recording (ffmpeg testsrc2 + a sine, 320×180, 30 fps, 20 s; no real footage). Input is real input events
// (webContents.sendInputEvent), not function calls, wherever the streamer would click or press a key.
//   electron desktop/background-export-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// 1. Export (the dialog's own 〔导出〕 button, Fast) → the progress window → 〔关掉窗口，接着剪〕 → nothing covers the editor;
//    a click selects a clip on the timeline, the Inspector shows it, Home moves the playhead; the top bar shows 导出中 N%.
// 2. While it renders: the second clip is selected and deleted (Delete key) and the edit is saved.
// 3. It finishes: a toast that names the timeline's time and says later edits are not in it; the queue has the file;
//    ffprobe: the file is 12 s long (both clips, as at the click), not 6 s; the saved project has one clip (the export
//    page wrote nothing back).
// 4. A second export on a 20 s timeline: the top bar button reopens the progress window, 〔取消〕 → it stops; the queue
//    says 已停下; no .part file and no fablecut-XXXX folder are left in exports/.
// ffmpeg: MontClip's own build (vendor/ffmpeg or MONTCLIP_FFMPEG_DIR). Encoder MONTCLIP_BG_ENCODER (default h264_mf).
// Prints BG_EXPORT_PASS / BG_EXPORT_FAIL.
const electron = require('electron'), { app, BrowserWindow } = electron, fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process'), os = require('node:os');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const exportsDir = path.join(profile, 'workspace', 'exports');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) }); out(ok ? 'BG_CHECK_OK' : 'BG_CHECK_FAIL', { name, detail }); };
const leftovers = () => fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter((f) => f.includes('.part') || f.startsWith('fablecut-')) : [];
const ffPath = require('../ffmpeg-path');
const ENCODER = process.env.MONTCLIP_BG_ENCODER || 'h264_mf';

function recording() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-bg-rec-')), file = path.join(dir, 'rec.mp4');
  execFileSync(ffPath.path('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=20',
    '-f', 'lavfi', '-i', 'sine=f=440:d=20:sample_rate=48000', '-c:v', ENCODER, '-pix_fmt', 'yuv420p', '-g', '30', '-movflags', '+faststart', '-c:a', 'aac', '-shortest', file], { windowsHide: true });
  const bytes = fs.readFileSync(file); fs.rmSync(dir, { recursive: true, force: true }); return bytes;
}
function seconds(file) {
  return Number(execFileSync(ffPath.path('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', windowsHide: true }).trim());
}

/* in the page: upload the recording, two clips (0–6 s from 0 s, 6–12 s from 10 s), or one 20 s clip */
async function setup({ b64, long }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200 && !runtime.projectId; i++) await wait(50);
  let src = window.__bgSmokeSrc;
  if (!src) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const up = await fetch('/api/upload?name=' + encodeURIComponent('合成录像.mp4'), { method: 'POST', body: new Blob([bin]) });
    if (!up.ok) throw Error('upload ' + up.status);
    src = window.__bgSmokeSrc = (await up.json()).src;
  }
  const doc = projectJSON();
  Object.assign(doc, { name: '后台导出', width: 320, height: 180, fps: 30, inPoint: null, outPoint: null,
    media: [{ id: 'rec', src, kind: 'video', name: '合成录像.mp4', duration: 20, width: 320, height: 180 }],
    clips: long ? [{ id: 'A', kind: 'video', mediaId: 'rec', track: 'V1', start: 0, in: 0, duration: 20, props: {} }]
      : [{ id: 'A', kind: 'video', mediaId: 'rec', track: 'V1', start: 0, in: 0, duration: 6, props: {} },
        { id: 'B', kind: 'video', mediaId: 'rec', track: 'V1', start: 6, in: 10, duration: 6, props: {} }] });
  applyProject(doc); scheduleSave(); if (!await flushSave()) throw Error('save failed');
  setTime(0); await fetchEncodeProfiles(); await fetchDeliveryInfo();
  // the page saves exports through the native Save window; here the file stays in exports/ and its name is noted
  window.__saved = []; saveDownload = (src, name) => { window.__saved.push(name); };
  return true;
}

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, wc = win.webContents, read = (s) => wc.executeJavaScript(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (sel) => {
    const r = await read(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.left+Math.min(b.width/2,30)),y:Math.round(b.top+b.height/2),w:b.width,h:b.height};})()`);
    if (!r || !r.w || !r.h) throw Error('not on screen: ' + sel);
    // what is under that point is the element itself (or inside it): nothing covers it
    const hit = await read(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}),h=document.elementFromPoint(${r.x},${r.y});return !!h&&(h===e||e.contains(h));})()`);
    wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await wait(150);
    return hit;
  };
  const key = async (keyCode) => { wc.sendInputEvent({ type: 'keyDown', keyCode }); wc.sendInputEvent({ type: 'keyUp', keyCode }); await wait(150); };
  const spec = JSON.stringify({ preset: 'master', video: { codec: 'h264', encoder: ENCODER } });
  const startFromDialog = async () => {
    await read(`openExportSetup()`);
    for (let i = 0; i < 100 && await read(`els.exportSetup.classList.contains('hidden')`); i++) await wait(50);
    await read(`(()=>{els.exportProfileSel.value='d:master';dlvSpec=normalizeDelivery(${spec}).spec;els.engineFast.checked=true;return true;})()`);
    return click('#btnStartExport');
  };
  try {
    await wc.executeJavaScript(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    win.setContentSize(1280, 820);
    const b64 = recording().toString('base64');
    await read(`(${setup.toString()})(${JSON.stringify({ b64 })})`);
    out('BG_STAGE', 'setup');
    check('Fast export can go to the background here', await read('fastExportBlocker()') === null, await read('fastExportBlocker()'));
    check('the dialog\'s Fast note says she can close the window and keep editing', /可以关掉进度窗口，接着剪/.test(await read(`(renderExportEngineText(), document.getElementById('engineFastNote').textContent)`)));
    await startFromDialog();
    await wait(300);
    check('the export runs in the background', await read('bgExportBusy()'));
    check('the progress window opened, with 〔关掉窗口，接着剪〕', await read(`!els.exportOverlay.classList.contains('hidden') && !document.getElementById('btnExportHide').classList.contains('hidden') && document.getElementById('btnExportHide').textContent`) === '关掉窗口，接着剪');
    check('its note', await read('els.exportNote.textContent') === await read(`uiText('term.engine-fast-note')`));
    await click('#btnExportHide');
    check('〔关掉窗口，接着剪〕 closes it', await read(`els.exportOverlay.classList.contains('hidden')`));
    check('the editor is not in its exporting state', await read('!state.exporting && !state.rendering'));
    // wait until frames are rendering, then use the editor
    for (let i = 0; i < 600 && !(await read('(bgExport.job() && bgExport.job().progress) || 0') > 0.02); i++) await wait(25);
    const t0 = Date.now(), p0 = await read('(bgExport.job() && bgExport.job().progress) || 0');
    out('BG_STAGE', { renderingAt: p0 });
    check('the top bar shows the percentage', /^导出中 \d+%$/.test(await read(`document.getElementById('btnExport').textContent`)), await read(`document.getElementById('btnExport').textContent`));
    check('a click on clip A reaches it (nothing covers the timeline)', await click('.clip[data-id="A"]'));
    check('clip A is selected', await read('state.selId') === 'A', await read('state.selId'));
    check('the Inspector shows a clip', await read(`!!document.querySelector('#inspector, .inspector') && !(document.querySelector('#inspector, .inspector').textContent||'').includes(uiText('own.inspector-empty'))`));
    await read('setTime(3); true');
    await key('Home');
    check('Home moves the playhead to the start', await read('state.time') === 0, await read('state.time'));
    check('clip B is selected by a click', await click('.clip[data-id="B"]') && await read('state.selId') === 'B');
    await key('Delete');
    check('Delete removes clip B from the timeline', await read(`project.clips.map(c=>c.id).join()`) === 'A', await read(`project.clips.map(c=>c.id).join()`));
    check('the edit is saved', await read('flushSave()'));
    const p1 = await read('(bgExport.job() && bgExport.job().progress) || 0');
    check('all that took place while the export was rendering frames', await read('bgExportBusy()') && p0 > 0 && p1 > p0, { ms: Date.now() - t0, from: p0, to: p1 });
    const queueRow = await read(`(()=>{const q=exportQueue.find(q=>q.bg);return q&&{status:q.status,progress:q.progress};})()`);
    check('the queue lists it as running', queueRow && queueRow.status === 'running', queueRow);
    let busy = true;
    for (let i = 0; i < 1200 && busy; i++) { await wait(100); busy = await read('bgExportBusy()'); }
    const q = await read(`(()=>{const q=exportQueue.find(q=>q.bg);return q&&{status:q.status,file:q.file,note:q.note,error:q.error,code:q.code,report:q.report};})()`);
    out('BG_STAGE', { q });
    check('it finished, and the queue has the file', q && q.status === 'done' && q.file, q);
    const toastText = await read('els.toast.textContent');
    check('the toast names the file and says later edits are not in it', toastText.includes(q.file) && /用的是 \d\d:\d\d:\d\d 开始导出时的时间线，之后的改动不在这个文件里。/.test(toastText), toastText);
    check('the file is handed to the Save window as before', (await read('window.__saved')).includes(q.file));
    const file = path.join(exportsDir, q.file), len = seconds(file);
    check('the file is the timeline as it was at the click: 12 s (both clips), not 6 s', Math.abs(len - 12) < 0.25, len);
    const disk = JSON.parse(fs.readFileSync(path.join(profile, 'workspace', 'project.json'), 'utf8'));
    check('the saved project keeps her edit (the export page wrote nothing back)', disk.clips.map((c) => c.id).join() === 'A', disk.clips.map((c) => c.id));
    check('the top bar is the Export button again', !/%/.test(await read(`document.getElementById('btnExport').textContent`)));
    check('no hidden export page is left', await read(`document.querySelectorAll('iframe.bg-export-frame').length`) === 0);
    // 4. cancel
    await read(`(${setup.toString()})(${JSON.stringify({ long: true })})`);
    await startFromDialog();
    await click('#btnExportHide');
    for (let i = 0; i < 600; i++) { await wait(100); const p = await read('bgExport.job() && bgExport.job().progress'); if (p > 0.1) break; }
    const partSeen = leftovers().some((f) => f.includes('.part'));
    check('the top bar button opens the progress window again', await click('#btnExport') && await read(`!els.exportOverlay.classList.contains('hidden')`));
    await click('#btnCancelExport');
    for (let i = 0; i < 200 && await read('bgExportBusy()'); i++) await wait(100);
    const c = await read(`(()=>{const q=exportQueue.filter(q=>q.bg).at(-1);return q&&{status:q.status};})()`);
    check('〔取消〕 stops it; the queue says 已停下', c && c.status === 'cancelled' && !(await read('bgExportBusy()')), c);
    check('the toast says no file was kept', (await read('els.toast.textContent')) === '导出已取消，没有留下文件。', await read('els.toast.textContent'));
    let left = leftovers();
    for (let i = 0; i < 50 && left.length; i++) { await wait(100); left = leftovers(); }
    check('no half-finished file and no fablecut-XXXX folder left (a .part existed while it ran: ' + partSeen + ')', left.length === 0, left);
    check('the files in exports/: only the first export', fs.readdirSync(exportsDir).filter((f) => !f.startsWith('.')).join() === q.file, fs.readdirSync(exportsDir));
    const pass = checks.every((x) => x.ok);
    out(pass ? 'BG_EXPORT_PASS' : 'BG_EXPORT_FAIL', { checks: checks.filter((x) => !x.ok) });
    process.exitCode = pass ? 0 : 1; app.exit(pass ? 0 : 1);
  } catch (e) { out('BG_EXPORT_FAIL', { error: String(e && e.stack || e), checks }); setTimeout(() => app.exit(1), 300); }
  await new Promise(() => {});   // main.js's own smoke steps must not run (they close the window)
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
