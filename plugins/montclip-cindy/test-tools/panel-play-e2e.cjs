// node plugins/montclip-cindy/test-tools/panel-play-e2e.cjs <repo root> <folder with the pinned ffmpeg.exe>   (after build.cjs; Chrome or Edge)
// VV's two open items on #114: (1) while the editor plays, the panel's highlight follows the playing line; (2) the panel
// follows Cindy's light theme (?theme=light, then a theme message). A generated 16 s test pattern with a tone and four
// captions; temp data and browser profile, removed afterwards.
const { spawn, spawnSync } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const [ROOT, FFDIR] = process.argv.slice(2);
const data = fs.mkdtempSync(path.join(os.tmpdir(), "mc-play-"));
fs.mkdirSync(path.join(data, "media"));
const video = path.join(data, "media", "pattern.mp4");
let enc = null;
for (const [e, pix] of [["h264_mf", "nv12"], ["h264_nvenc", "yuv420p"], ["h264_qsv", "nv12"], ["h264_amf", "nv12"]]) {
  const r = spawnSync(path.join(FFDIR, "ffmpeg.exe"), ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=16", "-f", "lavfi", "-i", "sine=f=440:d=16",
    "-c:v", e, "-pix_fmt", pix, "-c:a", "aac", "-movflags", "+faststart", "-shortest", video], { timeout: 120000 });
  if (r.status === 0) { enc = e; break; }
}
if (!enc) { console.log(JSON.stringify({ error: "no H.264 encoder in that ffmpeg" })); process.exit(1); }
const cap = (id, s, x) => ({ id, kind: "text", mediaId: null, track: "V2", start: s, in: 0, duration: 3.5, props: { text: x, caption: true } });
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "play e2e", width: 640, height: 360, fps: 30, revision: 1, panSchema: 1,
  media: [{ id: "m1", name: "pattern.mp4", kind: "video", src: "/media/pattern.mp4", duration: 16, width: 640, height: 360 }],
  clips: [{ id: "v1", mediaId: "m1", kind: "video", track: "V1", start: 0, in: 0, duration: 16, props: { volume: 1 } },
    cap("a", 0, "第一句"), cap("b", 4, "第二句"), cap("c", 8, "第三句"), cap("d", 12, "第四句")] }));
const w = spawn(process.execPath, [path.join(ROOT, "plugins/montclip-cindy/node/worker.cjs")], { env: { ...process.env, MONTCLIP_CINDY_APP: path.join(ROOT, "plugins/montclip-cindy/node/app"), MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0" }, stdio: ["pipe", "pipe", "ignore"] });
let id = 0; const pend = new Map(); let buf = "";
w.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
const rpc = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); w.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener("open", r));
  let n = 0; const p = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); p.get(m.id)?.(m); });
  const send = (method, params = {}) => new Promise((r) => { const k = ++n; p.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  return { send, eval: (expression) => new Promise((r) => { const k = ++n; p.set(k, (m) => r(m.result?.result?.value)); ws.send(JSON.stringify({ id: k, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } })); }), close: () => ws.close() };
}
(async () => {
  const out = { encoder: enc };
  const s = (await rpc("montclip/start")).result;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "mc-edge-")), port = 9000 + Math.floor(Math.random() * 500);
  const b = spawn(require(path.join(ROOT, "export-jobs.js")).findBrowser(), ["--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--window-size=1300,900", s.url], { stdio: "ignore" });
  await sleep(5000);
  const u = new URL(s.url); u.pathname = "/cindy/panel.html"; u.searchParams.delete("token"); u.searchParams.set("theme", "light");
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(u.href)}`, { method: "PUT" })).json();
  await sleep(3000);
  const editorTab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page" && t.url.includes("host=cindy") && !t.url.includes("/cindy/"));
  const panel = await cdp(tab.webSocketDebuggerUrl), editor = await cdp(editorTab.webSocketDebuggerUrl);
  // (2) the panel's theme: light from the URL, back to dark and light again by message
  out.theme = { atLoad: await panel.eval(`[document.documentElement.dataset.hostTheme, getComputedStyle(document.body).backgroundColor]`) };
  await panel.eval(`window.postMessage({ type: "montclip-host-theme", scheme: "dark" }, "*")`); await sleep(300);
  out.theme.afterDark = await panel.eval(`[document.documentElement.dataset.hostTheme, getComputedStyle(document.body).backgroundColor]`);
  await panel.eval(`window.postMessage({ type: "montclip-host-theme", scheme: "light" }, "*")`); await sleep(300);
  out.theme.afterLight = await panel.eval(`[document.documentElement.dataset.hostTheme, getComputedStyle(document.body).backgroundColor]`);
  // (1) play from 0 and sample: the editor's time and the panel's highlighted line, every 1.5 s
  out.debug = { panelSaw: await panel.eval(`new Promise(r => { const c = new BroadcastChannel("montclip-editor"); let got = null; c.onmessage = (e) => { got = e.data; }; c.postMessage({ type: "hello" }); setTimeout(() => r(got), 800); })`), lines: await panel.eval(`document.querySelectorAll('#lines li').length`), embedded: await editor.eval(`[typeof MontClipHost !== "undefined" && MontClipHost.embedded, !!runtime.hostChannel, location.search, typeof togglePlay]`),
    media: await editor.eval(`[...document.querySelectorAll("video")].map(v => [v.readyState, v.error && v.error.code, v.src.slice(-30)])`) };
  await editor.send("Page.bringToFront");   // the editor plays in the front tab; the panel keeps listening behind it
  await editor.eval(`setTime(0); play()`);
  out.samples = [];
  for (let i = 0; i < 9; i++) {
    await sleep(1500);
    const t = await editor.eval(`[Math.round(state.time * 10) / 10, !!state.playing]`);
    const line = await panel.eval(`[...document.querySelectorAll('#lines li')].findIndex(li => li.classList.contains('now'))`);
    out.samples.push({ editorTime: t[0], playing: t[1], panelLine: line });
  }
  await editor.eval(`state.playing && pause()`);
  console.log(JSON.stringify(out));
  panel.close(); editor.close(); b.kill(); w.kill();
  setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true }); } catch {} process.exit(0); }, 1500);
})();
