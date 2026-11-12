"use strict";
/* MontClip#301: in Cindy\x27s light theme the export dialogs\x27 titles were white on the white card — and the export
   progress percentage is that same title (app.js writes "正在渲染… 65%" into #exportTitle, a .dialog h2). This measures
   the computed colour of the three export titles in both host themes, in a real headless browser: the light theme must
   be dark ink at 4.5:1 or better, the dark theme must still be the editor\x27s own white. Skipped without Chrome / Edge. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDataDir, startServer, seedProject } = require("./helpers");
const { withPage } = require("./browser-contrast");
const browser = (() => { try { return require("../export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to measure in" : typeof WebSocket !== "function" ? "needs Node\x27s WebSocket (Node 22)" : false;

// one clip, so the editor draws its track headers (the harness waits for them before measuring)
const project = seedProject({ name: "301", revision: 1,
  media: [{ id: "m1", name: "rec.mp4", kind: "video", src: "/media/rec.mp4", duration: 30, width: 1920, height: 1080, fps: 30, codec: "h264" }],
  clips: [{ id: "v1", mediaId: "m1", kind: "video", track: "V1", start: 0, in: 0, duration: 10 }] });

// the app\x27s own opener for Export setup, then the progress overlay with the title its render loop writes
const OPEN = `(() => {
  openExportSetup();
  document.getElementById("exportTitle").textContent = uiText("own.rendering-pct", { pct: 65 });
  document.getElementById("exportOverlay").classList.remove("hidden");
  return true;
})()`;

/* Runs in the page: for each export title, its computed colour and the card behind it. */
const READ = `(() => {
  const out = {};
  for (const id of ["exportSetupTitle", "exportTitle", "exportQueueTitle"]) {
    const el = document.getElementById(id);
    if (!el) { out[id] = null; continue; }
    const color = getComputedStyle(el).color;
    const dialog = el.closest(".dialog");
    out[id] = { text: el.textContent.trim().slice(0, 20), color, bg: dialog ? getComputedStyle(dialog).backgroundColor : null };
  }
  return out;
})()`;

const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ""); return m ? m[1].split(/[ ,\/]+/).filter(Boolean).map(Number) : null; };
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100; };

async function titles(t, theme) {
  const { base } = await startServer(t, makeDataDir(t, project), { FABLECUT_NO_FS_WATCH: "1" });
  return withPage({ browser, url: base + "/?host=cindy&theme=" + theme, width: 1280, height: 800, settleMs: 1200 }, async ({ evaluate }) => {
    await evaluate(OPEN);
    await new Promise((r) => setTimeout(r, 400));
    return evaluate(READ);
  });
}

test("light theme: the export dialogs\x27 titles and percentage are dark ink, 4.5:1 or better", { skip, timeout: 120000 }, async (t) => {
  const out = await titles(t, "light");
  for (const id of ["exportSetupTitle", "exportTitle", "exportQueueTitle"]) {
    const x = out[id];
    assert.ok(x, id + " is on the page");
    const fg = rgb(x.color), bg = rgb(x.bg);
    assert.ok(fg && bg, id + ": colours are readable (" + x.color + " on " + x.bg + ")");
    assert.notEqual(x.color, "rgb(255, 255, 255)", id + " is no longer white on the light theme\x27s white card");
    const r = ratio(fg, bg);
    t.diagnostic(`${id} "${x.text}": ${r}:1 (${x.color} on ${x.bg})`);
    assert.ok(r >= 4.5, id + ` is ${r}:1 on the light theme, expected 4.5:1 or better`);
  }
});

test("dark theme: the same titles keep the editor\x27s own white, 4.5:1 or better", { skip, timeout: 120000 }, async (t) => {
  const out = await titles(t, "dark");
  for (const id of ["exportSetupTitle", "exportTitle", "exportQueueTitle"]) {
    const x = out[id];
    assert.ok(x, id + " is on the page");
    assert.equal(x.color, "rgb(255, 255, 255)", id + " keeps its #fff on the dark theme (" + x.color + ")");
    const r = ratio(rgb(x.color), rgb(x.bg));
    t.diagnostic(`${id} "${x.text}": ${r}:1 (${x.color} on ${x.bg})`);
    assert.ok(r >= 4.5, id + ` is ${r}:1 on the dark theme, expected 4.5:1 or better`);
  }
});

