/* MKV lengths, read from real files (JJ / Rea, 2026-11-04; Deja). The files are made here, with MontClip's own ffmpeg:
   3 s of a test picture and a 1 kHz tone, MPEG-4 Part 2 + AAC (the bundled LGPL build has no H.264 encoder).
     offset.mkv     timestamps start at 3600 s (-output_ts_offset): format.duration says 3603 s
     tags-only.mkv  the header's Duration element blanked out (a Void of the same size): only the streams' DURATION tags
     nothing.mkv    written to a pipe (no DURATION tags), and the header's Duration blanked out: nothing says the length
   Each case first checks that ffprobe really sees the file that way, then what MontClip's probe makes of it. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process");
const FF = require("../ffmpeg-path");
const MediaProbe = require("../media-probe");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const skip = !have && "no ffmpeg / ffprobe here (node desktop/fetch-ffmpeg.cjs, or MONTCLIP_FFMPEG_DIR)";
const SOURCE = ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
  "-t", "3", "-c:v", "mpeg4", "-c:a", "aac", "-threads", "1"];
const LENGTH = 3, TOL = 0.1;

let dir = null;
const made = (name) => path.join(dir, name);
const ffprobe = (file) => JSON.parse(cp.execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { encoding: "utf8", windowsHide: true }));
/** Blank the Segment Info's Duration element (ID 0x4489, an 8-byte float) with a Void element (0xEC) of the same 11 bytes. */
function blankHeaderDuration(file) {
  const buf = fs.readFileSync(file), at = buf.indexOf(Buffer.from([0x44, 0x89, 0x88]));
  a.ok(at > 0 && at < 4096, "the header's Duration element is where the muxer writes it");
  buf[at] = 0xec; buf[at + 1] = 0x89; buf.fill(0, at + 2, at + 11);
  fs.writeFileSync(file, buf);
}

test.before(() => {
  if (!have) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-mkv-"));
  const ff = FF.path("ffmpeg"), opts = { windowsHide: true, maxBuffer: 1 << 26 };
  cp.execFileSync(ff, [...SOURCE, "-output_ts_offset", "3600", made("offset.mkv")], opts);
  cp.execFileSync(ff, [...SOURCE, made("tags-only.mkv")], opts);
  blankHeaderDuration(made("tags-only.mkv"));
  fs.writeFileSync(made("nothing.mkv"), cp.execFileSync(ff, [...SOURCE, "-f", "matroska", "pipe:1"], opts));
  blankHeaderDuration(made("nothing.mkv"));
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test("an MKV whose timestamps start at 3600 s: 3 s long, not 3603 s", { skip }, async () => {
  const raw = ffprobe(made("offset.mkv"));
  a.ok(Number(raw.format.start_time) >= 3600 && Number(raw.format.duration) > 3600, "ffprobe: format.duration counts the start offset");
  const info = await MediaProbe.probeFile(made("offset.mkv"));
  a.equal(info.probe, "ffprobe");
  a.ok(Math.abs(info.duration - LENGTH) <= TOL, "probe says " + info.duration + " s");
});

test("an MKV whose header has no length, only the streams' DURATION tags: 3 s long", { skip }, async () => {
  const raw = ffprobe(made("tags-only.mkv"));
  a.equal(raw.format.duration, undefined, "ffprobe: no length in the header");
  a.ok(raw.streams.some((s) => s.tags && s.tags.DURATION), "ffprobe: the streams' DURATION tags are there");
  const info = await MediaProbe.probeFile(made("tags-only.mkv"));
  a.ok(Math.abs(info.duration - LENGTH) <= TOL, "probe says " + info.duration + " s");
  a.equal(info.durationUnknown, undefined);
});

test("an MKV where nothing says the length: unknown, never 0 s", { skip }, async () => {
  const raw = ffprobe(made("nothing.mkv"));
  a.equal(raw.format.duration, undefined, "ffprobe: no length in the header");
  a.ok(raw.streams.every((s) => !s.duration && !(s.tags && s.tags.DURATION)), "ffprobe: no stream says its length either");
  const info = await MediaProbe.probeFile(made("nothing.mkv"));
  a.equal(info.duration, undefined);
  a.equal(info.durationUnknown, true);
  // an entry made from it gets no length (the editor then says so), rather than 0
  a.equal(MediaProbe.infoForEntry(info, { kind: "video" }).duration, undefined);
});

test("the editor: Infinity from the browser is no length; the server's length wins where the browser has none or counted an MKV's start", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.ok(app.includes("duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined,"), "probeAV drops Infinity / NaN / 0");
  a.ok(app.includes('if (m.kind !== "image" && m.kind !== "svg" && i.duration > 0 && (!known || m.duration - i.duration > 1)) { m.duration = i.duration; changed = true; }'));
  a.ok(app.includes("else if (i.durationUnknown && !known && !durationUnknownSaid.has(m.src))"), "said once per file");
});

test("the hint for a file with no length, both languages, plain words (drafts for JJ)", () => {
  const V = require("../ui-preferences");
  a.equal(V.t("zh-CN", "own.media-duration-unknown", { name: "录像.mkv" }), "「录像.mkv」里没写时长，MontClip 读不出它有多长，放到时间线上的长度可能不对。");
  a.equal(V.t("en", "own.media-duration-unknown", { name: "rec.mkv" }), "“rec.mkv” doesn't say how long it is, so MontClip can't tell its length. Its length on the timeline may be wrong.");
  a.equal(V.t("zh-CN", "own.media-duration-unknown-n", { n: 3 }), "有 3 个文件里没写时长，MontClip 读不出它们有多长，放到时间线上的长度可能不对。");
  a.equal(V.t("en", "own.media-duration-unknown-n", { n: 3 }), "3 files don't say how long they are, so MontClip can't tell their length. Their length on the timeline may be wrong.");
  for (const k of ["own.media-duration-unknown", "own.media-duration-unknown-n"]) a.doesNotMatch(V.t("zh-CN", k, { name: "x", n: 2 }), /NaN|0:00|undefined/);
});
