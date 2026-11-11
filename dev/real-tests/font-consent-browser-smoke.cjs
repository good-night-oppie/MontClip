'use strict';
// Browser mode, Google Fonts asks first (Deja, 2026-11-04): the real server and a headless Chrome / Edge on it. Nothing
// leaves this computer: fonts.googleapis.com and fonts.gstatic.com are resolved to a local HTTPS stand-in (Chrome's
// --host-resolver-rules, a throwaway self-signed certificate), and every other non-local request is failed over CDP.
// The stand-in answers like Google Fonts (a stylesheet whose @font-face points at fonts.gstatic.com, then the font
// file), so both requests the browser really makes are seen with the headers it really sends.
// Checks: opening a project and getting fonts ready for an export send nothing out (and say which fonts fall back);
// the box names the font and both hosts; "Not now" sends nothing; after "Load", only those two hosts, for that font;
// the same font isn't asked about twice in a session. Deja (on #151): neither request carries a Referer or a Cookie
// (a cookie is planted for both hosts first), nor anything naming this computer's address; the headers are printed.
//   node dev/real-tests/font-consent-browser-smoke.cjs        (FABLECUT_CHROME picks the browser; needs openssl)
const { spawn, spawnSync } = require("child_process"), fs = require("fs"), path = require("path"), os = require("os"), https = require("https");
const ROOT = path.join(__dirname, "../.."), CHROME = require("../../export-jobs").findBrowser();
if (!CHROME) { console.log("SKIP: no Chrome / Edge (set FABLECUT_CHROME)"); process.exit(0); }
const PORT = 7791, ORIGIN = `http://127.0.0.1:${PORT}`, CDP = 9333;
let STAND_IN = 0;   // any free port
const HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const data = fs.mkdtempSync(path.join(os.tmpdir(), "fc-font-"));
fs.mkdirSync(path.join(data, "media"));
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "secret-project-name", width: 640, height: 360, fps: 30, revision: 1, panSchema: 1, media: [],
  clips: [{ id: "t1", kind: "text", mediaId: null, track: "V2", start: 0, in: 0, duration: 3, props: { text: "Hi", font: "Lobster" } },
    { id: "t2", kind: "text", mediaId: null, track: "V3", start: 0, in: 0, duration: 3, props: { text: "Yo", font: "Anton", textAnim: "font-cut", fontCutSet: ["Anton", "Cinzel"] } }] }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the stand-in for Google Fonts: what it was asked, with every header as sent */
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-cert-"));
const key = path.join(certDir, "k.pem"), crt = path.join(certDir, "c.pem");
const ssl = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt, "-days", "1",
  "-subj", "/CN=fonts.googleapis.com", "-addext", "subjectAltName=DNS:fonts.googleapis.com,DNS:fonts.gstatic.com"], { encoding: "utf8" });
if (ssl.status !== 0) { console.log("SKIP: openssl could not make a test certificate\n" + ssl.stderr); process.exit(0); }
const seen = [];
const FONT_FILE = fs.readFileSync(path.join(ROOT, "library", "fonts", "Anton.woff2"));
const standIn = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
  const headers = {};
  for (let i = 0; i < req.rawHeaders.length; i += 2) headers[req.rawHeaders[i]] = req.rawHeaders[i + 1];
  seen.push({ host: req.headers.host, url: req.url, headers });
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.headers.host === "fonts.googleapis.com" && req.url.startsWith("/css2")) {
    res.setHeader("Content-Type", "text/css");
    res.end("@font-face { font-family: 'Lobster'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/lobster/v30/test.woff2) format('woff2'); }");
  } else if (req.headers.host === "fonts.gstatic.com") { res.setHeader("Content-Type", "font/woff2"); res.end(FONT_FILE); }
  else { res.statusCode = 404; res.end(); }
});

(async () => {
  await new Promise((r) => standIn.listen(0, "127.0.0.1", r));
  STAND_IN = standIn.address().port;
  const srv = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, PORT, FABLECUT_DATA_DIR: data, FABLECUT_NO_FS_WATCH: "1" }, stdio: "ignore" });
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "fc-prof-"));
  const ch = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${CDP}`, "--user-data-dir=" + prof, "--no-first-run",
    `--host-resolver-rules=${HOSTS.map((h) => `MAP ${h} 127.0.0.1:${STAND_IN}`).join(", ")}`, "--ignore-certificate-errors", "about:blank"], { stdio: "ignore" });
  let ws;
  try {
    await sleep(2500);
    const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
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
        // the two Google Fonts hosts go on to the local stand-in (resolver rules); anything else stops here
        if (HOSTS.includes(new URL(request.url).hostname)) return send("Fetch.continueRequest", { requestId });
        return send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      }
    };
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await send("Runtime.enable"); await send("Network.enable");
    // a cookie for each host, so "no Cookie" means the browser chose not to send one
    for (const h of HOSTS) await send("Network.setCookie", { name: "planted", value: "cookie-" + h, domain: h, path: "/", secure: true, sameSite: "None" });
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
    await send("Page.navigate", { url: ORIGIN + "/" });
    // the fallback hint, once the page has opened the project (a slow machine takes longer than a fixed wait)
    const toastText = `(document.querySelector(".toast")||document.getElementById("toast"))?.textContent || ""`;
    let hint = "";
    for (let i = 0; i < 60 && !/Lobster/.test(hint); i++) { await sleep(500); hint = await ev(toastText); }
    await sleep(500);
    const r = { afterOpen: [...external] };
    r.toastAfterOpen = hint;
    await ev(`loadProjectFonts().then(()=>1)`);
    r.afterExportFonts = [...external];
    r.exportToast = await ev(`(document.querySelector(".toast")||document.getElementById("toast"))?.textContent || ""`);
    await ev(`(window.__rf = requestFonts(["Lobster"]), 1)`); await sleep(300);
    r.dialogText = await ev(`document.querySelector("dialog.font-consent-dialog")?.textContent || null`);
    r.whileOpen = [...external];
    await ev(`document.querySelector('[data-font-consent="deny"]').click(), 1`); r.denied = await ev(`window.__rf`);
    r.afterDeny = [...external];
    await ev(`(window.__rf = requestFonts(["Lobster"]), 1)`); await sleep(300);
    await ev(`document.querySelector('[data-font-consent="allow"]').click(), 1`); r.allowed = await ev(`window.__rf`); await sleep(1500);
    r.afterAllow = [...external];
    await ev(`(window.__rf = requestFonts(["Lobster"]), 1)`); await sleep(300);
    r.askedAgain = await ev(`!!document.querySelector("dialog.font-consent-dialog")`);
    // the page's policy is no-referrer (index.html); its own writes to the editor's server still go through
    r.pagePolicy = await ev(`document.querySelector('meta[name=referrer]')?.content || null`);
    r.localWrite = await ev(`fetch('/api/media-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ srcs: [], stat: true }) }).then((x) => x.status)`);
    r.localSave = await ev(`fetch('/api/project').then((x) => x.json()).then((d) => fetch('/api/project', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, revision: (d.revision || 0) + 1 }) })).then((x) => x.status)`);
    r.seen = seen;
    console.log(JSON.stringify(r, null, 1));
    const g = (u) => new URL(u).hostname;
    const css = seen.find((s) => s.host === "fonts.googleapis.com"), file = seen.find((s) => s.host === "fonts.gstatic.com");
    const header = (s, name) => Object.entries(s.headers).find(([k]) => k.toLowerCase() === name)?.[1];
    // nothing in what was sent names this computer (its address and port, the editor's page, the project), except the
    // Origin header: a browser sends it on every CORS request, which both of these are, whatever the referrer policy
    const local = (s) => JSON.stringify({ ...s, headers: Object.fromEntries(Object.entries(s.headers).filter(([k]) => k.toLowerCase() !== "origin")) })
      .match(/127\.0\.0\.1|localhost|:7791|secret-project-name/);
    const checks = [
      ["opening the project sent nothing out", r.afterOpen.length === 0],
      ["the fallback hint names the fonts", /Lobster/.test(r.toastAfterOpen) && /Cinzel/.test(r.toastAfterOpen)],
      ["getting fonts ready for an export sent nothing out", r.afterExportFonts.length === 0],
      ["the export hint names the fonts", /Lobster/.test(r.exportToast) && /Cinzel/.test(r.exportToast)],
      ["the box names the font and both hosts", !!r.dialogText && /Lobster/.test(r.dialogText) && /fonts\.googleapis\.com/.test(r.dialogText) && /fonts\.gstatic\.com/.test(r.dialogText)],
      ["nothing sent while the box is open, or after Not now", r.whileOpen.length === 0 && r.afterDeny.length === 0 && r.denied === null],
      ["after Load: only the two Google Fonts hosts, for that font", r.allowed === true && r.afterAllow.length > 0 && r.afterAllow.every((u) => HOSTS.includes(g(u)))
        && r.afterAllow.filter((u) => g(u) === "fonts.googleapis.com").every((u) => /family=Lobster[:&]/.test(u))],
      ["both requests reached the stand-in (the stylesheet, then the font file)", !!css && !!file],
      ["no Referer on either request", !!css && !!file && !header(css, "referer") && !header(file, "referer")],
      ["no Cookie on either request (one was planted for each host)", !!css && !!file && !header(css, "cookie") && !header(file, "cookie")],
      ["nothing else in either request names this computer's address, page or project", !!css && !!file && !local(css) && !local(file)],
      ["the Origin header is at most the editor's origin (no path, no project)", !!css && !!file && [css, file].every((s) => [undefined, ORIGIN, "null"].includes(header(s, "origin")))],
      ["not asked twice for one font in a session", r.askedAgain === false],
      ["the page's referrer policy is no-referrer", r.pagePolicy === "no-referrer"],
      ["the editor's own POST and PUT to its server still work under it", r.localWrite === 200 && r.localSave === 200],
    ];
    for (const [name, ok] of checks) console.log((ok ? "PASS " : "FAIL ") + name);
    process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
  } finally {
    try { ws && ws.close(); } catch { }
    ch.kill(); srv.kill(); standIn.close();
    await sleep(1000);
    // Chrome lets go of its profile a moment after it is killed (Windows): retry rather than leave it behind
    for (const d of [data, prof, certDir]) try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { }
  }
})().catch((e) => { console.error(e); process.exit(1); });
