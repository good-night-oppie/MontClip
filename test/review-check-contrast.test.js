/* QQ #326 item 6: every text in the 「检查这 10 秒」 box at least 4.5:1, in the dark and the light theme, measured in a real
   headless browser (test/browser-contrast.js; skipped where there is none). The server has no review routes yet, so the
   page mounts a second copy of the box on the interface stand-in (review-check.js stubApi — no network) and opens it:
   the confirm box, the confirm box with no known receiver (the warning line), and a result with a finding in the lead. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDataDir, startServer, seedProject } = require("./helpers");
const { measureContrast } = require("./browser-contrast");
const browser = (() => { try { return require("../server/export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to measure in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;

const project = seedProject({ name: "对比度", revision: 1, media: [], clips: [] });
const open = (opts) => `(() => {
  const R = window.MontClipReviewCheck;
  if (window.__rc) window.__rc.session.close();
  const b = document.createElement("button"); b.className = "btn"; document.body.appendChild(b);
  const api = R.stubApi(${opts});
  window.__rc = R.mount({ doc: document, button: b, api, lang: () => "zh-CN", time: () => 42, playing: () => false,
    duration: () => 200, inOut: () => ({}), seek: () => {}, blocked: () => false, setInterval: () => {} });
  b.style.display = "none";
  setTimeout(() => b.click(), 50);
  return true;
})()`;
const STATES = [
  { name: "confirm", run: open("{}") },
  { name: "no receiver", run: open("{ destination: null }") },
  { name: "result", run: open(`{ result: (scope, range) => ({ status: "issues", scope, range, findings: [
      { id: 0, t: 41, type: "speaker_swapped", text: "左边的人说话时，字幕标成了右边的名字。", suggestion: "把这两句字幕的说话人对调。" },
      { id: 1, t: 36, type: "cut_jump", text: "前面接过来的地方有点跳。", inLead: true }] }) }`) + `;setTimeout(() => document.querySelector('[data-review="full"]').click(), 400)` },
];

for (const theme of ["dark", "light"]) {
  test(`${theme} theme: every text in the review box at least 4.5:1`, { skip, timeout: 90000 }, async (t) => {
    const { base } = await startServer(t, makeDataDir(t, project), { FABLECUT_NO_FS_WATCH: "1" });
    const url = base + (theme === "light" ? "/?host=cindy&theme=light" : "/");
    // wait until the box shows what this state is about (a cold browser can take a while), at most 10 s
    const ready = { confirm: '[data-review="training"]', "no receiver": '[data-review="to"].review-warn', result: '[data-review="headline"]' };
    const states = STATES.map((st) => ({ ...st, run: st.run + `;new Promise((r) => { const t0 = Date.now(); (function w() {
      if (document.querySelector('${ready[st.name]}') || Date.now() - t0 > 10000) return setTimeout(r, 300); setTimeout(w, 100); })(); })` }));
    const out = await measureContrast({ browser, url, width: 1280, height: 900, settleMs: 1500, states });
    for (const st of STATES) {
      const { texts, skipped } = out[st.name];
      const mine = texts.filter((x) => /review|reviewDialog|reviewTitle/.test(x.where));
      assert.ok(mine.length >= (st.name === "result" ? 6 : 8), `${st.name}: the box drew its texts (${mine.length})`);
      const boxSkipped = skipped.filter((x) => /review/.test(x.where));
      assert.deepEqual(boxSkipped, [], `${st.name}: no text in the box sits on a gradient`);
      const low = mine.filter((x) => x.ratio < 4.5).map((x) => `${x.ratio} "${x.text}" ${x.where} (${x.fg} on ${x.bg})`);
      t.diagnostic(`${theme}, ${st.name}: ${mine.length} texts, lowest ${Math.min(...mine.map((x) => x.ratio))}:1`);
      assert.deepEqual(low, [], `${st.name}: texts under 4.5:1`);
    }
    if (theme === "dark") {
      const warn = out["no receiver"].texts.find((x) => x.text.startsWith("不知道这次会发到哪里"));
      assert.ok(warn, "the warning line was measured");
    }
  });
}
