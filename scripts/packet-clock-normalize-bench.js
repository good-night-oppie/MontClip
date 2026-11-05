/* Test-only normalization experiment. FFV1/PCM avoids encoder loss in pixel comparisons;
 * it is not a browser-ready repair output or a replacement for #157's encoder selection. */
"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process");
const FF = require("../ffmpeg-path"), Clock = require("../packet-clock");
const { samples } = require("./packet-timestamps-bench");
function run(bin, args) {
  return cp.execFileSync(bin, args, { windowsHide: true, timeout: 30000, maxBuffer: 8 << 20, stdio: ["ignore", "pipe", "pipe"] });
}
async function normalizeFixture(file, dir) {
  const clock = Clock.coverage(await Clock.scanFile(file));
  const ranges = Clock.sourceRanges(clock, 0, clock.coveredDuration), filters = [];
  const video = ranges.map((_, i) => `[v${i}]`), audio = ranges.map((_, i) => `[a${i}]`);
  filters.push(`[0:v:0]split=${ranges.length}${video.join("")}`, `[0:a:0]asplit=${ranges.length}${audio.join("")}`);
  ranges.forEach((r, i) => {
    // Both tracks use the SAME original PTS origin, rather than independently subtracting STARTPTS.
    filters.push(`${video[i]}trim=start=${r.sourceStart}:end=${r.sourceEnd},setpts=PTS-${r.sourceStart}/TB[xv${i}]`);
    filters.push(`${audio[i]}atrim=start=${r.sourceStart}:end=${r.sourceEnd},asetpts=PTS-${r.sourceStart}/TB[xa${i}]`);
  });
  filters.push(ranges.map((_, i) => `[xv${i}][xa${i}]`).join("") + `concat=n=${ranges.length}:v=1:a=1[v][a]`);
  const out = path.join(dir, path.basename(file) + ".clock-copy.mkv");
  run(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-n", "-copyts", "-i", file,
    "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "ffv1", "-c:a", "pcm_s16le", "-fps_mode", "vfr", out]);
  const duration = Number(JSON.parse(run(FF.path("ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "json", out])).format.duration);
  if (!Number.isFinite(duration) || duration < .5 || Math.abs(duration - clock.coveredDuration) > 1) throw new Error("normalized fixture failed duration checks");
  run(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-xerror", "-err_detect", "explode", "-i", out, "-f", "null", "-"]);
  return { file: out, duration, coveredDuration: clock.coveredDuration, strictDecode: true, spans: ranges };
}
if (require.main === module) (async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-clock-normalize-")), fixture = samples(dir), results = [];
  for (const row of fixture.rows) results.push({ audioReencodedAtFixtureCreation: row.audioReencoded, ...await normalizeFixture(row.file, dir) });
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { normalizeFixture };
