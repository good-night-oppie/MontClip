// Multi-track test recordings, made on the spot with ffmpeg (no real footage). node synth.cjs <out dir>
// Track 0 「游戏声」 220 Hz all 20 s · track 1 「麦克风」 silent 0–5 s, 440 Hz 5–15 s, silent 15–20 s · track 2 BGM 880 Hz, quiet.
"use strict";
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");
const ffmpeg = require("../../../server/ffmpeg-path").path("ffmpeg");
const out = path.resolve(process.argv[2] || "."); fs.mkdirSync(out, { recursive: true });
const run = (...a) => execFileSync(ffmpeg, ["-v", "error", "-y", ...a]);
const V = ["-f", "lavfi", "-i", "color=c=gray:s=320x180:r=30:d=20"];
const GAME = ["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=20,volume=0.6"];
const GAME51 = ["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=20,volume=0.6,pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0"];
const MIC = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=20,volume=0.6,volume=enable='lt(t,5)+gte(t,15)':volume=0"];
const BGM = ["-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=20,volume=0.1"];
const MAP = ["-map", "0:v", "-map", "1:a", "-map", "2:a", "-map", "3:a", "-c:v", "mpeg4", "-c:a", "aac", "-b:a", "128k"];
const names = (ext) => ["Game", "Mic", "BGM"].flatMap((n, i) => ["-metadata:s:a:" + i, (ext === "mp4" ? "handler_name=" : "title=") + n]);
for (const ext of ["mkv", "mp4"]) {
  const f = (b) => path.join(out, b + "." + ext);
  run(...V, ...GAME, ...MIC, ...BGM, ...MAP, "-ac", "2", ...names(ext), f("three"));                       // all stereo
  run(...V, ...GAME51, ...MIC, ...BGM, ...MAP, ...names(ext), f("three51"));                                // track 0 is 5.1
  run(...V, ...GAME, ...MIC, ...BGM, ...MAP, "-ac:a:0", "1", "-ac:a:1", "2", "-ac:a:2", "1", ...names(ext), f("micwide"));   // mic has the most channels
  run("-i", f("micwide"), "-map", "0", "-c", "copy", "-disposition:a:0", "0", "-disposition:a:1", "0", "-disposition:a:2", "0", f("nodefault"));
  run("-i", f("three"), "-map", "0", "-c", "copy", "-disposition:a:0", "0", "-disposition:a:1", "default", "-disposition:a:2", "0", f("micdefault"));
}
run(...V, ...MIC, "-map", "0:v", "-map", "1:a", "-c:v", "mpeg4", "-c:a", "aac", path.join(out, "single.mp4"));
console.log("written to", out);
