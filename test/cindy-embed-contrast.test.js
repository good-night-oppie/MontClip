/* VV's contrast check of #113: inside Cindy with the light theme (?host=cindy&theme=light), every visible text in the
   editor is at least 3:1 against what is behind it — in the default view, with a recording or a caption selected, and
   with the transcript and mixer tabs open, at 1280 and at the task tab's 970 px. Measured in a real headless browser
   (test/browser-contrast.js); skipped where there is none. Texts over a gradient (▶, ⬇ 导出, clip labels) are reported
   apart: their background cannot be read as one colour. A synthetic project; its recording file does not exist. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDataDir, startServer, seedProject } = require("./helpers");
const { measureContrast } = require("./browser-contrast");
const browser = (() => { try { return require("../export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to measure in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;

const caption = (id, start, text) => ({ id, kind: "text", mediaId: null, track: "V2", start, in: 0, duration: 3, props: { text, caption: true } });
const project = seedProject({ name: "对比度", revision: 1,
  media: [{ id: "m1", name: "rec.mp4", kind: "video", src: "/media/rec.mp4", duration: 7200, width: 1920, height: 1080, fps: 30, codec: "h264" }],
  clips: [{ id: "v1", mediaId: "m1", kind: "video", track: "V1", start: 0, in: 0, duration: 30 },
    caption("a", 0, "第一句"), caption("b", 4, "第二句"), caption("c", 9, "第三句"), caption("d", 13, "第四句")] });
const STATES = [
  { name: "default" },
  { name: "recording selected", run: 'setSelection(["v1"])' },
  { name: "caption selected", run: 'setSelection(["a"])' },
  { name: "transcript tab", run: 'setSideTab("transcript")' },
  { name: "mixer tab", run: 'setSideTab("mixer")' },
];

for (const width of [1280, 970]) {
  test(`light theme in Cindy, ${width} px: every visible text at least 3:1`, { skip, timeout: 90000 }, async (t) => {
    const { base } = await startServer(t, makeDataDir(t, project), { FABLECUT_NO_FS_WATCH: "1" });
    const out = await measureContrast({ browser, url: base + "/?host=cindy&theme=light", width, height: 800, settleMs: 1500, states: STATES });
    for (const st of STATES) {
      const { texts } = out[st.name];
      assert.ok(texts.length > 40, `${st.name}: the page drew its texts (${texts.length})`);
      const low = texts.filter((x) => x.ratio < 3).map((x) => `${x.ratio} "${x.text}" ${x.where} (${x.fg} on ${x.bg})`);
      assert.deepEqual(low, [], `${st.name}: texts under 3:1`);
    }
  });
}
