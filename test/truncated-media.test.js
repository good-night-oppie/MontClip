/* Recordings cut off mid-way (europa trial, P3, 2026-11-05; Deja). A screen recorder stopped before it closed the file
   leaves a WebM whose header, streams and tags say nothing about its length, and whose last bytes are missing:
   import said "duration unknown (no ffprobe)" although ffprobe was there, and fablecut_frame then said every moment was
   "past the end of the clip (0s)". The files are made here, with MontClip's own ffmpeg, no people in them:
     cut.webm      VP8 written live (the input comes through a pipe, so no muxer knows the length), the last 40 % cut off
     cut.mkv       MPEG-4 + AAC, the same way
     cut.mp4       an ordinary MP4 (index at the end), the last 40 % cut off: no index at all, ffprobe cannot open it
     cut-frag.mp4  a fragmented MP4 (how some recorders write), the last 40 % cut off: the fragments before the cut play
   Each case first checks that ffprobe really sees the file that way, then what MontClip makes of it. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process");
const FF = require("../server/ffmpeg-path");
const MediaProbe = require("../server/media-probe");
const MediaLib = require("../media-lib");
const { makeDataDir, seedProject, startMcp, startServer, readProject } = require("./helpers");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const skip = !have && "no ffmpeg / ffprobe here (node desktop/fetch-ffmpeg.cjs, or MONTCLIP_FFMPEG_DIR)";
const LENGTH = 4;

let dir = null;
const made = (name) => path.join(dir, name);
const ffprobe = (file) => JSON.parse(cp.execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { encoding: "utf8", windowsHide: true }));
/** ffmpeg's own picture (and tone) → a raw NUT stream on a pipe → the encoder writing to a pipe: a live recording. */
function live(enc, fmt) {
  const ff = FF.path("ffmpeg"), opts = { windowsHide: true, maxBuffer: 1 << 27 };
  const raw = cp.execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
    "-t", String(LENGTH), "-c:v", "rawvideo", "-c:a", "pcm_s16le", "-f", "nut", "pipe:1"], opts);
  return cp.execFileSync(ff, ["-v", "error", "-f", "nut", "-i", "pipe:0", ...enc, "-threads", "1", "-f", fmt, "pipe:1"], { ...opts, input: raw });
}
const cut = (buf) => buf.subarray(0, Math.floor(buf.length * 0.6));

test.before(() => {
  if (!have) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-cut-"));
  const ff = FF.path("ffmpeg"), opts = { windowsHide: true, maxBuffer: 1 << 26 };
  fs.writeFileSync(made("cut.webm"), cut(live(["-an", "-c:v", "libvpx", "-b:v", "300k"], "webm")));
  fs.writeFileSync(made("cut.mkv"), cut(live(["-c:v", "mpeg4", "-c:a", "aac"], "matroska")));
  const SRC = ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
    "-t", String(LENGTH), "-c:v", "mpeg4", "-c:a", "aac", "-threads", "1"];
  cp.execFileSync(ff, [...SRC, made("whole.mp4")], opts);
  fs.writeFileSync(made("cut.mp4"), cut(fs.readFileSync(made("whole.mp4"))));
  cp.execFileSync(ff, [...SRC, "-movflags", "frag_keyframe+empty_moov", made("whole-frag.mp4")], opts);
  fs.writeFileSync(made("cut-frag.mp4"), cut(fs.readFileSync(made("whole-frag.mp4"))));
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

/** The header, the streams and their tags say nothing about the length: what the europa recording looks like. */
function saysNothing(raw) {
  a.equal(raw.format.duration, undefined, "ffprobe: no length in the header");
  a.ok(raw.streams.every((s) => !s.duration && !(s.tags && (s.tags.DURATION || s.tags.duration))), "ffprobe: no stream says its length either");
}
const between = (d, what) => a.ok(d > 1.5 && d < LENGTH - 0.5, `${what}: ${d} s (the part before the cut, of ${LENGTH} s)`);

for (const name of ["cut.webm", "cut.mkv"]) {
  test(`${name}, cut off mid-way with no length anywhere: the length is read from its last packet`, { skip }, async () => {
    saysNothing(ffprobe(made(name)));
    const info = await MediaProbe.probeFile(made(name));
    a.equal(info.probe, "ffprobe");
    between(info.duration, "probe");
    a.equal(info.durationUnknown, undefined);
    a.equal(info.durationFrom, "packets", "says where the length came from");
    a.equal(MediaProbe.infoForEntry(info, { kind: "video" }).duration, info.duration);
  });
}

test("cut.webm: fablecut_frame shows a moment inside it, and a moment past it says the real end, not 0 s", { skip }, async () => {
  const { frame } = require("../server/analyze");
  const info = await MediaProbe.probeFile(made("cut.webm"));
  const r = await frame(made("cut.webm"), { t: 1, width: 160, stats: false });
  a.ok(r.jpeg && r.jpeg.length > 100, "a picture at 1 s");
  await a.rejects(frame(made("cut.webm"), { t: 30, width: 160, stats: false }), (e) => {
    a.doesNotMatch(e.message, /\(0s\)/);
    a.match(e.message, new RegExp(`\\(${String(info.duration).replace(".", "\\.")}s\\)`));
    return true;
  });
});

test("cut.mp4 (index never written): ffprobe can't open it — said as that, never 'no ffprobe', and the length is unknown, not 0", { skip }, async () => {
  a.throws(() => ffprobe(made("cut.mp4")), "ffprobe: the file can't be opened");
  const info = await MediaProbe.probeFile(made("cut.mp4"));
  a.equal(info.probe, "failed");
  a.match(info.probeError, /moov/i, "ffprobe's own reason: " + info.probeError);
  a.equal(info.duration, undefined);
  a.equal(info.durationUnknown, true);
  const e = MediaProbe.infoForEntry(info, { kind: "video" });
  a.equal(e.duration, undefined);
  a.equal(e.durationUnknown, true, "the entry is marked: it can't be cut");
  a.equal(MediaProbe.infoForEntry(info, { kind: "image" }).durationUnknown, undefined, "a picture needs no length");
});

test("cut-frag.mp4 (fragmented): the fragments before the cut play, and that is its length", { skip }, async () => {
  const info = await MediaProbe.probeFile(made("cut-frag.mp4"));
  a.equal(info.probe, "ffprobe");
  between(info.duration, "probe");
});

/* The import tool said "no ffprobe" for anything without a length. It now says what happened, in plain words, and an
   entry with no length can't be placed: never at 0 s, nor at the editor's 5 s stand-in. */
test("MCP import: the cut WebM gets its length; the cut MP4 says ffprobe couldn't read it and can't be placed", { skip }, async (t) => {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });

  const w = await mcp.callTool("fablecut_import_media", { path: made("cut.webm"), link: true });
  a.equal(w.isError, false, w.text);
  a.doesNotMatch(w.text, /no ffprobe/);
  a.match(w.text, /last packet/i, "says the length came from the packets: " + w.text);
  const webm = readProject(data).media.at(-1);
  between(webm.duration, "MCP stored");
  a.equal(webm.durationUnknown, undefined);

  const m = await mcp.callTool("fablecut_import_media", { path: made("cut.mp4") });
  a.equal(m.isError, false, m.text);
  a.doesNotMatch(m.text, /no ffprobe/);
  a.match(m.text, /ffprobe could not read/i, m.text);
  a.match(m.text, /can't be (cut|placed)/i, m.text);
  const mp4 = readProject(data).media.at(-1);
  a.equal(mp4.duration, undefined);
  a.equal(mp4.durationUnknown, true);

  for (const op of [
    { op: "insert", mediaId: mp4.id, at: 0, duration: 2 },
    { op: "overwrite", mediaId: mp4.id, at: 0, duration: 2 },
    { op: "addClip", clip: { mediaId: mp4.id, kind: "video", track: "V1", start: 0, in: 0, duration: 2 } },
  ]) {
    const r = await mcp.callTool("fablecut_patch_project", { ops: [op] });
    a.equal(r.isError, true, op.op + " was refused: " + r.text);
    a.match(r.text, /length/i, r.text);
  }
  a.equal(readProject(data).clips.length, 0, "nothing reached the timeline");
  // the WebM, now with its length, places as any file does
  const ok = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "insert", mediaId: webm.id, at: 0 }] });
  a.equal(ok.isError, false, ok.text);
});

test("media-lib: a length arriving clears the mark, an unknown one sets it; the editor won't place a file with none", () => {
  const m = { kind: "video", src: "/media/r.webm", size: 1 };
  MediaLib.serverDuration(m, { durationUnknown: true });
  a.equal(m.durationUnknown, true);
  MediaLib.serverDuration(m, { duration: 12.5, durationFrom: "packets" });
  a.equal(m.duration, 12.5);
  a.equal(m.durationUnknown, undefined);
  const pic = { kind: "image", src: "/media/p.png", size: 1 };
  MediaLib.serverDuration(pic, { durationUnknown: true });
  a.equal(pic.durationUnknown, undefined);
  a.equal(MediaLib.cannotCut({ kind: "video", durationUnknown: true }), true);
  a.equal(MediaLib.cannotCut({ kind: "video", durationUnknown: true, duration: 3 }), false);
  a.equal(MediaLib.cannotCut({ kind: "video" }), false, "not probed yet is not the same as unknown");
  a.equal(MediaLib.cannotCut({ kind: "image", durationUnknown: true }), false);

  const app = fs.readFileSync(path.join(__dirname, "..", "app/app.js"), "utf8");
  const at = app.indexOf("function addClipFromMedia"), body = app.slice(at, at + 600);
  a.match(body, /MediaLib\.cannotCut\(m\)/, "the editor refuses to place it");
  a.match(body, /own.media-cannot-cut/, "and says why, in JJ's words");
});

/* JJ (P1 / P3, 2026-11-05): the length can't wait for the editor tab. An entry already in the project with no length
   (imported before this fix, or by a tool that didn't read it) is read with ffprobe by the agent's own calls. */
test("no editor open: an entry with no length gets it from ffprobe when the agent reads or patches the project", { skip }, async (t) => {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  const mediaDir = path.join(data, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.copyFileSync(made("cut.webm"), path.join(mediaDir, "rec.webm"));
  fs.copyFileSync(made("cut.mp4"), path.join(mediaDir, "rec.mp4"));
  const proj = readProject(data);
  proj.media = [
    { id: "m_webm", name: "rec.webm", kind: "video", src: "/media/rec.webm", size: 1 },
    { id: "m_mp4", name: "rec.mp4", kind: "video", src: "/media/rec.mp4", size: 1 },
  ];
  proj.revision = 5;
  fs.writeFileSync(path.join(data, "project.json"), JSON.stringify(proj));
  const srv = await startServer(t, data, { FABLECUT_NO_FS_WATCH: "1" });
  const mcp = startMcp(t, data, { FABLECUT_PORT: String(srv.port), FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });

  const view = await mcp.callTool("fablecut_get_project", { compact: true });
  a.equal(view.isError, false, view.text);
  const after = readProject(data);
  between(after.media[0].duration, "the WebM's entry");
  a.equal(after.media[1].duration, undefined);
  a.equal(after.media[1].durationUnknown, true, "the MP4 nothing can read is marked");
  a.ok(after.revision > 5, "written back as an edit");
  // and a patch on it is told why, without an editor anywhere
  const r = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "insert", mediaId: "m_mp4", at: 0, duration: 1 }] });
  a.equal(r.isError, true);
  a.match(r.text, /no length MontClip could read/, r.text);
  const ok = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "insert", mediaId: "m_webm", at: 0 }] });
  a.equal(ok.isError, false, ok.text);
});

/* JJ's words on a file that can't be cut (2026-11-05, final in Chinese; the English is a draft for JJ). */
test("the mark on a file that can't be cut: JJ's sentence, shown on it in the bin", () => {
  const V = require("../ui-preferences");
  a.equal(V.t("zh-CN", "own.media-incomplete"), "这个视频没录完整（可能录屏中途停了），读不出时长，现在还剪不了。");
  a.doesNotMatch(V.t("en", "own.media-incomplete"), /[一-鿿]/);
  const app = fs.readFileSync(path.join(__dirname, "..", "app/app.js"), "utf8");
  a.match(app, /MediaLib\.cannotCut\(m\)[^\n]*own\.media-incomplete|own\.media-incomplete[^\n]*MediaLib\.cannotCut\(m\)/, "the bin marks it with that sentence");
});
