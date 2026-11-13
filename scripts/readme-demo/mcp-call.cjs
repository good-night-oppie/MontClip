// usage: node mcp-call.cjs calls.json
// Runs MCP tools/call requests one after another against MontClip's mcp-server.js over stdio.
// Fails closed: the first call that errors stops the run with a non-zero exit, and no later call is sent.
//   exit 2 = a JSON-RPC error or a result with isError
//   exit 3 = fablecut_export answered without its "Checks passed" line (MontClip reports a failed export as text)
//   exit 4 = the MCP server exited or closed its output before answering
//   exit 5 = (gated runs) before a tool request, the server did not serve this run's proof
//   exit 6 = (gated runs) before a tool request, the session had been marked as no longer trusted
// Gated runs (montclip_session.py sets MONTCLIP_GATE_*): before initialize and before every tools/call the
// session's dead-marker must be absent and the server must serve this run's proof; otherwise nothing more is sent.
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const calls = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const src = process.env.MONTCLIP_SRC || path.resolve(__dirname, '../..');
const p = spawn(process.execPath, [path.resolve(src, 'server', 'mcp-server.js')], { env: { ...process.env }, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', id = 0;
const pend = {};
const die = (code, msg) => { console.log('## STOP', msg); try { p.kill(); } catch {} process.exit(code); };
p.on('exit', (c, s) => { if (Object.keys(pend).length) die(4, `mcp-server exited (code ${c}, signal ${s}) with a call unanswered`); });
p.stdout.on('end', () => { if (Object.keys(pend).length) die(4, 'mcp-server closed its output with a call unanswered'); });
p.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!l.trim()) continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    if (m.id && pend[m.id]) { const r = pend[m.id]; delete pend[m.id]; r(m); }
  }
});
const gate = process.env.MONTCLIP_GATE_PROOF_URL
  ? { url: process.env.MONTCLIP_GATE_PROOF_URL, proof: process.env.MONTCLIP_GATE_PROOF, dead: process.env.MONTCLIP_GATE_DEAD } : null;
async function checkGate(what) {
  if (!gate) return;
  if (!gate.proof || !gate.dead) die(5, `gate is incomplete; ${what} not sent`);
  if (fs.existsSync(gate.dead)) die(6, `session no longer trusted (${fs.readFileSync(gate.dead, 'utf8').trim()}); ${what} not sent`);
  let got = null;
  try { const r = await fetch(gate.url, { signal: AbortSignal.timeout(5000) }); got = r.ok ? await r.text() : null; } catch {}
  if (got !== gate.proof) die(5, `the server did not serve this run's proof; ${what} not sent`);
  if (fs.existsSync(gate.dead)) die(6, `session no longer trusted (${fs.readFileSync(gate.dead, 'utf8').trim()}); ${what} not sent`);
}
const rpc = (method, params) => new Promise((r) => { const i = ++id; pend[i] = r; p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
(async () => {
  await checkGate('initialize');
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'readme-demo', version: '1' } });
  if (init.error) die(2, 'initialize failed: ' + JSON.stringify(init.error));
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  for (const c of calls) {
    await checkGate(c.name);
    const r = await rpc('tools/call', { name: c.name, arguments: c.arguments });
    const content = (r.result && r.result.content) || [];
    const text = content.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
    console.log('##', c.name, r.error || (r.result && r.result.isError) ? 'ERROR' : 'ok');
    console.log(content.map((x) => (x.type === 'text' ? x.text : `[${x.type} ${(x.data || '').length}b]`)).join('\n').slice(0, 2500));
    if (r.error) die(2, `${c.name}: JSON-RPC error ${JSON.stringify(r.error)}`);
    if (r.result && r.result.isError) die(2, `${c.name}: tool reported isError`);
    if (c.name === 'fablecut_export' && !/^Checks passed:/m.test(text)) die(3, 'fablecut_export: no "Checks passed" line, so the export did not succeed');
    if (c.saveImage) {
      const im = content.find((x) => x.type === 'image');
      if (!im) die(2, `${c.name}: expected an image to save to ${c.saveImage}, got none`);
      fs.writeFileSync(c.saveImage, Buffer.from(im.data, 'base64'));
    }
  }
  p.kill();
  process.exit(0);
})();
