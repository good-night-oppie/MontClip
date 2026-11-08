/* A recording whose timestamps don't start at 0 (Deja, from Rea's review 5780386186 of #152): an OBS MKV that starts at
   3600 s exported as 20 s of black, its sound 21 ms late, and the export said done with every check ticked.

   The file is made here with MontClip's own ffmpeg: 10 s of grey (luma ~100) with a white frame and a 20 ms 1 kHz beep
   at 1, 3.5, 6 and 8.5 s, H.264 (the first of the bundled build's H.264 encoders that works here) or else VP9, AAC
   sound, in MKV, timestamps from 3600 s (-output_ts_offset). It goes through the real export: the server, a headless
   Chrome / Edge running the editor, Fast export (VP9 + Opus WebM), the finished file read back with ffmpeg.
     1. the picture is there: every white frame within a frame of where the source has it; every beep within a frame of
        its white frame;
     2. the self-check: an export that came out black and silent while that footage is not must not be done, and must
        say why;
     3. what the probe reads (start, audioOffset) and what the self-check makes of black / silent files, without a browser. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process");
const FF = require("../ffmpeg-path");
const MediaLib = require("../media-lib");
const MediaProbe = require("../media-probe");
const ExportCheck = require("../export-check");
const Measure = require("../desktop/av-sync-measure.cjs");
const { findBrowser } = require("../export-jobs");
const { makeDataDir, seedProject, startServer, bundledH264 } = require("./helpers");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const noFf = !have && "no ffmpeg / ffprobe here (node desktop/fetch-ffmpeg.cjs, or MONTCLIP_FFMPEG_DIR)";
const browser = findBrowser();
const noBrowser = noFf || (!browser && "no Chrome / Edge / Chromium to export headless (FABLECUT_CHROME)");
const SECONDS = 10, FPS = 30, EVENTS = [1, 3.5, 6, 8.5], FRAME = 1 / FPS;

let dir = null, codec = null;
const ffmpeg = () => FF.path("ffmpeg");
function makeSource(file, offset) {
  const on = EVENTS.map((t) => `between(t\\,${t}\\,${t + FRAME / 2})`).join("+");
  const beep = EVENTS.map((t) => `between(t\\,${t}\\,${t + 0.02})`).join("+");
  const h264 = bundledH264();
  codec = h264 ? h264.encoder : "libvpx-vp9";
  const venc = h264 ? ["-c:v", h264.encoder, "-pix_fmt", h264.pix, "-b:v", "400k", "-g", "30"]
    : ["-c:v", "libvpx-vp9", "-b:v", "300k", "-deadline", "realtime", "-cpu-used", "8", "-g", "30", "-pix_fmt", "yuv420p"];
  cp.execFileSync(ffmpeg(), ["-hide_banner", "-v", "error", "-y",
    "-f", "lavfi", "-i", `color=c=0x646464:size=320x180:rate=${FPS}:duration=${SECONDS},format=yuv420p,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='${on}'`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='(${beep})*0.5*sin(2*PI*1000*t)':s=48000:d=${SECONDS}`,
    "-map", "0:v", "-map", "1:a", ...venc, "-c:a", "aac", "-b:a", "128k", "-ac", "1", "-ar", "48000",
    ...(offset ? ["-output_ts_offset", String(offset)] : []), file], { windowsHide: true, maxBuffer: 1 << 26 });
}
const ffprobe = (file) => JSON.parse(cp.execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { encoding: "utf8", windowsHide: true }));

test.before(() => {
  if (!have) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-start-"));
  makeSource(path.join(dir, "obs-3600.mkv"), 3600);
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

/** Export the timeline (V1 picture muted + A1 sound, the whole file) through a headless editor; → {job, file}. */
async function exportThrough(t, media) {
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.copyFileSync(path.join(dir, "obs-3600.mkv"), path.join(data, "media", "obs-3600.mkv"));
  const { base } = await startServer(t, data, { FABLECUT_NO_FS_WATCH: "1" });
  const doc = await (await fetch(base + "/api/project")).json();
  Object.assign(doc, { name: "start", width: 320, height: 180, fps: FPS, revision: (doc.revision || 0) + 1,
    media: [{ id: "m", name: "obs-3600.mkv", kind: "video", src: "/media/obs-3600.mkv", width: 320, height: 180, ...media }],
    clips: [{ id: "v", kind: "video", mediaId: "m", track: "V1", start: 0, in: 0, duration: SECONDS, props: { volume: 0 } },
      { id: "a", kind: "audio", mediaId: "m", track: "A1", start: 0, in: 0, duration: SECONDS }] });
  a.equal((await fetch(base + "/api/project", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) })).status, 200);
  const req = await (await fetch(base + "/api/export/request", { method: "POST", headers: { "Content-Type": "application/json" },
    // VP9 + Opus in WebM: every ffmpeg MontClip runs can write it (the bundled LGPL build on Linux has no H.264 encoder)
    body: JSON.stringify({ where: "headless", preset: "custom", delivery: { container: "webm", video: { codec: "vp9" }, audio: { codec: "opus" } } }) })).json();
  a.ok(req.id, JSON.stringify(req));
  let job;
  for (const until = Date.now() + 240_000; Date.now() < until;) {
    await new Promise((r) => setTimeout(r, 500));
    job = await (await fetch(base + "/api/export/job?id=" + req.id)).json();
    if (/^(done|failed|cancelled)$/.test(job.status)) break;
  }
  const file = job.src ? path.join(data, "exports", decodeURIComponent(job.src.replace(/^\/exports\//, ""))) : null;
  return { job, file };
}

test("ffprobe sees the recording the way OBS writes it: timestamps from 3600 s, AAC priming ahead of them", { skip: noFf }, async () => {
  const file = path.join(dir, "obs-3600.mkv"), p = ffprobe(file), aud = p.streams.find((s) => s.codec_type === "audio");
  // ffprobe 9 counts the priming out of the start (3600); ffprobe 7 doesn't (3599.979)
  a.ok(Math.abs(Number(p.format.start_time) - 3600) < 0.03, p.format.start_time);
  a.equal(aud.codec_name, "aac");
  a.ok(Number(aud.initial_padding) > 0, "the AAC encoder's priming is in the file");
  const info = await MediaProbe.probeFile(file);
  a.ok(Math.abs(info.duration - SECONDS) < 0.1, "the length (#126)");
  a.equal(info.start, Number(p.format.start_time), "where media time 0 is on the file's clock: the 0 of ffmpeg -ss");
  // the decoded sound starts at the first packet, the priming, 1024 samples ahead of the first sound at 3600 s
  a.ok(Math.abs(info.start + (info.audioOffset || 0) - (3600 - Number(aud.initial_padding) / 48000)) < 0.0015,
    `start ${info.start}, audioOffset ${info.audioOffset}`);
});

test("a recording that starts at 3600 s exports its picture, and its sound in step", { skip: noBrowser, timeout: 300_000 }, async (t) => {
  const { job, file } = await exportThrough(t, {});   // no details yet, as a file dropped in: the editor asks the server
  a.equal(job.status, "done", JSON.stringify(job.error || job));
  const m = Measure.measure(file, { ffmpeg: ffmpeg(), limit: FRAME, expect: EVENTS });
  const lumaMax = Math.max(...Measure.decode(ffmpeg(), file).luma);
  t.diagnostic(`${codec}: flashes ${m.flashes.map((x) => x.toFixed(3)).join(" ")} · beeps ${m.beeps.map((x) => x.toFixed(4)).join(" ")} · worst A/V ${(m.worst * 1000).toFixed(1)} ms · brightest ${lumaMax.toFixed(0)}`);
  a.ok(lumaMax > 200, `the export has a picture (brightest frame mean ${lumaMax})`);
  a.equal(m.flashes.length, EVENTS.length, "every white frame of the source is in the export: " + m.flashes.join(", "));
  a.ok(m.placementOk, "each white frame within a frame of where the source has it: " + JSON.stringify(m.placement));
  a.equal(m.beeps.length, EVENTS.length, "every beep");
  a.ok(m.ok && m.worst <= FRAME, `sound and picture within a frame: worst ${(m.worst * 1000).toFixed(1)} ms`);
});

test("an export that comes out black and silent while the footage is not is not done, and says why", { skip: noFf, timeout: 120_000 }, async (t) => {
  // the server's side of the self-check, through the real routes: the plan the editor sends, black frames, a silent mix
  const data = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.copyFileSync(path.join(dir, "obs-3600.mkv"), path.join(data, "media", "obs-3600.mkv"));
  const { base } = await startServer(t, data, { FABLECUT_NO_FS_WATCH: "1" });
  const post = (route, body, json = true) => fetch(base + route, { method: "POST", ...(json ? { headers: { "Content-Type": "application/json" } } : {}), body: json ? JSON.stringify(body) : body });
  const jpeg = cp.execFileSync(ffmpeg(), ["-v", "error", "-f", "lavfi", "-i", "color=c=black:size=320x180", "-frames:v", "1", "-c:v", "mjpeg", "-f", "image2pipe", "-"], { windowsHide: true });
  const wav = cp.execFileSync(ffmpeg(), ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "2", "-f", "wav", "-"], { windowsHide: true });
  const src = "/media/obs-3600.mkv";
  const check = { video: [0.125, 0.375, 0.625, 0.875, 1.125, 1.375, 1.625, 1.875].map((t) => ({ t, src, at: t + 4 })), audio: [{ src, at: 3, dur: 2 }] };
  const begin = await (await post("/api/export/begin", { fps: FPS, duration: 2, hasAudio: true, canvasW: 320, canvasH: 180, check,
    deliveries: [{ name: "blank", delivery: { preset: "custom", container: "webm", video: { codec: "vp9" }, audio: { codec: "opus" } } }] })).json();
  a.ok(begin.id, JSON.stringify(begin));
  a.equal((await post("/api/export/audio?id=" + begin.id, wav, false)).status, 200);
  for (let i = 0; i < 2 * FPS; i++) a.equal((await post("/api/export/frame?id=" + begin.id, jpeg, false)).status, 200);
  const end = await post("/api/export/end?id=" + begin.id, {});
  const body = await end.json();
  a.equal(end.status, 500, "a black, silent file must not be called done: " + JSON.stringify(body));
  a.equal(body.code, "EXPORT_BLANK_BOTH");
  a.match(body.error, /black and silent from start to end, but the footage on the timeline is not/);
});

test("the self-check: black or silent only counts when the footage at those moments is not", { skip: noFf, timeout: 120_000 }, async () => {
  const src = path.join(dir, "obs-3600.mkv");
  const black = path.join(dir, "black.mp4"), quiet = path.join(dir, "quiet.wav"), loud = path.join(dir, "loud.wav");
  const ff = (args) => cp.execFileSync(ffmpeg(), ["-hide_banner", "-v", "error", "-y", ...args], { windowsHide: true });
  ff(["-f", "lavfi", "-i", "color=c=black:size=320x180:rate=30:duration=10", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "10", "-c:v", "mpeg4", "-c:a", "aac", black]);
  ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "10", quiet]);
  ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "10", loud]);
  const resolve = (s) => (s === "/media/obs-3600.mkv" ? src : null);
  const plan = ExportCheck.cleanPlan({
    video: [0.6, 1.9, 3.1, 4.4, 5.6, 6.9, 8.1, 9.4].map((t) => ({ t, src: "/media/obs-3600.mkv", at: t })),
    audio: [{ src: "/media/obs-3600.mkv", at: 0, dur: 10 }],
  });
  const lost = await ExportCheck.check({ ffmpeg: ffmpeg(), file: black, plan, resolve, silent: null, mix: quiet });
  a.deepEqual([lost.picture, lost.sound, lost.ok], [true, true, false], "black and silent while the grey source beeps");
  a.equal(ExportCheck.failCode(lost), "EXPORT_BLANK_BOTH");
  const sounding = await ExportCheck.check({ ffmpeg: ffmpeg(), file: black, plan, resolve, silent: null, mix: loud });
  a.deepEqual([sounding.picture, sounding.sound], [true, false], "the mix has sound: only the picture is lost");
  const fine = await ExportCheck.check({ ffmpeg: ffmpeg(), file: src, plan, resolve, silent: false, mix: null });
  a.equal(fine.ok, true, "a file with its picture and sound passes");
  // a black source exported black is what was asked for; a missing source is never a reason to fail
  const dark = await ExportCheck.check({ ffmpeg: ffmpeg(), file: black, resolve: (s) => (s === "/media/black.mp4" ? black : null),
    plan: ExportCheck.cleanPlan({ video: [{ t: 1, src: "/media/black.mp4", at: 1 }, { t: 2, src: "/media/gone.mp4", at: 2 }], audio: [{ src: "/media/black.mp4", at: 0, dur: 5 }] }), silent: true });
  a.equal(dark.ok, true, JSON.stringify(dark));
  a.deepEqual(ExportCheck.cleanPlan({ video: [{ t: -1, src: "/m", at: 1 }, { t: 1, src: 3, at: 1 }, null], audio: [{ src: "/m", at: 0, dur: 0 }] }), { video: [], audio: [], silent: [] });
});

test("parseProbe: start and audioOffset only when a file's clock is not at 0", () => {
  const P = (fmt, streams) => MediaLib.parseProbe({ format: { duration: "10", ...fmt }, streams });
  const v = { codec_type: "video", codec_name: "h264", width: 320, height: 180 };
  const aac = (start, pad) => ({ codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 1, start_time: String(start), initial_padding: pad });
  // an ordinary file: nothing new on the entry
  let i = P({ start_time: "0.000000" }, [{ ...v, start_time: "0.000000" }, aac(0, 1024)]);
  a.equal(i.start, undefined); a.equal(i.audioOffset, undefined);
  // OBS at 3600 s (MKV): the clock, and the priming the browser decodes ahead of it
  i = P({ format_name: "matroska,webm", start_time: "3600.000000", duration: "3610" }, [{ ...v, start_time: "3600.000000" }, aac(3600, 1024)]);
  a.equal(i.start, 3600); a.equal(i.audioOffset, -0.021333); a.equal(i.duration, 10);
  // the same file with the first packet read: its time is rounded to the ms, the start less the priming is exact
  i = MediaLib.parseProbe({ format: { format_name: "matroska,webm", start_time: "3600.000000", duration: "3610" }, streams: [{ ...v, start_time: "3600.000000" }, aac(3600, 1024)] }, 0, 3599.979);
  a.equal(i.audioOffset, -0.021333);
  // ffprobe 7 doesn't count the priming out: the start is the first packet, and the sound starts at media time 0
  i = MediaLib.parseProbe({ format: { format_name: "matroska,webm", start_time: "3599.979000", duration: "3610.021" }, streams: [{ ...v, start_time: "3600.000000" }, aac(3599.979, 1024)] }, 0, 3599.979);
  a.equal(i.start, 3599.979); a.equal(i.audioOffset, undefined);
  a.equal(MediaLib.needsFirstAudioPts({ format: { start_time: "3600" }, streams: [aac(3600, 1024)] }), true);
  a.equal(MediaLib.needsFirstAudioPts({ format: { start_time: "0" }, streams: [aac(0, 1024)] }), false, "an ordinary file: no extra read");
  // Opus drops its own pre-skip
  i = P({ format_name: "matroska,webm", start_time: "3600.000000" }, [{ ...v, start_time: "3600.000000" }, { codec_type: "audio", codec_name: "opus", sample_rate: "48000", start_time: "3600.000000", initial_padding: 312 }]);
  a.equal(i.start, 3600); a.equal(i.audioOffset, undefined);
  // sound that starts after the picture: the mix puts it there
  i = P({ start_time: "0.000000" }, [{ ...v, start_time: "0.000000" }, aac(0.5, 0)]);
  a.equal(i.start, undefined); a.equal(i.audioOffset, 0.5);
  // a negative start is not a clock to shift by
  i = P({ start_time: "-0.023000" }, [{ ...v, start_time: "0.000000" }]);
  a.equal(i.start, undefined);
  a.ok(MediaLib.INFO_KEYS.includes("start") && MediaLib.INFO_KEYS.includes("audioOffset"), "written onto the entry, read-only like the other details");
});

test("the editor reads every player and the export's decoder on media time, and decodes the sound from media time 0", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.match(app, /el\._fcSrc = src;\n  setPlayerStart\(el, playerStart\(m, src\)\);/, "the timeline's players");
  a.match(app, /setPlayerStart\(el, playerStart\(m, want\)\);/, "the Source monitor");
  a.match(app, /src\.frameAt\(mediaTimeAt\(c, t\) \+ playerStart\(m, m && m\.src\)\)/, "the MP4 decoder of the export");
  a.match(app, /\.then\(\(buf\) => \(off \? shiftAudioBuffer\(buf, off\) : buf\)\)/, "the decoded sound");
  a.match(app, /await mediaInfoSettled\(\);\n    const silent = \[\];\n    const wav = await renderAudioMix\(t0, t1, \{ silent \}\);/, "an export waits for the files' details");
  a.equal((app.match(/check: \{ \.\.\.exportCheckPlan\(t0, t1\), silent \}/g) || []).length, 3, "every export sends its self-check plan");
  // a proxy is written from 0: no shift
  const fn = /function playerStart\(m, src\) \{[^}]*\}/.exec(app)[0];
  const playerStart = new Function("return " + fn)();
  a.equal(playerStart({ src: "/media/a.mkv", start: 3600 }, "/media/a.mkv"), 3600);
  a.equal(playerStart({ src: "/media/a.mkv", start: 3600 }, "/proxies/a.mp4"), 0);
  a.equal(playerStart({ src: "/media/a.mp4" }, "/media/a.mp4"), 0);
});

/* JJ's final words (2026-11-04, #161), word for word, and what the streamer sees with them: the 〔复制问题信息〕 they ask
   for (#129's button and its redaction), never 「完成」 or a way to open the file. */
const BLANK = {
  "export-blank-picture": ["The export went wrong: the video is black from start to finish, but the clips on the timeline have picture. Don't use this file. Your originals are unchanged. Export again, and if it's still black, click “Copy problem details” and send it to us.",
    "导出出了问题：成片从头到尾都是黑屏，但时间线上的素材是有画面的。这个文件先别用，原片没有改动。请再导出一次；还是黑屏的话，点〔复制问题信息〕发给我们。"],
  "export-blank-sound": ["The export went wrong: the video has no sound from start to finish, but the clips on the timeline have sound. Don't use this file. Your originals are unchanged. Export again, and if there's still no sound, click “Copy problem details” and send it to us.",
    "导出出了问题：成片从头到尾都没有声音，但时间线上的素材是有声音的。这个文件先别用，原片没有改动。请再导出一次；还是没声音的话，点〔复制问题信息〕发给我们。"],
  "export-blank-both": ["The export went wrong: the video is black and silent from start to finish, but the clips on the timeline have picture and sound. Don't use this file. Your originals are unchanged. Export again, and if it happens again, click “Copy problem details” and send it to us.",
    "导出出了问题：成片从头到尾都是黑屏、也没有声音，但时间线上的素材有画面也有声音。这个文件先别用，原片没有改动。请再导出一次；还是这样的话，点〔复制问题信息〕发给我们。"],
};
const CODES = { "export-blank-picture": "EXPORT_BLANK_PICTURE", "export-blank-sound": "EXPORT_BLANK_SOUND", "export-blank-both": "EXPORT_BLANK_BOTH" };

test("the self-check's words: JJ's, word for word, for each case, said with the copy button and nothing before them", () => {
  const V = require("../ui-preferences");
  for (const [k, [en, zh]] of Object.entries(BLANK)) {
    a.equal(V.t("zh-CN", "own." + k), zh, k);
    a.equal(V.t("en", "own." + k), en, k);
    for (const [l, want] of [["zh-CN", zh], ["en", en]]) {
      const r = V.errorText(l, { code: CODES[k], error: "the exported file is black" });
      a.deepEqual([r.text, r.known, r.copy], [want, true, true], k + " " + l);
      a.equal(V.batchReason(l, { code: CODES[k] }), want, "the queue and the summaries say the same sentence");
    }
  }
  a.equal(V.errorText("zh-CN", { code: "DISK_FULL" }).copy, false, "other sentences of their own keep their own way");
});

test("the button named in the sentences is the button on screen: zh", () => {
  const V = require("../ui-preferences"), btn = V.t("zh-CN", "btnCopyProblem");
  a.equal(btn, "复制问题信息");
  for (const k of Object.keys(BLANK)) a.ok(V.t("zh-CN", "own." + k).includes(`〔${btn}〕`), k);
});

// JJ's rule: a sentence names a button by its real name on screen. The English sentences said “Copy problem info”; the
// button (#129's btnCopyProblem) says "Copy problem details", so the sentences use that (Deja, #161).
test("the button named in the sentences is the button on screen: en", () => {
  const V = require("../ui-preferences"), btn = V.t("en", "btnCopyProblem");
  a.equal(btn, "Copy problem details");
  for (const k of Object.keys(BLANK)) {
    a.ok(V.t("en", "own." + k).includes(`click “${btn}” and send it to us.`), `${k}: the sentence names “${btn}”`);
    a.ok(!/Copy problem info/.test(V.t("en", "own." + k)), k);
  }
});
test("a black / silent export: the queue row says the sentence with 〔复制问题信息〕 and 〔重试这条〕 — no 完成, no 保存 or open", () => {
  const V = require("../ui-preferences");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const src = app.slice(app.indexOf("function renderQueue() {"), app.indexOf("function renderQueueProgress() {"));
  a.ok(src.length > 100, "renderQueue found");
  for (const language of ["zh-CN", "en"]) for (const k of Object.keys(BLANK)) {
    const els = {};
    const $ = (id) => (els[id] = els[id] || { textContent: "", innerHTML: "", disabled: false });
    const uiText = (key, vars) => V.t(language, key, vars);
    const q = { id: "q1", status: "failed", code: CODES[k], error: "blank.mp4: the exported file is black", label: "Web", name: "blank", spec: { container: "mp4" }, range: null };
    const run = new Function("$", "uiText", "MontClipView", "mcView", "Delivery", "deliveryFrame", "projectFps", "escapeHtml", "fmt", "exportQueue", "queueRunning",
      src + "\nrenderQueue();");
    run($, uiText, V, { get: () => ({ language }) }, { CONTAINERS: { mp4: { ext: ".mp4" } }, describe: () => "1280×720" }, () => ({ outW: 1280, outH: 720 }), () => 30,
      (x) => String(x), (x) => String(x), [q], false);
    const html = els.exportQueueList.innerHTML;
    a.ok(html.includes(V.t(language, "own." + k)), `${k} ${language}: the sentence, as it is`);
    a.ok(!html.includes(V.t(language, "qFailed")), "not after 「没导出来：」");
    a.match(html, new RegExp(`data-q-copy="q1"[^>]*>${V.t(language, "btnCopyProblem")}<`), "〔复制问题信息〕 on the row");
    a.match(html, /data-q-retry="q1"/);
    a.doesNotMatch(html, /data-q-save|dlv-q-saved/, "nothing to save or open");
    for (const word of ["完成", "导好了", "Done", "Open", "打开"]) a.ok(!html.includes(word), `${k} ${language}: no 「${word}」`);
  }
  // the clicks: the row's button copies through #129's redaction; the agent's job is failed, never done
  a.match(app, /if \(c\) \{ copyProblem\(sayError\(q, "export-queue"\)\); return; \}/);
  a.match(app, /if \(r\.known && !r\.copy\) toast\(prefix \+ r\.text\);\n  else toastAction\(\(r\.copy \? "" : prefix\) \+ r\.text, uiText\("btnCopyProblem"\), \(\) => copyProblem\(r\), uiText\("copyProblemNote"\)\);/);
  a.match(app, /toastAction\(blank\.copy \? blank\.text : msg, uiText\("btnCopyProblem"\)/, "the queue's summary when none made it");
  a.match(app, /\.\.\.\(o \? \{ code: o\.code \}/, "an output's own code reaches the queue");
  a.match(app, /if \(!end\.src\) throw exportEndError\(end, "encode failed"\);/, "the export stops before any save window opens");
});

test("after 〔复制问题信息〕: JJ's sentence, word for word, with the mailbox to select — and no second copy button", () => {
  const V = require("../ui-preferences");
  a.equal(V.PROBLEM_EMAIL, "etang.build.bot@gmail.com");
  const said = (l) => V.t(l, "own.copy-problem-sent", { email: V.PROBLEM_EMAIL });
  a.equal(said("zh-CN"), "复制好了（文件路径和账号已经去掉）。把它发到 etang.build.bot@gmail.com，我们会尽快看。");
  a.equal(said("en"), "Copied (file paths and account details removed). Send it to etang.build.bot@gmail.com and we'll look at it as soon as we can.");
  // the toast, run on a small stand-in for the page
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const src = app.slice(app.indexOf("function toastProblemSent() {"), app.indexOf("/** A failure in a toast:"));
  const node = (tag) => ({ tag, children: [], className: "", tabIndex: -1, _text: "",
    set textContent(v) { this._text = v; this.children = []; }, get textContent() { return this._text + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join(""); },
    append(...xs) { this.children.push(...xs); }, classList: { set: new Set(), add(...c) { c.forEach((x) => this.set.add(x)); }, remove(...c) { c.forEach((x) => this.set.delete(x)); }, contains(c) { return this.set.has(c); } } });
  for (const language of ["zh-CN", "en"]) {
    const toast = node("div");
    let held = 0;
    new Function("els", "uiText", "MontClipView", "document", "clearTimeout", "toastTimer", "toastHold", "holdToast", src + "\ntoastProblemSent();")(
      { toast }, (k, v) => V.t(language, k, v), V, { createElement: node }, () => {}, 0, null, () => ({ start: () => { held++; }, stop() {} }));
    a.equal(toast.textContent, said(language), language);
    const all = []; const walk = (n) => { if (typeof n !== "string") { all.push(n); n.children.forEach(walk); } }; walk(toast);
    const mail = all.find((n) => n.className === "toast-email");
    a.ok(mail && mail.textContent === V.PROBLEM_EMAIL && mail.tabIndex === 0, "the address is its own selectable element");
    a.ok(!all.some((n) => n.tag === "button"), "no button: a second copy would overwrite the problem details");
    a.ok(toast.classList.contains("show") && toast.classList.contains("has-action") && held === 1, "it stays while held, so it can be selected");
  }
  const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
  a.match(css, /#toast \.toast-email \{ user-select: all;/, "one click selects the whole address");
  a.match(app, /navigator\.clipboard\.writeText\(out\); toastProblemSent\(\);/);
  a.doesNotMatch(src, /clipboard/, "the toast never writes the clipboard");
});
