"use strict";
// Rea — black-box: does a headless export show source frame N at output frame N for EVERY frame (not just at 4 flashes)?
// The repo's 3600 s test (#161) flashes one frame at 1 / 3.5 / 6 / 8.5 s and has failed 4 times on CI: once a flash
// missing, once an extra flash 2 frames early. A 3-frame flash (export-sync-truth) can't see that. Here every source frame
// carries its own index as a grey level (13 levels, 16 apart, cycling), so a duplicated, skipped or shifted frame anywhere
// shows up as a level step that is not +1. Truth = the source's own frame index on its container clock.
// Usage: BASE=http://127.0.0.1:PORT MEDIA=<data>/media EXPORTS=<data>/exports MONTCLIP_FFMPEG_DIR=<dir> RUNS=5 [OFFSET=3600]
const fs = require("node:fs"), path = require("node:path"), { execFileSync, spawnSync } = require("node:child_process");
const BASE = process.env.BASE, DIR = process.env.MONTCLIP_FFMPEG_DIR, MEDIA = process.env.MEDIA, EXPORTS = process.env.EXPORTS;
const ff = (b) => path.join(DIR, b + (process.platform === "win32" ? ".exe" : ""));
const FPS = 30, SECONDS = 10, N = FPS * SECONDS, LEVELS = 13, STEP = 16, BASEY = 24;
const OFFSET = Number(process.env.OFFSET || 3600), RUNS = Number(process.env.RUNS || 5);
const levelOf = (n) => BASEY + (n % LEVELS) * STEP;
function makeSource(file) {
  // geq: Y = level of the frame index; U = V = 128 (grey). N = frame number on the generated clock
  const expr = `${BASEY}+mod(N\\,${LEVELS})*${STEP}`;
  execFileSync(ff("ffmpeg"), ["-hide_banner", "-v", "error", "-y",
    "-f", "lavfi", "-i", `color=c=black:size=320x180:rate=${FPS}:duration=${SECONDS},format=yuv420p,geq=lum='${expr}':cb=128:cr=128`,
    "-f", "lavfi", "-i", `sine=frequency=1000:sample_rate=48000:duration=${SECONDS}`,
    "-map", "0:v", "-map", "1:a", "-c:v", "libvpx-vp9", "-b:v", "2M", "-deadline", "good", "-g", "30", "-pix_fmt", "yuv420p",
    "-c:a", "libopus", ...(OFFSET ? ["-output_ts_offset", String(OFFSET)] : []), file], { windowsHide: true });
}
function frameLevels(file) { // mean Y of every decoded frame, in presentation order
  const r = spawnSync(ff("ffmpeg"), ["-hide_banner", "-v", "error", "-i", file, "-map", "0:v:0", "-vf", "scale=32:18,format=gray", "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 28 });
  const px = 32 * 18, out = [];
  for (let i = 0; i + px <= r.stdout.length; i += px) { let s = 0; for (let j = 0; j < px; j++) s += r.stdout[i + j]; out.push(s / px); }
  return out;
}
// calibrated from the source: the 13 grey levels as they decode (the scaler maps limited→full range, so they are not BASEY+k*STEP)
let CAL = null;
const toIndex = (y) => { let b = -1, bd = Infinity; CAL.forEach((c, k) => { const d = Math.abs(c - y); if (d < bd) { bd = d; b = k; } }); return b; };
async function exportOnce(name) {
  const doc = await (await fetch(BASE + "/api/project")).json();
  Object.assign(doc, { name: "rea-cadence", width: 320, height: 180, fps: FPS, revision: (doc.revision || 0) + 1,
    media: [{ id: "m", name, kind: "video", src: "/media/" + encodeURIComponent(name), width: 320, height: 180 }],
    clips: [{ id: "v", kind: "video", mediaId: "m", track: "V1", start: 0, in: 0, duration: SECONDS, props: { volume: 0 } },
      { id: "a", kind: "audio", mediaId: "m", track: "A1", start: 0, in: 0, duration: SECONDS }] });
  const put = await fetch(BASE + "/api/project", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) });
  if (put.status !== 200) throw new Error("PUT " + put.status);
  const req = await (await fetch(BASE + "/api/export/request", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ where: "headless", preset: "custom", delivery: { container: "webm", video: { codec: "vp9" }, audio: { codec: "opus" } } }) })).json();
  let job;
  for (const until = Date.now() + 300000; Date.now() < until;) {
    await new Promise((r) => setTimeout(r, 1000));
    job = await (await fetch(BASE + "/api/export/job?id=" + req.id)).json();
    if (/^(done|failed|cancelled)$/.test(job.status)) break;
  }
  return { job, file: job && job.src ? path.join(EXPORTS, decodeURIComponent(job.src.replace(/^\/exports\//, "").split("?")[0])) : null };
}
(async () => {
  const name = `cadence-${OFFSET}.webm`, src = path.join(MEDIA, name);
  makeSource(src);
  const srcLv = frameLevels(src); CAL = srcLv.slice(0, LEVELS);
  console.log(`calibrated levels: ${CAL.map((x) => x.toFixed(1)).join(" ")}`);
  const srcIdx = srcLv.map(toIndex);
  const srcBad = srcIdx.filter((x, n) => x !== n % LEVELS).length;
  console.log(`source: ${srcIdx.length} frames, ${srcBad} not on their own index (must be 0)`);
  let badRuns = 0;
  for (let run = 1; run <= RUNS; run++) {
    const { job, file } = await exportOnce(name);
    if (!file || job.status !== "done") { badRuns++; console.log(`run ${run}: status ${job && job.status} ${JSON.stringify(job && job.error)}`); continue; }
    const idx = frameLevels(file).map(toIndex);
    const errs = [];
    for (let n = 0; n < Math.min(idx.length, N); n++) {
      const want = n % LEVELS, got = idx[n];
      if (got !== want) { let d = ((got - want) % LEVELS + LEVELS) % LEVELS; if (d > LEVELS / 2) d -= LEVELS; errs.push([n, d]); }
    }
    // group consecutive wrong frames into events: [first frame, length, offset in frames]
    const ev = []; for (const [n, d] of errs) { const l = ev[ev.length - 1]; if (l && l[0] + l[1] === n && l[2] === d) l[1]++; else ev.push([n, 1, d]); }
    if (errs.length) badRuns++;
    console.log(`run ${run}: ${idx.length} frames; ${errs.length} off their source frame` + (ev.length ? `; events [frame@s, length, offset frames]: ${JSON.stringify(ev.slice(0, 12).map(([n, l, d]) => [`${n}@${(n / FPS).toFixed(3)}`, l, d]))}` : ""));
    try { fs.unlinkSync(file); } catch { }
  }
  console.log(badRuns ? `FRAME_CADENCE_FAIL ${badRuns}/${RUNS} runs had a frame off` : `FRAME_CADENCE_PASS ${RUNS}/${RUNS} runs, every frame on its own`);
  try { fs.unlinkSync(src); } catch { }
  process.exitCode = badRuns ? 1 : 0;
})();
