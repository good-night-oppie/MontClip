"use strict";
// Rea — FLV import, Deja's rule of 2026-11-04 22:14Z:
//   gap ≤ 0.5 s → imported directly (no transcode);  gap > 0.5 s → MontClip converts to MP4 itself;
//   either way the result: duration within 1 s of the original, audio/video apart ≤ 0.04 s; reject only when that check fails.
// Fixtures (fixtures-v2/): 60 s H.264 30 fps + AAC 44.1k, flash + 1 kHz beep (100 ms) at 2,7,…,57 s; at 30 s both streams
// jump by g (0.034 / 0.1 / 0.5 / 0.6 / 2.0 s), so every marker after the hole sits g later, still paired.
// Usage: SRC=<exported MontClip tree> MONTCLIP_FFMPEG_DIR=<bundled ffmpeg dir> node --test flv-truth-v2.test.js
// Measurement uses the same bundled ffmpeg/ffprobe (SRC's ffmpeg-path), never PATH.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
// MontClip: paths only — SRC is this repo (skipped, like the other ffmpeg tests, when the bundled ffmpeg/ffprobe is missing)
const SRC = require(path.join(__dirname, "..", "ffmpeg-path.js")).available("ffprobe") ? path.join(__dirname, "..") : null;
const P = SRC ? require(path.join(SRC, "prepare-media.js")) : null;
const FF = SRC ? require(path.join(SRC, "ffmpeg-path.js")) : null;
const FIX = path.join(__dirname, "fixtures", "flv-truth-v2");
const run = (bin, args) => execFileSync(FF.path(bin), args, { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
const duration = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());
function markers(f) {
  // flash = frames whose mean luma is high; beep start = end of a silence (silencedetect writes to stderr, so run it via -f null)
  const flashes = run("ffprobe", ["-v", "error", "-f", "lavfi", "-i", `movie=${f.replace(/\\/g, "/").replace(/:/g, "\\\\:")},signalstats`,
    "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"])
    .trim().split(/\r?\n/).map((l) => l.split(",").map(Number)).filter(([, y]) => y > 128).map(([t]) => t);
  const starts = []; for (const t of flashes) if (!starts.length || t - starts[starts.length - 1] > 1) starts.push(t);
  return { flashes: starts };
}
function beepStarts(f) {
  const r = require("node:child_process").spawnSync(FF.path("ffmpeg"), ["-hide_banner", "-nostats", "-i", f, "-vn", "-af", "silencedetect=n=-30dB:d=0.5", "-f", "null", "-"], { encoding: "utf8" });
  return [...String(r.stderr).matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
}
function worstAV(f) {
  const v = markers(f).flashes, a = beepStarts(f);
  assert.ok(v.length >= 10 && a.length >= 10, `markers found: ${v.length} flashes, ${a.length} beeps`);
  return Math.max(...v.map((t) => Math.min(...a.map((s) => Math.abs(s - t)))));
}
async function prepare(name, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rea-flv-")), src = path.join(dir, name);
  fs.copyFileSync(path.join(FIX, name), src);
  try {
    const r = await P.prepareMedia(src, opts);
    const out = fs.readdirSync(dir).filter((n) => /\.mp4$/i.test(n) && !/\.part\./.test(n)).map((n) => path.join(dir, n))[0];
    return { ok: true, r, out, srcDur: duration(src) };
  } catch (e) { return { ok: false, code: e.code }; }
}
const CASES = [["C0-clean.flv", 0], ["G-gap0.034s.flv", 0.034], ["G-gap0.100s.flv", 0.1], ["G-gap0.500s.flv", 0.5], ["G-gap0.600s.flv", 0.6], ["G-gap2.000s.flv", 2.0]];
for (const [name, g] of CASES) {
  test(`${name}: ${g <= 0.5 ? "imported directly, no transcode" : "converted by MontClip"}; duration ±1 s, A/V ≤ 0.04 s`, { skip: !SRC }, async () => {
    // a streamer's click: no consent screens exist yet, so the options the app passes after its own conversion offer
    // FIX_GAPS=1: also pass the fixGaps consent (#130 0af22f0e asks the streamer for every gap > 5 ms) — measures conversion quality only
    const x = await prepare(name, process.env.FIX_GAPS === "1" ? { allowTranscode: true, acceptReadable: true, fixGaps: true } : g <= 0.5 ? {} : { allowTranscode: true, acceptReadable: true });
    assert.ok(x.ok, `refused with ${x.code}`);
    if (g <= 0.5 && process.env.FIX_GAPS !== "1") assert.equal(x.r.preparation, "remux", "a gap ≤ 0.5 s must not be transcoded");
    assert.ok(x.out && fs.existsSync(x.out), "an MP4 is produced");
    assert.ok(Math.abs(duration(x.out) - x.srcDur) <= 1, `duration ${duration(x.out)} vs original ${x.srcDur}`);
    assert.ok(worstAV(x.out) <= 0.04, "audio/video apart > 0.04 s");
  });
}
test("source fixtures themselves: A/V paired ≤ 0.04 s (self-check of the truth)", { skip: !SRC }, () => {
  for (const [name] of CASES) assert.ok(worstAV(path.join(FIX, name)) <= 0.04, name);
});
