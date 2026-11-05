/* Synthetic two-part recording; no user media. Run: node scripts/packet-timestamps-bench.js */
"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process");
const FF = require("../ffmpeg-path");
function run(tool, args, input) {
  return cp.execFileSync(tool, args, { input, windowsHide: true, maxBuffer: 32 << 20, timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
}
function packets(file) {
  return JSON.parse(run(FF.path("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,dts_time,duration_time", "-of", "json", file])).packets;
}
function samples(dir) {
  // Generated test pattern + sine, H.264/AAC, from #157. Copying needs no H.264 encoder.
  const source = path.join(__dirname, "../test/fixtures/truncated-h264/obs-crash.mkv");
  const segment = offset => run(FF.path("ffmpeg"), ["-v", "error", "-stream_loop", "-1", "-i", source, "-t", "5", "-c", "copy", "-output_ts_offset", String(offset), "-f", "mpegts", "pipe:1"]);
  const joined = path.join(dir, "jump.ts");
  fs.writeFileSync(joined, Buffer.concat([segment(0), segment(300)]));
  const rows = [];
  for (const [format, ext] of [["flv", "flv"], ["matroska", "mkv"]]) {
    const args = ["-v", "error", "-copyts", "-i", joined, "-c", "copy"];
    let bytes, audioReencoded = false, copyError = "";
    try { bytes = run(FF.path("ffmpeg"), [...args, "-f", format, "pipe:1"]); }
    catch (e) {
      if (format !== "matroska") throw e;
      // TS AAC may lack the extradata required by Matroska. Keep this deviation explicit.
      copyError = String(e.stderr).slice(-2000);
      bytes = run(FF.path("ffmpeg"), [...args, "-c:a", "aac", "-f", format, "pipe:1"]);
      audioReencoded = true;
    }
    const file = path.join(dir, "cut." + ext);
    fs.writeFileSync(file, bytes.subarray(0, bytes.length - 2048));
    rows.push({ file, audioReencoded, copyError, bytes: bytes.length - 2048 });
  }
  return { joined, rows };
}
function compare(file, dir) {
  return [false, true].map(genpts => {
    const out = path.join(dir, path.basename(file) + (genpts ? ".genpts" : ".bare") + ".mp4");
    const began = performance.now();
    run(FF.path("ffmpeg"), ["-v", "error", "-y", ...(genpts ? ["-fflags", "+genpts"] : []), "-i", file, "-c", "copy", "-movflags", "+faststart", out]);
    const duration = Number(JSON.parse(run(FF.path("ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "json", out])).format.duration);
    let decode = true;
    try { run(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-xerror", "-err_detect", "explode", "-i", out, "-f", "null", "-"]); } catch { decode = false; }
    return { genpts, duration, decode, elapsedMs: Math.round(performance.now() - began) };
  });
}
if (require.main === module) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-coverage-"));
  const result = samples(dir);
  for (const row of result.rows) row.compare = compare(row.file, dir);
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
module.exports = { samples, packets, compare };
