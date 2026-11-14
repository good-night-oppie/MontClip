/* Export video-sync — sliced from app.js so tests exercise production logic,
   not a reimplemented predicate. */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { ROOT } = require("./helpers");

const SRC = fs.readFileSync(path.join(ROOT, "app/app.js"), "utf8");

function slice(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  const b = SRC.indexOf(endMarker, a);
  assert.ok(a >= 0, `start marker not found: ${startMarker}`);
  assert.ok(b > a, `end marker not found after it: ${endMarker}`);
  return SRC.slice(a, b);
}

const WAIT_HELPERS = slice("function notePresented(", "function assignVideoTime(");
const PLAY = slice("function playAdvanceVideo(", "const EXPORT_PREFETCH_S");

function loadWait() {
  return new Function(`${WAIT_HELPERS}
    return { notePresented, presentedClose, waitForPresentedFrame };`)();
}

function loadPlay(hardSeekVideo = () => Promise.resolve()) {
  return new Function(
    "hardSeekVideo",
    `${WAIT_HELPERS}
     ${PLAY}
     return { notePresented, presentedClose, playAdvanceVideo };`
  )(hardSeekVideo);
}

function mockVideo({
  currentTime = 0,
  paused = true,
  readyState = 2,
  rvfcMediaTime,
  rvfcDelayMs = 0,
  noRvfc = false,
  noRvfcFire = false,
} = {}) {
  const el = {
    currentTime,
    paused,
    readyState,
    muted: false,
    playbackRate: 1,
    _fcPresentedTime: null,
    _fcPrevMuted: null,
    pause() { el.paused = true; },
    play() { el.paused = false; return Promise.resolve(); },
    addEventListener() {},
    removeEventListener() {},
  };
  if (!noRvfc) {
    el.requestVideoFrameCallback = (cb) => {
      if (noRvfcFire) return;
      const fire = () => cb(0, { mediaTime: rvfcMediaTime ?? currentTime });
      if (rvfcDelayMs > 0) setTimeout(fire, rvfcDelayMs);
      else queueMicrotask(fire);
    };
    el.cancelVideoFrameCallback = () => {};
  }
  return el;
}

const { waitForPresentedFrame } = loadWait();

test("waitForPresentedFrame: timeout rejects without recording currentTime", async () => {
  const el = mockVideo({ noRvfcFire: true });
  await assert.rejects(() => waitForPresentedFrame(el, 15), /presented frame timeout/);
  assert.equal(el._fcPresentedTime, null);
});

test("waitForPresentedFrame: rvfc without mediaTime times out instead of using currentTime", async () => {
  const el = mockVideo();
  el.requestVideoFrameCallback = (cb) => { cb(0, {}); };
  await assert.rejects(() => waitForPresentedFrame(el, 50), /presented frame timeout/);
  assert.equal(el._fcPresentedTime, null);
});

test("waitForPresentedFrame: records finite mediaTime from rvfc", async () => {
  const el = mockVideo({ rvfcMediaTime: 0.04 });
  await waitForPresentedFrame(el, 80);
  assert.equal(el._fcPresentedTime, 0.04);
});

test("playAdvanceVideo: no hard-seek when presented reached target but clock ran ahead", async () => {
  let hardSeeks = 0;
  const play = loadPlay(() => { hardSeeks++; return Promise.resolve(); }).playAdvanceVideo;
  const el = mockVideo({ currentTime: 0.055, rvfcMediaTime: 0.039 });
  await play(el, 0.04, 0.01, 1, { keepPlaying: false });
  assert.equal(hardSeeks, 0);
  assert.equal(el._fcPresentedTime, 0.039);
});

test("playAdvanceVideo: hard-seeks when picture never reaches target", async () => {
  let hardSeeks = 0;
  const play = loadPlay(() => { hardSeeks++; return Promise.resolve(); }).playAdvanceVideo;
  const el = mockVideo({ currentTime: 0.07, noRvfcFire: true });
  await play(el, 0.04, 0.01, 1, { keepPlaying: false });
  assert.equal(hardSeeks, 1);
}, { timeout: 1000 });

test("playAdvanceVideo: tolerates small clock drift when picture is on target", async () => {
  let hardSeeks = 0;
  const play = loadPlay(() => { hardSeeks++; return Promise.resolve(); }).playAdvanceVideo;
  const el = mockVideo({ currentTime: 0.025, rvfcMediaTime: 0.02 });
  await play(el, 0.02, 0.01, 1, { keepPlaying: false });
  assert.equal(hardSeeks, 0);
});

test("playAdvanceVideo: hard-seeks when presented picture overshoots target", async () => {
  let hardSeeks = 0;
  const play = loadPlay(() => { hardSeeks++; return Promise.resolve(); }).playAdvanceVideo;
  const el = mockVideo({ currentTime: 0.06, rvfcMediaTime: 0.041 });
  await play(el, 0.04, 0.01, 1, { keepPlaying: false });
  assert.equal(hardSeeks, 1);
});

/* hardSeekVideo: a seek that presents no new frame (slow motion inside one source
   frame) or presents it late must not fail the export. */
const HARD = slice("function sameSourceFrame(", "/** Play forward until");
function loadHard() {
  return new Function(`${WAIT_HELPERS}
    function assignVideoTime(el, mt) { el.currentTime = mt; }
    ${HARD}
    return { hardSeekVideo, sameSourceFrame };`)();
}
/** A video whose seeks complete (seeked fires) but whose frame callback never does. */
function seekingVideo({ currentTime = 0, presented = null, completes = true, frameDur = 1 / 30 } = {}) {
  const listeners = new Map();
  const el = {
    _t: currentTime, paused: true, readyState: 2, seeking: false, _fcPresentedTime: presented, rvfcCalls: 0,
    _fcLastShown: presented, _fcFrameDur: frameDur, _fcFrameSeen: frameDur ? 5 : 0,   // as learned from earlier frames
    pause() { el.paused = true; },
    get currentTime() { return el._t; },
    set currentTime(v) {
      el._t = v; el.seeking = true;
      if (!completes) return;
      setTimeout(() => { el.seeking = false; for (const f of [...(listeners.get("seeked") || [])]) f(); }, 5);
    },
    addEventListener(n, f) { (listeners.get(n) || listeners.set(n, []).get(n)).push(f); },
    removeEventListener(n, f) { const a = listeners.get(n) || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    requestVideoFrameCallback() { el.rvfcCalls++; },   // never fires: nothing new was presented
  };
  return el;
}

test("hardSeekVideo: slow motion inside the frame on screen resolves without a frame callback", async () => {
  const { hardSeekVideo } = loadHard();
  const el = seekingVideo({ currentTime: 1.0, presented: 1.0 });
  await hardSeekVideo(el, 1.02);   // 0.6x on 30 fps footage: still source frame 1.0 (1.0 … 1.033)
  assert.equal(el.rvfcCalls, 1, "accepted after the first wait, not after every retry");
  assert.equal(el._fcPresentedTime, 1.0, "the presented frame is still the one on screen");
});

test("hardSeekVideo: a target in the next source frame is not taken for the frame on screen", async () => {
  const { hardSeekVideo, sameSourceFrame } = loadHard();
  const el = seekingVideo({ currentTime: 1.0, presented: 1.0 });
  el._t = 1.04; el.seeking = false;
  assert.equal(sameSourceFrame(el, 1.04, 1.0), false, "1.04 s is the next frame of 30 fps footage");
  const unknown = seekingVideo({ currentTime: 1.0, presented: 1.0, frameDur: 0 });
  unknown._t = 1.02;
  assert.equal(sameSourceFrame(unknown, 1.02, 1.0), false, "no frame duration learned yet: never assume");
  await hardSeekVideo(el, 1.04);   // only the finished seek on the last try settles it
  assert.equal(el.rvfcCalls, 3);
  assert.equal(el._fcPresentedTime, 1.04);
});

test("notePresented learns the source frame duration from consecutive frames", () => {
  const { notePresented } = loadWait();
  const el = {};
  for (const t of [0, 1 / 30, 3 / 30, 4 / 30, 5 / 30]) notePresented(el, t);   // one dropped frame in there
  assert.ok(Math.abs(el._fcFrameDur - 1 / 30) < 1e-9);
  assert.equal(el._fcFrameSeen, 4);
});

test("hardSeekVideo: a late frame callback on the last try still uses the finished seek", async () => {
  const { hardSeekVideo } = loadHard();
  const el = seekingVideo({ currentTime: 0, presented: 0 });
  await hardSeekVideo(el, 2.0);   // a different frame, but the callback never arrives (busy page)
  assert.equal(el._fcPresentedTime, 2.0);
});

test("hardSeekVideo: a seek that never lands still fails", async () => {
  const { hardSeekVideo } = loadHard();
  const el = seekingVideo({ currentTime: 0, presented: 0, completes: false });
  await assert.rejects(hardSeekVideo(el, 2.0), /presented frame timeout/);
});

/* #224: WebM / MKV keep times in whole milliseconds, so at 30 fps frame 29 starts at 0.967 s, after 29 / 30 =
   0.96667 s. A paused element seeked to t shows the last frame that starts at or before t (Chrome / Edge), so a seek
   to exactly n / fps showed frame n − 1 for every third frame, and the export drew that stale frame. */
function msGridVideo(fps = 30, frames = 300) {
  const starts = Array.from({ length: frames }, (_, n) => Math.round(n * 1000 / fps) / 1000);
  const shownAt = (t) => { let k = 0; while (k + 1 < starts.length && starts[k + 1] <= t) k++; return k; };
  const listeners = new Map();
  const el = {
    _t: 0, paused: true, readyState: 2, seeking: false, _fcPresentedTime: null, shown: 0,
    pause() { el.paused = true; },
    get currentTime() { return el._t; },
    set currentTime(v) {
      el._t = v; el.seeking = true;
      setTimeout(() => { el.seeking = false; el.shown = shownAt(v); for (const f of [...(listeners.get("seeked") || [])]) f(); }, 1);
    },
    addEventListener(n, f) { (listeners.get(n) || listeners.set(n, []).get(n)).push(f); },
    removeEventListener(n, f) { const a = listeners.get(n) || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    requestVideoFrameCallback(cb) { setTimeout(() => cb(0, { mediaTime: starts[el.shown] }), 1); },
  };
  return el;
}

test("hardSeekVideo: every output frame of 30 fps WebM shows its own source frame, not the one before (#224)", async () => {
  const { hardSeekVideo } = loadHard();
  const el = msGridVideo();
  const wrong = [];
  for (let n = 0; n < 90; n++) {
    el._fcPresentedTime = null;   // a hard seek each time, as when the export falls back from playing forward
    await hardSeekVideo(el, n / 30);
    if (el.shown !== n) wrong.push(`${n}→${el.shown}`);
  }
  assert.deepEqual(wrong, [], "output frames that showed another source frame");
});

/* #224: the frame callback said the target was presented and the element was paused on it, yet the frame it held
   (and the export drew) was already the next one — a flash a frame early, or missing. Measured with
   new VideoFrame(el).timestamp just before the draw: it matched the exported picture every time. So the export takes
   that frame, checks its timestamp, seeks back if it is ahead, and draws the frame it took. */
const HOLD = slice("/** Take the frame a video element holds", "/** Decode the frame of video clip c");
/** An element that holds source frame `holding` (start times on a 30 fps millisecond grid). */
function holdingVideo(holding) {
  const el = { holding, paused: true, readyState: 2, _fcPresentedTime: null, videoWidth: 320, videoHeight: 180 };
  return el;
}
class FakeVideoFrame {
  constructor(el) {
    this.timestamp = Math.round(Math.round(el.holding * 1000 / 30) * 1000); this.closed = false;
    Object.assign(this, { displayWidth: 320, displayHeight: 180, rotation: el.rotation || 0, flip: false });
    FakeVideoFrame.made.push(this);
  }
  close() { this.closed = true; }
}
FakeVideoFrame.made = [];
function loadHold(seek) {
  const runtime = { exportHeld: new Map(), exportFrames: new Map() };
  const fns = new Function("runtime", "VideoFrame", "hardSeekVideo", `${HOLD}
    return { holdElementFrame, dropHeldFrame };`)(runtime, FakeVideoFrame, seek);
  return { runtime, ...fns };
}

test("holdElementFrame: a frame that starts after the target is sought back, and the frame drawn is the target (#224)", async () => {
  let seeks = 0;
  const el = holdingVideo(31);   // asked for frame 30 (1.000 s), holds 31
  const { runtime, holdElementFrame } = loadHold(async (e, mt) => { seeks++; e.holding = Math.round(mt * 30); });
  await holdElementFrame({ id: "v" }, el, 1);
  assert.equal(seeks, 1);
  assert.equal(runtime.exportFrames.get("v").timestamp, 1e6, "frame 30 is drawn");
  assert.equal(FakeVideoFrame.made.filter((f) => !f.closed).length, 1, "the frame of 31 was closed");
});

test("holdElementFrame: the target frame is taken as it is, ms-rounded or not, and the last one is closed", async () => {
  let seeks = 0;
  const { runtime, holdElementFrame, dropHeldFrame } = loadHold(async () => { seeks++; });
  const el = holdingVideo(29);   // frame 29 starts at 0.967 s, after 29 / 30
  await holdElementFrame({ id: "v" }, el, 29 / 30);
  const first = runtime.exportFrames.get("v");
  el.holding = 30;
  await holdElementFrame({ id: "v" }, el, 1);
  assert.equal(seeks, 0);
  assert.equal(first.closed, true, "the frame of the last tick is closed when the next is taken");
  assert.equal(runtime.exportFrames.get("v").timestamp, 1e6);
  dropHeldFrame({ id: "v" });
  assert.equal(runtime.exportFrames.has("v"), false);
});

test("holdElementFrame: a seek that never gets there still draws something after two tries", async () => {
  let seeks = 0;
  const { runtime, holdElementFrame } = loadHold(async () => { seeks++; });   // the element stays on 31
  await holdElementFrame({ id: "v" }, holdingVideo(31), 1);
  assert.equal(seeks, 2);
  assert.ok(runtime.exportFrames.get("v"), "the export goes on rather than failing");
});

test("seekVideosTo: an element whose callback says it is on the frame but holds the next one draws the frame (#224)", async () => {
  const el = holdingVideo(31);
  Object.assign(el, { currentTime: 1, paused: false, _fcPresentedTime: 1 });   // callback: frame 30; holds 31
  const clip = { id: "v", kind: "video", start: 0, duration: 10 };
  const runtime = { exportDecode: null, exportHeld: new Map(), exportFrames: new Map(), clipGain: new Map() };
  const seekTo = new Function("el", "clip", "runtime", "VideoFrame", `
    let exportSeekClock = 0;
    const projectFps = () => 30, exportLoopLag = () => ({ lagMs: 1, fast: true, behind: false });
    const mediaClips = () => [clip], clipRenders = () => true, getClipEl = () => el, activeAt = () => true;
    const mediaTimeAt = (c, t) => t, clipSpeed = () => 1, kfChannel = (c, k, l, d) => d, evalProps = () => ({});
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), videoRangeBuffered = () => true, prefetchExportVideos = () => {};
    const playAdvanceVideo = () => Promise.resolve(), driveClipChain = () => {}, muteClipChain = () => {};
    const hardSeekVideo = async (e, mt) => { e.holding = Math.round(mt * 30); };
    const presentedClose = (e, mt, eps) => e._fcPresentedTime != null && Math.abs(e._fcPresentedTime - mt) <= eps;
    ${HOLD}
    ${slice("async function seekVideosTo(", "function encodeWAV(")}
    return seekVideosTo;`)(el, clip, runtime, FakeVideoFrame);
  await seekTo(1);
  assert.equal(runtime.exportFrames.get("v")?.timestamp, 1e6, "frame 30 is what gets drawn, not 31");
});

test("holdElementFrame: a turned picture (phone footage) is checked, but the element is drawn as before", async () => {
  let seeks = 0;
  const { runtime, holdElementFrame } = loadHold(async (e, mt) => { seeks++; e.holding = Math.round(mt * 30); });
  const el = Object.assign(holdingVideo(31), { rotation: 90 });
  await holdElementFrame({ id: "v" }, el, 1);
  assert.equal(seeks, 1, "still sought back onto the frame");
  assert.equal(runtime.exportFrames.has("v"), false, "the element draws itself, turned");
});
