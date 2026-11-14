/* QQ #326 item 6: every text in the 「检查这 10 秒」 box at least 4.5:1, in the dark and the light theme, measured in a real
   headless browser (test/browser-contrast.js; skipped where there is none). The server has no review routes yet, so the
   page mounts a second copy of the box on the interface stand-in (review-check.js stubApi — no network) and opens it:
   the confirm box, the confirm box with no known receiver (the warning line), the box for a domain nobody confirmed
   (「未验证」, #328), and a result with a finding in the lead and the four dimensions. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDataDir, startServer, seedProject } = require("./helpers");
const { measureContrast } = require("./browser-contrast");
const browser = (() => { try { return require("../server/export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to measure in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;

const project = seedProject({ name: "对比度", revision: 1, media: [], clips: [] });
// Each state mounts a fresh box and works only inside it (window.__rc.overlay; the boxes of earlier states stay in the
// page, hidden). `wait` returns {reached, ms, step, at}, and every assertion message carries it with the theme, state,
// text count and skipped texts: the earlier 1-in-7 failures (#326) left no reason, so a miss now says where it stopped.
const open = (opts) => `(() => {
  const R = window.MontClipReviewCheck;
  if (window.__rc) window.__rc.session.close();
  const b = document.createElement("button"); b.className = "btn hidden"; document.body.appendChild(b);   // shown once the routes answer
  const api = R.stubApi(${opts});
  window.__rc = R.mount({ doc: document, button: b, api, lang: () => "zh-CN", time: () => 42, playing: () => false,
    duration: () => 200, inOut: () => ({}), seek: () => {}, setInterval: () => {}, pollMs: 50 });
  b.style.display = "none";
  window.__rcBtn = b;
  return true;
})()`;
// poll inside the newest box until `sel` is there (at most 15 s); `click` is pressed once it is enabled (the button: once shown, as for a person)
const wait = (steps) => `new Promise((done) => {
  const t0 = Date.now(), steps = ${JSON.stringify(steps)}; let i = 0;
  (function w() {
    const box = window.__rc && window.__rc.overlay, st = steps[i];
    if (st.click) { const el = st.click === "#open" ? window.__rcBtn : box.querySelector(st.click);
      if (el && !el.disabled && !(st.click === "#open" && (el.classList.contains("hidden") || box.classList.contains("hidden") === false))) { el.click(); i++; } }
    else if (box && !box.classList.contains("hidden") && box.querySelector(st.sel)) i++;
    if (i >= steps.length) return setTimeout(() => done({ reached: true, ms: Date.now() - t0 }), 300);
    if (Date.now() - t0 > 15000) return done({ reached: false, ms: Date.now() - t0, step: i, at: JSON.stringify(steps[i]) });
    setTimeout(w, 50);
  })();
})`;
const STATES = [
  { name: "confirm", run: open("{}") + ";" + wait([{ click: "#open" }, { sel: '[data-review="training"]' }]) },
  { name: "no receiver", run: open("{ destination: null }") + ";" + wait([{ click: "#open" }, { sel: '[data-review="to"].review-warn' }]) },
  // #328: nobody confirmed the domain — the engine refuses to prepare; the box says where it would go, 「未验证」, in the warning colour
  { name: "unverified", run: open(`{ destination: { service: "Google Gemini", host: "daily-cloudcode-pa.googleapis.com", source: "docs", verified: false }, prepareError: "DESTINATION_UNVERIFIED" }`)
      + ";" + wait([{ click: "#open" }, { sel: '[data-review="to"].review-warn' }]) },
  { name: "result", run: open(`{ result: (scope, range) => ({ status: "issues", scope, range, findings: [
      { id: 0, t: 41, type: "speaker_swapped", text: "左边的人说话时，字幕标成了右边的名字。", suggestion: "把这两句字幕的说话人对调。" },
      { id: 1, t: 36, type: "cut_jump", text: "前面接过来的地方有点跳。", inLead: true }],
      dimensions: { fact: { state: "issues", reason: "名牌和说话的人对不上。" }, subtitle: { state: "passed", reason: "" },
        pacing: { state: "insufficient_evidence", reason: "这一段太短。" }, packaging: { state: "passed", reason: "" } } }) }`)
      + ";" + wait([{ click: "#open" }, { click: '[data-review="full"]' }, { sel: '[data-review="headline"]' }, { sel: '[data-review="jump"]' }, { sel: '[data-review="dim"]' }]) },
];

for (const theme of ["dark", "light"]) {
  test(`${theme} theme: every text in the review box at least 4.5:1`, { skip, timeout: 120000 }, async (t) => {
    const { base } = await startServer(t, makeDataDir(t, project), { FABLECUT_NO_FS_WATCH: "1" });
    const url = base + (theme === "light" ? "/?host=cindy&theme=light" : "/");
    const t0 = Date.now();
    const out = await measureContrast({ browser, url, width: 1280, height: 900, settleMs: 1500, states: STATES });
    t.diagnostic(`${theme}: page + ${STATES.length} states measured in ${Date.now() - t0} ms`);
    for (const st of STATES) {
      const { texts, skipped, ran } = out[st.name];
      const mine = texts.filter((x) => /review|reviewDialog|reviewTitle/.test(x.where));
      const why = `${theme}, ${st.name}: ran ${JSON.stringify(ran)}, ${mine.length} texts, skipped ${JSON.stringify(skipped.slice(0, 5))}`;
      t.diagnostic(why);
      assert.equal(ran && ran.reached, true, `the box never got to this state — ${why}`);
      assert.ok(mine.length >= (st.name === "result" ? 10 : st.name === "unverified" ? 6 : 8), `the box drew its texts — ${why}`);
      const boxSkipped = skipped.filter((x) => /review/.test(x.where));
      assert.deepEqual(boxSkipped, [], `no text in the box sits on a gradient — ${why}`);
      const low = mine.filter((x) => x.ratio < 4.5).map((x) => `${x.ratio} "${x.text}" ${x.where} (${x.fg} on ${x.bg})`);
      t.diagnostic(`${theme}, ${st.name}: ${mine.length} texts, lowest ${Math.min(...mine.map((x) => x.ratio))}:1`);
      assert.deepEqual(low, [], `texts under 4.5:1 — ${why}`);
    }
    if (theme === "dark") {
      const warn = out["no receiver"].texts.find((x) => x.text.startsWith("不知道这次会发到哪里"));
      assert.ok(warn, "the warning line was measured");
      // measured texts are cut to 40 characters (browser-contrast.js), so the 未验证 line is found by its start and its warning style;
      // its words are checked in full by test/review-check.test.js
      const unv = out.unverified.texts.find((x) => x.text.startsWith("发给：Google Gemini") && /review-warn/.test(x.where));
      assert.ok(unv, "the 未验证 line was measured, in the warning colour");
    }
  });
}
