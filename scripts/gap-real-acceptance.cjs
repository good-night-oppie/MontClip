/* Run only on the machine holding the real recording. Never copies it elsewhere.
 * node scripts/gap-real-acceptance.cjs <recording>
 * New output is confined to a fresh OS temp directory and removed in finally.
 * The JSON receipt contains no input path, user name, picture, audio or transcript. */
"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto"), cp = require("node:child_process");
const Clock = require("../packet-clock"), Repair = require("../make-editable"), Probe = require("../media-probe"), FF = require("../ffmpeg-path");
async function digest(file) { const h = crypto.createHash("sha256"); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest("hex"); }
async function main() {
  const file = process.argv[2]; if (!file) throw Error("recording argument required");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "mc-real-repair-"));
  const report = { sourceUnchanged: false, outputRemoved: false };
  try {
    const before = await digest(file), version = Repair.fileVersion(file);
    const metadata = JSON.parse(cp.execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { maxBuffer: 4 << 20 }));
    report.videoStreams = metadata.streams.filter(s => s.codec_type === "video").length;
    report.audioStreams = metadata.streams.filter(s => s.codec_type === "audio").length;
    report.headerDurationKnown = Number.isFinite(Number(metadata.format?.duration)) && Number(metadata.format.duration) > 0;
    const scan = Clock.coverage(await Clock.scanFile(file));
    report.gaps = scan.gaps.map(g => ({ seconds: g.duration }));
    report.gapSeconds = scan.gaps.reduce((n, g) => n + g.duration, 0);
    report.coveredDuration = scan.coveredDuration;
    report.probedDuration = (await Probe.probeFile(file)).duration;
    const repaired = await Repair.makeEditable(file, { outDir: out, skipGaps: true });
    report.repairedDuration = repaired.duration; report.preparation = repaired.preparation; report.encoder = repaired.encoder || null;
    // makeEditable already performs the strict whole-file decode before success.
    report.strictDecode = true;
    const frame = cp.execFileSync(FF.path("ffmpeg"), ["-v", "error", "-ss", "57", "-i", repaired.file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"], { maxBuffer: 8 << 20 });
    report.frameAt57Seconds = frame.length > 0;
    report.sourceUnchanged = (await digest(file)) === before && Repair.fileVersion(file) === version;
    report.avAlignment = { status: "not_measured", reason: !report.audioStreams ? "no_audio_stream" : !report.gaps.length ? "no_internal_gap" : "requires_identifiable_sync_events" };
  } catch (e) { report.errorCode = e.code || "ACCEPTANCE_FAILED"; process.exitCode = 1; }
  finally {
    // Exact directory was just created by this process; no symlinks/junctions added.
    fs.rmSync(out, { recursive: true, force: true }); report.outputRemoved = !fs.existsSync(out);
    console.log(JSON.stringify(report, null, 2));
  }
}
if (require.main === module) main().catch(() => { console.error("acceptance could not start"); process.exitCode = 1; });
