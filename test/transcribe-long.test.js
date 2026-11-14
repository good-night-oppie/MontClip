/* P8 (Deja, 2026-11-05): fablecut_transcribe on three short clips of a two-hour, 8.2 GB livestream replay.
   Two things went wrong on europa (the Cindy plugin, Linux): the plugin's copy of the engine had no
   desktop/asr-manifest.json, so the first request to /api/asr/* threw while loading asr-models.js and took the
   whole engine down (the agent then heard "the editor stopped reporting progress"); and a clip's words meant
   transcribing the whole file — two hours of sound for 13 s of clips.
   Here: the server answers when the speech engine is missing (never crashes), and says so in a code; a long
   file is listened to only where its clips play (ffmpeg -ss / -t, nothing else decoded), the transcript keeps
   which parts it covers (spans), and later clips add only what is still missing. */
"use strict";
const test = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { makeDataDir, seedProject, startServer, startMcp } = require("./helpers");
const T = require("../transcribe.js");

const ROOT = path.join(__dirname, "..");
const RATE = 16000;
const ffmpeg = () => require("../server/ffmpeg-path").path("ffmpeg");

/* ── transcribe.js: which parts a transcript covers ── */

test("a transcript may cover only some parts of its file (spans); validate keeps them merged and inside the file", () => {
  const d = T.validate({ duration: 7200, words: [["你", 4441, 4441.2]], spans: [[4454, 4459.1], [4438.5, 4447.9], [4447, 4450], [7100, 9000]] });
  a.deepEqual(d.spans, [[4438.5, 4450], [4454, 4459.1], [7100, 7200]]);
  a.equal("spans" in T.validate({ duration: 10, words: [] }), false, "a whole-file transcript has no spans");
  a.throws(() => T.validate({ words: [], spans: [[3, 1]] }), /span/);
  a.throws(() => T.validate({ words: [], spans: "all" }), /spans/);
});

test("clipRanges: the windows a file's clips play, padded and merged, in file seconds", () => {
  const clips = [{ in: 4455.5, duration: 2.134 }, { in: 4440, duration: 6.401 }, { in: 4452.2, duration: 4.267 }, { in: 7199, duration: 6, props: { speed: 2 } }];
  a.deepEqual(T.clipRanges(clips, { pad: 1.5, duration: 7211.725 }), [[4438.5, 4447.901], [4450.7, 4459.134], [7197.5, 7211.725]]);
});

test("missingSpans: what is still to be listened to", () => {
  const want = [[100, 110], [200, 205]];
  a.deepEqual(T.missingSpans(null, want), [[100, 110], [200, 205]], "no transcript: all of it");
  a.deepEqual(T.missingSpans({ words: [], gaps: [] }, want), [], "a whole-file transcript covers everything");
  a.deepEqual(T.missingSpans({ words: [], gaps: [], spans: [[99, 105], [200, 205]] }, want), [[105, 110]]);
  a.deepEqual(T.missingSpans({ words: [], gaps: [], spans: [[100, 109.9]] }, [[100, 110]]), [], "a sliver under 0.3 s is not worth a pass");
});

test("mergeDocs: a new part replaces what was there, the spans add up; the whole file replaces everything", () => {
  const old = T.validate({ duration: 7200, words: [["旧", 101, 101.2], ["留", 300, 300.2]], spans: [[100, 110], [299, 301]] });
  const add = T.validate({ duration: 7200, words: [["新", 102, 102.3], ["加", 501, 501.2]], spans: [[100, 110], [500, 502]] });
  const m = T.mergeDocs(old, add);
  a.deepEqual(m.words.map((w) => w[0]), ["新", "留", "加"]);
  a.deepEqual(m.spans, [[100, 110], [299, 301], [500, 502]]);
  const whole = T.validate({ duration: 7200, words: [["全", 5, 5.1]] });
  a.equal(T.mergeDocs(old, whole), whole);
  const all = T.mergeDocs(T.validate({ duration: 10, words: [], spans: [[0, 6]] }), T.validate({ duration: 10, words: [], spans: [[5, 10]] }));
  a.equal("spans" in all, false, "parts that add up to the whole file are the whole file");
});

/* ── asr-local.js: a long file, a short window ── */

/** sherpa-onnx-node, standing in: the VAD hands out what it heard every 3 s; the recognizer writes 「字」 every 0.5 s.
 *  `heard` counts every sample the VAD was given. */
function fakeSherpa() {
  const heard = { samples: 0 };
  class Vad {
    constructor() { this.buf = []; this.at = 0; this.q = []; }
    acceptWaveform(f) { heard.samples += f.length; for (const x of f) this.buf.push(x); this.cut(false); }
    cut(all) { while (this.buf.length >= 3 * RATE || (all && this.buf.length)) { const n = Math.min(3 * RATE, this.buf.length); this.q.push({ start: this.at, samples: Float32Array.from(this.buf.splice(0, n)) }); this.at += n; } }
    flush() { this.cut(true); }
    isEmpty() { return !this.q.length; }
    front() { return this.q[0]; }
    pop() { this.q.shift(); }
  }
  const rec = { createStream: () => ({ acceptWaveform({ samples }) { this.n = samples.length; } }),
    async decodeAsync(s) { const tokens = [], timestamps = []; for (let t = 0; t + 0.5 <= s.n / RATE; t += 0.5) { tokens.push("字"); timestamps.push(t); } return { text: tokens.join(""), tokens, timestamps }; } };
  return { sherpa: { Vad, OfflineRecognizer: { createAsync: async () => rec }, OfflinePunctuation: class {} }, heard };
}
function engineDir(t, { native = true } = {}) {
  const { manifest } = require("../server/asr-models");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-asr-long-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const nm = path.join(dir, "engine", "node_modules");
  fs.mkdirSync(path.join(nm, "sherpa-onnx-node"), { recursive: true }); fs.writeFileSync(path.join(nm, "sherpa-onnx-node", "package.json"), "{}");
  if (native) { const n = path.join(nm, require("../server/asr-local").nativePackage()); fs.mkdirSync(n, { recursive: true }); fs.writeFileSync(path.join(n, "package.json"), "{}"); }
  const vad = path.join(dir, manifest.engine.vad.file); fs.writeFileSync(vad, ""); fs.truncateSync(vad, manifest.engine.vad.size);
  fs.mkdirSync(path.join(dir, "model"));
  const store = { dir: (k) => (k === "asr" ? path.join(dir, "model") : null), status: () => ({ asr: { ready: true, missing: [], bad: [] }, punct: { ready: false, missing: [], bad: [] } }) };
  return { dir, store };
}

for (const duration of [12, null]) test('MC-08: cancellation preserves paragraphs and path; duration=' + duration, async t => {
  const E = engineDir(t), file = path.join(E.dir, 'partial.wav');
  fs.writeFileSync(file, 'synthetic media identity');
  // Feed PCM at the subprocess boundary: no model, media download or installed FFmpeg needed.
  const filename = path.join(ROOT, 'server/asr-local.js'), mod = { exports: {} };
  const realRequire = require('node:module').createRequire(filename);
  const source = process.env.MONTCLIP_TEST_BASELINE ? execFileSync('git', ['show', 'HEAD:asr-local.js'], { cwd: ROOT, encoding: 'utf8' }) : fs.readFileSync(filename, 'utf8');
  require('node:vm').runInNewContext(source, { module: mod, exports: mod.exports, __dirname: ROOT, process, Buffer, setTimeout, clearTimeout,
    require: name => !['child_process', 'node:child_process'].includes(name) ? realRequire(name) : { spawn: () => {
      const proc = new (require('node:events').EventEmitter)();
      proc.stdout = require('node:stream').Readable.from([Buffer.alloc(12 * RATE * 2)]);
      proc.stderr = new (require('node:stream').PassThrough)();
      proc.stdout.on('end', () => proc.emit('close', 0));
      proc.kill = () => { proc.stdout.destroy(); proc.emit('close', 0); };
      return proc;
    } },
  }, { filename });
  const { sherpa } = fakeSherpa();
  const asr = mod.exports.createAsr({ asrDir: E.dir, store: E.store, ffmpeg: 'synthetic-pcm', sherpa });
  const store = require('../server/transcripts').createTranscripts({ dir: path.join(E.dir, 'transcripts'), resolveSrc: () => file });
  const ac = new AbortController();
  let checkpoints = 0;
  await a.rejects(asr.transcribe(file, { duration, signal: ac.signal, onCheckpoint: r => {
    const add = T.validate({ ...r, gaps: r.gaps.map(g => [g.start, g.end, g.reason]) });
    store.put('/media/partial.wav', T.mergeDocs(store.get('/media/partial.wav') || null, add));
    checkpoints++; if (checkpoints === 2) ac.abort();
  } }), e => e.code === 'ASR_CANCELLED');
  a.equal(checkpoints, 2);
  const doc = store.get('/media/partial.wav');
  a.ok(doc.words.length > 0); a.ok(doc.spans[0][1] < 12);
  a.deepEqual(JSON.parse(fs.readFileSync(store.file('/media/partial.wav'), 'utf8')).words, doc.words);
});

test("a long recording, two short windows: only those parts are decoded, the words keep file times", async (t) => {
  const E = engineDir(t);
  // 30 minutes of a tone, mp3 sound in an mp4 (as the replay is), made by ffmpeg's lavfi
  const file = path.join(E.dir, "long.mp4");
  execFileSync(ffmpeg(), ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:sample_rate=16000:duration=1800", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "32k", file]);
  const { sherpa, heard } = fakeSherpa();
  const asr = require("../server/asr-local").createAsr({ asrDir: E.dir, store: E.store, ffmpeg: ffmpeg(), sherpa });
  const ranges = [[600, 605], [1500, 1503.5]];
  const fracs = [];
  const r = await asr.transcribe(file, { ranges, duration: 1800, onProgress: (f) => fracs.push(f) });
  a.ok(Math.abs(heard.samples - 8.5 * RATE) < RATE * 0.1, `the VAD heard ${heard.samples / RATE} s, not 8.5 s`);
  a.ok(r.words.length > 0);
  a.ok(r.words.every((w) => (w[1] >= 600 && w[1] < 605) || (w[1] >= 1500 && w[1] < 1503.5)), "every word inside a window, in file seconds: " + JSON.stringify(r.words.slice(0, 3)));
  a.ok(r.words.some((w) => w[1] < 605) && r.words.some((w) => w[1] >= 1500), "words from both windows");
  a.equal(r.spans.length, 2); a.ok(Math.abs(r.spans[0][0] - 600) < 1e-6 && Math.abs(r.spans[1][1] - 1503.5) < 0.05, JSON.stringify(r.spans));
  a.equal(r.duration, 1800, "the file's length, not what was heard");
  a.ok(fracs.length && Math.max(...fracs) > 0.5 && fracs.every((f) => f <= 0.99), "progress is over what is listened to");
});

test("two refill reads that both start before 3 s (both read from the file's start): every word once (Rea on #165, 17:14)", async (t) => {
  const E = engineDir(t);
  const file = path.join(E.dir, "short.wav");
  execFileSync(ffmpeg(), ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:sample_rate=16000:duration=10", "-ac", "1", file]);
  const { sherpa } = fakeSherpa();
  const asr = require("../server/asr-local").createAsr({ asrDir: E.dir, store: E.store, ffmpeg: ffmpeg(), sherpa });
  // heard before: [0.5, 3.9]; now [0, 6] is wanted
  const had = T.validate({ duration: 10, words: [["旧", 1.6, 1.8]], spans: [[0.5, 3.9]] });
  const plan = T.refillPlan(had, [[0, 6]], { pad: 1.5, duration: 10 });
  a.deepEqual(plan.read, [[0, 2], [2.4, 7.5]], "Rea's example: two reads, both under SEEK_MIN");
  a.deepEqual(plan.core, [[0, 1.25], [3.15, 6]]);
  const r = await asr.transcribe(file, { ranges: plan.read, duration: 10 });
  a.ok(r.words.every((w, i) => i === 0 || w[1] !== r.words[i - 1][1]), "no word heard twice by the two reads: " + JSON.stringify(r.words.map((w) => w[1])));
  a.deepEqual(r.spans.map((x) => x[0]), [0, 2.4], "each span starts where its read was asked to");
  const add = T.keepIn(T.validate({ duration: r.duration, words: r.words, gaps: [], spans: r.spans }), plan.core);
  const starts = add.words.map((w) => w[1]);
  a.ok(starts.length > 0);
  a.equal(new Set(starts).size, starts.length, "every word once after keepIn: " + JSON.stringify(starts));
  const m = T.mergeDocs(had, add);
  a.equal(new Set(m.words.map((w) => w[1])).size, m.words.length, "and once in the merged transcript");
});

test("the engine's native part for this computer is missing: not ready, and transcribe says ASR_ENGINE_MISSING", async (t) => {
  const E = engineDir(t, { native: false });
  const asr = require("../server/asr-local").createAsr({ asrDir: E.dir, store: E.store, ffmpeg: ffmpeg() });
  a.equal(asr.status().engine.ready, false);
  await a.rejects(asr.transcribe(path.join(E.dir, "x.wav"), {}), (e) => e.code === "ASR_ENGINE_MISSING");
});

/* ── the server: never brought down by a missing engine ── */

test("a copy of the engine without desktop/asr-manifest.json (the plugin's): /api/asr/* answers, the server stays up", async (t) => {
  // the plugin's build copies the top-level files and a few folders, not desktop/asr-manifest.json
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-noasr-app-"));
  for (const f of fs.readdirSync(ROOT)) if (/\.(js|html|css|json)$/.test(f) && f !== "project.json") fs.copyFileSync(path.join(ROOT, f), path.join(app, f));
  fs.mkdirSync(path.join(app, "server"), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, "server"))) if (/\.(js|json)$/.test(f)) fs.copyFileSync(path.join(ROOT, "server", f), path.join(app, "server", f));
  fs.mkdirSync(path.join(app, "desktop"));
  for (const f of ["ffmpeg-manifest.json", "fetch-ffmpeg.cjs"]) fs.copyFileSync(path.join(ROOT, "desktop", f), path.join(app, "desktop", f));
  const dataDir = makeDataDir(t);
  fs.mkdirSync(path.join(dataDir, "media"), { recursive: true }); fs.writeFileSync(path.join(dataDir, "media", "a.wav"), Buffer.alloc(100));
  const s = await startServer(t, dataDir, { FABLECUT_NO_FS_WATCH: "1", MONTCLIP_ASR_DIR: path.join(dataDir, "no-asr") }, { serverJs: path.join(app, "server/server.js") });
  t.after(() => fs.rmSync(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const st = await fetch(s.base + "/api/asr/status");
  a.equal(st.status, 200);
  const sj = await st.json();
  a.equal(sj.engine.ready, false); a.equal(sj.asr.ready, false);
  const r = await fetch(s.base + "/api/asr/transcribe", { method: "POST", body: JSON.stringify({ src: "/media/a.wav" }) });
  a.equal(r.status, 409); a.equal((await r.json()).code, "ASR_MANIFEST_MISSING", "its own code (test/asr-unavailable.test.js)");
  a.equal((await fetch(s.base + "/api/project")).status, 200, "still running");
});

test("the server: a stand-in engine without its native part is not ready, and says ASR_ENGINE_MISSING", async (t) => {
  const dataDir = makeDataDir(t);
  const asrDir = path.join(dataDir, "asr"); fs.mkdirSync(path.join(asrDir, "engine", "node_modules", "sherpa-onnx-node"), { recursive: true });
  fs.writeFileSync(path.join(asrDir, "engine", "node_modules", "sherpa-onnx-node", "package.json"), "{}");
  fs.writeFileSync(path.join(asrDir, "silero_vad.onnx"), Buffer.alloc(643854));
  fs.mkdirSync(path.join(dataDir, "media"), { recursive: true }); fs.writeFileSync(path.join(dataDir, "media", "a.wav"), Buffer.alloc(100));
  const s = await startServer(t, dataDir, { FABLECUT_NO_FS_WATCH: "1", MONTCLIP_ASR_DIR: asrDir, MONTCLIP_ASR_MODELS_DIR: path.join(dataDir, "no-models") });
  const st = await (await fetch(s.base + "/api/asr/status")).json();
  a.equal(st.engine.ready, false);
  const r = await fetch(s.base + "/api/asr/transcribe", { method: "POST", body: JSON.stringify({ src: "/media/a.wav", ranges: [[0, 1]] }) });
  a.equal(r.status, 409); a.equal((await r.json()).code, "ASR_ENGINE_MISSING");
  const bad = await fetch(s.base + "/api/asr/transcribe", { method: "POST", body: JSON.stringify({ src: "/media/a.wav", ranges: [[5, 1]] }) });
  a.equal(bad.status, 400, "ranges must be [from, to] with to > from");
});

/* ── fablecut_transcribe: a long file's clips ask for their windows only ── */

function fakeTab(t, base) {
  const tickets = [], waiters = [];
  let buf = "";
  const req = http.get(base + "/api/events", (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: (.*)$/m.exec(block)?.[1] !== "export") continue;
        const ticket = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
        const w = waiters.shift(); if (w) w(ticket); else tickets.push(ticket);
      }
    });
  });
  req.on("error", () => {});
  t.after(() => req.destroy());
  return {
    next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((r) => waiters.push(r)),
    pending: () => tickets.length,
    connected: async () => { for (let i = 0; i < 100 && !req.socket?.readyState; i++) await new Promise((r) => setTimeout(r, 20)); await new Promise((r) => setTimeout(r, 100)); },
  };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const LONG = "/media/nov03-live-full.mp4";
function longProject() {
  return seedProject({
    revision: 3, fps: 30,
    media: [{ id: "m_hi", name: "nov03-live-full.mp4", kind: "audio", src: LONG, duration: 7211.725 }],
    clips: [{ id: "sh_her1_a", kind: "audio", mediaId: "m_hi", track: "A1", start: 4.61, in: 4455.5, duration: 2.134 },
      { id: "sh_her2_a", kind: "audio", mediaId: "m_hi", track: "A1", start: 27.013, in: 4440, duration: 6.401 },
      { id: "sp_a", kind: "audio", mediaId: "m_hi", track: "A1", start: 33.414, in: 4452.2, duration: 4.267 },
      { id: "later", kind: "audio", mediaId: "m_hi", track: "A2", start: 50, in: 100, duration: 3 }],
  });
}
const bootLong = async (t) => {
  const dir = makeDataDir(t, longProject());
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.writeFileSync(path.join(dir, "media", path.basename(LONG)), Buffer.alloc(4096));
  const srv = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  return { dir, ...srv };
};

test("fablecut_transcribe on clips of a two-hour file asks for their windows only, and only once", async (t) => {
  const { dir, base, port } = await bootLong(t);
  const tab = fakeTab(t, base);
  await tab.connected();
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port) });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });

  const pending = mcp.callTool("fablecut_transcribe", { clipIds: ["sh_her1_a", "sh_her2_a", "sp_a"] });
  const ticket = await tab.next();
  a.deepEqual(ticket.transcribe, { srcs: [LONG], tracks: { [LONG]: 0 }, model: "paraformer-zh", language: "zh", again: false,
    ranges: { [LONG]: [[4438.5, 4447.901], [4450.7, 4459.134]] } });
  a.equal((await post(base, "/api/export/job/claim?id=" + ticket.id)).status, 200);
  await post(base, "/api/transcript?src=" + LONG, { duration: 7211.725, words: [["我", 4441, 4441.3], ["们", 4441.3, 4441.6], ["唱", 4456, 4456.4]],
    spans: [[4438.5, 4447.901], [4450.7, 4459.134]] });
  await post(base, "/api/export/job/report?id=" + ticket.id, { status: "done", result: { done: [{ src: LONG, words: 3 }], skipped: [], failed: [] } });
  const read = await pending;
  a.equal(read.isError, false, read.text);
  a.match(read.text, /我们/);

  // the same clips again: covered, no job
  const again = await mcp.callTool("fablecut_transcribe", { clipIds: ["sh_her2_a"] });
  a.equal(again.isError, false, again.text);
  a.doesNotMatch(again.text, /Transcribed/);
  a.equal(tab.pending(), 0);

  // a clip elsewhere in the file: only its window is asked for
  const more = mcp.callTool("fablecut_transcribe", { clipIds: ["later", "sp_a"] });
  const t2 = await tab.next();
  a.deepEqual(t2.transcribe.ranges, { [LONG]: [[98.5, 104.5]] });
  await post(base, "/api/export/job/claim?id=" + t2.id);
  await post(base, "/api/export/job/report?id=" + t2.id, { status: "done", result: { done: [{ src: LONG, words: 0 }], skipped: [], failed: [] } });
  a.equal((await more).isError, false);
});

test("fablecut_transcribe: no speech engine or model is said plainly, with its code — not as a stalled editor", async (t) => {
  const { dir, base, port } = await bootLong(t);
  const tab = fakeTab(t, base);
  await tab.connected();
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port) });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  for (const [code, re] of [["ASR_ENGINE_MISSING", /还没有听写程序/], ["ASR_MODEL_MISSING", /还没装听写模型/]]) {
    const pending = mcp.callTool("fablecut_transcribe", { clipIds: ["sp_a"] });
    const ticket = await tab.next();
    await post(base, "/api/export/job/claim?id=" + ticket.id);
    await post(base, "/api/export/job/report?id=" + ticket.id, { status: "failed", error: `${LONG}: the speech engine is missing from this copy of MontClip (${code})` });
    const r = await pending;
    a.equal(r.isError, true);
    a.match(r.text, re);
    a.match(r.text, new RegExp(code));
    a.match(r.text, /nothing was transcribed/i);
    a.doesNotMatch(r.text, /stopped reporting/);
  }
});

/* ── the real engine (only where desktop/fetch-asr.cjs --models asr has run: europa, not CI) ── */

const VENDOR = path.join(ROOT, "vendor", "asr");
test("the real engine: the model's test sentence an hour into a long file, heard through a 10 s window", {
  skip: !(fs.existsSync(path.join(VENDOR, "models", "asr", "model.int8.onnx")) && fs.existsSync(path.join(VENDOR, "test_wavs", "0.wav"))) && "vendor/asr models not fetched here",
}, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-asr-real-long-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "long.mp4");
  // an hour of silence, the sentence (about 5.6 s), a minute of silence: mp3 sound in an mp4, as the replay is
  execFileSync(ffmpeg(), ["-v", "error", "-f", "lavfi", "-t", "3600", "-i", "anullsrc=r=16000:cl=mono", "-i", path.join(VENDOR, "test_wavs", "0.wav"),
    "-f", "lavfi", "-t", "60", "-i", "anullsrc=r=16000:cl=mono", "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1", "-c:a", "libmp3lame", "-b:a", "32k", file]);
  const asr = require("../server/asr-local").createAsr({ asrDir: VENDOR, modelsDir: path.join(VENDOR, "models"), ffmpeg: ffmpeg(), cacheDir: path.join(dir, "cache") });
  const t0 = Date.now();
  const r = await asr.transcribe(file, { ranges: [[3598, 3608]], duration: 3665.6 });
  const secs = (Date.now() - t0) / 1000;
  t.diagnostic(`window of 10 s in a ${r.duration} s file: ${r.words.length} words in ${secs.toFixed(1)} s — ${r.words.map((w) => w[0]).join("")}`);
  a.ok(r.words.length > 5, "words: " + r.words.length);
  a.ok(r.words.every((w) => w[1] >= 3599.9 && w[2] <= 3608.01), "in file seconds, inside the window: " + JSON.stringify(r.words.slice(0, 2)));
  a.ok(secs < 60, `took ${secs} s — the hour before the window must not be decoded`);
});
