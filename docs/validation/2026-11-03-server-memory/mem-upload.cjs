'use strict';
// Upload a large body N times to /api/upload and record the server's memory after each (and after a pause).
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), net = require('node:net');
const repo = path.resolve(process.argv[2]), mb = Number(process.argv[3] || 512), times = Number(process.argv[4] || 4);
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-up-'));
const kids = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = (pid) => { const o = execFileSync('powershell', ['-NoProfile', '-Command', `$p=Get-Process -Id ${pid}; "$($p.WorkingSet64) $($p.PrivateMemorySize64)"`], { encoding: 'utf8', windowsHide: true }).trim().split(' ').map(Number); return { rssMB: Math.round(o[0] / 1048576), privateMB: Math.round(o[1] / 1048576) }; };
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
function upload(port, name) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/upload?name=' + name, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': mb * 1048576 } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    const chunk = Buffer.alloc(1048576, 7);
    let i = 0;
    const pump = () => { while (i < mb) { i++; if (!req.write(chunk)) return req.once('drain', pump); } req.end(); };
    pump();
  });
}
(async () => {
  const port = await freePort();
  const srv = spawn(process.execPath, [path.join(repo, 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', FABLECUT_DATA_DIR: data, FABLECUT_NO_FS_WATCH: '1' }, stdio: 'ignore' });
  kids.push(srv);
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/project`)).ok) break; } catch {} await sleep(100); }
  console.log(JSON.stringify({ start: mem(srv.pid) }));
  for (let k = 0; k < times; k++) {
    const peak = { privateMB: 0 }; const timer = setInterval(() => { try { const m = mem(srv.pid); if (m.privateMB > peak.privateMB) Object.assign(peak, m); } catch {} }, 300);
    const code = await upload(port, `big${k}.bin`);
    clearInterval(timer);
    fs.rmSync(path.join(data, 'media', `big${k}.bin`), { force: true });
    await sleep(3000);
    console.log(JSON.stringify({ upload: k + 1, mb, code, peak, after3s: mem(srv.pid) }));
  }
})().catch((e) => console.error('ERR', e)).finally(() => { for (const k of kids) { try { k.kill(); } catch {} } setTimeout(() => { try { fs.rmSync(data, { recursive: true, force: true }); } catch {} process.exit(0); }, 800); });
