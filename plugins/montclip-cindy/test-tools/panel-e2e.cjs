// node plugins/montclip-cindy/test-tools/panel-e2e.cjs <repo root>   (after node plugins/montclip-cindy/build.cjs; needs Chrome or Edge)
// The side panel and the editor in one browser (two top-level tabs of the engine's origin, as the panel and the task
// view are in Cindy's plugin partition): the panel lists the lines, a click on a line moves the editor, and the panel
// marks the line being shown. Driven over CDP with Node's own WebSocket; temp data and profile, removed afterwards.
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const ROOT = process.argv[2], APP = path.join(ROOT, "plugins/montclip-cindy/node/app");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "mc-panel-"));
const t = (id, s, d, x) => ({ id, kind: "text", mediaId: null, track: "V2", start: s, in: 0, duration: d, props: { text: x, caption: true } });
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "panel e2e", width: 1280, height: 720, fps: 30, revision: 1, media: [], clips: [t("a", 0, 3, "第一句"), t("b", 4, 3, "第二句"), t("c", 9, 2, "第三句")] }));
const w = spawn(process.execPath, [path.join(ROOT, "plugins/montclip-cindy/node/worker.cjs")], { env: { ...process.env, MONTCLIP_CINDY_APP: APP, MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0" }, stdio: ["pipe", "pipe", "ignore"] });
let id = 0; const pend = new Map(); let buf = "";
w.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
const rpc = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); w.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener("open", r));
  let n = 0; const p = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); p.get(m.id)?.(m); });
  return { eval: (expr) => new Promise((r) => { const k = ++n; p.set(k, (m) => r(m.result?.result?.value)); ws.send(JSON.stringify({ id: k, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: true } })); }), close: () => ws.close() };
}
(async () => {
  const s = (await rpc("montclip/start")).result;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "mc-edge-"));
  const port = 9000 + Math.floor(Math.random() * 500);
  const b = spawn(require(path.join(ROOT, "export-jobs.js")).findBrowser(), ["--headless=new", "--no-first-run", `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--window-size=1300,900", s.url], { stdio: "ignore" });
  await sleep(4000);
  const u = new URL(s.url); u.pathname = "/cindy/panel.html";
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(u.href)}`, { method: "PUT" })).json();
  await sleep(3000);
  const panel = await cdp(tab.webSocketDebuggerUrl);
  const out = {};
  out.lines = await panel.eval(`[...document.querySelectorAll('#lines button')].map(b => b.textContent)`);
  out.theme = await panel.eval(`document.documentElement.dataset.hostTheme + '/' + document.documentElement.dataset.host`);
  await panel.eval(`document.querySelectorAll('#lines button')[1].click()`);
  await sleep(800);
  out.editorAfterClick = (await rpc("montclip/ui", { cmd: "state" })).result;
  out.nowLine = await panel.eval(`[...document.querySelectorAll('#lines li')].findIndex(li => li.classList.contains('now'))`);
  await rpc("montclip/call", { name: "fablecut_patch_project", arguments: { ops: [{ op: "updateClip", id: "c", set: { props: { text: "第三句（改过）" } } }] } });
  await sleep(1500);
  out.afterAgentEdit = await panel.eval(`[...document.querySelectorAll('#lines button')].map(b => b.textContent).pop()`);
  console.log(JSON.stringify(out));
  panel.close(); b.kill(); w.kill();
  setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true }); } catch {} process.exit(0); }, 1500);
})();
