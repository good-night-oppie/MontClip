/* What worked in the europa trial and must keep working (JJ, 2026-11-05: 「保持住」). Each is locked here through the
   tool an agent calls, with made-up material — no recording, no voice:
     · a hard-linked import of a big file is instant and makes no second copy (8.2 GB replay: instant; upload: 6.7 min);
     · fablecut_songs says "possibly singing", never more sure than that (likely / estimated, never "sure");
     · fablecut_beats finds the tempo and the first beat (the trial's song: 112.3 BPM, first beat 0.343 s). */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const FF = require("../server/ffmpeg-path");
const { makeDataDir, seedProject, startMcp, readProject } = require("./helpers");
const { wav: songWav } = require("./songs-synth");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const skip = !have && "no ffmpeg / ffprobe here (node desktop/fetch-ffmpeg.cjs, or MONTCLIP_FFMPEG_DIR)";
const init = (mcp) => mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });

test("a 200 MB file imported with link:true: the same file (no second copy on disk), in a moment", { skip }, async (t) => {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "mc-big-"));
  t.after(() => fs.rmSync(src, { recursive: true, force: true }));
  const big = path.join(src, "replay.mkv");
  const fd = fs.openSync(big, "w");
  const block = Buffer.alloc(1 << 20, 0x5a);            // 200 MB of filler: not a recording, so its length is unknown
  for (let i = 0; i < 200; i++) fs.writeSync(fd, block);
  fs.closeSync(fd);
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1" });
  await init(mcp);
  const t0 = Date.now();
  const r = await mcp.callTool("fablecut_import_media", { path: big, link: true });
  const took = Date.now() - t0;
  a.equal(r.isError, false, r.text);
  a.ok(took < 10_000, `took ${took} ms — a copy of 200 MB would be slower; a link is instant`);
  const inMedia = path.join(data, "media", "replay.mkv");
  const ino = (f) => fs.statSync(f, { bigint: true }).ino;
  a.equal(ino(inMedia), ino(big), "the same file on disk");
  a.ok(fs.statSync(big).nlink >= 2, "two names, one copy");
  a.equal(readProject(data).media.at(-1).src, "/media/replay.mkv");
});

test("fablecut_songs on made-up singing between talk: finds them, and says no more than 'possibly' (likely / estimated)", { skip }, async (t) => {
  // the plan test/song-scan.test.js uses: songs 60–200 s and 280–430 s
  const PLAN = [["talk", 60], ["song", 140], ["talk", 80], ["song", 150], ["talk", 50]];
  const proj = seedProject({ media: [{ id: "m_r", name: "rec.wav", kind: "audio", src: "/media/rec.wav", duration: 480 }],
    clips: [{ id: "c_r", mediaId: "m_r", kind: "audio", track: "A1", start: 0, in: 0, duration: 480 }] });
  const data = makeDataDir(t, proj);
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.writeFileSync(path.join(data, "media", "rec.wav"), songWav(PLAN));
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1" });
  await init(mcp);
  const r = await mcp.callTool("fablecut_songs", {});
  a.equal(r.isError, false, r.text);
  a.match(r.text, /2 songs/);
  a.doesNotMatch(r.text, /\b(sure|certain|definitely|confirmed)\b|确定|肯定|准/i, "never more sure than the scan is");
  const e = readProject(data).songs.m_r;
  a.equal(e.songs.length, 2);
  for (const s of e.songs) a.ok(["likely", "estimated"].includes(s.confidence), s.confidence);
  const near = (x, y) => Math.abs(x - y) <= 3;
  a.ok(near(e.songs[0].from, 60) && near(e.songs[0].to, 200), JSON.stringify(e.songs[0]));
  a.ok(near(e.songs[1].from, 280) && near(e.songs[1].to, 430), JSON.stringify(e.songs[1]));
  // what the agent is told the tool does: possibly singing
  const tool = require("../server/mcp-tools").find((x) => x.name === "fablecut_songs");
  a.match(tool.description, /possibly|may be|likely/i);
  a.match(require("../shared/capabilities").get("fablecut_songs").summary["zh-CN"], /可能在唱歌/);
});

/** A kick drum at `bpm` from `at` seconds: a 60 Hz thump decaying over ~0.1 s, as 16-bit mono WAV. */
function kicks({ bpm, at, secs, sr = 22050 }) {
  const n = Math.round(secs * sr), pcm = Buffer.alloc(n * 2), x = new Float32Array(n);
  for (let t = at; t < secs - 0.3; t += 60 / bpm) {
    const i0 = Math.round(t * sr);
    for (let j = 0; j < 0.25 * sr && i0 + j < n; j++) x[i0 + j] += Math.sin(2 * Math.PI * 60 * j / sr) * Math.exp(-j / (0.1 * sr)) * 0.9;
  }
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

test("fablecut_beats on a made-up kick track at the trial song's tempo: 112.3 BPM, the first beat at 0.343 s", { skip }, async (t) => {
  const BPM = 112.3, AT = 0.343, SECS = 40;
  const proj = seedProject({ media: [{ id: "m_k", name: "kick.wav", kind: "audio", src: "/media/kick.wav", duration: SECS }],
    clips: [{ id: "c_k", mediaId: "m_k", kind: "audio", track: "A1", start: 0, in: 0, duration: SECS }] });
  const data = makeDataDir(t, proj);
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.writeFileSync(path.join(data, "media", "kick.wav"), kicks({ bpm: BPM, at: AT, secs: SECS }));
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1" });
  await init(mcp);
  const r = await mcp.callTool("fablecut_beats", { clipId: "c_k" });
  a.equal(r.isError, false, r.text);
  const bpm = Number((/([\d.]+) BPM/.exec(r.text) || [])[1]);
  a.ok(Math.abs(bpm - BPM) <= 0.5, "tempo " + bpm + " BPM: " + r.text.split("\n")[0]);
  const beats = ((/Beats \(timeline\): ([^\n…]+)/.exec(r.text) || [])[1] || "").trim().split(/\s+/).map(Number);
  a.ok(Math.abs(beats[0] - AT) <= 0.03, "first beat " + beats[0] + " s");
  const per = 60 / BPM;
  a.ok(beats.slice(0, 20).every((b, i) => Math.abs(b - (AT + i * per)) <= 0.04), "on the kicks: " + beats.slice(0, 8).join(" "));
  a.equal(readProject(data).revision, proj.revision, "reporting changes nothing");
});
