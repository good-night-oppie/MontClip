// node plugins/montclip-cindy/test-tools/cross-site-frame.cjs <repo root>   (needs Chrome or Edge)
// Cross-site iframe check: a parent page on http://localhost:<p> frames the worker's editor URL on 127.0.0.1 (another
// site), like Cindy's cindy-ghost:// page does; the editor answers ui-command "state" only if its cookie worked.
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), os = require("os"), path = require("path");
const ROOT = process.argv[2];
const data = fs.mkdtempSync(path.join(os.tmpdir(), "mc-xsite-"));
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "xsite", width: 1280, height: 720, fps: 30, revision: 1, media: [], clips: [] }));
const w = spawn(process.execPath, [path.join(ROOT, "plugins/montclip-cindy/node/worker.cjs")], { env: { ...process.env, MONTCLIP_CINDY_APP: ROOT, MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" }, stdio: ["pipe", "pipe", "inherit"] });
let id = 0; const pend = new Map(); let buf = "";
w.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
const rpc = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); w.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
(async () => {
  const s = (await rpc("montclip/start")).result;
  const parent = http.createServer((q, r) => { r.writeHead(200, { "Content-Type": "text/html" }); r.end(`<iframe src="${s.url}" style="width:1200px;height:800px"></iframe>`); }).listen(0, "127.0.0.1");
  await new Promise((r) => parent.once("listening", r));
  const purl = `http://localhost:${parent.address().port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "mc-edge-"));
  const browser = require(path.join(ROOT, "export-jobs.js")).findBrowser();
  const b = spawn(browser, ["--headless=new", "--no-first-run", "--disable-extensions", `--user-data-dir=${prof}`, "--window-size=1300,900", purl], { stdio: "ignore" });
  let state = null;
  for (let i = 0; i < 30 && !(state && state.status === 200); i++) { await new Promise((r) => setTimeout(r, 1000)); state = (await rpc("montclip/ui", { cmd: "state" })).result; }
  console.log(JSON.stringify({ browser: path.basename(browser), parent: purl, editorOrigin: s.origin, state }));
  b.kill(); w.kill(); parent.close();
  setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true }); } catch {} process.exit(0); }, 1500);
})();
