// Headless harness: drive the plugin's Node worker over JSON-RPC stdio, the way Cindy's host does.
// usage: node rpc.cjs <worker.cjs> <dataDir> <steps.json>
"use strict";
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const [worker, data, stepsFile] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, "utf8"));
const p = spawn(process.execPath, [worker], { env: { ...process.env, MONTCLIP_CINDY_DATA: data }, stdio: ["pipe", "pipe", "pipe"] });
let buf = "", id = 0;
const browsers = [];
const waiting = new Map();
const bad = [];
p.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m; try { m = JSON.parse(line); } catch { bad.push(line.slice(0, 200)); continue; }
    const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m); }
  }
});
p.stderr.on("data", (d) => fs.appendFileSync(path.join(data, "worker-stderr.log"), d));
const call = (method, params) => new Promise((res) => { const n = ++id; waiting.set(n, res); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
(async () => {
  for (const s of steps) {
    if (s.sleep) { await new Promise((r) => setTimeout(r, s.sleep)); continue; }
    if (s.browser) {   // a headless editor tab: invisible, its own empty profile, no debugging port
      const prof = fs.mkdtempSync(path.join(os.tmpdir(), "mc-edge-"));
      const b = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--user-data-dir=" + prof, "--no-first-run",
        "--autoplay-policy=no-user-gesture-required", "--window-size=1600,1000", s.browser], { stdio: "ignore" });
      browsers.push({ b, prof });
      console.log(">> browser " + s.browser + " pid " + b.pid);
      continue;
    }
    if (s.curl) {
      const r = spawnSync("curl", ["-s", "-o", "NUL", "-D", "-", ...s.curl], { encoding: "utf8" });
      const keep = r.stdout.split(/\r?\n/).filter((l) => /^(HTTP|Content-Range|Content-Length|Accept-Ranges)/i.test(l));
      console.log(">> curl " + s.curl.join(" ") + "\n" + keep.join("\n"));
      continue;
    }
    const t0 = Date.now();
    const r = await call(s.method, s.params || {});
    const out = JSON.stringify(r.result ?? r.error);
    const max = s.max || 1500;
    console.log(`>> ${s.method} ${s.params ? JSON.stringify(s.params).slice(0, 200) : ""} (${Date.now() - t0} ms)`);
    console.log(out.length > max ? out.slice(0, max) + " …[" + out.length + " chars]" : out);
  }
  console.log("non-protocol stdout lines:", bad.length, bad.slice(0, 3));
  for (const { b, prof } of browsers) { try { b.kill(); } catch { } setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch { } }, 1500); }
  setTimeout(() => p.kill(), 2500);
})();
