'use strict';
// Meta's model runs in a process of its own (asr-meta-engine.js → asr-meta-run.js → asr-local.js), so a broken model, a
// crash or too little memory fails only it, in plain words, and Paraformer (asr-local.js, in the server) goes on — Deja,
// 2026-11-04 (ADR #122: only the optional engine may fail). The real-model test also checks English gets no 「。」
// (test/asr-meta-punct.test.js has the rule).
// Stand-in runners and a stand-in engine here; the real engine where vendor/asr has it, the real Meta model only when
// MONTCLIP_TEST_META_DIR is a folder holding asrMeta/ (synthetic speech: Windows' TTS or ffmpeg's flite, never a person).
const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const L = require('../asr-local');
const { createMetaEngine } = require('../asr-meta-engine');
const { manifest } = require('../asr-models');
const { wav } = require('./songs-synth');

const ffmpeg = () => require('../ffmpeg-path').path('ffmpeg');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-meta-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const RATE = 16000;

// ── the child process ──
/** A stand-in engine folder asr-local accepts, a stand-in sherpa for Paraformer (writes 「字」 every 0.5 s), a file. */
function setup(t) {
  const dir = tmp(t);
  const pkg = path.join(dir, 'engine', 'node_modules', 'sherpa-onnx-node'); fs.mkdirSync(pkg, { recursive: true }); fs.writeFileSync(path.join(pkg, 'package.json'), '{}');
  const vad = path.join(dir, manifest.engine.vad.file); fs.writeFileSync(vad, ''); fs.truncateSync(vad, manifest.engine.vad.size);
  fs.mkdirSync(path.join(dir, 'model'));
  const file = path.join(dir, 'rec.wav'); fs.writeFileSync(file, wav([['talk', 3]]));
  class Vad { constructor() { this.buf = []; this.q = []; this.at = 0; } acceptWaveform(f) { for (const x of f) this.buf.push(x); }
    flush() { if (this.buf.length) this.q.push({ start: this.at, samples: Float32Array.from(this.buf.splice(0)) }); } isEmpty() { return !this.q.length; } front() { return this.q[0]; } pop() { this.q.shift(); } }
  const sherpa = { Vad, OfflinePunctuation: class {}, OfflineRecognizer: { createAsync: async () => ({ createStream: () => ({ acceptWaveform({ samples }) { this.n = samples.length; } }),
    async decodeAsync(s) { const tokens = [], timestamps = []; for (let x = 0; x + 0.5 <= s.n / RATE; x += 0.5) { tokens.push('字'); timestamps.push(x); } return { tokens, timestamps }; } }) } };
  const store = { dir: (k) => (k === 'asr' ? path.join(dir, 'model') : null), status: () => ({ asr: { ready: true, missing: [], bad: [] }, punct: { ready: false, missing: [], bad: [] } }) };
  const paraformer = () => L.createAsr({ asrDir: dir, store, ffmpeg: ffmpeg(), sherpa });
  const runner = (code) => { const f = path.join(dir, 'runner-' + Math.random().toString(36).slice(2) + '.js'); fs.writeFileSync(f, code); return f; };
  const meta = (o) => createMetaEngine({ asrDir: dir, modelsDir: dir, ffmpeg: ffmpeg(), cacheDir: dir, freeMem: () => 64 * 1024 * 1048576, ...o });
  return { dir, file, paraformer, runner, meta };
}

test('a broken Meta model: one plain error; the same process then transcribes with Paraformer', async (t) => {
  const S = setup(t);
  const broken = S.meta({ runner: S.runner('process.once("message", () => process.send({ t: "error", code: "ASR_OPTIONAL_MODEL_BROKEN", message: "Failed to create offline recognizer" }, () => process.disconnect()));') });
  await a.rejects(broken.transcribe(S.file, {}), { code: 'ASR_OPTIONAL_MODEL_BROKEN' });
  const r = await S.paraformer().transcribe(S.file, {});
  a.equal(r.status, 'complete'); a.ok(r.words.length > 0); a.equal(r.model, manifest.models.asr.id);
});

test('Meta\'s process killed (or crashing, or out of memory): only Meta fails, in plain words; Paraformer is unaffected', async (t) => {
  const S = setup(t);
  // killed from outside while it works
  let child = null;
  const hang = S.meta({ runner: S.runner('setInterval(() => {}, 1000);'), fork: (...x) => (child = cp.fork(...x)) });
  const p = hang.transcribe(S.file, {});
  setTimeout(() => child.kill('SIGKILL'), 300);
  await a.rejects(p, (e) => e.code === 'ASR_OPTIONAL_CRASHED' && /Paraformer is not affected/.test(e.message));
  // it aborts, or dies of an exhausted heap
  for (const [code, o] of [['process.abort();', {}],
    ['process.on("message", () => { const a = []; for (;;) a.push(new Array(1e6).fill(1)); });', { fork: (m, args, opt) => cp.fork(m, args, { ...opt, execArgv: ['--max-old-space-size=32'] }) }]]) {
    await a.rejects(S.meta({ runner: S.runner(code), ...o }).transcribe(S.file, {}), { code: 'ASR_OPTIONAL_CRASHED' });
  }
  const r = await S.paraformer().transcribe(S.file, {});
  a.equal(r.status, 'complete'); a.ok(r.words.length > 0);
});

test('too little free memory: refused before anything starts; cancel stops the child', async (t) => {
  const S = setup(t);
  let forked = 0;
  const low = S.meta({ freeMem: () => 100 * 1048576, fork: () => { forked++; throw new Error('no'); } });
  await a.rejects(low.transcribe(S.file, {}), (e) => e.code === 'ASR_OPTIONAL_NO_MEMORY' && e.needMB === manifest.models.asrMeta.ramMB && e.freeMB === 100);
  a.equal(forked, 0);
  let child = null;
  const hang = S.meta({ runner: S.runner('setInterval(() => {}, 1000);'), fork: (...x) => (child = cp.fork(...x)) });
  const ac = new AbortController();
  const p = hang.transcribe(S.file, { signal: ac.signal });
  setTimeout(() => ac.abort(), 200);
  await a.rejects(p, { code: 'ASR_CANCELLED' });
  await new Promise((r) => (child.exitCode != null || child.signalCode ? r() : child.once('exit', r)));
});

test('the server runs Meta through the child engine and Paraformer in place; the page words the failures', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  a.match(server, /await \(key === "asrMeta" \? asrMeta\(\) : asr\(\)\)\.transcribe\(/);
  a.match(server, /require\("\.\/asr-meta-engine"\)\.createMetaEngine\(/);
  for (const k of ['asr-meta-crashed', 'asr-meta-broken', 'asr-meta-no-memory']) a.match(app, new RegExp('uiText\\("own\\.' + k + '"'));
  const run = fs.readFileSync(path.join(ROOT, 'asr-meta-run.js'), 'utf8');
  a.match(run, /transcribe\(job\.file, \{ model: "asrMeta"/, 'the child uses asr-local.js\'s own path');
});

// ── the real engine (vendor/asr; CI has none) ──
const VENDOR = path.join(ROOT, 'vendor', 'asr');
const ENGINE = fs.existsSync(path.join(VENDOR, 'engine', 'node_modules', 'sherpa-onnx-node', 'package.json')) && fs.existsSync(path.join(VENDOR, 'models', 'asr', 'model.int8.onnx'));
const META = process.env.MONTCLIP_TEST_META_DIR;
function tts(dir, text) {
  const out = path.join(dir, 'tts.wav');
  if (process.platform !== 'win32') {
    try { cp.execFileSync(ffmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', `flite=text='${text.replace(/[':\\]/g, ' ')}':voice=slt`, '-ar', '16000', '-y', out], { stdio: 'ignore', timeout: 60000 }); } catch { return null; }
  } else {
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${out.replace(/'/g, "''")}'); $s.Speak('${text}'); $s.Dispose()`;
    try { cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 60000 }); } catch { return null; }
  }
  return fs.existsSync(out) && fs.statSync(out).size > 10000 ? out : null;
}

test('real engine: Meta\'s model missing or damaged fails in its own process with a plain code; Paraformer then transcribes', { skip: !ENGINE && 'vendor/asr with the Paraformer model is not here' }, async (t) => {
  const dir = tmp(t);
  // Meta's files, damaged (the right names, the wrong bytes): its checks refuse them inside the child
  fs.mkdirSync(path.join(dir, 'asrMeta'));
  for (const n of Object.keys(manifest.models.asrMeta.files)) fs.writeFileSync(path.join(dir, 'asrMeta', n), 'damaged');
  const file = path.join(dir, 'rec.wav'); fs.writeFileSync(file, fs.readFileSync(path.join(VENDOR, 'test_wavs', '0.wav')));
  const meta = createMetaEngine({ asrDir: VENDOR, modelsDir: dir, ffmpeg: ffmpeg(), cacheDir: path.join(os.tmpdir(), 'mc-meta-cache') });
  await a.rejects(meta.transcribe(file, {}), (e) => e.code === 'ASR_MODEL_MISSING');
  const r = await L.createAsr({ asrDir: VENDOR, modelsDir: path.join(VENDOR, 'models'), ffmpeg: ffmpeg(), cacheDir: path.join(os.tmpdir(), 'mc-meta-cache') }).transcribe(file, {});
  a.equal(r.status, 'complete'); a.ok(r.words.length > 5, 'Paraformer read the sentence');
});

test('real Meta model: English through the child process, no 「。」; killed mid-way, Paraformer still transcribes', { skip: !(ENGINE && META) && 'set MONTCLIP_TEST_META_DIR to a folder holding asrMeta/ (and have vendor/asr)' }, async (t) => {
  const dir = tmp(t), speech = tts(dir, 'the quick brown fox jumps over the lazy dog. please call stella and ask her to bring these things with her from the store.');
  if (!speech) { t.skip('no TTS here'); return; }
  const cache = path.join(os.tmpdir(), 'mc-meta-cache');
  const r = await createMetaEngine({ asrDir: VENDOR, modelsDir: path.resolve(META), ffmpeg: ffmpeg(), cacheDir: cache }).transcribe(speech, {});
  a.equal(r.status, 'complete'); a.equal(r.language, 'auto');
  const text = r.words.map((w) => w[0]).join(' ');
  a.match(text, /quick brown fox/); a.ok(!/[。，？！]/.test(text), 'no Chinese punctuation on English: ' + text);
  let child = null;
  const p = createMetaEngine({ asrDir: VENDOR, modelsDir: path.resolve(META), ffmpeg: ffmpeg(), cacheDir: cache, fork: (...x) => (child = cp.fork(...x)) }).transcribe(speech, {});
  setTimeout(() => child.kill('SIGKILL'), 500);
  await a.rejects(p, { code: 'ASR_OPTIONAL_CRASHED' });
  const para = await L.createAsr({ asrDir: VENDOR, modelsDir: path.join(VENDOR, 'models'), ffmpeg: ffmpeg(), cacheDir: cache }).transcribe(speech, {});
  a.equal(para.status, 'complete'); a.ok(para.words.length > 5);
});
