'use strict';
// Browser mode, Google Fonts asks first (Deja, 2026-11-04): the real server and a headless Chrome / Edge on it. Every
// request is intercepted over CDP and nothing leaves this computer: a request to fonts.googleapis.com is answered with
// a fake stylesheet, anything else non-local is failed. Checks: opening a project and getting fonts ready for an export
// send nothing out (and say which fonts fall back); the box names the font and both hosts; "Not now" sends nothing;
// after "Load", only fonts.googleapis.com, for that font; the same font isn't asked about twice in a session.
//   node real-tests/font-consent-browser-smoke.cjs        (FABLECUT_CHROME picks the browser)
const { spawn } = require("child_process"), fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), CHROME = require("../export-jobs").findBrowser();
if (!CHROME) { console.log("SKIP: no Chrome / Edge (set FABLECUT_CHROME)"); process.exit(0); }
const PORT = 7791, ORIGIN = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), "fc-font-"));
fs.mkdirSync(path.join(data, "media"));
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "fonts", width: 640, height: 360, fps: 30, revision: 1, panSchema: 1, media: [],
  clips: [{ id: "t1", kind: "text", mediaId: null, track: "V2", start: 0, in: 0, duration: 3, props: { text: "Hi", font: "Lobster" } },
    { id: "t2", kind: "text", mediaId: null, track: "V3", start: 0, in: 0, duration: 3, props: { text: "Yo", font: "Anton", textAnim: "font-cut", fontCutSet: ["Anton", "Cinzel"] } }] }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, PORT, FABLECUT_DATA_DIR: data, FABLECUT_NO_FS_WATCH: "1" }, stdio: "ignore" });
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "fc-prof-"));
  const ch = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", "--user-data-dir=" + prof, "--no-first-run", "about:blank"], { stdio: "ignore" });
  let ws;
  try {
    await sleep(2500);
    const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
    ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => ws.onopen = r);
    let id = 0; const pend = new Map(), external = [];
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m); pend.delete(m.id); return; }
      if (m.method === "Fetch.requestPaused") {
        const { requestId, request } = m.params;
        if (request.url.startsWith(ORIGIN) || /^(data|blob):/.test(request.url)) return send("Fetch.continueRequest", { requestId });
        external.push(request.url);
        if (new URL(request.url).hostname === "fonts.googleapis.com")
          return send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/css" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from("/* fake */").toString("base64") });
        return send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      }
    };
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await send("Runtime.enable");
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
    await send("Page.navigate", { url: ORIGIN + "/" });
    await sleep(6000);
    const r = { afterOpen: [...external] };
    r.toastAfterOpen = await ev(`document.querySelector(".toast")?.textContent || document.getElementById("toast")?.textContent || ""`);
    await ev(`loadProjectFonts().then(()=>1)`);
    r.afterExportFonts = [...external];
    r.exportToast = await ev(`(document.querySelector(".toast")||document.getElementById("toast"))?.textContent || ""`);
    await ev(`(window.__rf = requestFonts(["Lobster"]), 1)`); await sleep(300);
    r.dialogText = await ev(`document.querySelector("dialog.font-consent-dialog")?.textContent || null`);
    r.whileOpen = [...external];
    await ev(`document.querySelector('[data-font-consent="deny"]').click(), 1`); r.denied = await ev(`window.__rf`);
    r.afterDeny = [...external];
    await ev(`(window.__rf = requestFonts(["Lobster"]), 1)`); await sleep(300);
    await ev(`document.querySelector('[data-font-consent="allow"]').click(), 1`); r.allowed = await ev(`window.__rf`); await sleep(500);
    r.afterAllow = [...external];
    await ev(`(window.__rf = requestFonts(["Lobster"]), 1)`); await sleep(300);
    r.askedAgain = await ev(`!!document.querySelector("dialog.font-consent-dialog")`);
    console.log(JSON.stringify(r, null, 1));
    const g = (u) => new URL(u).hostname;
    const checks = [
      ["opening the project sent nothing out", r.afterOpen.length === 0],
      ["the fallback hint names the fonts", /Lobster/.test(r.toastAfterOpen) && /Cinzel/.test(r.toastAfterOpen)],
      ["getting fonts ready for an export sent nothing out", r.afterExportFonts.length === 0],
      ["the export hint names the fonts", /Lobster/.test(r.exportToast) && /Cinzel/.test(r.exportToast)],
      ["the box names the font and both hosts", !!r.dialogText && /Lobster/.test(r.dialogText) && /fonts.googleapis.com/.test(r.dialogText) && /fonts.gstatic.com/.test(r.dialogText)],
      ["nothing sent while the box is open, or after Not now", r.whileOpen.length === 0 && r.afterDeny.length === 0 && r.denied === null],
      ["after Load: only Google Fonts, for that font", r.allowed === true && r.afterAllow.length > 0 && r.afterAllow.every((u) => ["fonts.googleapis.com", "fonts.gstatic.com"].includes(g(u)) && /family=Lobster[:&]/.test(u))],
      ["not asked twice for one font in a session", r.askedAgain === false],
    ];
    for (const [name, ok] of checks) console.log((ok ? "PASS " : "FAIL ") + name);
    process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
  } finally {
    try { ws && ws.close(); } catch { }
    ch.kill(); srv.kill();
    await sleep(1000);
    for (const d of [data, prof]) try { fs.rmSync(d, { recursive: true, force: true }); } catch { }
  }
})().catch((e) => { console.error(e); process.exit(1); });
