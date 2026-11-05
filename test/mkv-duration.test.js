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
const MediaLib = require("../media-lib");
const { makeDataDir, seedProject, startMcp, readProject } = require("./helpers");

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
  cp.execFileSync(ff, [...SOURCE.map((v) => (v === "3" ? "20" : v)), "-output_ts_offset", "3600", made("offset20.mkv")], opts);
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

test("the editor: Infinity from the browser is no length; which files are asked and what is taken is media-lib.js's rule", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.ok(app.includes("duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined,"), "probeAV drops Infinity / NaN / 0");
  const at = app.indexOf("async function refreshMediaInfo"), body = app.slice(at, at + 2400);
  a.match(body, /MediaLib\.needsInfo\(m\)/, "which files are asked: the same rule the tests check");
  a.match(body, /MediaLib\.serverDuration\(m, i\)/, "how the server's length is taken: the same rule");
  a.ok(body.includes("!durationUnknownSaid.has(m.src)"), "said once per file");
});

/* QQ (#126 review): refreshMediaInfo only asked files with no size, so an old project whose MKV already had its size
   kept the browser's 3620 s for ever. Which files are asked, and what is taken from the answer, is now media-lib.js. */
test("an old project: an MKV with its size already saved and the browser's 3620 s is asked again, becomes 20 s, and is asked once", () => {
  const m = { id: "m1", kind: "video", name: "rec.mkv", src: "/media/rec.mkv", size: 123456, duration: 3620 };
  a.equal(MediaLib.needsInfo(m), true, "asked although it has a size");
  const r = MediaLib.serverDuration(m, { size: 123456, duration: 20 });
  a.equal(m.duration, 20); a.equal(r.changed, true);
  a.equal(MediaLib.needsInfo(m), false, "not asked on every load");
  // a WebM the same; an MKV whose src was renamed but whose name says MKV too
  a.equal(MediaLib.needsInfo({ kind: "video", src: "/media/a.webm", size: 1, duration: 10 }), true);
  a.equal(MediaLib.needsInfo({ kind: "audio", src: "/media/a.mka", name: "a.mkv", size: 1, duration: 10 }), true);
  // any recording with no usable length is asked once, whatever its format
  a.equal(MediaLib.needsInfo({ kind: "video", src: "/media/a.mp4", size: 1 }), true);
  // an MP4 that already has its size and a length is left alone, as before; pictures are never asked for a length
  a.equal(MediaLib.needsInfo({ kind: "video", src: "/media/a.mp4", size: 1, duration: 10 }), false);
  a.equal(MediaLib.needsInfo({ kind: "image", src: "/media/a.png", size: 1 }), false);
  a.equal(MediaLib.needsInfo({ kind: "video", src: "/media/a.mp4" }), true, "no size: asked, as before");
  // the browser's length stays when it is not longer than the server's by more than a second
  const ok = { kind: "video", src: "/media/b.mkv", size: 1, duration: 20.4 };
  a.equal(MediaLib.serverDuration(ok, { duration: 20 }).changed, true, "only the marker changes");
  a.equal(ok.duration, 20.4);
  // nothing says the length: unknown, the marker set so it is said once and not asked again
  const none = { kind: "video", src: "/media/c.mkv", size: 1 };
  a.deepEqual(MediaLib.serverDuration(none, { durationUnknown: true }), { changed: true, unknown: true, length: false });
  a.equal(none.duration, undefined); a.equal(MediaLib.needsInfo(none), false);
});

test("an old project opened on a real offset MKV: the browser's 3620 s becomes 20 s", { skip }, async () => {
  const info = await MediaProbe.probeFile(made("offset20.mkv"));
  const m = { id: "m1", kind: "video", name: "rec.mkv", src: "/media/rec.mkv", size: info.size, duration: 3620 };
  a.equal(MediaLib.needsInfo(m), true);
  MediaLib.serverDuration(m, info);
  a.ok(Math.abs(m.duration - 20) <= TOL, "now " + m.duration + " s");
});

test("MCP import of an MKV whose timestamps start at 3600 s: 20 s, the same as the editor", { skip }, async (t) => {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  const r = await mcp.callTool("fablecut_import_media", { path: made("offset20.mkv") });
  a.equal(r.isError, false, r.text);
  const m = readProject(data).media.at(-1);
  a.ok(Math.abs(m.duration - 20) <= TOL, "MCP stored " + m.duration + " s");
});

/* QQ: the streams' fallback took each stream less its own start, then the longest, which loses the gap between them. */
test("no length in the header: from the earliest start to the latest end, across streams (video 0–20 s, audio 10–30 s → 30 s)", () => {
  const fmt = { format_name: "matroska,webm", start_time: "0.000000" };
  // the streams' own durations
  a.equal(MediaLib.parseProbe({ format: fmt, streams: [
    { codec_type: "video", start_time: "0.000000", duration: "20.000000", width: 160, height: 90 },
    { codec_type: "audio", start_time: "10.000000", duration: "20.000000", channels: 2, sample_rate: "48000" }] }).duration, 30);
  // the streams' DURATION tags (where each stream's timestamps end)
  a.equal(MediaLib.parseProbe({ format: fmt, streams: [
    { codec_type: "video", start_time: "0.000000", width: 160, height: 90, tags: { DURATION: "00:00:20.000000000" } },
    { codec_type: "audio", start_time: "10.000000", channels: 2, sample_rate: "48000", tags: { DURATION: "00:00:30.000000000" } }] }).duration, 30);
  // the whole file offset (both start at 3600 s, tags say where they end): still the length, not the end
  a.equal(MediaLib.parseProbe({ format: { format_name: "matroska,webm", start_time: "3600.000000" }, streams: [
    { codec_type: "video", start_time: "3600.000000", width: 160, height: 90, tags: { DURATION: "01:00:03.000000000" } },
    { codec_type: "audio", start_time: "3600.000000", channels: 2, sample_rate: "48000", tags: { DURATION: "01:00:03.000000000" } }] }).duration, 3);
});

/* JJ rule 1: what happened, then what she can do now, and that the original is unchanged. Drafts, for JJ. */
test("the hint for a file with no length, both languages, plain words with the next step (drafts for JJ)", () => {
  const V = require("../ui-preferences");
  a.equal(V.t("zh-CN", "own.media-duration-unknown", { name: "录像.mkv" }), "「录像.mkv」里没写时长，MontClip 读不出它有多长，放到时间线上的长度可能不对。原片没有改动；拖到时间线后拉一下结尾就能对上。");
  a.equal(V.t("en", "own.media-duration-unknown", { name: "rec.mkv" }), "“rec.mkv” doesn't say how long it is, so MontClip can't tell its length, and its length on the timeline may be wrong. The original is unchanged; after you drag it onto the timeline, drag its end to fit.");
  a.equal(V.t("zh-CN", "own.media-duration-unknown-n", { n: 3 }), "有 3 个文件里没写时长，MontClip 读不出它们有多长，放到时间线上的长度可能不对。原片没有改动；拖到时间线后拉一下结尾就能对上。");
  a.equal(V.t("en", "own.media-duration-unknown-n", { n: 3 }), "3 files don't say how long they are, so MontClip can't tell their length, and their length on the timeline may be wrong. The originals are unchanged; after you drag one onto the timeline, drag its end to fit.");
  for (const k of ["own.media-duration-unknown", "own.media-duration-unknown-n"]) {
    const zh = V.t("zh-CN", k, { name: "x", n: 2 });
    a.doesNotMatch(zh, /NaN|0:00|undefined/);
    a.equal(zh.replace(/MontClip/g, "").match(/[A-Za-z]{3,}/), null, "no English word in the Chinese: " + zh);
  }
});
