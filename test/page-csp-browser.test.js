/* #366 part B in a real headless browser (Chrome / Edge over CDP; skipped where there is none): the editor page in browser
   mode and inside Cindy (?host=cindy) draws under its script policy without a single violation, and HTML that ends up in the
   page anyway — an inline handler, an inline script, a same-origin script planted in media/ — runs nothing. Synthetic files
   only; nothing leaves the computer. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { makeDataDir, startServer } = require("./helpers");
const { withPage } = require("./browser-contrast");
const browser = (() => { try { return require("../server/export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to run the page in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;

// every policy violation the page reports, collected before its own scripts run
const INIT = `window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "")));`;

for (const url of ["/", "/?host=cindy&theme=dark"]) {
  test(`the editor at ${url} runs under its policy; injected HTML runs nothing`, { skip, timeout: 120000 }, async (t) => {
    const dir = makeDataDir(t);
    fs.mkdirSync(path.join(dir, "media"), { recursive: true });
    fs.writeFileSync(path.join(dir, "media", "evil.js"), "window.__ranMedia = 1;");   // planted by other means than an upload
    const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
    const out = await withPage({ browser, url: base + url, settleMs: 1500, init: INIT }, async ({ evaluate }) => {
      const drawn = await evaluate(`document.querySelectorAll(".track-head").length`);
      const before = await evaluate(`window.__csp.slice()`);
      await evaluate(`(() => {
        document.body.insertAdjacentHTML("beforeend", '<img id="x366" src="data:," onerror="window.__ranAttr = 1">');
        const box = document.createElement("div"); box.innerHTML = '<svg onload="window.__ranSvg = 1"></svg>'; document.body.appendChild(box);
        const s = document.createElement("script"); s.textContent = "window.__ranInline = 1"; document.body.appendChild(s);
        const m = document.createElement("script"); m.src = "/media/evil.js"; document.body.appendChild(m);
        return true; })()`);
      await new Promise((r) => setTimeout(r, 1500));
      return { drawn, before, ran: await evaluate(`[window.__ranAttr, window.__ranSvg, window.__ranInline, window.__ranMedia]`),
        after: await evaluate(`window.__csp.slice()`) };
    });
    assert.ok(out.drawn > 0, "the editor drew its tracks under the policy");
    assert.deepEqual(out.before, [], "no violation while the editor loads and draws: " + JSON.stringify(out.before));
    assert.deepEqual(out.ran, [null, null, null, null], "nothing injected ran");
    assert.ok(out.after.some((v) => /^script-src/.test(v)), "the policy is what stopped the inline ones: " + JSON.stringify(out.after));
  });
}
