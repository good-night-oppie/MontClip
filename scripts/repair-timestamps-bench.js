/* Synthetic timestamp jump + truncated tail. No user recordings. Run from any directory:
 * node scripts/repair-timestamps-bench.js
 * Compares the actual repair pipeline, changing only the remux input flags. */
"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process"), vm = require("node:vm");
const FF = require("../server/ffmpeg-path"), MP = require("../server/media-probe");
const file = require.resolve("../server/make-editable"), localRequire = require("node:module").createRequire(file);
function exec(bin, args) {
  return cp.execFileSync(bin, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}
function sample(dir) {
  // The source is an existing synthetic H.264/AAC test pattern. Copying it needs no H.264 encoder.
  const source = path.join(__dirname, "../test/fixtures/truncated-h264/obs-crash.mkv");
  const segment = (offset) => exec(FF.path("ffmpeg"), ["-v", "error", "-i", source, "-t", "2", "-c", "copy",
    "-output_ts_offset", String(offset), "-f", "mpegts", "pipe:1"]);
  const first = segment(0), second = segment(20);
  const input = path.join(dir, "jump-truncated.ts");
  fs.writeFileSync(input, Buffer.concat([first, second.subarray(0, Math.floor(second.length * 0.7))]));
  const packets = JSON.parse(exec(FF.path("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_packets",
    "-show_entries", "packet=pts_time", "-of", "json", input])).packets;
  const jumps = [];
  for (let i = 1; i < packets.length; i++) {
    const before = Number(packets[i - 1].pts_time), after = Number(packets[i].pts_time);
    if (after - before > 10) jumps.push({ packet: i, before, after, seconds: after - before });
  }
  return { input, bytes: fs.statSync(input).size, completeBytes: first.length + second.length, packets: packets.length, jumps };
}
function pipeline(flags) {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    module: mod, exports: mod.exports, require(id) {
      if (id !== "child_process") return localRequire(id);
      return { ...cp, spawn(bin, args, options) {
        // Change only step 1 (-c copy), leaving probe, strict decode and transcode untouched.
        if (args.includes("copy")) {
          args = Array.from(args);
          const at = args.indexOf("-fflags");
          if (at >= 0) args.splice(at, 2);
          args.splice(args.indexOf("-i"), 0, ...flags);
        }
        return cp.spawn(bin, args, options);
      } };
    },
  });
  return mod.exports.makeEditable;
}
async function benchmark() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-timestamps-"));
  const source = sample(dir), info = await MP.probeFile(source.input), rows = [];
  for (const [variant, flags] of [["before", []], ["genpts", ["-fflags", "+genpts"]],
    ["igndts", ["-fflags", "+genpts+igndts"]], ["ignore_err", ["-err_detect", "ignore_err", "-fflags", "+genpts+igndts"]]]) {
    const out = path.join(dir, variant + ".mp4"), start = performance.now();
    exec(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-y", ...flags, "-i", source.input,
      "-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", out]);
    const duration = Number(JSON.parse(exec(FF.path("ffprobe"), ["-v", "error", "-show_format", "-of", "json", out])).format.duration);
    exec(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-xerror", "-err_detect", "explode", "-i", out, "-f", "null", "-"]);
    const row = { variant, duration, strictDecode: "pass", remuxProbeDecodeMs: performance.now() - start };
    if (variant === "before" || variant === "genpts") {
      const phases = [], began = performance.now();
      try { row.result = await pipeline(flags)(source.input, { outDir: dir, onProgress: (_p, phase) => { if (phases.at(-1) !== phase) phases.push(phase); } }); }
      catch (e) { row.error = e.code || e.message; }
      row.pipelineMs = performance.now() - began; row.phases = phases;
    }
    rows.push(row);
  }
  const result = { ffmpeg: String(exec(FF.path("ffmpeg"), ["-version"])).split(/\r?\n/)[0], source, expectedDuration: info.duration, rows };
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) benchmark().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { sample, pipeline };
