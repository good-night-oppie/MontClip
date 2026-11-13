'use strict';
// Closing during an export (Deja, 2026-11-03; VV's spec §7 item 10): the real main.js and page, a fresh profile, a hidden
// offscreen window, a synthetic recording (ffmpeg testsrc2 + a sine, 320×180, 30 fps, 20 s). The close prompt is the
// real one; only dialog.showMessageBox is answered by this script (no native box opens), and the options it got are printed.
//   MONTCLIP_CLOSE_CASE=keep  electron desktop/export-close-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
//     close during an export → the prompt → 「继续导出」 → the window stays and the export completes; then, not exporting
//     (one unsaved video in the queue), close → no prompt, the app quits.
//   MONTCLIP_CLOSE_CASE=stop  … same command
//     one short export first (its copy stays in exports/), two unsaved videos in the queue, then close during a long
//     export → the prompt says 2 → 「停止导出并关闭」 → the app quits; no half-finished file, no fablecut-XXXX folder,
//     the exported copy is still there.
//   MONTCLIP_CLOSE_CASE=unsaved  … not exporting, two copies this session exported plus an unrelated file in the queue:
//     close → 「先去保存」 → the window stays and the queue opens; close again → 「删掉它们并关闭」 with one copy held open
//     (PowerShell, no sharing) → 「有 1 个视频删不掉…」, the window still open → released, 「再试一次」 → the app quits;
//     both copies gone, the unrelated file still there.
//   MONTCLIP_CLOSE_CASE=unsaved-keep  … close → 「不删，直接关闭」 → the app quits; the copies are still there.
// ffmpeg: MONTCLIP_FFMPEG_DIR (MontClip's own build). Prints CLOSE_PASS / CLOSE_FAIL.
const electron = require('electron'), { app, BrowserWindow } = electron, fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process'), os = require('node:os');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const CASE = process.env.MONTCLIP_CLOSE_CASE;
if (!['keep', 'stop', 'unsaved', 'unsaved-keep'].includes(CASE)) throw Error('MONTCLIP_CLOSE_CASE=keep|stop|unsaved|unsaved-keep');
const exportsDir = path.join(profile, 'workspace', 'exports');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');
const prompts = [], checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) }); };
const leftovers = () => fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter((f) => f.includes('.part') || f.startsWith('fablecut-')) : [];
let answeredAt = 0;

// answers the prompts: 「继续导出」 (keep) or 「停止导出并关闭」 (stop); the unsaved cases set answer(); any other box: its default
const ExportClose = require('./export-close');
let answer = (o) => o.message === ExportClose.dialogOptions('zh-CN', 0).message ? (CASE === 'keep' ? ExportClose.KEEP : ExportClose.STOP) : o.defaultId;
const fakeDialog = { ...electron.dialog, showMessageBox: async (...args) => {
  const o = args.find((x) => x && typeof x === 'object' && Array.isArray(x.buttons));
  prompts.push({ message: o.message, detail: o.detail, buttons: o.buttons, defaultId: o.defaultId, cancelId: o.cancelId });
  out('EXPORT_CLOSE_PROMPT', prompts[prompts.length - 1]);
  const response = await answer(o);
  answeredAt = Date.now();
  return { response, checkboxChecked: false };
} };

function recording() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-close-rec-')), file = path.join(dir, 'rec.mp4');
  execFileSync(require('../server/ffmpeg-path').path('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=20',
    '-f', 'lavfi', '-i', 'sine=f=440:d=20:sample_rate=48000', '-c:v', process.env.MONTCLIP_CLOSE_ENCODER || 'h264_mf', '-pix_fmt', 'yuv420p', '-g', '30', '-movflags', '+faststart', '-c:a', 'aac', '-shortest', file], { windowsHide: true });
  const bytes = fs.readFileSync(file); fs.rmSync(dir, { recursive: true, force: true }); return bytes;
}

async function setup({ b64, seconds }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200 && !runtime.projectId; i++) await wait(50);
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const up = await fetch('/api/upload?name=' + encodeURIComponent('合成录像.mp4'), { method: 'POST', body: new Blob([bin]) });
  if (!up.ok) throw Error('upload ' + up.status);
  const { src } = await up.json();
  window.__closeSmoke = { src };
  const doc = projectJSON();
  Object.assign(doc, { name: '导出中关窗', width: 320, height: 180, fps: 30,
    media: [{ id: 'rec', src, kind: 'video', name: '合成录像.mp4', duration: 20, width: 320, height: 180 }],
    clips: [{ id: 'v', kind: 'video', mediaId: 'rec', track: 'V1', start: 0, in: 0, duration: seconds, props: {} }] });
  applyProject(doc); scheduleSave(); if (!await flushSave()) throw Error('save failed');
  setTime(0); await fetchEncodeProfiles();
  return true;
}
async function setLength(seconds) {
  const doc = projectJSON(); doc.clips[0].duration = seconds; applyProject(doc); scheduleSave(); return await flushSave();
}

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  out('CLOSE_HOOK', { case: CASE });
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // the bundled LGPL ffmpeg has no libx264: MONTCLIP_CLOSE_ENCODER (default h264_mf) as in the A/V sync smoke
  const spec = JSON.stringify({ preset: 'master', video: { codec: 'h264', encoder: process.env.MONTCLIP_CLOSE_ENCODER || 'h264_mf' } });
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    out('CLOSE_STAGE', 'connected');
    const b64 = recording().toString('base64');
    out('CLOSE_STAGE', 'recording ' + b64.length);
    if (CASE === 'unsaved' || CASE === 'unsaved-keep') {
      await read(`(${setup.toString()})(${JSON.stringify({ b64, seconds: 1 })})`);
      const a1 = await read(`fastExport({silent:true,delivery:${spec}})`), a2 = await read(`fastExport({silent:true,delivery:${spec}})`);
      const f1 = a1.outputs[0].file, f2 = a2.outputs[0].file;
      const other = '别的软件放的.mp4'; fs.writeFileSync(path.join(exportsDir, other), 'not exported by MontClip');
      const row = (id, f) => ({ id, status: 'done', file: f, src: '/exports/' + encodeURIComponent(f), label: 'Master', spec: JSON.parse(spec), name: id, range: 'entire', progress: 1 });
      await read(`exportQueue.push(...${JSON.stringify([row('q1', f1), row('q2', f2), row('q3', other)])}.map((q) => ({ ...q, spec: normalizeDelivery(q.spec).spec })));try{renderQueue()}catch{};true`);
      const there = () => [f1, f2, other].map((f) => fs.existsSync(path.join(exportsDir, f)));
      check('two copies exported this session, one unrelated file', there().every(Boolean), { f1, f2, other });
      if (CASE === 'unsaved-keep') {
        answer = () => ExportClose.UNSAVED.KEEP;
        app.once('quit', () => {
          check('one prompt: 还有 3 个视频没保存', prompts.length === 1 && prompts[0].message === '还有 3 个视频没保存，现在关掉吗？', prompts);
          check('不删，直接关闭: every copy still there', there().every(Boolean), there());
          const pass = checks.every((c) => c.ok);
          out(pass ? 'CLOSE_PASS' : 'CLOSE_FAIL', { case: CASE, checks });
          process.exitCode = pass ? 0 : 1; app.exit(pass ? 0 : 1);
        });
        win.close();
        await new Promise(() => {});   // main.js's own smoke steps must not run (they close the window)
      }
      // 先去保存 (the default; Enter and Esc answer the same): the window stays, the queue opens
      answer = (o) => o.defaultId;
      win.close();
      await wait(1500);
      check('先去保存: the prompt was the unsaved one, 先去保存 the default', prompts[0] && prompts[0].message === '还有 3 个视频没保存，现在关掉吗？' && prompts[0].buttons[prompts[0].defaultId] === '先去保存', prompts[0]);
      check('先去保存: the window stays', !win.isDestroyed());
      check('先去保存: the export queue is open', await read(`!document.getElementById('exportQueue').classList.contains('hidden')`));
      check('先去保存: nothing deleted', there().every(Boolean), there());
      // 删掉它们并关闭 with f2 held open by another program
      const target = path.join(exportsDir, f2).split("'").join("''");
      const lock = require('node:child_process').spawn('powershell', ['-NoProfile', '-Command',
        "$f=[IO.File]::Open('" + target + "','Open','Read','None'); [Console]::Out.WriteLine('LOCKED'); [Console]::In.ReadLine() | Out-Null; $f.Close()"],
        { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      await new Promise((r) => lock.stdout.on('data', (d) => { if (String(d).includes('LOCKED')) r(); }));
      let failures = 0;
      answer = async (o) => {
        if (o.buttons.length === 3) return ExportClose.UNSAVED.DELETE;
        check('删不掉: the window is still open', !win.isDestroyed());
        if (++failures === 1) {
          // f2 is held by a player; the unrelated file is refused by the server (not this session's): both named (Deja)
          check('删不掉: 有 2 个视频删不掉, both named', o.message === '有 2 个视频删不掉，可能正被别的软件打开着。' && o.detail.split('\n').slice(0, 2).join('|') === f2 + '|' + other, [o.message, o.detail]);
          check('删不掉: f1 deleted, f2 still there', !fs.existsSync(path.join(exportsDir, f1)) && fs.existsSync(path.join(exportsDir, f2)), there());
          lock.stdin.write('\n'); await new Promise((r) => lock.once('exit', r));
          return ExportClose.FAILED.RETRY;
        }
        // after 再试一次: f2 is gone; the refused file is still named, and the window still waits for an answer
        check('再试一次: f2 deleted, the refused file named alone', o.message === '有 1 个视频删不掉，可能正被别的软件打开着。' && o.detail.split('\n')[0] === other && !fs.existsSync(path.join(exportsDir, f2)), [o.message, o.detail]);
        return ExportClose.FAILED.GIVE_UP;
      };
      app.once('quit', () => {
        check('the copies this session exported are gone', !fs.existsSync(path.join(exportsDir, f1)) && !fs.existsSync(path.join(exportsDir, f2)), there());
        check('the unrelated file is still there', fs.existsSync(path.join(exportsDir, other)));
        check('prompts: unsaved, 先去保存; unsaved, delete; two failures', prompts.length === 4, prompts.map((p) => p.message));
        const pass = checks.every((c) => c.ok);
        out(pass ? 'CLOSE_PASS' : 'CLOSE_FAIL', { case: CASE, checks });
        process.exitCode = pass ? 0 : 1; app.exit(pass ? 0 : 1);
      });
      win.close();
      await new Promise(() => {});
    }
    if (CASE === 'stop') {
      await read(`(${setup.toString()})(${JSON.stringify({ b64, seconds: 1 })})`);
      const short = await read(`fastExport({silent:true,delivery:${spec}})`);
      check('the short export finished', short && short.outputs && short.outputs[0] && short.outputs[0].ok, short);
      const file = short.outputs[0].file;
      // two exported videos not saved yet (one of them that file), one saved, one waiting: n must be 2
      const row = (id, status, f, saved) => ({ id, status, file: f, src: f ? '/exports/' + encodeURIComponent(f) : undefined, saved, label: 'Master', spec: JSON.parse(spec), name: id, range: 'entire', progress: status === 'done' ? 1 : 0 });
      await read(`exportQueue.push(...${JSON.stringify([row('q1', 'done', file), row('q2', 'done', 'b.mp4'), row('q3', 'done', 'c.mp4', true), row('q4', 'pending')])}.map((q) => ({ ...q, spec: normalizeDelivery(q.spec).spec })));try{renderQueue()}catch{};true`);
      await read(`(${setLength.toString()})(20)`);
      for (const ev of ['before-quit', 'will-quit', 'window-all-closed']) app.on(ev, () => out('CLOSE_EVENT', { ev, ms: Date.now() - answeredAt, part: leftovers() }));
      app.once('quit', () => {
        const ms = Date.now() - answeredAt;
        check('one prompt', prompts.length === 1, prompts.length);
        check('the prompt says 2 unsaved videos', prompts[0] && prompts[0].detail.split('\n')[1] === '导出队列里还有 2 个没保存的视频，关掉以后它们不会再出现在队列里，但还占着 C 盘空间。', prompts[0] && prompts[0].detail);
        check('「继续导出」 is the default and the Esc answer', prompts[0] && prompts[0].buttons[prompts[0].defaultId] === '继续导出' && prompts[0].cancelId === prompts[0].defaultId);
        check('no half-finished file, no fablecut-XXXX folder', leftovers().length === 0, leftovers());
        check('the exported copy that was not saved is still there', fs.existsSync(path.join(exportsDir, file)), file);
        check('quit within before-quit\'s 4 s of the answer (plus the project save)', ms < 6000, ms);
        const pass = checks.every((c) => c.ok);
        out(pass ? 'CLOSE_PASS' : 'CLOSE_FAIL', { case: CASE, quitMs: ms, checks });
        process.exitCode = pass ? 0 : 1; app.exit(pass ? 0 : 1);
      });
      await read(`window.__long = fastExport({silent:true,delivery:${spec}}); true`);
      const until = Date.now() + 30000;
      while (Date.now() < until && !(leftovers().some((f) => f.includes('.part')) && fs.statSync(path.join(exportsDir, leftovers().find((f) => f.includes('.part')))).size > 0)) await wait(50);
      check('exporting: a half-finished file exists', leftovers().some((f) => f.includes('.part')), leftovers());
      win.close();
      await new Promise(() => {});
    }
    // keep
    await read(`(${setup.toString()})(${JSON.stringify({ b64, seconds: 6 })})`);
    out('CLOSE_STAGE', 'setup');
    await read(`window.__long = fastExport({silent:true,delivery:${spec}}).then(r=>(window.__done=r,r)); true`);
    const until = Date.now() + 30000;
    while (Date.now() < until && !leftovers().some((f) => f.includes('.part'))) await wait(50);
    check('exporting: a half-finished file exists', leftovers().some((f) => f.includes('.part')), leftovers());
    out('CLOSE_STAGE', { exporting: await read('state.exporting'), done: await read('window.__done || null'), files: fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir) : null });
    win.close();                                   // × (Alt+F4 is the same close)
    await wait(1500);
    check('one prompt', prompts.length === 1, prompts.length);
    check('no unsaved sentence with an empty queue', prompts[0] && !prompts[0].detail.includes('导出队列'), prompts[0] && prompts[0].detail);
    check('「继续导出」: the window stays open', !win.isDestroyed());
    win.webContents.on('render-process-gone', (_e, d) => out('CLOSE_STAGE', { gone: d }));
    win.webContents.on('did-start-navigation', (d) => out('CLOSE_STAGE', { navigation: d && d.url || String(d) }));
    let done = null;
    for (let i = 0, end = Date.now() + 90000; Date.now() < end && !done; i++) { await wait(500); done = await read('window.__done || null'); if (i % 20 === 0) out('CLOSE_STAGE', await read('({title: els.exportTitle.textContent, exporting: state.exporting})')); }
    check('「继续导出」: the export completes', done && done.outputs && done.outputs[0] && done.outputs[0].ok, done && (done.error || done.outputs));
    const file = done && done.outputs && done.outputs[0] && done.outputs[0].file;
    check('the exported file is there', file && fs.existsSync(path.join(exportsDir, file)), file);
    check('after it: no half-finished file, no fablecut-XXXX folder', leftovers().length === 0, leftovers());
    // not exporting, nothing unsaved in the queue (the export above was a silent one): no prompt, the app quits
    app.once('quit', () => {
      check('not exporting: no prompt', prompts.length === 1, prompts.length);
      const pass = checks.every((c) => c.ok);
      out(pass ? 'CLOSE_PASS' : 'CLOSE_FAIL', { case: CASE, checks });
      process.exitCode = pass ? 0 : 1; app.exit(pass ? 0 : 1);
    });
    win.close();
    await new Promise(() => {});
  } catch (e) { out('CLOSE_FAIL', { case: CASE, error: String(e && e.message || e), checks, prompts }); setTimeout(() => app.exit(1), 300); }
};
// Hidden, offscreen window: nothing on the desktop, no focus taken. The message box is answered here, never shown.
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, dialog: fakeDialog, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
