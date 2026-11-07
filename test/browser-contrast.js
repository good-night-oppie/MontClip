/* Contrast of every visible text in the editor, measured in a real headless browser (Chrome / Edge over CDP, with
   Node's own WebSocket). Used by test/cindy-embed-contrast.test.js. The background of a text is its element's and its
   ancestors' background colours composited back to the page; a text over a background image or gradient cannot be
   read that way and is reported apart (VV, #113: ▶ and ⬇ 导出 sit on gradients). */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

/* Runs in the page: [{text, ratio, fg, bg, where}] for each element with its own visible text, plus the skipped ones. */
const MEASURE = String.raw`(() => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => { const a = top.a + under.a * (1 - top.a); if (!a) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: (top.r * top.a + under.r * under.a * (1 - top.a)) / a, g: (top.g * top.a + under.g * under.a * (1 - top.a)) / a, b: (top.b * top.a + under.b * under.a * (1 - top.a)) / a, a }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const out = [], skipped = [];
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || +cs.opacity === 0) continue;
    let hidden = false, image = false, layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || +s.opacity === 0) { hidden = true; break; }
      if (s.backgroundImage && s.backgroundImage !== "none") image = true;
      const bg = parse(s.backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
    }
    if (hidden) continue;
    const where = (el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""));
    if (image) { skipped.push({ text: own.slice(0, 40), where, why: "background image" }); continue; }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) bg = over(l, bg);
    const fg = over(parse(cs.color) || { r: 0, g: 0, b: 0, a: 1 }, bg);
    out.push({ text: own.slice(0, 40), where, ratio: Math.round(ratio(fg, bg) * 100) / 100,
      fg: [fg.r, fg.g, fg.b].map(Math.round).join(","), bg: [bg.r, bg.g, bg.b].map(Math.round).join(","), size: parseFloat(cs.fontSize) });
  }
  return { texts: out, skipped };
})()`;

/* The browser picks its own debugging port and writes it to <profile>/DevToolsActivePort once it listens (a random
   port of ours could be taken). A cold browser on a CI runner can take well over 15 s to get there, and Edge may open
   its own first-run tab instead of ours, so: wait for the port (up to 60 s), take the first page there, and navigate
   it to `url` ourselves. */
async function cdpPage(prof) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const port = Number(fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]);
      if (port > 0) {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("the headless browser did not open the page");
}

/** Open `url` in a headless browser at `width`×`height`, wait `settleMs`, run MEASURE — once, or after each of
 *  `states` ({name, run}: an expression that puts the page in that state). → {texts, skipped} | {[name]: {texts, skipped}} */
async function measureContrast({ browser, url, width = 1280, height = 800, settleMs = 3000, before = "", states = null }) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-contrast-"));
  const b = spawn(browser, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
    `--user-data-dir=${prof}`, "--remote-debugging-port=0", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
  try {
    const ws = new WebSocket(await cdpPage(prof));
    await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
    let n = 0; const pend = new Map();
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); });
    const send = (method, params) => new Promise((r) => { const k = ++n; pend.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
    const evaluate = (expression) => send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }).then((m) => m.result?.result?.value);
    await send("Page.navigate", { url });
    // the editor has drawn when its track headers are there (a loaded machine takes longer than settleMs alone)
    for (const until = Date.now() + 20000; Date.now() < until;) {
      if (await evaluate(`document.readyState === "complete" && document.querySelectorAll(".track-head").length > 0`)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, settleMs));
    let out;
    if (states) {
      out = {};
      for (const st of states) {
        if (st.run) await evaluate(st.run);
        await new Promise((r) => setTimeout(r, 500));
        out[st.name] = await evaluate(MEASURE);
      }
    } else {
      if (before) { await evaluate(before); await new Promise((r) => setTimeout(r, 500)); }
      out = await evaluate(MEASURE);
    }
    ws.close();
    return out;
  } finally {
    b.kill();
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch { }
  }
}

module.exports = { measureContrast };
