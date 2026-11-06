'use strict';
// Browser mode, AI background removal asks first (Deja, 2026-11-04): the real server and a headless Chrome / Edge on it.
// Every request is intercepted over CDP. By default nothing leaves this computer: cdn.jsdelivr.net is answered with a
// stand-in for MediaPipe's script (which then asks for its wasm and model files, as the real one does), anything else
// non-local is failed. Checks: opening a project with a bgRemove clip and getting ready for an export send nothing out
// (and say the clip stays uncut); the box names the host; "Not now" sends nothing; after "Load", only cdn.jsdelivr.net,
// only GETs; not asked twice in a session.
//   node real-tests/bgremove-consent-browser-smoke.cjs            (FABLECUT_CHROME picks the browser)
//   MONTCLIP_SMOKE_REAL_NET=1 node real-tests/bgremove-consent-browser-smoke.cjs
//     lets the cdn.jsdelivr.net requests through to the real MediaPipe, runs a cut-out on a frame, and records every
//     request the page makes (host, method, body) — what is actually sent, not what the code says.
const { spawn, spawnSync } = require("child_process"), fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), CHROME = require("../export-jobs").findBrowser();
if (!CHROME) { console.log("SKIP: no Chrome / Edge (set FABLECUT_CHROME)"); process.exit(0); }
const REAL = process.env.MONTCLIP_SMOKE_REAL_NET === "1";
const PORT = +process.env.SMOKE_PORT || 7843, DBG = PORT + 1600, ORIGIN = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), "fc-bg-"));
fs.mkdirSync(path.join(data, "media"));
// a 64×64 PNG: grey with a darker square (no need for a real person — the point is what goes over the network)
const png = (() => {
  const zlib = require("zlib"), W = 64, H = 64, raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 4 + 1) + 1 + x * 4, v = x > 20 && x < 44 && y > 12 ? 60 : 200; raw[o] = raw[o + 1] = raw[o + 2] = v; raw[o + 3] = 255; }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type), body]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb)); return Buffer.concat([len, tb, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
})();
fs.writeFileSync(path.join(data, "media", "still.png"), png);
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "bg", width: 640, height: 360, fps: 30, revision: 1, panSchema: 1,
  media: [{ id: "m1", name: "still.png", kind: "image", src: "/media/still.png", width: 64, height: 64 }],
  clips: [{ id: "c1", kind: "image", mediaId: "m1", track: "V1", start: 0, in: 0, duration: 3, props: { bgRemove: true } }] }));
// the stand-in: what MediaPipe's script does that matters here — ask locateFile for its files and fetch them
const FAKE = `window.SelfieSegmentation = class { constructor(o) { this.o = o; for (const f of ["selfie_segmentation_solution_simd_wasm_bin.js", "selfie_segmentation_solution_simd_wasm_bin.wasm", "selfie_segmentation_landscape.tflite", "selfie_segmentation.binarypb"]) fetch(o.locateFile(f)).catch(() => {}); }
  setOptions() {} onResults(f) { this.cb = f; } async send() { const c = document.createElement("canvas"); c.width = c.height = 8; const x=c.getContext('2d'); x.fillStyle='white'; x.fillRect(4,0,4,8); this.cb && this.cb({ segmentationMask: c }); } };`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, PORT, FABLECUT_DATA_DIR: data, FABLECUT_NO_FS_WATCH: "1" }, stdio: "ignore" });
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "fc-prof-"));
  const ch = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DBG}`, "--user-data-dir=" + prof, "--no-first-run", "about:blank"], { stdio: "ignore" });
  let ws;
  try {
    await sleep(2500);
    const targets = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
    ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => ws.onopen = r);
    let id = 0, failScript = !REAL; const pend = new Map(), external = [];
    const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m); pend.delete(m.id); return; }
      // workers the page may start: intercept their requests too
      if (m.method === "Target.attachedToTarget") {
        const sid = m.params.sessionId;
        send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sid).then(() => send("Runtime.runIfWaitingForDebugger", {}, sid));
        return;
      }
      if (m.method === "Fetch.requestPaused") {
        const sid = m.sessionId, { requestId, request } = m.params;
        if (request.url.startsWith(ORIGIN) || /^(data|blob):/.test(request.url)) return send("Fetch.continueRequest", { requestId }, sid);
        external.push({ url: request.url, method: request.method, body: request.postData ? request.postData.length : 0 });
        if (new URL(request.url).hostname === "cdn.jsdelivr.net") {
          if (REAL) return send("Fetch.continueRequest", { requestId }, sid);
          const js = /selfie_segmentation\.js$/.test(request.url);
          if (js && failScript) { failScript=false; return send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" }, sid); }
          return send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: js ? "text/javascript" : "application/octet-stream" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(js ? FAKE : "").toString("base64") }, sid);
        }
        return send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, sid);
      }
    };
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await send("Runtime.enable");
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
    const toasts = () => ev(`[...document.querySelectorAll(".toast, #toast")].map((e) => e.textContent).join(" | ")`);
    await send("Page.navigate", { url: ORIGIN + "/" });
    await sleep(6000);
    const r = { afterOpen: external.map((x) => x.url) };
    r.toastAfterOpen = await toasts();
    r.preflightError = await ev(`(async()=>{try { noteExportBgRemove(); await prepareFrameAssets(0.5); return null; } catch(e) { return e.message; }})()`);
    r.afterExportPrep = external.map((x) => x.url);
    r.exportToast = await toasts();
    await ev(`(window.__rb = requestBgRemove(), 1)`); await sleep(300);
    r.dialogText = await ev(`document.querySelector("dialog.font-consent-dialog")?.textContent || null`);
    r.whileOpen = external.length;
    await ev(`document.querySelector('[data-bg-remove-consent="deny"]').click(), 1`); r.denied = await ev(`window.__rb`);
    await sleep(500);
    r.afterDeny = external.length;
    await ev(`(window.__rb = requestBgRemove(), 1)`); await sleep(300);
    await ev(`document.querySelector('[data-bg-remove-consent="allow"]').click(), 1`);
    r.allowed = await ev(`window.__rb`);
    if (!REAL) {
      r.firstDownloadFailed = r.allowed === false;
      r.allowed = await ev(`requestBgRemove()`);
      r.scriptAttempts = external.filter(x=>/selfie_segmentation\.js$/.test(x.url)).length;
    }
    // a cut-out on the still, as an export frame does (the real library runs its wasm and model here)
    await ev(`prepareFrameAssets(0.5).then(() => 1)`); await sleep(REAL ? 4000 : 800);
    r.maskReady = await ev(`!!bgSeg.masks.get("c1")`);
    r.afterAllow = external.slice();
    if (!REAL && r.allowed) {
      r.preview = await ev(`(async()=>{await renderStillAt(0.5); const x=els.preview.getContext('2d');return {w:els.preview.width,h:els.preview.height,left:[...x.getImageData(220,180,1,1).data],right:[...x.getImageData(420,180,1,1).data]};})()`);
      r.tabExport = await ev(`fastExport({silent:true,profile:'prores422'})`);
      const src = r.tabExport?.outputs?.[0]?.src;
      if (src) {
        const file=path.join(data,'exports',path.basename(decodeURIComponent(src)));
        const decoded=spawnSync(process.env.MONTCLIP_FFMPEG || 'ffmpeg',['-v','error','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:4*1024*1024,windowsHide:true});
        if(decoded.status!==0)throw Error('decode: '+decoded.stderr);
        r.exportPixels={left:[...decoded.stdout.subarray((180*640+220)*3,(180*640+220)*3+3)],right:[...decoded.stdout.subarray((180*640+420)*3,(180*640+420)*3+3)]};
      }
    }
    // A separate page must not inherit the preview page's consent. The server's actual job receipt is the evidence.
    const req = await (await fetch(ORIGIN+'/api/export/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({where:'headless',profile:'prores422'})})).json();
    const jobId = req.id || req.job?.id;
    if (!jobId) throw Error('export request: '+JSON.stringify(req));
    for(let n=0;n<300;n++) {
      r.headless = await (await fetch(ORIGIN+'/api/export/job?id='+jobId)).json();
      if(['done','failed','cancelled'].includes(r.headless.status))break;
      await sleep(200);
    }
    await ev(`(window.__rb = requestBgRemove(), 1)`); await sleep(300);
    r.askedAgain = await ev(`!!document.querySelector("dialog.font-consent-dialog")`);
    console.log(JSON.stringify(r, null, 1));
    const host = (u) => new URL(u).hostname;
    const checks = [
      ["opening the project sent nothing out", r.afterOpen.length === 0],
      ["the open hint says the clip shows with its background", /AI/.test(r.toastAfterOpen)],
      ["getting an export frame ready sent nothing out", r.afterExportPrep.length === 0],
      ["export refuses unavailable masks", /BG_REMOVE_UNAVAILABLE/.test(r.preflightError)],
      ["the box names the host", !!r.dialogText && /cdn\.jsdelivr\.net/.test(r.dialogText)],
      ["nothing sent while the box is open, or after Not now", r.whileOpen === 0 && r.afterDeny === 0 && r.denied === null],
      ["after Load: only cdn.jsdelivr.net, only GETs with no body", r.allowed === true && r.afterAllow.length > 0 && r.afterAllow.every((x) => host(x.url) === "cdn.jsdelivr.net" && x.method === "GET" && !x.body)],
      ["the cut-out ran", r.maskReady === true],
      ["not asked twice in a session", r.askedAgain === false],
      ["explicit download retry works", REAL || (r.firstDownloadFailed && r.allowed && r.scriptAttempts===2)],
      ["independent headless job fails with actionable error, no output", r.headless.status==='failed' && /BG_REMOVE_UNAVAILABLE/.test(r.headless.error) && !r.headless.src],
      ["synthetic preview and exported frame remove left half and retain right half", REAL || (r.preview?.left[0]<30 && r.preview?.right[0]>150 && r.exportPixels?.left[0]<30 && r.exportPixels?.right[0]>150)],
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
