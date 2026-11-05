/* Where crop, masks and transforms put the picture, measured in pixels on both
   render paths:
     · the still that fablecut_frame {time} / fablecut_scopes return (the editor's
       compositor, videos read through <video>), and
     · a real Fast export (the same compositor, videos decoded with WebCodecs),
       read back frame by frame with ffmpeg.
   The expected rectangles come from an independent model of the documented
   conventions (CLAUDE.md "props reference" and "Masks"), not from app.js:
     crop  — % of the source trimmed off each edge, before anything else;
     fit   — the cropped picture fitted to the canvas (contain), then scale,
             then x / y (px from the canvas centre);
     masks — x / y the centre, w / h the size, all fractions of the clip's own
             picture (the cropped source), so they move and scale with the clip.
   The source is a mid-grey frame with a red block at a known place, so the
   bounding box of everything not black is where the picture (or its masked
   part) landed, and the red block's box says which part of the source is shown.
   Tolerance: 1% of the canvas on each axis.

   Needs the bundled ffmpeg (node desktop/fetch-ffmpeg.cjs) and a Chromium-family
   browser (Chrome / Edge, or FABLECUT_CHROME); skips without them. Covered on
   purpose: no transform; static scale + offset; keyframed push at its middle;
   speed ≠ 1; a clip's first frame (P4, P4b, P5 in the 2026-11-05 europa trial). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { makeDataDir, startServer } = require("./helpers");
const { findBrowser } = require("../export-jobs");

const W = 960, H = 540, FPS = 10;
const RED = { x0: 0.6, y0: 0.6, x1: 0.7, y1: 0.7 };   // the red block, fractions of the source

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
/** Grey 960×540 with the red block, 20 s, VP9 in MP4 — the export decodes it with WebCodecs. */
async function makeSource(dir) {
  const file = path.join(dir, "media", "grid.mp4");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const box = `drawbox=x=${RED.x0 * W}:y=${RED.y0 * H}:w=${(RED.x1 - RED.x0) * W}:h=${(RED.y1 - RED.y0) * H}:color=red:t=fill`;
  await run(ffmpegBin(), ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x808080:s=${W}x${H}:r=${FPS}:d=20`,
    "-vf", box, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "20", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8",
    "-g", String(FPS), "-f", "mp4", file]);
  return "/media/grid.mp4";
}
/** RGB pixels of an image or video frame, scaled to W×H. */
async function rgbOf(file, frameIndex) {
  const sel = frameIndex == null ? [] : ["-vf", `select=eq(n\\,${frameIndex}),scale=${W}:${H}`, "-fps_mode", "passthrough"];
  const scale = frameIndex == null ? ["-vf", `scale=${W}:${H}`] : [];
  return run(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-i", file, ...sel, ...scale, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
}
/** Bounding boxes of "not black" and "red" pixels, in canvas px. */
function boxes(rgb) {
  const nb = { x0: W, y0: H, x1: -1, y1: -1 }, red = { x0: W, y0: H, x1: -1, y1: -1 };
  const add = (b, x, y) => { if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    if (Math.max(r, g, b) > 60) add(nb, x, y);
    if (r > 150 && g < 90 && b < 90) add(red, x, y);
  }
  const fin = (b) => b.x1 < 0 ? null : { x0: b.x0, y0: b.y0, x1: b.x1 + 1, y1: b.y1 + 1 };
  return { picture: fin(nb), red: fin(red) };
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
  const p = c.props || {}, k = c.keyframes || {}, lt = t - c.start;
  const scale = lerp(k.scale, lt, p.scale ?? 1), x = lerp(k.x, lt, p.x ?? 0), y = lerp(k.y, lt, p.y ?? 0);
  const L = (p.cropL || 0) / 100, R = (p.cropR || 0) / 100, T = (p.cropT || 0) / 100, B = (p.cropB || 0) / 100;
  const cw = W * (1 - L - R), ch = H * (1 - T - B);            // the cropped source, px (source is W×H)
  const f = Math.min(W / cw, H / ch) * scale;                    // fit: contain, then scale
  const dw = cw * f, dh = ch * f;
  const left = W / 2 + x - dw / 2, top = H / 2 + y - dh / 2;    // x / y from the canvas centre
  const at = (u, v) => [left + u * dw, top + v * dh];           // picture fraction → canvas px
  const fromSource = (sx, sy) => at((sx - L) / (1 - L - R), (sy - T) / (1 - T - B));
  let vis = [left, top, left + dw, top + dh];
  const m = p.masks && p.masks[0];
  if (m) {
    const [mx0, my0] = at(m.x - m.w / 2, m.y - m.h / 2), [mx1, my1] = at(m.x + m.w / 2, m.y + m.h / 2);
    vis = [Math.max(vis[0], mx0), Math.max(vis[1], my0), Math.min(vis[2], mx1), Math.min(vis[3], my1)];
  }
  const [rx0, ry0] = fromSource(RED.x0, RED.y0), [rx1, ry1] = fromSource(RED.x1, RED.y1);
  const red = clipRect(Math.max(rx0, vis[0]), Math.max(ry0, vis[1]), Math.min(rx1, vis[2]), Math.min(ry1, vis[3]));
  return { picture: clipRect(...vis), red };
}

/* One clip per case, each in its own stretch of the timeline. Linear keys only. */
const CASES = [
  { name: "crop, no transform", samples: [0.5],
    clip: { id: "c_crop", start: 0, in: 0, duration: 1, props: { cropL: 50, cropR: 10, cropT: 50, cropB: 20 } } },
  { name: "top strip crop (cropR + cropB), fit:contain centres it", samples: [1.5],
    clip: { id: "c_strip", start: 1, in: 0, duration: 1, props: { cropR: 30, cropB: 85 } } },
  { name: "static scale + offset with a rect mask", samples: [2.5],
    clip: { id: "c_zoom", start: 2, in: 0, duration: 1, props: { scale: 2, x: -120, y: -60,
      masks: [{ shape: "rect", x: 0.65, y: 0.65, w: 0.2, h: 0.2 }] } } },
  { name: "keyframed push (scale / x / y) with a rect mask: start, middle, end", samples: [3, 3.5, 4],
    clip: { id: "c_push", start: 3, in: 0, duration: 2, props: { masks: [{ shape: "rect", x: 0.65, y: 0.65, w: 0.2, h: 0.2 }] },
      keyframes: { scale: [{ t: 0, v: 1 }, { t: 1, v: 2, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 1, v: -120, ease: "linear" }],
        y: [{ t: 0, v: 0 }, { t: 1, v: -60, ease: "linear" }] } } },
  { name: "speed 4 with crop and a scale key", samples: [5.5],
    clip: { id: "c_speed", start: 5, in: 2, duration: 1, props: { speed: 4, cropL: 50, cropR: 10, cropT: 50, cropB: 20 },
      keyframes: { scale: [{ t: 0, v: 1 }, { t: 1, v: 1.2, ease: "linear" }] } } },
  // starts between frames, like sh_scrub (2.477 s, speed 4, keyed) — the still is asked for its very first instant
  { name: "first frame of a keyed speed-4 clip", samples: [6.27], exportSamples: [6.3],
    clip: { id: "c_first", start: 6.27, in: 1, duration: 0.93, props: { speed: 4 },
      keyframes: { scale: [{ t: 0, v: 1 }, { t: 0.9, v: 1.5, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 0.9, v: 90, ease: "linear" }],
        y: [{ t: 0, v: 0 }, { t: 0.9, v: 45, ease: "linear" }] } } },
  // crop + a mask + a push: the mask is a fraction of the CROPPED picture and rides the push (start, middle, end)
  { name: "crop + rect mask + keyframed push: start, middle, end", samples: [7.5, 8, 8.5],
    clip: { id: "c_cropmask", start: 7.5, in: 0, duration: 1.5, props: { cropL: 20, cropT: 10, cropR: 10, cropB: 30,
      masks: [{ shape: "rect", x: 0.75, y: 0.75, w: 0.3, h: 0.3 }] },
      keyframes: { scale: [{ t: 0, v: 1 }, { t: 1, v: 1.6, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 1, v: -100, ease: "linear" }],
        y: [{ t: 0, v: 0 }, { t: 1, v: -50, ease: "linear" }] } } },
];

function project(src) {
  return {
    name: "Geometry", width: W, height: H, fps: FPS, revision: 1, panSchema: 1, background: "#000000",
    media: [{ id: "m_g", name: "grid.mp4", kind: "video", src, duration: 20, width: W, height: H }],
    clips: CASES.map(({ clip }) => ({ mediaId: "m_g", kind: "video", track: "V1", name: clip.id, ...clip,
      props: { volume: 0, ...clip.props } })),
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

test("model sanity: a full-frame clip fills the canvas", () => {
  const e = expected({ start: 0, props: {} }, 0);
  assert.deepEqual(e.picture, { x0: 0, y0: 0, x1: W, y1: H });
});

test("render geometry: crop, masks and transforms land where documented — fablecut_frame still and Fast export agree", { skip: SKIP, timeout: 600_000 }, async (t) => {
  const dir = makeDataDir(t, { name: "x", width: W, height: H, fps: FPS, revision: 0, media: [], clips: [] });
  const src = await makeSource(dir);
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(project(src), null, 2));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const doc = project(src);

  // 1) the still fablecut_frame {time} shows (scopes job, image:true)
  for (const cs of CASES) for (const sample of cs.samples) {
    const r = await fetch(base + "/api/scopes/request", { method: "POST", body: JSON.stringify({ time: sample, image: true, where: "headless" }) });
    assert.equal(r.status, 200, await r.clone().text());
    const job = await poll(base, (await r.json()).id, 120_000);
    assert.deepEqual(job.result.imageSize, { w: W, h: H }, "the still says its own size (fablecut_frame quotes it)");
    const jpg = path.join(dir, `still-${cs.clip.id}-${sample}.jpg`);
    fs.writeFileSync(jpg, Buffer.from(job.result.image.split(",")[1], "base64"));
    const got = boxes(await rgbOf(jpg));
    const want = expected(doc.clips.find((c) => c.id === cs.clip.id), sample);
    assertNear(got.picture, want.picture, `still · ${cs.name} · t=${sample} · picture`);
    assertNear(got.red, want.red, `still · ${cs.name} · t=${sample} · red block`);
  }

  // 2) a Fast export of the whole timeline, lossless (FFV1), read back per frame
  const r = await fetch(base + "/api/export/request", { method: "POST",
    body: JSON.stringify({ where: "headless", range: "entire", preset: "archive", delivery: { audio: { codec: "none" } } }) });
  assert.equal(r.status, 200, await r.clone().text());
  const job = await poll(base, (await r.json()).id, 240_000);
  const file = path.join(dir, job.src.replace(/^\/exports\//, "exports/"));
  assert.ok(fs.existsSync(file), "export file " + file);
  for (const cs of CASES) for (const ts of cs.exportSamples || cs.samples) {
    const n = Math.round(ts * FPS);
    const got = boxes(await rgbOf(file, n));
    const want = expected(doc.clips.find((c) => c.id === cs.clip.id), n / FPS);
    assertNear(got.picture, want.picture, `export · ${cs.name} · t=${n / FPS} · picture`);
    assertNear(got.red, want.red, `export · ${cs.name} · t=${n / FPS} · red block`);
  }
});

/* ── Covered areas (props.redactions, fablecut_blur_region): where a cover is, the stripes of a striped source are
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
  const cv = p.redactions[0];
  if ((cv.from != null && lt < cv.from) || (cv.to != null && lt >= cv.to)) return null;   // outside its time window
  const r = { x0: Math.max(left, fl + cv.x * W * f), y0: Math.max(top, ft + cv.y * H * f),
    x1: Math.min(left + dw, fl + (cv.x + cv.w) * W * f), y1: Math.min(top + dh, ft + (cv.y + cv.h) * H * f) };
  const out = { x0: Math.max(0, r.x0), y0: Math.max(0, r.y0), x1: Math.min(W, r.x1), y1: Math.min(H, r.y1) };
  return out.x1 > out.x0 && out.y1 > out.y0 ? out : null;   // wholly cropped away: nothing covered
}
function nearBox(got, want, what) {
  if (!want) { assert.equal(got, null, `${what}: expected nothing covered, got ${JSON.stringify(got)}`); return; }
  assert.ok(got, `${what}: nothing covered, expected ${JSON.stringify(want)}`);
  for (const [k, tol] of [["x0", W * 0.01], ["x1", W * 0.01], ["y0", H * 0.01], ["y1", H * 0.01]])
    assert.ok(Math.abs(got[k] - want[k]) <= tol, `${what}: ${k} ${got[k]}, expected ${want[k].toFixed(1)} ±${tol} (got ${JSON.stringify(got)})`);
}
const COVER_CASES = [
  { id: "c_push", start: 0, duration: 2, samples: [0, 1, 1.9],
    props: { redactions: [{ x: 0.55, y: 0.55, w: 0.2, h: 0.2 }] },
    keyframes: { scale: [{ t: 0, v: 1 }, { t: 1.9, v: 2, ease: "linear" }], x: [{ t: 0, v: 0 }, { t: 1.9, v: -120, ease: "linear" }],
      y: [{ t: 0, v: 0 }, { t: 1.9, v: -60, ease: "linear" }] } },
  { id: "c_cropped", start: 2, duration: 1, samples: [2.5],
    props: { cropL: 30, cropT: 20, redactions: [{ x: 0.2, y: 0.3, w: 0.3, h: 0.25, style: "blur", strength: 80 }] } },
  // a cover with a time window (seconds from the clip's start): not there before `from`, there after it
  { id: "c_window", start: 3, duration: 1, samples: [3.2, 3.7],
    props: { redactions: [{ x: 0.3, y: 0.3, w: 0.4, h: 0.4, from: 0.5 }] } },
  // Deja's two locks. One: the same redaction before and after the crop is changed — it stays on the same part of
  // the original frame (checked below by mapping both covered boxes back onto the source frame).
  { id: "c_crop_a", start: 4, duration: 1, samples: [4.5], props: { redactions: [{ x: 0.3, y: 0.3, w: 0.3, h: 0.3 }] } },
  { id: "c_crop_b", start: 5, duration: 1, samples: [5.5], props: { cropR: 25, cropB: 20, cropL: 10, redactions: [{ x: 0.3, y: 0.3, w: 0.3, h: 0.3 }] } },
  // Two: half of the redaction lies in the cropped-away part (0.25–0.40 cut, 0.40–0.55 shown): only the shown half is drawn
  { id: "c_half", start: 6, duration: 1, samples: [6.5], props: { cropL: 40, redactions: [{ x: 0.25, y: 0.3, w: 0.3, h: 0.3 }] } },
  // wholly in the cropped-away part: nothing drawn (no flat area anywhere)
  { id: "c_outside", start: 8, duration: 1, samples: [8.5], props: { cropL: 50, redactions: [{ x: 0.1, y: 0.3, w: 0.3, h: 0.3 }] } },
  // x + w and y + h past 1: cut at the original frame's edge
  { id: "c_over", start: 7, duration: 1, samples: [7.5], props: { redactions: [{ x: 0.8, y: 0.7, w: 0.4, h: 0.5 }] } },
];
/** A canvas box of clip c (no transform keys) back onto its original frame, as fractions. */
function toSourceFrame(c, b) {
  const p = c.props, L = (p.cropL || 0) / 100, R = (p.cropR || 0) / 100, T = (p.cropT || 0) / 100, B = (p.cropB || 0) / 100;
  const cw = W * (1 - L - R), ch = H * (1 - T - B), f = Math.min(W / cw, H / ch);
  const fl = W / 2 - cw * f / 2 - L * W * f, ft = H / 2 - ch * f / 2 - T * H * f;
  return { x0: (b.x0 - fl) / (W * f), y0: (b.y0 - ft) / (H * f), x1: (b.x1 - fl) / (W * f), y1: (b.y1 - ft) / (H * f) };
}

test("a redaction hides the picture there and follows the clip — fablecut_frame still and Fast export", { skip: SKIP, timeout: 900_000 }, async (t) => {
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
  const seen = {};
  for (const cs of COVER_CASES) for (const ts of cs.samples) {
    const j = await poll((await (await fetch(base + "/api/scopes/request", { method: "POST", body: JSON.stringify({ time: ts, image: true, where: "headless" }) })).json()).id);
    const jpg = path.join(dir, `s${ts}.jpg`);
    fs.writeFileSync(jpg, Buffer.from(j.result.image.split(",")[1], "base64"));
    const got = flatBox(await coverRgb(jpg));
    nearBox(got, expectedCover(doc.clips.find((c) => c.id === cs.id), ts), `still · ${cs.id} · t=${ts}`);
    seen[cs.id] = got;
  }
  // the crop changed, the redaction did not move on the original frame: both boxes map back to 0.3…0.6 × 0.3…0.6
  for (const id of ["c_crop_a", "c_crop_b"]) {
    const s = toSourceFrame(doc.clips.find((c) => c.id === id), seen[id]);
    for (const [k, v] of [["x0", 0.3], ["y0", 0.3], ["x1", 0.6], ["y1", 0.6]])
      assert.ok(Math.abs(s[k] - v) <= 0.01, `${id}: the redaction's ${k} on the original frame is ${s[k].toFixed(4)}, expected ${v} ±0.01 (crop must not move it)`);
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
