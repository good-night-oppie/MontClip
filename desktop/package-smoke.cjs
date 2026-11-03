'use strict';
/* Smoke test of the Windows internal package itself (Deja, 2026-11-02). Node, outside Electron:

     node desktop/package-smoke.cjs <MontClip-internal-win-x64-….zip>

   1. The zip's sha256 must equal its line in SHA256SUMS.txt beside it.
   2. It is unpacked with PowerShell's Expand-Archive into a new folder whose path has Chinese characters and a space, and
      MontClip.exe is started with a new, empty profile (--user-data-dir).
   3. Nothing appears on the screen: the program runs on a separate Windows desktop made for this test (CreateDesktop),
      so no window is shown, raised or focused and the user's mouse and keyboard are never touched. It is driven
      through the DevTools protocol (--remote-debugging-port=0; the port is read from the profile).
   4. Checks: the editor window loads and connects to its service; a synthetic MP4 (made with the packaged ffmpeg) is
      imported through the editor's own file input; it is exported to MP4 by the editor (an export job); while the
      export runs, every ffmpeg.exe process is the one inside the package; the exported file is an MP4 that the packaged
      ffprobe reads. Whether the highlight-candidates entry exists, and opens, is reported (it comes with #52).
   5. The window is closed the normal way; the exit code is recorded; no MontClip.exe or ffmpeg.exe from the package is
      left running. The unpacked folder and the profile are deleted. Prints PACKAGE_SMOKE_COMPLETE {…} or PACKAGE_SMOKE_FAIL. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const zip = path.resolve(process.argv[2] || '');
// --no-path-ffmpeg (Deja): start the app with every PATH folder holding ffmpeg / ffprobe taken out, as on a computer with no FFmpeg
const noPath = process.argv.includes('--no-path-ffmpeg');
const NP = require('./smoke-no-path.cjs');
if (!process.argv[2] || !fs.existsSync(zip)) { console.error('usage: node desktop/package-smoke.cjs <zip> [--no-path-ffmpeg]'); process.exit(2); }
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (script) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' + script], { encoding: 'utf8', windowsHide: true }).stdout || '';

// a separate desktop, and the program started on it; prints PID, then EXIT <code> when it ends
const LAUNCHER = String.raw`
param([string]$Exe, [string]$ArgLine, [string]$Desk)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class HiddenDesk {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct SI { public int cb; public string r; public string desk; public string title; public int x, y, w, h, cx, cy, fill, flags; public short show, r2; public IntPtr r3, i, o, e; }
  [StructLayout(LayoutKind.Sequential)] public struct PI { public IntPtr hp, ht; public int pid, tid; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateDesktop(string name, IntPtr d, IntPtr m, int f, uint access, IntPtr sa);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool CloseDesktop(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref SI si, out PI pi);
  [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] public static extern bool GetExitCodeProcess(IntPtr h, out uint code);
}
"@
$h = [HiddenDesk]::CreateDesktop($Desk, [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero)
if ($h -eq [IntPtr]::Zero) { "DESKTOP_FAILED $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"; exit 3 }
$si = New-Object HiddenDesk+SI; $si.cb = [Runtime.InteropServices.Marshal]::SizeOf($si); $si.desk = "WinSta0\$Desk"
$pi = New-Object HiddenDesk+PI
if (-not [HiddenDesk]::CreateProcess($Exe, "\`"$Exe\`" $ArgLine", [IntPtr]::Zero, [IntPtr]::Zero, $false, 0, [IntPtr]::Zero, (Split-Path $Exe), [ref]$si, [ref]$pi)) { "LAUNCH_FAILED $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"; exit 4 }
"PID $($pi.pid)"
[Console]::Out.Flush()
[void][HiddenDesk]::WaitForSingleObject($pi.hp, [uint32]::MaxValue)
$code = 0; [void][HiddenDesk]::GetExitCodeProcess($pi.hp, [ref]$code)
"EXIT $code"
[void][HiddenDesk]::CloseDesktop($h)
`;

async function cdp(port) {
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(t.url)); } catch {}
    if (!page) await wait(200);
  }
  if (!page) throw Error('no editor page');
  const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(); let id = 0;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(Error('devtools socket')); });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, (d) => (d.error ? rej(Error(method + ': ' + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: n, method, params })); });
  const read = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  return { send, read, url: page.url, close: () => ws.close() };
}

async function main() {
  const out = { zip: path.basename(zip), round: noPath ? 'no FFmpeg on PATH' : 'normal' };
  // 1. the zip and its sum
  const sums = fs.readFileSync(path.join(path.dirname(zip), 'SHA256SUMS.txt'), 'utf8');
  const listed = sums.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[1] === path.basename(zip));
  out.sha256 = sha(zip);
  assert.ok(listed && listed[0] === out.sha256, 'the zip matches SHA256SUMS.txt');
  // every entry is named with '/' (QQ, #57: they had a backslash), non-ASCII names flagged UTF-8
  const entries = require('./zip-entries.cjs').zipEntries(zip);
  out.zipEntries = { count: entries.length, withBackslash: entries.filter((e) => e.name.includes(String.fromCharCode(92))).length, nonAsciiNotUtf8: entries.filter((e) => /[^\x00-\x7f]/.test(e.name) && !e.utf8).length };
  assert.deepEqual([out.zipEntries.withBackslash, out.zipEntries.nonAsciiNotUtf8], [0, 0], 'zip entry names: ' + JSON.stringify(out.zipEntries));
  // 2. unpack into a new folder with Chinese and a space; a new profile
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'MontClip 包测试 ')), profile = path.join(root, '全新 profile'), media = path.join(root, '合成 素材');
  fs.mkdirSync(profile); fs.mkdirSync(media);
  let child = null, pid = null, exitCode = null;
  try {
    // Expand-Archive, not tar.exe: tar.exe cannot change into a folder whose name has Chinese characters
    const q = (s) => "'" + s.replace(/'/g, "''") + "'";
    const ex = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(root)}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(ex.status, 0, 'unpack: ' + ex.stderr);
    const top = fs.readdirSync(root).find((d) => d.startsWith('MontClip-internal-win-x64-'));
    const appDir = path.join(root, top), exe = path.join(appDir, 'MontClip.exe'), ffDir = path.join(appDir, 'resources', 'ffmpeg');
    // JJ's notes in the root: UTF-8 with a BOM, CRLF, placeholders filled, no internal checklist
    out.readme = ['先看我-使用说明.txt', 'README-first.txt'].map((n) => { const b = fs.readFileSync(path.join(appDir, n)), s = b.toString('utf8');
      return { name: n, bom: b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf, crlf: !/[^\r]\n/.test(s), placeholders: (s.match(/\{[a-z0-9]+\}/g) || []).length, internal: /落地前|实施侧/.test(s), exeNamed: s.includes('MontClip.exe') }; });
    for (const r of out.readme) assert.ok(r.bom && r.crlf && !r.placeholders && !r.internal && r.exeNamed, 'notes: ' + JSON.stringify(r));
    // the URL line in the notes matches the packaged app: JJ's alternative when it hides + URL (#58), v3's otherwise
    const ALT = require('./package-readme/url-hidden.json'), hides = fs.readFileSync(path.join(appDir, 'resources', 'app', 'app.js'), 'utf8').includes(ALT.marker);
    out.readmeUrlLine = hides ? "JJ's alternative (app hides + URL)" : 'v3 (app shows + URL)';
    for (const [n, lang] of [['先看我-使用说明.txt', 'zh-CN'], ['README-first.txt', 'en']]) {
      const t = fs.readFileSync(path.join(appDir, n), 'utf8');
      assert.ok(t.includes(hides ? ALT[lang].to : ALT[lang].from) && !t.includes(hides ? ALT[lang].from : ALT[lang].to), n + ': the URL line matches the app');
    }
    // the export-copy line matches it too: gone when the packaged app has the fix that removes each export's copy
    const COPY = require('./package-readme/exports-fixed.json'), pkgRead = (f) => { try { return fs.readFileSync(path.join(appDir, 'resources', 'app', 'desktop', f), 'utf8'); } catch { return ''; } };
    const appRead = (f) => { try { return fs.readFileSync(path.join(appDir, 'resources', 'app', f), 'utf8'); } catch { return ''; } };
    const copyGone = pkgRead('main.js').includes(COPY.marker) && pkgRead('main.js').includes(COPY.expects) && pkgRead('export-downloads.js').includes(COPY.removes) && appRead('server.js').includes(COPY.registers);
    out.readmeCopyLine = copyGone ? (!COPY['zh-CN'].to ? 'removed (app keeps no export copy)' : "JJ's replacement (app keeps no export copy)") : 'as written (app keeps export copies)';
    for (const [n, lang] of [['先看我-使用说明.txt', 'zh-CN'], ['README-first.txt', 'en']]) {
      const lines = fs.readFileSync(path.join(appDir, n), 'utf8').replace(/^\uFEFF/, '').split('\r\n'), has = lines.includes(COPY[lang].from);
      assert.ok(copyGone ? !has && (!COPY[lang].to || lines.includes(COPY[lang].to)) : has, n + ': the export-copy line matches the app');
    }
    out.unpackedTo = 'a new folder under %TEMP% named "MontClip 包测试 …"';
    // a synthetic MP4, made with the packaged ffmpeg: 24 s, 320×180 at 30 fps, H.264 by Media Foundation + AAC; a 440 Hz tone,
    // quiet except 12–16 s (+25 dB), so the highlight candidates have a louder stretch to find
    const mp4 = path.join(media, '合成 片段.mp4');
    const mk = spawnSync(path.join(ffDir, 'ffmpeg.exe'), ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=24', '-f', 'lavfi', '-i', 'aevalsrc=if(between(t\\,12\\,16)\\,0.9\\,0.05)*sin(2*PI*440*t):s=48000:d=24',
      '-c:v', 'h264_mf', '-pix_fmt', 'nv12', '-b:v', '1M', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4], { windowsHide: true });
    assert.equal(mk.status, 0, 'synthetic MP4: ' + String(mk.stderr).slice(0, 200));
    // 3. start it on a desktop nobody sees
    // the app's environment: as is, or without any PATH folder that holds ffmpeg / ffprobe
    const launchEnv = { ...process.env }, pathKey = Object.keys(launchEnv).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    const onPath = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8', windowsHide: true });
    out.pathFfmpegBefore = onPath.status === 0 ? NP.lavcFromVersion(spawnSync(onPath.stdout.split(/\r?\n/)[0].trim(), ['-version'], { encoding: 'utf8', windowsHide: true }).stdout) : null;
    if (noPath) {
      const r = NP.pathWithoutFfmpeg(launchEnv[pathKey]);
      launchEnv[pathKey] = r.path; out.pathRemoved = r.removed;
      const left = spawnSync('where.exe', ['ffmpeg', 'ffprobe'], { encoding: 'utf8', windowsHide: true, env: launchEnv });
      out.pathFfmpegLeft = left.status === 0 ? left.stdout.trim().split(/\r?\n/) : [];
      assert.deepEqual(out.pathFfmpegLeft, [], 'no ffmpeg / ffprobe left on the app\'s PATH');
    }
    const launcher = path.join(root, 'launch.ps1'); fs.writeFileSync(launcher, '﻿' + LAUNCHER, 'utf8');
    const args = `--user-data-dir="${profile}" --remote-debugging-port=0 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding`;
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', launcher, '-Exe', exe, '-ArgLine', args, '-Desk', 'MontClipSmoke' + crypto.randomBytes(4).toString('hex')], { windowsHide: true, env: launchEnv });
    let log = '';
    const exited = new Promise((res) => child.stdout.on('data', (d) => { log += d; const m = /EXIT (\d+)/.exec(log); if (m) res(Number(m[1])); }));
    child.stderr.on('data', (d) => { log += d; });
    for (let i = 0; i < 100 && !pid; i++) { const m = /PID (\d+)/.exec(log); if (m) pid = Number(m[1]); else if (/FAILED/.test(log)) throw Error(log.trim()); else await wait(100); }
    assert.ok(pid, 'started: ' + log);
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 300 && !fs.existsSync(portFile); i++) await wait(100);
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const c = await cdp(port);
    // 4. the editor
    // the page may reload once while it starts (its first project load): wait, retrying through that, then a settled page
    for (let i = 0, ok = 0; ok < 3; i++) {
      if (i > 60) throw Error('NOT_CONNECTED');
      try { ok = (await c.read(`typeof state!=='undefined'&&state.connected&&document.readyState==='complete'`)) ? ok + 1 : 0; } catch (e) { if (!/context was destroyed|Cannot find context/.test(e.message)) throw e; ok = 0; }
      await wait(500);
    }
    out.window = await c.read(`({title:document.title,loaded:document.readyState,width:innerWidth,height:innerHeight,connected:state.connected})`);
    // import through the editor's own file input
    const { root: doc } = await c.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await c.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#fileInput' });
    await c.send('DOM.setFileInputFiles', { nodeId, files: [mp4] });
    await c.read(`(async()=>{const until=Date.now()+30000;while(!(project.media.length&&project.media[0].duration>0)&&Date.now()<until)await new Promise(r=>setTimeout(r,100));})()`);
    out.imported = await c.read(`(()=>{const m=project.media[0];return m?{name:m.name,src:m.src,kind:m.kind,duration:Math.round(m.duration*100)/100,transient:!!m.transient}:null;})()`);
    assert.ok(out.imported && out.imported.kind === 'video' && /^\/media\//.test(out.imported.src) && !out.imported.transient, 'imported into media/ ' + JSON.stringify(out.imported));
    await c.read(`(async()=>{const m=project.media[0],doc=projectJSON();doc.clips=[{id:'v',kind:'video',mediaId:m.id,track:'V1',start:0,in:0,duration:m.duration,props:{volume:1}}];applyProject(doc);scheduleSave();if(!await flushSave())throw Error('save');})()`);
    // export, watching which ffmpeg runs
    const seen = new Set(); let watching = true;
    const watcher = (async () => { while (watching) { for (const p of ps(`Get-CimInstance Win32_Process -Filter "name='ffmpeg.exe'" | ForEach-Object { $_.ExecutablePath }`).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) seen.add(p); await wait(150); } })();
    const job = await c.read(`(async()=>{const r=await fetch('/api/export/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({where:'tab',range:'entire',preset:'master'})});const j=await r.json();if(!r.ok)throw Error('export request '+r.status+' '+JSON.stringify(j));
      let s;const until=Date.now()+180000;do{await new Promise(r=>setTimeout(r,300));s=await (await fetch('/api/export/job?id='+encodeURIComponent(j.id))).json();}while(!['done','failed','cancelled'].includes(s.status)&&Date.now()<until);return{status:s.status,src:s.src,error:s.error||null};})()`);
    watching = false; await watcher;
    out.export = job;
    assert.equal(job.status, 'done', 'export ' + JSON.stringify(job));
    const ffExe = path.join(ffDir, 'ffmpeg.exe').toLowerCase();
    out.ffmpegProcesses = [...seen].map((p) => (p.toLowerCase() === ffExe ? '<package>/resources/ffmpeg/ffmpeg.exe' : p));
    assert.ok(seen.size > 0, 'an ffmpeg process was seen during the export');
    assert.ok([...seen].every((p) => p.toLowerCase() === ffExe), 'every ffmpeg was the packaged one: ' + [...seen].join(', '));
    const exported = path.join(profile, 'workspace', decodeURIComponent(job.src.replace(/^\//, '')).split('/').join(path.sep));
    const probe = JSON.parse(spawnSync(path.join(ffDir, 'ffprobe.exe'), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:stream_tags=encoder:format=format_name,duration:format_tags=encoder', '-of', 'json', exported], { encoding: 'utf8', windowsHide: true }).stdout || '{}');
    out.exportedFile = { name: path.basename(exported), bytes: fs.statSync(exported).size, format: probe.format?.format_name, duration: Number(probe.format?.duration), streams: (probe.streams || []).map((s) => [s.codec_type, s.codec_name, s.width, s.height].filter((x) => x != null).join(' ')) };
    assert.ok(/mp4/.test(out.exportedFile.format || '') && out.exportedFile.streams.some((s) => s.startsWith('video h264')), 'an H.264 MP4 ' + JSON.stringify(out.exportedFile));
    // the encoder tags: the video was encoded by the packaged libavcodec, not one on PATH
    out.encoderTags = { format: probe.format?.tags?.encoder || null, streams: (probe.streams || []).map((s) => s.codec_type + ': ' + (s.tags?.encoder || '-')) };
    const videoTag = (probe.streams || []).find((s) => s.codec_type === 'video')?.tags?.encoder;
    out.lavc = { packaged: NP.lavcFromVersion(spawnSync(path.join(ffDir, 'ffmpeg.exe'), ['-version'], { encoding: 'utf8', windowsHide: true }).stdout), exportedVideo: NP.lavcFromTag(videoTag), onPath: out.pathFfmpegBefore };
    assert.ok(out.lavc.packaged && out.lavc.exportedVideo === out.lavc.packaged, 'the export was encoded by the packaged libavcodec: ' + JSON.stringify(out.lavc));
    // the highlight candidates read the sound: the server's loudness of the imported file, and the cards' loudness reasons
    out.highlightSound = await c.read(`(async()=>{const m=project.media[0];const r=await fetch('/api/signals/loudness?src='+encodeURIComponent(m.src));const j=await r.json();const v=j.values||[];
      return{status:r.status,code:j.code||null,bins:v.length,quietDb:v.length?Math.min(...v):null,loudDb:v.length?Math.max(...v):null};})()`);
    assert.ok(out.highlightSound.status === 200 && out.highlightSound.bins > 0 && out.highlightSound.loudDb - out.highlightSound.quietDb > 15, 'the sound was read: ' + JSON.stringify(out.highlightSound));
    // the highlight candidates (from #52)
    out.highlights = await c.read(`(async()=>{setSideTab('transcript');await new Promise(r=>setTimeout(r,500));const b=document.querySelector('[data-tr-highlights]');if(!b)return 'not in this build';b.click();await new Promise(r=>setTimeout(r,1500));const d=document.querySelector('.highlight-dialog');if(!(d&&d.open))return 'did not open';const until=Date.now()+20000;while(!d.querySelector('.hl-card')&&Date.now()<until)await new Promise(r=>setTimeout(r,250));
      const cards=[...d.querySelectorAll('.hl-card')];return{opens:true,cards:cards.length,loudnessReasons:d.querySelectorAll('[data-hl-reason="loudness"]').length,first:cards[0]?cards[0].querySelector('h3,h4,strong,.hl-title')?.textContent||null:null};})()`);
    out.highlightSound.cardsWithLoudness = out.highlights.loudnessReasons;
    out.pathFallback = await c.read(`fetch('/api/export/ffmpeg').then(r=>r.json())`).catch(() => null);
    // 5. close the normal way
    await c.read(`setTimeout(()=>window.close(),50);true`).catch(() => {});
    c.close();
    exitCode = await Promise.race([exited, wait(30000).then(() => null)]);
    out.exitCode = exitCode;
    assert.equal(exitCode, 0, 'exit code');
    await wait(1000);
    const left = ps(`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${appDir.replace(/'/g, "''")}', [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.Name }`).trim();
    out.leftRunning = left ? left.split(/\r?\n/) : [];
    assert.deepEqual(out.leftRunning, [], 'nothing from the package left running');
    process.stdout.write('PACKAGE_SMOKE_COMPLETE ' + JSON.stringify(out) + '\n');
  } catch (e) {
    process.stdout.write('PACKAGE_SMOKE_FAIL ' + (e && e.message) + ' ' + JSON.stringify(out) + '\n');
    process.exitCode = 1;
  } finally {
    if (pid && exitCode == null) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });   // only the process this test started
    await wait(1500);
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch (e) { process.stdout.write('CLEANUP_LEFT ' + e.message + '\n'); }
  }
}
main();
