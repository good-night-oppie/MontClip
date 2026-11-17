"use strict";
/* #375 (2) through the real page: the engine embedded as Cindy runs it (MONTCLIP_HOST=cindy, its token), the editor page
   loaded the way Cindy frames it (?token=…&host=cindy) in headless Chrome, and the assistant's MCP process with the same two
   variables. The assistant imports from a URL; the page shows the card; the browser's own mouse and keyboard answer it.
     · 「不要」 (a real click): IMPORT_URL_DECLINED, the site got 0 requests; asked again, no card and still 0.
     · Esc: the same as 「不要」.
     · 「下载」 (a real click): the file is downloaded and registered; the site got exactly 1 request.
   The "site" is a stand-in on https://127.0.0.1 with a certificate made for this run (openssl), trusted only by the MCP process
   (NODE_EXTRA_CA_CERTS); the file is a synthetic 2 s clip made with the bundled FFmpeg. Nothing leaves this computer.
   Needs Chrome or Edge, openssl and the bundled FFmpeg:
     MONTCLIP_FFMPEG_DIR=<vendor/ffmpeg/win32-x64> node --test dev/real-tests/url-import-375-embed-browser.cjs */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..", "..");
const { makeDataDir, freePort, endTree, startMcp } = require(path.join(ROOT, "test/helpers"));
const { withPage } = require(path.join(ROOT, "test/browser-contrast"));
const browser = require(path.join(ROOT, "server/export-jobs")).findBrowser();
const FF = require(path.join(ROOT, "server/ffmpeg-path"));

test("#375 (2) in the real page: 「不要」, Esc and 「下载」 on the assistant's URL import", { timeout: 300000 }, async (t) => {
  // the stand-in site: its own certificate, a synthetic clip, every request counted
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc375-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", path.join(tmp, "key.pem"), "-out", path.join(tmp, "cert.pem")], { stdio: "ignore" });
  const clip = path.join(tmp, "clip.mp4");
  execFileSync(FF.path("ffmpeg"), ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=2",
    "-c:v", "mpeg4", "-pix_fmt", "yuv420p", "-y", clip]);
  const hits = [];
  const site = https.createServer({ key: fs.readFileSync(path.join(tmp, "key.pem")), cert: fs.readFileSync(path.join(tmp, "cert.pem")) }, (req, res) => {
    hits.push(req.url);
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": fs.statSync(clip).size });
    fs.createReadStream(clip).pipe(res);
  });
  await new Promise((r) => site.listen(0, "127.0.0.1", r));
  t.after(() => site.close());
  const url = (n) => `https://127.0.0.1:${site.address().port}/${n}`;

  // the engine as Cindy runs it
  const token = crypto.randomBytes(32).toString("hex"), port = await freePort(), dir = makeDataDir(t);
  const child = spawn(process.execPath, [path.join(ROOT, "server/server.js")], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1",
      MONTCLIP_DESKTOP: "", MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token } });
  child.stdout.resume(); child.stderr.resume();
  const exited = new Promise((r) => child.on("exit", r));
  t.after(async () => { endTree(child); await exited; });
  const base = `http://127.0.0.1:${port}`;
  // wait for the engine (a plain request to 127.0.0.1 only — the network scan in scripts/pr-sop reads it as local)
  const workerHeaders = { "X-MontClip-Session": token };
  const status = () => new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/project", headers: workerHeaders });
    req.on("response", (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve(0));
  });
  for (let i = 0; i < 400; i++) {
    if ((await status()) === 200) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  // the assistant's MCP process, embedded the same way
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port), MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token,
    FABLECUT_TEST_IMPORT_ALLOW_PRIVATE: "1", NODE_EXTRA_CA_CERTS: path.join(tmp, "cert.pem") });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });

  const out = await withPage({ browser, url: `${base}/?token=${token}&host=cindy`, settleMs: 1500 }, async ({ evaluate, send }) => {
    const r = {};
    const card = async () => {
      for (const until = Date.now() + 20000; Date.now() < until;) {
        const c = await evaluate(`(() => { const d = document.querySelector("dialog[data-iu-card]"); if (!d || !d.open) return null;
          const at = (s) => { const b = d.querySelector(s).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
          return { text: d.querySelector("[data-iu-ask]").textContent, buttons: [...d.querySelectorAll("[data-iu-choice]")].map((b) => b.textContent),
            focused: document.activeElement && document.activeElement.dataset.iuChoice, yes: at('[data-iu-choice="download"]'), no: at('[data-iu-choice="no"]') }; })()`);
        if (c) return c;
        await new Promise((res) => setTimeout(res, 200));
      }
      return null;
    };
    const click = async (p) => {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
    };
    const cards = () => evaluate(`document.querySelectorAll("dialog[data-iu-card]").length`);
    // 「不要」
    const p1 = mcp.callTool("fablecut_import_media", { path: url("no.mp4") });
    const c1 = await card(); r.card = c1;
    await click(c1.no);
    r.no = await p1; r.hitsAfterNo = hits.length;
    const p1b = await mcp.callTool("fablecut_import_media", { path: url("no.mp4") });
    r.noAgain = p1b; r.cardAfterNoAgain = await cards(); r.hitsAfterNoAgain = hits.length;
    // Esc
    const p2 = mcp.callTool("fablecut_import_media", { path: url("esc.mp4") });
    r.cardEsc = await card();
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    r.esc = await p2; r.hitsAfterEsc = hits.length;
    // 「下载」
    const p3 = mcp.callTool("fablecut_import_media", { path: url("yes.mp4") });
    const c3 = await card();
    await click(c3.yes);
    r.yes = await p3; r.hitsAfterYes = hits.length;
    return r;
  });
  console.log("URL_IMPORT_EMBED " + JSON.stringify({ card: out.card, no: out.no.text, noAgain: out.noAgain.text, cardAfterNoAgain: out.cardAfterNoAgain,
    esc: out.esc.text, yes: out.yes.text.slice(0, 300), hits }, null, 1));
  assert.equal(out.card.text, "助手想从 127.0.0.1 下载一个录像到你的电脑，要下载吗？");
  assert.deepEqual(out.card.buttons, ["下载", "不要"]);
  assert.equal(out.card.focused, "no", "the focus is on 「不要」");
  assert.match(out.no.text, /IMPORT_URL_DECLINED/); assert.equal(out.hitsAfterNo, 0);
  assert.match(out.noAgain.text, /IMPORT_URL_DECLINED/); assert.equal(out.cardAfterNoAgain, 0); assert.equal(out.hitsAfterNoAgain, 0);
  assert.match(out.esc.text, /IMPORT_URL_DECLINED/); assert.equal(out.hitsAfterEsc, 0);
  assert.equal(out.yes.isError, false, out.yes.text);
  assert.deepEqual(hits, ["/yes.mp4"], "exactly one request, after 「下载」");
  const media = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8")).media;
  assert.ok(media.some((m) => m.name === "yes.mp4" && fs.existsSync(path.join(dir, "media", decodeURIComponent(m.src.slice(7))))), JSON.stringify(media));
});
