/* Where crop, masks and transforms put the picture, measured in pixels on both
   render paths:
     · the still that fablecut_frame {time} / fablecut_scopes return (the editor's
       compositor, videos read through <video>), and
     · a real Fast export (the same compositor, videos decoded with WebCodecs),
       read back frame by frame with ffmpeg.
   The expected rectangles come from an independent model of the documented
   conventions (CLAUDE.md "props reference" and "Masks"), not from app.js:
     crop  — % of the source's whole frame trimmed off each edge, before anything else;
     fit   — the cropped picture fitted to the canvas (contain), then scale,
             then x / y (px from the canvas centre);
     masks — x, y = the TOP-LEFT corner, w, h = the size, all 0…1 of the clip's
             original frame (the whole source frame, before crop, scale and x / y —
             the same frame crop is measured on), so they move and scale with the clip.
   Each source is mid-grey with a red block at a known place, so the bounding box
   of everything not black is where the picture (or its masked part) landed, and
   the red block's box says which part of the source is shown.
   Tolerance: 1% of the canvas on each axis.

   Needs the bundled ffmpeg (node desktop/fetch-ffmpeg.cjs) and a Chromium-family
   browser (Chrome / Edge, or FABLECUT_CHROME); skips without them. Covered on
   purpose (2026-11-05 europa trial P4 / P4b / P5 and JJ's review):
     no transform; static scale + offset; a keyed push at its start, middle and end;
     speed ≠ 1; a clip's first frame; a synthetic 1920×1080 screen recording (grid,
     crop + mask + push) at its start, middle and end; and the things that already
     worked, locked: a title card, a crop on playback footage, a push. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { makeDataDir, startServer } = require("./helpers");
const { findBrowser } = require("../export-jobs");

const W = 960, H = 540, FPS = 10;
const RED = { x0: 0.6, y0: 0.6, x1: 0.7, y1: 0.7 };   // the red block, fractions of each source frame
const SOURCES = {
  m_g: { file: "grid.mp4", w: 960, h: 540 },          // playback-like footage, the canvas's size
  m_rec: { file: "rec.mp4", w: 1920, h: 1080, grid: true },   // a full-screen recording, 1920×1080 with a grid
};

const ffmpegBin = () => require("../ffmpeg-path").path("ffmpeg");
const hasFfmpeg = () => { try { execFileSync(ffmpegBin(), ["-version"], { stdio: "ignore" }); return true; } catch { return false; } };
const SKIP = !hasFfmpeg() ? "bundled ffmpeg not installed (node desktop/fetch-ffmpeg.cjs)"
  : !findBrowser() ? "no Chrome / Edge for the headless editor (set FABLECUT_CHROME)" : false;

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [], err = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(Buffer.concat(out))
      : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().trim()}`)));
  });
}
/** Grey with the red block (and, for the recording, a light grid), 20 s, VP9 in MP4 — the export decodes it with WebCodecs. */
async function makeSource(dir, { file, w, h, grid }) {
  const out = path.join(dir, "media", file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const box = `drawbox=x=${RED.x0 * w}:y=${RED.y0 * h}:w=${(RED.x1 - RED.x0) * w}:h=${(RED.y1 - RED.y0) * h}:color=red:t=fill`;
  const vf = grid ? `drawgrid=w=${w / 10}:h=${h / 10}:t=2:color=0xa0a0a0,${box}` : box;
  await run(ffmpegBin(), ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x808080:s=${w}x${h}:r=${FPS}:d=20`,
    "-vf", vf, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "20", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8",
    "-g", String(FPS), "-f", "mp4", out]);
  return "/media/" + file;
}
/** RGB pixels of an image or video frame, scaled to W×H. */
async function rgbOf(file, frameIndex) {
  const sel = frameIndex == null ? [] : ["-vf", `select=eq(n\\,${frameIndex}),scale=${W}:${H}`, "-fps_mode", "passthrough"];
  const scale = frameIndex == null ? ["-vf", `scale=${W}:${H}`] : [];
  return run(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-i", file, ...sel, ...scale, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
}
/** Bounding boxes of "not black", "red" and "white" (title) pixels, in canvas px. */
function boxes(rgb) {
  const mk = () => ({ x0: W, y0: H, x1: -1, y1: -1 });
  const nb = mk(), red = mk(), white = mk();
  const add = (b, x, y) => { if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    if (Math.max(r, g, b) > 60) add(nb, x, y);
    if (r > 150 && g < 90 && b < 90) add(red, x, y);
    if (r > 200 && g > 200 && b > 200) add(white, x, y);
  }
  const fin = (b) => b.x1 < 0 ? null : { x0: b.x0, y0: b.y0, x1: b.x1 + 1, y1: b.y1 + 1 };
  return { picture: fin(nb), red: fin(red), white: fin(white) };
}

/* ── The model: documented conventions, written independently of app.js ── */
const lerp = (keys, t, dflt) => {
  if (!keys || !keys.length) return dflt;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) {
    const a = keys[i - 1], b = keys[i];
    return a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);   // the test clips use linear keys only
  }
  return dflt;
};
const clipRect = (x0, y0, x1, y1) => {
  const r = { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(W, x1), y1: Math.min(H, y1) };
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
};
/** Where clip c's picture, its masked part and its red block land at timeline time t. */
function expected(c, t) {
  const src = SOURCES[c.mediaId], p = c.props || {}, k = c.keyframes || {}, lt = t - c.start;
  const scale = lerp(k.scale, lt, p.scale ?? 1), x = lerp(k.x, lt, p.x ?? 0), y = lerp(k.y, lt, p.y ?? 0);
  const L = (p.cropL || 0) / 100, R = (p.cropR || 0) / 100, T = (p.cropT || 0) / 100, B = (p.cropB || 0) / 100;
  const cw = src.w * (1 - L - R), ch = src.h * (1 - T - B);     // the cropped source, px
  const f = Math.min(W / cw, H / ch) * scale;                    // fit: contain, then scale
  const dw = cw * f, dh = ch * f;
  const left = W / 2 + x - dw / 2, top = H / 2 + y - dh / 2;    // x / y from the canvas centre
  // the clip's original frame (crop is measured on it, and so are masks) on the canvas
  const fl = left - L * src.w * f, ft = top - T * src.h * f, fw = src.w * f, fh = src.h * f;
  const at = (u, v) => [fl + u * fw, ft + v * fh];              // source-frame fraction → canvas px
  let vis = [left, top, left + dw, top + dh];
  const m = p.masks && p.masks[0];
  if (m) {   // x, y = the top-left corner
    const [mx0, my0] = at(m.x, m.y), [mx1, my1] = at(m.x + m.w, m.y + m.h);
    vis = [Math.max(vis[0], mx0), Math.max(vis[1], my0), Math.min(vis[2], mx1), Math.min(vis[3], my1)];
  }
  const [rx0, ry0] = at(RED.x0, RED.y0), [rx1, ry1] = at(RED.x1, RED.y1);
  const red = clipRect(Math.max(rx0, vis[0]), Math.max(ry0, vis[1]), Math.min(rx1, vis[2]), Math.min(ry1, vis[3]));
  return { picture: clipRect(...vis), red };
}

/* One clip per case, each in its own stretch of the timeline. Linear keys only.
   samples: timeline times to check (each is a frame time, so the export has that exact frame). */
const PUSH = { scale: [{ t: 0, v: 1 }, { t: 1.9, v: 2, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 1.9, v: -120, ease: "linear" }],
  y: [{ t: 0, v: 0 }, { t: 1.9, v: -60, ease: "linear" }] };
const CASES = [
  { name: "crop on playback footage, no transform (regression lock)", samples: [0.5],
    clip: { id: "c_crop", mediaId: "m_g", start: 0, in: 0, duration: 1, props: { cropL: 50, cropR: 10, cropT: 50, cropB: 20 } } },
  { name: "top strip crop (cropR + cropB), fit:contain centres it", samples: [1.5],
    clip: { id: "c_strip", mediaId: "m_g", start: 1, in: 0, duration: 1, props: { cropR: 30, cropB: 85 } } },
  { name: "static scale + offset with a rect mask", samples: [2.5],
    clip: { id: "c_zoom", mediaId: "m_g", start: 2, in: 0, duration: 1, props: { scale: 2, x: -120, y: -60,
      masks: [{ shape: "rect", x: 0.55, y: 0.55, w: 0.2, h: 0.2 }] } } },
  { name: "keyed push with a rect mask: start, middle, end (regression lock for the push)", samples: [3, 4, 4.9],
    clip: { id: "c_push", mediaId: "m_g", start: 3, in: 0, duration: 2, props: { masks: [{ shape: "rect", x: 0.55, y: 0.55, w: 0.2, h: 0.2 }] },
      keyframes: PUSH } },
  { name: "speed 4 with crop and a scale key", samples: [5.5],
    clip: { id: "c_speed", mediaId: "m_g", start: 5, in: 2, duration: 1, props: { speed: 4, cropL: 50, cropR: 10, cropT: 50, cropB: 20 },
      keyframes: { scale: [{ t: 0, v: 1 }, { t: 1, v: 1.2, ease: "linear" }] } } },
  // starts between frames, like sh_scrub (2.477 s, speed 4, keyed): the still is asked for its very first instant,
  // the export checks its first frame (6.3)
  { name: "first frame of a keyed speed-4 clip", samples: [6.27], exportSamples: [6.3],
    clip: { id: "c_first", mediaId: "m_g", start: 6.27, in: 1, duration: 0.93, props: { speed: 4 },
      keyframes: { scale: [{ t: 0, v: 1 }, { t: 0.9, v: 1.5, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 0.9, v: 90, ease: "linear" }],
        y: [{ t: 0, v: 0 }, { t: 0.9, v: 45, ease: "linear" }] } } },
  // a 1920×1080 screen recording, cropped (like sh_auto), a mask over the red block in the recording's own
  // frame, pushed in: the mask stays on the block at the start, the middle and the end
  { name: "1920×1080 screen recording: crop + mask on the block + push — start, middle, end", samples: [7.2, 8.1, 9.1],
    clip: { id: "c_rec", mediaId: "m_rec", start: 7.2, in: 0, duration: 2, props: { cropR: 20, cropB: 20,
      masks: [{ shape: "rect", x: RED.x0, y: RED.y0, w: RED.x1 - RED.x0, h: RED.y1 - RED.y0 }] },
      keyframes: { scale: [{ t: 0, v: 1.3 }, { t: 1.9, v: 2, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 1.9, v: -150, ease: "linear" }],
        y: [{ t: 0, v: 0 }, { t: 1.9, v: -90, ease: "linear" }] } } },
];
// a title card (regression lock): white text, centred horizontally, 150 px above the middle
const TITLE = { id: "t_title", kind: "text", track: "V2", start: 9.5, duration: 1, mediaId: null,
  props: { text: "TITLE", fontSize: 80, color: "#ffffff", font: "Arial", textShadow: 0, y: -150 } };
const TITLE_AT = 10;

function project(srcs) {
  return {
    name: "Geometry", width: W, height: H, fps: FPS, revision: 1, panSchema: 1, maskSchema: 2, background: "#000000",
    media: Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.file, kind: "video", src: srcs[id], duration: 20, width: s.w, height: s.h })),
    clips: [...CASES.map(({ clip }) => ({ kind: "video", track: "V1", name: clip.id, ...clip, props: { volume: 0, ...clip.props } })), TITLE],
  };
}
function assertNear(got, want, what) {
  if (!want) { assert.equal(got, null, `${what}: expected nothing, got ${JSON.stringify(got)}`); return; }
  assert.ok(got, `${what}: expected ${JSON.stringify(want)}, got nothing`);
  const tx = W * 0.01, ty = H * 0.01;
  for (const [k, tol] of [["x0", tx], ["x1", tx], ["y0", ty], ["y1", ty]]) {
    assert.ok(Math.abs(got[k] - want[k]) <= tol,
      `${what}: ${k} is ${got[k]}, expected ${want[k].toFixed(1)} ±${tol.toFixed(1)} (got ${JSON.stringify(got)}, want ${JSON.stringify(Object.fromEntries(Object.entries(want).map(([a, b]) => [a, +b.toFixed(1)])))})`);
  }
}
function assertTitle(got, what) {
  assert.ok(got.white, `${what}: no title on screen`);
  const cx = (got.white.x0 + got.white.x1) / 2, cy = (got.white.y0 + got.white.y1) / 2;
  assert.ok(Math.abs(cx - W / 2) <= W * 0.01, `${what}: title centre x ${cx}, expected ${W / 2} ±1%`);
  assert.ok(Math.abs(cy - (H / 2 - 150)) <= H * 0.02, `${what}: title centre y ${cy}, expected ${H / 2 - 150} ±2% (glyph boxes sit a little off the line box)`);
  assert.ok(got.white.y1 - got.white.y0 > 40 && got.white.y1 - got.white.y0 < 90, `${what}: title ${got.white.y1 - got.white.y0} px tall at fontSize 80`);
}
async function poll(base, id, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const j = await (await fetch(base + "/api/export/job?id=" + encodeURIComponent(id))).json();
    if (j.status === "done") return j;
    if (j.status === "failed" || j.status === "cancelled") throw new Error(`job ${j.status}: ${j.error}`);
    if (Date.now() > end) throw new Error("job timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
}
async function still(base, dir, time) {
  const r = await fetch(base + "/api/scopes/request", { method: "POST", body: JSON.stringify({ time, image: true, where: "headless" }) });
  assert.equal(r.status, 200, await r.clone().text());
  const job = await poll(base, (await r.json()).id, 120_000);
  assert.deepEqual(job.result.imageSize, { w: W, h: H }, "the still says its own size (fablecut_frame quotes it)");
  const jpg = path.join(dir, `still-${time}.jpg`);
  fs.writeFileSync(jpg, Buffer.from(job.result.image.split(",")[1], "base64"));
  return boxes(await rgbOf(jpg));
}

test("model sanity: a full-frame clip fills the canvas; a mask's x, y is its top-left corner", () => {
  assert.deepEqual(expected({ mediaId: "m_g", start: 0, props: {} }, 0).picture, { x0: 0, y0: 0, x1: W, y1: H });
  assert.deepEqual(expected({ mediaId: "m_g", start: 0, props: { masks: [{ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }] } }, 0).picture,
    { x0: 240, y0: 270, x1: 720, y1: 405 });
  // a 1920×1080 recording on the 960×540 canvas: the same fractions land on the same canvas px
  assert.deepEqual(expected({ mediaId: "m_rec", start: 0, props: { masks: [{ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }] } }, 0).picture,
    { x0: 240, y0: 270, x1: 720, y1: 405 });
});

test("render geometry: crop, masks and transforms land where documented — fablecut_frame still and Fast export agree", { skip: SKIP, timeout: 900_000 }, async (t) => {
  const dir = makeDataDir(t, { name: "x", width: W, height: H, fps: FPS, revision: 0, media: [], clips: [] });
  const srcs = {};
  for (const [id, s] of Object.entries(SOURCES)) srcs[id] = await makeSource(dir, s);
  const doc = project(srcs);
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(doc, null, 2));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const clip = (id) => doc.clips.find((c) => c.id === id);

  // 1) the still fablecut_frame {time} shows (scopes job, image:true)
  for (const cs of CASES) for (const ts of cs.samples) {
    const got = await still(base, dir, ts), want = expected(clip(cs.clip.id), ts);
    assertNear(got.picture, want.picture, `still · ${cs.name} · t=${ts} · picture`);
    assertNear(got.red, want.red, `still · ${cs.name} · t=${ts} · red block`);
  }
  assertTitle(await still(base, dir, TITLE_AT), "still · title card");

  // 2) a Fast export of the whole timeline, lossless (FFV1), read back per frame
  const r = await fetch(base + "/api/export/request", { method: "POST",
    body: JSON.stringify({ where: "headless", range: "entire", preset: "archive", delivery: { audio: { codec: "none" } } }) });
  assert.equal(r.status, 200, await r.clone().text());
  const job = await poll(base, (await r.json()).id, 480_000);
  const file = path.join(dir, job.src.replace(/^\/exports\//, "exports/"));
  assert.ok(fs.existsSync(file), "export file " + file);
  for (const cs of CASES) for (const ts of cs.exportSamples || cs.samples) {
    const n = Math.round(ts * FPS);
    const got = boxes(await rgbOf(file, n)), want = expected(clip(cs.clip.id), n / FPS);
    assertNear(got.picture, want.picture, `export · ${cs.name} · t=${n / FPS} · picture`);
    assertNear(got.red, want.red, `export · ${cs.name} · t=${n / FPS} · red block`);
  }
  assertTitle(boxes(await rgbOf(file, Math.round(TITLE_AT * FPS))), "export · title card");
});

/* ── Covered areas (props.covers, fablecut_blur_region): where a cover is, the stripes of a striped source are
   gone (flat grey); everywhere else they remain. A cover on a clip pushed in with keys, at the push's start,
   middle and end, and a blur cover on a cropped clip — on both render paths. ── */
function runFf(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [], err = [];
    child.stdout.on("data", (c) => out.push(c)); child.stderr.on("data", (c) => err.push(c));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(Buffer.concat(err).toString())));
  });
}
const coverRgb = (file, n) => runFf(["-hide_banner", "-loglevel", "error", "-i", file,
  ...(n == null ? ["-vf", `scale=${W}:${H}`] : ["-vf", `select=eq(n\\,${n}),scale=${W}:${H}`, "-fps_mode", "passthrough"]),
  "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
/** The box of "flat mid-grey" pixels: where the stripes were covered (black canvas and the stripes are not flat grey). */
function flatBox(rgb) {
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3;
  const b = { x0: W, y0: H, x1: -1, y1: -1 };
  for (let y = 0; y < H; y++) for (let x = 6; x < W - 6; x++) {
    const v = L[y * W + x];
    if (v < 60 || v > 200) continue;
    let lo = 255, hi = 0;
    for (let k = -6; k <= 6; k++) { const q = L[y * W + x + k]; if (q < lo) lo = q; if (q > hi) hi = q; }
    if (hi - lo > 40) continue;
    if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y;
  }
  return b.x1 < 0 ? null : { x0: b.x0, y0: b.y0, x1: b.x1 + 1, y1: b.y1 + 1 };
}
const lerpK = (k, t, d) => { if (!k) return d; if (t <= k[0].t) return k[0].v; if (t >= k[k.length - 1].t) return k[k.length - 1].v;
  for (let i = 1; i < k.length; i++) if (t <= k[i].t) return k[i - 1].v + (k[i].v - k[i - 1].v) * (t - k[i - 1].t) / (k[i].t - k[i - 1].t); return d; };
/** Where clip c's cover lands at time t (independent model: crop → fit contain → scale → x / y; covers on the original frame). */
function expectedCover(c, t) {
  const p = c.props, k = c.keyframes || {}, lt = t - c.start, s = lerpK(k.scale, lt, 1), x = lerpK(k.x, lt, 0), y = lerpK(k.y, lt, 0);
  const L = (p.cropL || 0) / 100, R = (p.cropR || 0) / 100, T = (p.cropT || 0) / 100, B = (p.cropB || 0) / 100;
  const cw = W * (1 - L - R), ch = H * (1 - T - B), f = Math.min(W / cw, H / ch) * s, dw = cw * f, dh = ch * f;
  const left = W / 2 + x - dw / 2, top = H / 2 + y - dh / 2, fl = left - L * W * f, ft = top - T * H * f;
  const cv = p.covers[0];
  if ((cv.from != null && lt < cv.from) || (cv.to != null && lt >= cv.to)) return null;   // outside its time window
  const r = { x0: Math.max(left, fl + cv.x * W * f), y0: Math.max(top, ft + cv.y * H * f),
    x1: Math.min(left + dw, fl + (cv.x + cv.w) * W * f), y1: Math.min(top + dh, ft + (cv.y + cv.h) * H * f) };
  return { x0: Math.max(0, r.x0), y0: Math.max(0, r.y0), x1: Math.min(W, r.x1), y1: Math.min(H, r.y1) };
}
function nearBox(got, want, what) {
  if (!want) { assert.equal(got, null, `${what}: expected nothing covered, got ${JSON.stringify(got)}`); return; }
  assert.ok(got, `${what}: nothing covered, expected ${JSON.stringify(want)}`);
  for (const [k, tol] of [["x0", W * 0.01], ["x1", W * 0.01], ["y0", H * 0.01], ["y1", H * 0.01]])
    assert.ok(Math.abs(got[k] - want[k]) <= tol, `${what}: ${k} ${got[k]}, expected ${want[k].toFixed(1)} ±${tol} (got ${JSON.stringify(got)})`);
}
const COVER_CASES = [
  { id: "c_push", start: 0, duration: 2, samples: [0, 1, 1.9],
    props: { covers: [{ x: 0.55, y: 0.55, w: 0.2, h: 0.2 }] },
    keyframes: { scale: [{ t: 0, v: 1 }, { t: 1.9, v: 2, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 1.9, v: -120, ease: "linear" }],
      y: [{ t: 0, v: 0 }, { t: 1.9, v: -60, ease: "linear" }] } },
  { id: "c_cropped", start: 2, duration: 1, samples: [2.5],
    props: { cropL: 30, cropT: 20, covers: [{ x: 0.2, y: 0.3, w: 0.3, h: 0.25, style: "blur", strength: 80 }] } },
  // a cover with a time window (seconds from the clip's start): not there before `from`, there after it
  { id: "c_window", start: 3, duration: 1, samples: [3.2, 3.7],
    props: { covers: [{ x: 0.3, y: 0.3, w: 0.4, h: 0.4, from: 0.5 }] } },
];

test("a covered area hides the picture there and follows the clip — fablecut_frame still and Fast export", { skip: SKIP, timeout: 900_000 }, async (t) => {
  const dir = makeDataDir(t, { name: "x", width: W, height: H, fps: FPS, revision: 0, media: [], clips: [] });
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  // vertical black / white stripes, 8 px each: nothing flat anywhere until something covers it
  await runFf(["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=${FPS}:d=10`,
    "-vf", "geq=lum='if(lt(mod(X,16),8),235,16)':cb=128:cr=128", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "12", "-b:v", "0",
    "-deadline", "realtime", "-cpu-used", "8", "-g", String(FPS), "-f", "mp4", path.join(dir, "media", "stripes.mp4")]);
  const doc = { name: "Covers", width: W, height: H, fps: FPS, revision: 1, maskSchema: 2, background: "#000000",
    media: [{ id: "m_s", name: "stripes.mp4", kind: "video", src: "/media/stripes.mp4", duration: 10, width: W, height: H }],
    clips: COVER_CASES.map((cs) => ({ id: cs.id, mediaId: "m_s", kind: "video", track: "V1", start: cs.start, in: 0, duration: cs.duration,
      props: { volume: 0, ...cs.props }, ...(cs.keyframes ? { keyframes: cs.keyframes } : {}) })) };
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(doc));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const poll = async (id) => { for (;;) { const j = await (await fetch(base + "/api/export/job?id=" + id)).json();
    if (j.status === "done") return j; if (/failed|cancelled/.test(j.status)) throw new Error(j.error); await new Promise((r) => setTimeout(r, 200)); } };
  for (const cs of COVER_CASES) for (const ts of cs.samples) {
    const j = await poll((await (await fetch(base + "/api/scopes/request", { method: "POST", body: JSON.stringify({ time: ts, image: true, where: "headless" }) })).json()).id);
    const jpg = path.join(dir, `s${ts}.jpg`);
    fs.writeFileSync(jpg, Buffer.from(j.result.image.split(",")[1], "base64"));
    nearBox(flatBox(await coverRgb(jpg)), expectedCover(doc.clips.find((c) => c.id === cs.id), ts), `still · ${cs.id} · t=${ts}`);
  }
  const e = await poll((await (await fetch(base + "/api/export/request", { method: "POST",
    body: JSON.stringify({ where: "headless", range: "entire", preset: "archive", delivery: { audio: { codec: "none" } } }) })).json()).id);
  const file = path.join(dir, decodeURIComponent(e.src).replace(/^\/exports\//, "exports/"));
  for (const cs of COVER_CASES) for (const ts of cs.samples) {
    const n = Math.round(ts * FPS);
    nearBox(flatBox(await coverRgb(file, n)), expectedCover(doc.clips.find((c) => c.id === cs.id), n / FPS), `export · ${cs.id} · t=${n / FPS}`);
  }
});

module.exports = { expected, boxes };
