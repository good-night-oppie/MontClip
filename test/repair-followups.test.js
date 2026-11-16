/* Rea's review of #152 (5780386186), for the repair PR (Deja, 2026-11-05):
   1. a truncated H.264 MKV (what OBS leaves after a crash) is in 〔帮我修好〕's reach: its export failed with
      "presented frame timeout", and a plain remux fixed it. test/fixtures/truncated-h264/obs-crash.mkv is made with a
      test picture and a 1 kHz tone, no people: ffmpeg's testsrc 160×90 30 fps + sine, 6 s, H.264 (h264_mf, keyframe
      every 30) + AAC, written to a pipe as Matroska (so no length anywhere), the last 40 % cut off; sha256 in
      SHA256SUMS.txt. Committed so Linux, which has no H.264 encoder, runs it too.
   2. analyze.probe is cached per file version: fablecut_frame on a truncated file read every packet on every call.
   3. the agent's backfill of missing lengths never holds fablecut_status up: probes run side by side, and what takes
      longer than a moment finishes in the background.
   4. a sound file nothing can read the length of is not called a video, and gets no 〔帮我修好〕 (it repairs videos). */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto"), cp = require("node:child_process");
const FF = require("../server/ffmpeg-path");
const MediaLib = require("../media-lib");
const { makeDataDir, seedProject, startMcp, startServer, readProject } = require("./helpers");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const skip = !have && "no ffmpeg / ffprobe here (node desktop/fetch-ffmpeg.cjs, or MONTCLIP_FFMPEG_DIR)";
const FIX = path.join(__dirname, "fixtures", "truncated-h264");
const OBS = path.join(FIX, "obs-crash.mkv");
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const init = (mcp) => mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });

test("the fixture is the one recorded in SHA256SUMS.txt", () => {
  const want = fs.readFileSync(path.join(FIX, "SHA256SUMS.txt"), "utf8").trim().split(/\s+/)[0];
  a.equal(sha(OBS), want);
});

test("a truncated H.264 MKV (OBS after a crash): marked 'seeking may be slow', and 〔帮我修好〕 remuxes it — nothing re-encoded", { skip }, async () => {
  const MediaProbe = require("../server/media-probe");
  const raw = JSON.parse(cp.execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", OBS], { encoding: "utf8", windowsHide: true }));
  a.equal(raw.format.duration, undefined, "ffprobe: no length in the header");
  a.deepEqual(raw.streams.map((s) => s.codec_name).sort(), ["aac", "h264"]);
  const info = await MediaProbe.probeFile(OBS);
  a.equal(info.durationFrom, "packets");
  a.ok(info.duration > 3 && info.duration < 4, info.duration + " s");
  const entry = { kind: "video", ...MediaProbe.infoForEntry(info, { kind: "video" }) };
  a.equal(MediaLib.slowToSeek(entry), true, "the ◔ mark and 〔帮我修好…〕");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-obs-"));
  try {
    const src = path.join(dir, "obs.mkv");
    fs.copyFileSync(OBS, src);
    const before = sha(src);
    const r = await require("../server/make-editable").makeEditable(src, { outDir: dir, encoders: async () => [] });   // no encoder needed
    a.equal(r.preparation, "remux");
    a.ok(Math.abs(r.duration - info.duration) <= 1, r.duration + " s vs " + info.duration + " s");
    const out = JSON.parse(cp.execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", r.file], { encoding: "utf8", windowsHide: true }));
    a.deepEqual(out.streams.map((s) => s.codec_name).sort(), ["aac", "h264"], "the same streams, copied");
    a.ok(Number(out.format.duration) > 3, "the new file says its length");
    a.equal(sha(src), before, "the original is untouched");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fablecut_frame on a truncated file reads its packets once, not on every call (cached per file version)", { skip }, async () => {
  const MediaProbe = require("../server/media-probe");
  const Analyze = require("../server/analyze");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-probe-"));
  const real = MediaProbe.packetDuration;
  let scans = 0;
  MediaProbe.packetDuration = (...x) => { scans++; return real(...x); };
  try {
    const f = path.join(dir, "obs.mkv");
    fs.copyFileSync(OBS, f);
    await Analyze.frame(f, { t: 1, width: 160, stats: false });
    await Analyze.frame(f, { t: 2, width: 160, stats: false });
    await Analyze.frame(f, { t: 0.5, width: 160, stats: false });
    a.equal(scans, 1, "one packet scan for three frames");
    // another version of the file (it grew, or was replaced): read again
    fs.appendFileSync(f, Buffer.alloc(16));
    await Analyze.frame(f, { t: 1, width: 160, stats: false });
    a.equal(scans, 2);
  } finally { MediaProbe.packetDuration = real; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fablecut_status is not held up by slow probes: they run side by side and finish in the background", { skip }, async (t) => {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  const proj = readProject(data);
  proj.media = [];
  for (let i = 0; i < 4; i++) {
    fs.copyFileSync(OBS, path.join(data, "media", `rec${i}.mkv`));
    proj.media.push({ id: "m_" + i, name: `rec${i}.mkv`, kind: "video", src: `/media/rec${i}.mkv`, size: 1 });
  }
  fs.writeFileSync(path.join(data, "project.json"), JSON.stringify(proj));
  // tests only: each ffprobe run waits 3 s first — four of them one after another would hold status for 12 s
  const srv = await startServer(t, data, { FABLECUT_NO_FS_WATCH: "1" });
  const mcp = startMcp(t, data, { FABLECUT_PORT: String(srv.port), FABLECUT_NO_AUTOSTART: "1", FABLECUT_TEST_PROBE_DELAY_MS: "3000" });
  await init(mcp);
  const t0 = Date.now();
  const s = await mcp.callTool("fablecut_status", {});
  const took = Date.now() - t0;
  a.ok(took < 2500, `status answered in ${took} ms`);
  a.ok(typeof s.text === "string");
  // the lengths still arrive, written once the probes are done
  let doc;
  for (const end = Date.now() + 30_000; Date.now() < end;) {
    doc = readProject(data);
    if (doc.media.every((m) => m.duration > 0)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  a.ok(doc.media.every((m) => m.duration > 3 && m.durationFrom === "packets"), JSON.stringify(doc.media.map((m) => m.duration)) + "\n" + mcp.stderr);
});

test("a sound file nothing can read the length of: not called a video, no 〔帮我修好〕 button (it repairs videos)", () => {
  const V = require("../ui-preferences");
  for (const k of ["own.media-incomplete-audio", "own.media-duration-unknown-audio", "own.media-duration-unknown-n-mixed"]) {
    const zh = V.t("zh-CN", k, { name: "录音.m4a", n: 3 }), en = V.t("en", k, { name: "rec.m4a", n: 3 });
    a.doesNotMatch(zh, /视频|帮我修好|undefined/, k);
    a.doesNotMatch(en, /video|Fix it for me|undefined/i, k);
  }
  const app = fs.readFileSync(path.join(__dirname, "..", "app/app.js"), "utf8");
  const line = app.split("\n").find((l) => l.includes("const incomplete = repairHtml"));
  a.ok(line && line.includes('m.kind === "video"') && line.includes("own.media-incomplete-audio"), "the button only on a video; a sound file's own words");
  a.ok(app.includes('"own.media-duration-unknown-audio"') && app.includes('"own.media-duration-unknown-n-mixed"'), "the toasts pick the words by kind");
});
