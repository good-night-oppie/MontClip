/* 〔修复成可以剪的视频〕 (JJ, P3, 2026-11-05; Deja). A recording cut off mid-way, or any video MontClip can't cut as it
   is, becomes a new MP4 beside it: the original is never touched, the new file takes the entry's place in the project
   (one undo step in the editor), first a quick remux (-c copy), a re-encode only when that doesn't hold. Agents use
   fablecut_repair_media {mediaId}: it answers at once with a job; the same call, {job}, says how far it got; {cancel}
   stops it. The files are made here, with MontClip's own ffmpeg, no people in them. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process"), crypto = require("node:crypto");
const FF = require("../ffmpeg-path");
const MediaLib = require("../media-lib");
const { makeDataDir, seedProject, startMcp, startServer, readProject } = require("./helpers");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const skip = !have && "no ffmpeg / ffprobe here (node desktop/fetch-ffmpeg.cjs, or MONTCLIP_FFMPEG_DIR)";
const LENGTH = 4;
let dir = null;
const made = (name) => path.join(dir, name);
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const probe = (file) => JSON.parse(cp.execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { encoding: "utf8", windowsHide: true }));
function live(enc, fmt, seconds = LENGTH) {
  const ff = FF.path("ffmpeg"), opts = { windowsHide: true, maxBuffer: 1 << 28 };
  const raw = cp.execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
    "-t", String(seconds), "-c:v", "rawvideo", "-c:a", "pcm_s16le", "-f", "nut", "pipe:1"], opts);
  return cp.execFileSync(ff, ["-v", "error", "-f", "nut", "-i", "pipe:0", ...enc, "-threads", "1", "-f", fmt, "pipe:1"], { ...opts, input: raw });
}
const cut = (buf) => buf.subarray(0, Math.floor(buf.length * 0.6));

test.before(() => {
  if (!have) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-repair-"));
  fs.writeFileSync(made("cut.webm"), cut(live(["-an", "-c:v", "libvpx", "-b:v", "300k"], "webm")));
  fs.writeFileSync(made("cut.mkv"), cut(live(["-c:v", "mpeg4", "-c:a", "aac"], "matroska")));
  fs.writeFileSync(made("long.webm"), live(["-an", "-c:v", "libvpx", "-b:v", "300k"], "webm", 40));
  const SRC = ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
    "-t", String(LENGTH), "-threads", "1"];
  cp.execFileSync(FF.path("ffmpeg"), [...SRC, "-c:v", "mpeg4", "-c:a", "aac", made("whole.mp4")], { windowsHide: true });
  fs.writeFileSync(made("cut.mp4"), cut(fs.readFileSync(made("whole.mp4"))));
  // an FLV whose codecs can't go into an MP4 as they are (the FLV1 picture): converted, without allowTranscode
  cp.execFileSync(FF.path("ffmpeg"), [...SRC, "-c:v", "flv", "-c:a", "aac", made("old.flv")], { windowsHide: true });
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

const makeEditable = (...x) => require("../make-editable").makeEditable(...x);
const playsFor = (file) => Number(probe(file).format.duration);

test("cut.webm (VP8, cut off): a new MP4 with its length in the header; VP8 can't go into an MP4, so re-encoded", { skip }, async () => {
  const before = sha(made("cut.webm"));
  const seen = [];
  const r = await makeEditable(made("cut.webm"), { outDir: dir, onProgress: (p, phase) => seen.push([p, phase]) });
  a.equal(sha(made("cut.webm")), before, "the original is untouched");
  a.equal(path.extname(r.file), ".mp4");
  a.notEqual(path.resolve(r.file), path.resolve(made("cut.webm")));
  a.equal(probe(r.file).format.format_name.includes("mp4"), true);
  a.ok(r.duration > 1.5 && r.duration < LENGTH, "usable part " + r.duration + " s");
  a.ok(Math.abs(playsFor(r.file) - r.duration) < 0.2, "its header says it");
  a.equal(r.preparation, "transcode");
  a.ok(["h264", "vp9"].includes(probe(r.file).streams.find((s) => s.codec_type === "video").codec_name));
  a.ok(seen.length >= 2 && seen.every(([p]) => p >= 0 && p <= 1), "progress 0…1");
  a.ok(seen.some(([, ph]) => ph === "remux") && seen.some(([, ph]) => ph === "transcode"), "tried the remux first: " + JSON.stringify(seen.map((s) => s[1])));
  a.deepEqual(fs.readdirSync(dir).filter((f) => /\.part/.test(f)), [], "no half-written file left");
});

test("cut.mkv (MPEG-4 + AAC, cut off): the quick remux holds, nothing re-encoded", { skip }, async () => {
  const r = await makeEditable(made("cut.mkv"), { outDir: dir });
  a.equal(r.preparation, "remux");
  a.ok(r.duration > 1.5 && r.duration < LENGTH, "usable part " + r.duration + " s");
  a.equal(probe(r.file).streams.find((s) => s.codec_type === "video").codec_name, "mpeg4");
});

test("cut.mp4 (index never written): too damaged — REPAIR_FAILED, nothing written", { skip }, async () => {
  const before = fs.readdirSync(dir).length;
  await a.rejects(makeEditable(made("cut.mp4"), { outDir: dir }), (e) => e.code === "REPAIR_FAILED");
  a.equal(fs.readdirSync(dir).length, before);
});

test("an FLV that needs converting: made editable without allowTranscode (the click is the yes)", { skip }, async () => {
  const r = await makeEditable(made("old.flv"), { outDir: dir });
  a.equal(path.extname(r.file), ".mp4");
  a.ok(Math.abs(r.duration - LENGTH) < 0.3, r.duration + " s");
  a.equal(r.preparation, "transcode");
});

test("cancelled while it runs: REPAIR_CANCELLED, no file left behind", { skip }, async () => {
  const ac = new AbortController();
  const before = new Set(fs.readdirSync(dir));
  const p = makeEditable(made("long.webm"), { outDir: dir, signal: ac.signal, onProgress: (_p, phase) => { if (phase === "transcode") ac.abort(); } });
  await a.rejects(p, (e) => e.code === "REPAIR_CANCELLED");
  a.deepEqual(fs.readdirSync(dir).filter((f) => !before.has(f)), [], "nothing new in the folder");
});

test("MediaLib.swapMedia: the new entry takes the old one's place everywhere — clips, comps, other sequences, collections", () => {
  const old = { id: "m1", kind: "video", name: "rec.webm", src: "/media/rec.webm", favorite: true, tags: ["day 1"], folderId: "f1" };
  const root = {
    media: [{ id: "m0", kind: "audio", src: "/media/a.mp3" }, old],
    clips: [{ id: "c1", mediaId: "m1", kind: "video", start: 0, in: 0, duration: 2 }, { id: "c2", mediaId: "m0", kind: "audio", start: 0, in: 0, duration: 1 }],
    comps: [{ id: "k", clips: [{ id: "kc", mediaId: "m1", kind: "video", start: 0, in: 0, duration: 1 }] }],
    sequences: [{ id: "main" }, { id: "s2", clips: [{ id: "sc", mediaId: "m1", kind: "audio", start: 0, in: 1, duration: 9 }] }],
    collections: [{ id: "col", name: "Selects", media: ["m1", "m0"] }],
  };
  const entry = { id: "m2", kind: "video", name: "rec.repaired.mp4", src: "/media/rec.repaired.mp4", duration: 3 };
  const r = MediaLib.swapMedia(root, "m1", entry);
  a.equal(r.clips, 3);
  a.deepEqual(root.media.map((m) => m.id), ["m0", "m2"], "in the old one's place");
  const m2 = root.media[1];
  a.equal(m2.derivedFrom, "m1");
  a.deepEqual(m2.replaced, { id: "m1", name: "rec.webm", src: "/media/rec.webm" });
  a.equal(m2.favorite, true); a.deepEqual(m2.tags, ["day 1"]); a.equal(m2.folderId, "f1");
  a.equal(root.clips[0].mediaId, "m2"); a.equal(root.clips[1].mediaId, "m0");
  a.equal(root.comps[0].clips[0].mediaId, "m2");
  a.equal(root.sequences[1].clips[0].mediaId, "m2");
  a.ok(root.sequences[1].clips[0].in + root.sequences[1].clips[0].duration <= 3 + 1e-6, "fitted to the usable part");
  a.deepEqual(root.collections[0].media, ["m2", "m0"]);
});

/* JJ 定稿 (2026-11-05, via Deja): one button, 〔帮我修好〕 / "Fix it for me", for every repair and conversion — the
   old 〔修复成可以剪的视频〕 and 〔帮我转成可以剪的视频〕 are gone. */
test("the words: JJ's, word for word (the English of the mark and the progress lines are drafts)", () => {
  const V = require("../ui-preferences");
  a.equal(V.t("zh-CN", "own.repair-button"), "帮我修好");
  a.equal(V.t("en", "own.repair-button"), "Fix it for me");
  a.equal(V.t("zh-CN", "own.repair-menu"), "帮我修好…");
  a.equal(V.t("en", "own.repair-menu"), "Fix it for me…");
  a.equal(V.t("zh-CN", "own.repair-done"), "修好了。时间线上用到它的片段已经换成修好的这份，位置没变；原文件还在。");
  a.equal(V.t("en", "own.repair-done"), "Fixed. Clips that use it now use the fixed copy, in the same place. The original is still there.");
  a.equal(V.t("zh-CN", "own.repair-failed", { name: "录屏.mp4" }), "「录屏.mp4」录到一半就停了，没存好，这种修不了。原文件没有改动，请换一个完整的文件。");
  a.equal(V.t("en", "own.repair-failed", { name: "rec.mp4" }), "\"rec.mp4\" stopped recording before it was saved, and this kind can't be fixed. The original file is unchanged — please use a complete file.");
  a.equal(V.t("zh-CN", "own.media-slow-mark"), "没录完整，拖动可能会慢。右键〔帮我修好〕，会另存一份完整的。");
  // with the button there, the two toasts end with JJ's "try it" (curly quotes round the button's name in English)
  a.equal(V.t("zh-CN", "own.media-duration-unknown", { name: "录屏.webm" }), "「录屏.webm」可能没录完整（比如录屏中途停了），读不出有多长，现在还剪不了。原文件没有改动。点〔帮我修好〕试试。");
  a.equal(V.t("en", "own.media-duration-unknown", { name: "rec.webm" }), "\"rec.webm\" may not have finished recording (for example, a screen recording that was stopped), so its length can't be read and it can't be edited yet. The original file is unchanged. Click “Fix it for me” to try.");
  a.equal(V.t("zh-CN", "own.media-duration-unknown-n", { n: 3 }), "有 3 个视频可能没录完整，读不出有多长，现在还剪不了。原文件都没有改动。点〔帮我修好〕试试。");
  a.equal(V.t("en", "own.media-duration-unknown-n", { n: 3 }), "3 videos may not have finished recording, so their length can't be read and they can't be edited yet. The original files are unchanged. Click “Fix it for me” to try.");
  for (const k of ["own.repair-progress", "own.repair-cancel", "own.repair-button-tip", "own.media-slow-mark", "own.repair-encoder-missing"]) {
    a.doesNotMatch(V.t("en", k, { n: 40, name: "x" }), /[一-鿿]|undefined/, k);
    a.doesNotMatch(V.t("zh-CN", k, { n: 40, name: "x" }), /undefined|NaN/, k);
  }
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), ui = fs.readFileSync(path.join(__dirname, "..", "ui-preferences.js"), "utf8");
  for (const old of ["修复成可以剪的视频", "帮我转成可以剪的视频", "Repair into a video", "Convert to a video you can cut", "own.convert-menu"])
    a.ok(!app.includes(old) && !ui.includes(old), "the old name is gone: " + old);
  const line = (s) => app.split("\n").filter((l) => l.includes(s));
  a.ok(line("MediaLib.cannotCut(m)").some((l) => l.includes("own.repair-button")), "the button sits on a file that can't be cut");
  const errorBranch = app.match(/  const errorKey = \{ REPAIR_ENCODER_MISSING:[\s\S]*?toast\(uiText\([^\n]+\n/);
  a.ok(errorBranch, "the editor routes repair errors to localized text");
  for (const [code, key] of [["REPAIR_ENCODER_MISSING", "own.repair-encoder-missing"], ["REPAIR_FAILED", "own.repair-failed"], ["GAP_EDIT_CONFLICT", "own.repair-gap-conflict"]]) {
    let result;
    new Function("j", "m", "uiText", "toast", errorBranch[0])({ error: { code } }, { name: "rec.mp4" }, (k, args) => ({ k, args }), value => { result = value; });
    a.deepEqual(result, { k: key, args: { name: "rec.mp4" } });
  }
  a.ok(app.includes("/api/repair"), "the editor runs it on the server");
  a.ok(app.includes("MediaLib.swapMedia("), "and swaps the entry the same way the agent's does");
});

/* JJ (cases 1 and 2): a recording that plays but was cut off — its length read from its packets — can already be cut,
   only seeking may be slow. No dialog: a small mark on the file with JJ's hint, and 〔帮我修好…〕 in its menu. */
test("a file whose length came from its packets: marked 'seeking may be slow' on the entry; the editor shows the mark", { skip }, async () => {
  const MediaProbe = require("../media-probe");
  const info = await MediaProbe.probeFile(made("cut.webm"));
  const e = MediaProbe.infoForEntry(info, { kind: "video" });
  a.equal(e.durationFrom, "packets", "kept on the entry");
  a.equal(MediaLib.slowToSeek({ kind: "video", duration: 2, durationFrom: "packets" }), true);
  a.equal(MediaLib.slowToSeek({ kind: "video", duration: 2 }), false);
  a.equal(MediaLib.slowToSeek({ kind: "video", durationUnknown: true }), false, "that one can't be cut at all: the other mark");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.ok(app.split("\n").some((l) => l.includes("MediaLib.slowToSeek(m)") && l.includes("own.media-slow-mark")), "the mark and its hint");
  a.ok(app.includes('uiText("own.repair-menu")'), "〔帮我修好…〕 in the file's menu");
});

test("no encoder can take it: refused (REPAIR_ENCODER_MISSING), nothing written", { skip }, async () => {
  const before = new Set(fs.readdirSync(dir));
  await a.rejects(makeEditable(made("cut.webm"), { outDir: dir, encoders: async () => [] }), (e) => e.code === "REPAIR_ENCODER_MISSING");
  a.deepEqual(fs.readdirSync(dir).filter((f) => !before.has(f)), [], "nothing new in the folder");
});

test("the check after a remux is ±1 s against what the original holds, not more", () => {
  const { lengthHolds } = require("../make-editable");
  a.equal(lengthHolds(100, 100.9), true);
  a.equal(lengthHolds(100, 101.2), false, "1.2 s off is not the same recording");
  a.equal(lengthHolds(7200, 7201.5), false, "not a share of a long one either");
  a.equal(lengthHolds(0, 3), true, "nothing to compare with: the new file's own length");
});

async function mcpWith(t, files) {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  for (const [from, to] of files) fs.copyFileSync(made(from), path.join(data, "media", to));
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  return { data, mcp };
}
const jobOf = (text) => JSON.parse(text.slice(text.indexOf("{"))).job;
async function until(mcp, job, ms = 60_000) {
  const end = Date.now() + ms;
  for (;;) {
    const r = await mcp.callTool("fablecut_repair_media", { job });
    const s = JSON.parse(r.text.slice(r.text.indexOf("{")));
    if (!["pending", "running"].includes(s.status)) return s;
    if (Date.now() > end) throw new Error("still running: " + r.text);
    await new Promise((res) => setTimeout(res, 200));
  }
}

test("fablecut_repair_media: a job at once; the same call again is the same job; done → a new mediaId in the old one's place", { skip }, async (t) => {
  const { data, mcp } = await mcpWith(t, [["cut.mp4", "dead.mp4"]]);
  // the cut MP4 can't be repaired; the cut WebM can — import both the normal way
  const w = await mcp.callTool("fablecut_import_media", { path: made("cut.webm") });
  a.equal(w.isError, false, w.text);
  const old = readProject(data).media.at(-1);
  const t0 = Date.now();
  const r = await mcp.callTool("fablecut_repair_media", { mediaId: old.id });
  a.equal(r.isError, false, r.text);
  a.ok(Date.now() - t0 < 5000, "answers at once");
  const job = jobOf(r.text);
  a.match(job, /^r_/);
  const again = await mcp.callTool("fablecut_repair_media", { mediaId: old.id });
  a.equal(jobOf(again.text), job, "a second call joins the running job, nothing is started twice");
  const s = await until(mcp, job);
  a.equal(s.status, "done", JSON.stringify(s));
  a.ok(s.result && s.result.mediaId && s.result.mediaId !== old.id, "a new mediaId");
  a.ok(s.result.duration > 1.5);
  const proj = readProject(data);
  a.equal(proj.media.some((m) => m.id === old.id), false, "the old entry is replaced");
  const neu = proj.media.find((m) => m.id === s.result.mediaId);
  a.equal(neu.derivedFrom, old.id);
  a.match(neu.src, /\.mp4$/);
  a.ok(fs.existsSync(path.join(data, "media", decodeURIComponent(old.src.slice(7)))), "the original file is still there");
  const ins = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "insert", mediaId: neu.id, at: 0 }] });
  a.equal(ins.isError, false, ins.text);
});

test("fablecut_repair_media: one too damaged fails with JJ's reason; {cancel} stops one", { skip }, async (t) => {
  const { data, mcp } = await mcpWith(t, []);
  const imp = await mcp.callTool("fablecut_import_media", { path: made("cut.mp4") });
  a.equal(imp.isError, false);
  const dead = readProject(data).media.at(-1);
  const s = await until(mcp, jobOf((await mcp.callTool("fablecut_repair_media", { mediaId: dead.id })).text));
  a.equal(s.status, "failed");
  a.equal(s.error.code, "REPAIR_FAILED");
  a.ok(readProject(data).media.some((m) => m.id === dead.id), "nothing replaced");

  await mcp.callTool("fablecut_import_media", { path: made("long.webm") });
  const longId = readProject(data).media.at(-1).id;
  const job = jobOf((await mcp.callTool("fablecut_repair_media", { mediaId: longId })).text);
  const c = await mcp.callTool("fablecut_repair_media", { cancel: job });
  a.equal(c.isError, false, c.text);
  const s2 = await until(mcp, job);
  a.equal(s2.status, "cancelled");
  a.ok(readProject(data).media.some((m) => m.id === longId), "nothing replaced");
});

test("the editor's server: POST /api/repair → a job; it ends with the new file's entry, the original untouched", { skip }, async (t) => {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.copyFileSync(made("cut.webm"), path.join(data, "media", "rec.webm"));
  const before = sha(path.join(data, "media", "rec.webm"));
  const srv = await startServer(t, data, { FABLECUT_NO_FS_WATCH: "1" });
  const start = await fetch(srv.base + "/api/repair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src: "/media/rec.webm" }) });
  a.equal(start.status, 200);
  const { job: id } = await start.json();
  let s;
  for (const end = Date.now() + 60_000; ;) {
    s = await (await fetch(srv.base + "/api/repair/job?id=" + encodeURIComponent(id))).json();
    if (!["pending", "running"].includes(s.status) || Date.now() > end) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  a.equal(s.status, "done", JSON.stringify(s));
  a.match(s.result.src, /^\/media\/.+\.mp4$/);
  a.ok(s.result.duration > 1.5);
  a.equal(s.result.kind, "video");
  a.equal(sha(path.join(data, "media", "rec.webm")), before);
  const nf = await fetch(srv.base + "/api/repair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src: "/media/nope.webm" }) });
  a.equal(nf.status, 404);
});
