/* P6 (europa trial, JJ 2026-11-05): a file's width and height are its DISPLAY size. A replay stored as 1080×1920 with
   non-square pixels (sample aspect ratio 896:405) shows as 2389×1920; the browser composes it that way, but the media
   entry said 1080×1920, which misleads anything that judges by the size (Reframe, the canvas that follows the first
   recording, an agent). Now width × height is what shows, and storedWidth × storedHeight is what the file stores, when
   they differ. The file is made here, with MontClip's own ffmpeg: a test picture, no people. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process");
const FF = require("../server/ffmpeg-path");
const MediaLib = require("../media-lib");
const MediaProbe = require("../server/media-probe");
const ProjectOps = require("../server/project-ops");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const skip = !have && "no ffmpeg / ffprobe here";
let dir = null;
test.before(() => {
  if (!have) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-sar-"));
  // stored 108×192, pixels 896:405 wide → shows as 239×192 (108 × 896 / 405 = 238.9)
  cp.execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=108x192:rate=30", "-t", "1",
    "-vf", "setsar=896/405", "-c:v", "mpeg4", path.join(dir, "sar.mp4")], { windowsHide: true });
  cp.execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-t", "1",
    "-c:v", "mpeg4", path.join(dir, "square.mp4")], { windowsHide: true });
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test("parseProbe: width × height is the display size; the stored size beside it, only when they differ", () => {
  const fmt = { format_name: "mov,mp4", duration: "60" };
  const v = (o) => ({ codec_type: "video", codec_name: "h264", avg_frame_rate: "30/1", ...o });
  // the trial's replay
  const r = MediaLib.parseProbe({ format: fmt, streams: [v({ width: 1080, height: 1920, sample_aspect_ratio: "896:405" })] });
  a.deepEqual([r.width, r.height, r.storedWidth, r.storedHeight], [2389, 1920, 1080, 1920]);
  // square pixels, or none said: as before, nothing extra
  for (const sar of ["1:1", "0:1", "N/A", undefined]) {
    const s = MediaLib.parseProbe({ format: fmt, streams: [v({ width: 1920, height: 1080, sample_aspect_ratio: sar })] });
    a.deepEqual([s.width, s.height, s.storedWidth, s.storedHeight], [1920, 1080, undefined, undefined], String(sar));
  }
  // phone footage turned 90°: the display size turns with it, and so does the stored one
  const t = MediaLib.parseProbe({ format: fmt, streams: [v({ width: 1080, height: 1920, sample_aspect_ratio: "896:405", side_data_list: [{ rotation: -90 }] })] });
  a.deepEqual([t.width, t.height, t.storedWidth, t.storedHeight], [1920, 2389, 1920, 1080]);
  a.ok(MediaLib.INFO_KEYS.includes("storedWidth") && MediaLib.INFO_KEYS.includes("storedHeight"), "kept on the entry with the other details");
});

test("what an agent reads: 2389×1920, then 'stored as 1080×1920'", () => {
  const m = { id: "m1", kind: "video", name: "replay.mp4", src: "/media/replay.mp4", width: 2389, height: 1920, storedWidth: 1080, storedHeight: 1920, duration: 60 };
  a.equal(MediaLib.fmtRes(m), "2389×1920 (stored as 1080×1920)");
  a.equal(MediaLib.fmtRes({ width: 1920, height: 1080 }), "1920×1080");
  a.match(ProjectOps.compactView({ name: "p", width: 1080, height: 1920, fps: 30, media: [m], clips: [] }), /2389×1920 \(stored as 1080×1920\)/);
});

test("a real file with non-square pixels: probed at its display size", { skip }, async () => {
  const i = await MediaProbe.probeFile(path.join(dir, "sar.mp4"));
  a.deepEqual([i.width, i.height, i.storedWidth, i.storedHeight], [239, 192, 108, 192]);
  const sq = await MediaProbe.probeFile(path.join(dir, "square.mp4"));
  a.deepEqual([sq.width, sq.height, sq.storedWidth], [160, 90, undefined]);
});

test("an entry that already has the stored size (imported before) is corrected to the display size; one with another size is left alone", () => {
  const info = { width: 2389, height: 1920, storedWidth: 1080, storedHeight: 1920 };
  const old = MediaProbe.infoForEntry(info, { kind: "video", width: 1080, height: 1920 });
  a.deepEqual([old.width, old.height, old.storedWidth, old.storedHeight], [2389, 1920, 1080, 1920]);
  const fresh = MediaProbe.infoForEntry(info, { kind: "video" });
  a.deepEqual([fresh.width, fresh.height], [2389, 1920]);
  const browser = MediaProbe.infoForEntry(info, { kind: "video", width: 2389, height: 1920 });
  a.equal(browser.width, undefined, "the browser's display size is already right");
  // the editor's own reading follows the same rule
  const m = { kind: "video", src: "/media/r.mp4", width: 1080, height: 1920 };
  a.equal(MediaLib.displaySize(m, info), true);
  a.deepEqual([m.width, m.height], [2389, 1920]);
  a.equal(MediaLib.displaySize(m, info), false, "once");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.match(app, /MediaLib\.displaySize\(m, i\)/, "refreshMediaInfo uses it");
});

/* The agent's backfill goes through MediaLib.applyBackfill (#152: the server, or the open editor, merges it), so the
   sizes ride in the same updates as the lengths. */
test("applyBackfill: the display size and the stored one, once, for a video with no stored size yet", () => {
  const doc = { media: [
    { id: "m_r", kind: "video", src: "/media/r.mp4", duration: 20, width: 1080, height: 1920 },
    { id: "m_n", kind: "video", src: "/media/n.mp4", width: 1080, height: 1920 },
    { id: "m_x", kind: "video", src: "/media/x-relinked.mp4", width: 1080, height: 1920 },
  ] };
  const size = { width: 2389, height: 1920, storedWidth: 1080, storedHeight: 1920 };
  const n = MediaLib.applyBackfill(doc, [
    { id: "m_r", src: "/media/r.mp4", ...size },
    { id: "m_n", src: "/media/n.mp4", duration: 3, ...size },
    { id: "m_x", src: "/media/x.mp4", ...size },
  ]);
  a.equal(n, 3, "m_r: size · m_n: length and size · m_x: another file now, left alone");
  a.deepEqual([doc.media[0].width, doc.media[0].storedWidth, doc.media[0].duration], [2389, 1080, 20]);
  a.deepEqual([doc.media[1].width, doc.media[1].storedHeight, doc.media[1].duration], [2389, 1920, 3]);
  a.equal(doc.media[2].storedWidth, undefined);
  a.equal(MediaLib.applyBackfill(doc, [{ id: "m_r", src: "/media/r.mp4", ...size }]), 0, "once");
  a.equal(MediaLib.applyBackfill(doc, [{ id: "m_x", src: "/media/x-relinked.mp4", ...size, storedWidth: "1080" }]), 0, "sizes must be whole pixels");
});

/* An entry already in a project (europa: the replay imported as 1080×1920) is put right on the agent's next call,
   no editor needed — the same pass that reads missing lengths (mcp-server backfillDurations). */
test("no editor open: an entry with the stored size gets the display size when the agent reads the project", { skip }, async (t) => {
  const { makeDataDir, seedProject, startMcp, readProject } = require("./helpers");
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.copyFileSync(path.join(dir, "sar.mp4"), path.join(data, "media", "replay.mp4"));
  fs.copyFileSync(path.join(dir, "square.mp4"), path.join(data, "media", "sq.mp4"));
  const proj = readProject(data);
  proj.media = [
    { id: "m_r", name: "replay.mp4", kind: "video", src: "/media/replay.mp4", duration: 1, width: 108, height: 192, size: 1 },
    { id: "m_s", name: "sq.mp4", kind: "video", src: "/media/sq.mp4", duration: 1, width: 160, height: 90, size: 1 },
  ];
  proj.revision = 3;
  fs.writeFileSync(path.join(data, "project.json"), JSON.stringify(proj));
  // no editor: a port nothing listens on, so the backfill is refused and written directly (#152). Not startMcp's
  // FABLECUT_PORT "0": http to port 0 goes to port 80, which a CI runner may answer (Windows CI: never written)
  const closedPort = await new Promise((r) => { const s = require("node:net").createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1", FABLECUT_PORT: String(closedPort) });
  await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  await mcp.callTool("fablecut_get_project", { compact: true });
  // #152: the call waits at most BACKFILL_WAIT_MS; a slower ffprobe (a cold CI runner) writes it in the background
  for (const t0 = Date.now(); readProject(data).media[0].storedWidth == null && Date.now() - t0 < 30_000;) await new Promise((r) => setTimeout(r, 100));
  const view = await mcp.callTool("fablecut_get_project", { compact: true });
  a.match(view.text, /239×192 \(stored as 108×192\)/, view.text);
  const after = readProject(data);
  a.deepEqual([after.media[0].width, after.media[0].height, after.media[0].storedWidth], [239, 192, 108]);
  a.deepEqual([after.media[1].width, after.media[1].storedWidth], [160, undefined], "square pixels: left as they were");
  const rev = after.revision;
  await mcp.callTool("fablecut_get_project", { compact: true });
  a.equal(readProject(data).revision, rev, "put right once, not on every call");
});
