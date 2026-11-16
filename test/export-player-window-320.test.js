/* MontClip#320: the page the server opens for one export (?exportJob=<id>) kept one <video> / <audio> per clip, all of
   them opened when the project loaded and none freed until the job ended. A project with 173 clips (84 of them on one
   2160×1440 file) took over 4 GiB at load and stopped on the memory limit (europa, 2026-11-15; arena, synthetic copy).
   What must hold, in a real Chrome / Edge:
     1. on an export page only the clips that are on or about to be on (3 s ahead) have a player — never one per clip;
     2. a job that goes forward frees a clip's player when the clip is over, so the number alive stays small to the end;
     3. the editor (a page without ?exportJob=) is unchanged: every clip keeps its player, a scrub stays instant.
   Counts of players, not megabytes: the memory is a measurement for the PR, not an assertion. The seek / decode steps are
   stood in for (no media is decoded), so this runs without a video encoder. Synthetic project only. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const { withPage } = require("./browser-contrast");

const browser = (() => { try { return require("../server/export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to run the page in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;

const CLIPS = 30, LEN = 2;   // 30 clips of 2 s one after the other: a 60 s timeline
const project = () => seedProject({
  width: 640, height: 360,
  media: [{ id: "m_a", name: "a.mp4", kind: "video", src: "/media/a.mp4", duration: 100 }],
  clips: Array.from({ length: CLIPS }, (_, i) => ({ id: "c" + i, mediaId: "m_a", kind: "video", track: "V1", start: i * LEN, in: i, duration: LEN })),
});

/* The page's own loop, forward, one step per half second, as seekVideosTo is called per frame by the export: how many players
   are alive after each step, which clips have one at the end, and how many <video> the page ever made. */
const WALK = String.raw`(async () => {
  hardSeekVideo = async () => {}; playAdvanceVideo = async () => {}; holdElementFrame = async () => {};   // no media is decoded here
  const alive = [], made = () => window.__videoMade || 0;
  for (let t = 0; t < 60; t += 0.5) { state.time = t; await seekVideosTo(t, {}); alive.push(runtime.clipEls.size); }
  const left = [...runtime.clipEls.keys()];
  return { alive, max: Math.max(...alive), left, made: made() };
})()`;
const INIT = `(() => { const o = Document.prototype.createElement; window.__videoMade = 0;
  Document.prototype.createElement = function (t) { if (/^(video|audio)$/i.test(String(t))) window.__videoMade++; return o.apply(this, arguments); }; })()`;
const READY = (until) => `new Promise((res) => { const t0 = Date.now(); const go = () => (typeof runtime !== "undefined" && typeof project !== "undefined" && project.clips && project.clips.length >= ${CLIPS}) || Date.now() - t0 > ${until} ? res(true) : setTimeout(go, 100); go(); })`;

test("an export page opens players only for the clips near the playhead, and frees them when they are over (#320)", { skip, timeout: 180000 }, async (t) => {
  const dir = makeDataDir(t, project());
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  await withPage({ browser, url: base + "/?exportJob=x_none", width: 1000, height: 700, settleMs: 1500, init: INIT }, async ({ evaluate }) => {
    await evaluate(READY(20000));
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await evaluate("project.clips.length"), CLIPS, "the project is in the page");
    const atLoad = await evaluate("runtime.clipEls.size");
    assert.ok(atLoad <= 3, `at load only the clips within 3 s of the start have a player: ${atLoad} of ${CLIPS}`);
    const w = await evaluate(WALK);
    assert.ok(w.max <= 4, `never more than the clips on and the ones just ahead (≤ 4) at the same time: peak ${w.max} of ${CLIPS}`);
    assert.ok(w.left.length <= 1, `at the end every clip that is over has let its player go: ${w.left.length} left (${w.left.join(",")})`);
    assert.ok(w.made <= CLIPS + 3, `each clip's player is made once, not again and again: ${w.made}`);
  });
});

test("the editor still keeps a player for every clip, so a scrub is instant (#320: only the export page changed)", { skip, timeout: 180000 }, async (t) => {
  const dir = makeDataDir(t, project());
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  await withPage({ browser, url: base + "/", width: 1000, height: 700, settleMs: 1500, init: INIT }, async ({ evaluate }) => {
    await evaluate(READY(20000));
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await evaluate("runtime.clipEls.size"), CLIPS, "one player per clip, as before");
    const w = await evaluate(WALK);
    assert.equal(w.max, CLIPS, "walking the timeline does not free any of them");
  });
});
