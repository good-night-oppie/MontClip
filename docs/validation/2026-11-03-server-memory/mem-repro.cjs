'use strict';
// Memory repro for server.js: a synthetic recording, then rounds of (a) aborted Range reads like a scrubbing <video>,
// (b) full exports through /api/export/begin|frame|audio|end, (c) export sessions that are never ended (a closed tab),
// (d) SSE connections that stop reading, (e) /api/project polls. RSS and private bytes (commit) of the server each round.
// Usage: node mem-repro.cjs <repo> <seconds> [mode]   (mode: all|range|export|abandon|sse|project)
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), net = require('node:net');
const repo = path.resolve(process.argv[2]), seconds = Number(process.argv[3] || 60), mode = process.argv[4] || 'all';
const FF = require(path.join(repo, "ffmpeg-path"));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-mem-'));
const kids = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mem(pid) {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', `$p=Get-Process -Id ${pid}; "$($p.WorkingSet64) $($p.PrivateMemorySize64) $($p.HandleCount)"`], { encoding: 'utf8', windowsHide: true }).trim().split(' ').map(Number);
  return { rssMB: Math.round(out[0] / 1048576), privateMB: Math.round(out[1] / 1048576), handles: out[2] };
}
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
async function main() {
  fs.mkdirSync(path.join(data, 'media'), { recursive: true });
  const rec = path.join(data, 'media', 'rec.mp4');
  execFileSync(FF.path('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=60', '-f', 'lavfi', '-i', 'sine=f=440:d=60',
    '-c:v', 'h264_mf', '-b:v', '8M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', rec], { windowsHide: true });
  const jpg = path.join(data, 'f.jpg');
  execFileSync(FF.path('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360', '-frames:v', '1', '-q:v', '3', jpg], { windowsHide: true });
  const frame = fs.readFileSync(jpg), size = fs.statSync(rec).size;
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(repo, 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', FABLECUT_DATA_DIR: data, FABLECUT_NO_FS_WATCH: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  kids.push(srv); let errTail=''; srv.stderr.on('data',(d)=>{errTail=(errTail+d).slice(-1500)}); srv.on('exit',(c)=>console.log('SERVER EXIT',c,errTail));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/project')).ok) break; } catch {} await sleep(100); }
  const t0 = Date.now(), m0 = mem(srv.pid);
  console.log(JSON.stringify({ mode, size, start: m0 }));
  const on = (m) => mode === 'all' || mode === m;
  let round = 0;
  const abortedRange = () => new Promise((resolve) => {
    const start = Math.floor(Math.random() * (size - 1));
    const req = http.get(base + '/media/rec.mp4', { headers: { Range: `bytes=${start}-` } }, (res) => {
      res.once('data', () => { req.destroy(); resolve(); });   // a <video> seek: reads a little, then drops the request
    });
    req.on('error', () => resolve());
  });
  const sse = [];
  while (Date.now() - t0 < seconds * 1000) {
    round++;
    if (on('range')) await Promise.all(Array.from({ length: 40 }, abortedRange));
    if (on('project')) for (let i = 0; i < 20; i++) await (await fetch(base + '/api/project')).text();
    if (on('export') || on('abandon')) {
      const b = await (await fetch(base + '/api/export/begin', { method: 'POST', body: JSON.stringify({ fps: 30, name: 'mem', hasAudio: false, duration: 1,
        delivery: { preset: 'custom', width: 640, height: 360, video: { codec: 'h264', encoder: 'h264_mf' } }, canvasW: 640, canvasH: 360 }) })).json();
      if (b.id) {
        await fetch(base + '/api/export/frame?id=' + b.id, { method: 'POST', body: Buffer.concat(Array(30).fill(frame)) });
        if (on('export') && (mode !== 'all' || round % 2)) await (await fetch(base + '/api/export/end?id=' + b.id, { method: 'POST' })).text();
      } else if (round === 1) console.log('begin failed', b.error);
    }
    if (on('sse')) {
      // an EventSource whose tab stops reading: the socket stays open, nothing is read
      const s = net.connect(port, '127.0.0.1', () => s.write(`GET /api/events HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`)); s.pause(); sse.push(s);
      for (let i = 0; i < 20; i++) await fetch(base + '/api/project', { method: 'GET' });
    }
    if (round % 5 === 0) console.log(JSON.stringify({ t: Math.round((Date.now() - t0) / 1000), round, ...mem(srv.pid) }));
  }
  console.log(JSON.stringify({ end: mem(srv.pid), rounds: round, exportsLeft: fs.readdirSync(path.join(data, 'exports')).length }));
  for (const s of sse) s.destroy();
}
main().catch((e) => console.error('ERR', e)).finally(() => {
  for (const k of kids) { try { k.kill(); } catch {} }
  setTimeout(() => { try { fs.rmSync(data, { recursive: true, force: true }); } catch {} process.exit(0); }, 800);
});
