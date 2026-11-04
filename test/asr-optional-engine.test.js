'use strict';
// The optional engine (Meta Omnilingual, asr-optional-engine.js) runs each transcription in a process of its own, so a
// broken model, a crash or too little memory fails only that engine, in plain words: the server and the default engine
// (asr-local.js, Paraformer) go on. Its words follow MontClip's rules: one Chinese character is one word, other scripts
// are put back into whole words. Stand-in runners here; the real engine where vendor/asr has it (a damaged model), and
// the real model only when MONTCLIP_TEST_OMNI_DIR points at one (synthetic speech: Windows' TTS or ffmpeg's lavfi flite, never a person).
const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const OW = require('../asr-optional-words');
const { createOptionalAsr } = require('../asr-optional-engine');
const { manifest } = require('../asr-models');
const { wav } = require('./songs-synth');
const T = require('../transcribe');

const ffmpeg = () => require('../ffmpeg-path').path('ffmpeg');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-asr-opt-eng-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('words: one Chinese character is one word; other scripts are whole words up to the space; times in file seconds', () => {
  const zh = { tokens: ['特', '朗', '普', ' ', '雷', '杰'], timestamps: [3.94, 4.1, 4.3, 6.3, 6.38, 6.56] };
  a.deepEqual(OW.words(zh, { offset: 10, end: 17.1 }), [['特', 13.94, 14.1], ['朗', 14.1, 14.3], ['普', 14.3, 14.8], ['雷', 16.38, 16.56], ['杰', 16.56, 17.06]]);
  const en = { tokens: ['a', 's', 'k', ' ', 'n', 'o', 't', ' ', '<unk>', 'w', 'h', 'y'], timestamps: [0.14, 0.28, 0.36, 0.46, 0.5, 0.54, 0.58, 0.62, 0.63, 0.64, 0.66, 0.7] };
  a.deepEqual(OW.words(en, { offset: 0, end: 1 }), [['ask', 0.14, 0.5], ['not', 0.5, 0.64], ['why', 0.64, 1]]);
  // mixed: Chinese characters split, Latin letters kept together even without a space
  a.deepEqual(OW.words({ tokens: ['我', '用', 'o', 'k', '的'], timestamps: [0, 0.2, 0.4, 0.5, 0.7] }, { offset: 0, end: 1 }).map((w) => w[0]), ['我', '用', 'ok', '的']);
  a.deepEqual(OW.words({ tokens: ['a'], timestamps: [] }), [], 'no times for every token: no made-up times');
  a.equal(T.text(OW.words(zh, { offset: 0, end: 8 })), '特朗普雷杰', 'read without spaces, as the default engine');
  a.equal(T.text(OW.words(en, { offset: 0, end: 1 })), 'ask not why');
});

/** An engine folder the parent accepts (the engine's package.json, a VAD of the pinned size), a store with one ready model. */
function setup(t, { ramMB = 10, ready = true } = {}) {
  const dir = tmp(t);
  const pkg = path.join(dir, 'engine', 'node_modules', 'sherpa-onnx-node'); fs.mkdirSync(pkg, { recursive: true }); fs.writeFileSync(path.join(pkg, 'package.json'), '{}');
  const vad = path.join(dir, manifest.engine.vad.file); fs.writeFileSync(vad, ''); fs.truncateSync(vad, manifest.engine.vad.size);
  const model = path.join(dir, 'model'); fs.mkdirSync(model);
  const store = { active: () => 'omni-test', status: () => ({ name: 'Omni test', ramMB, missing: ready ? [] : ['tokens.txt'], bad: [] }), dir: () => (ready ? model : null) };
  const file = path.join(dir, 'rec.wav'); fs.writeFileSync(file, wav([['talk', 3]]));
  const runner = (code) => { const f = path.join(dir, 'runner-' + Math.random().toString(36).slice(2) + '.js'); fs.writeFileSync(f, code); return f; };
  return { dir, store, file, runner };
}

test('a runner that crashes (abort) or dies (out of memory): only the optional engine fails, in plain words; the parent goes on', async (t) => {
  const S = setup(t);
  for (const code of ['process.abort();', 'process.on("message", () => process.exit(137));', 'process.on("message", () => { const a = []; for (;;) a.push(new Array(1e6).fill(1)); });']) {
    const asr = createOptionalAsr({ asrDir: S.dir, optional: S.store, ffmpeg: ffmpeg(), runner: S.runner(code),
      ...(code.includes('fill') ? { fork: (m, args, o) => require('node:child_process').fork(m, args, { ...o, execArgv: ['--max-old-space-size=32'] }) } : {}) });
    await a.rejects(asr.transcribe(S.file, {}), (e) => e.code === 'ASR_OPTIONAL_CRASHED' && /default engine is not affected/.test(e.message) && e.model === 'omni-test', code);
  }
  // the same parent then runs a good transcription
  const good = createOptionalAsr({ asrDir: S.dir, optional: S.store, ffmpeg: ffmpeg(),
    runner: S.runner('process.once("message", (j) => process.send({ t: "done", result: { status: "complete", gaps: [], skippedSegments: 0, words: [["hello", 0, 0.4]], duration: 3, speech: 1, segments: 1, punctuated: false } }, () => process.disconnect()));') });
  const r = await good.transcribe(S.file, {});
  a.equal(r.model, 'omni-test'); a.equal(r.language, 'multi'); a.deepEqual(r.words, [['hello', 0, 0.4]]);
});

test('an error the engine reports keeps its code; cancel stops the child', async (t) => {
  const S = setup(t);
  const bad = createOptionalAsr({ asrDir: S.dir, optional: S.store, ffmpeg: ffmpeg(),
    runner: S.runner('process.once("message", () => process.send({ t: "error", code: "ASR_READ_FAILED", message: "ffmpeg could not read the sound" }, () => process.disconnect()));') });
  await a.rejects(bad.transcribe(S.file, {}), { code: 'ASR_READ_FAILED' });
  let child = null;
  const hang = createOptionalAsr({ asrDir: S.dir, optional: S.store, ffmpeg: ffmpeg(), runner: S.runner('setInterval(() => {}, 1000);'),
    fork: (...x) => (child = require('node:child_process').fork(...x)) });
  const ac = new AbortController();
  const p = hang.transcribe(S.file, { signal: ac.signal });
  setTimeout(() => ac.abort(), 200);
  await a.rejects(p, { code: 'ASR_CANCELLED' });
  await new Promise((r) => (child.exitCode != null || child.signalCode ? r() : child.once('exit', r)));
  a.ok(child.killed || child.exitCode != null || child.signalCode, 'the child is gone');
});

test('not enough free memory, or the model\'s files missing: refused before anything starts, in plain words', async (t) => {
  let forked = 0;
  const S = setup(t, { ramMB: 4000 });
  const asr = createOptionalAsr({ asrDir: S.dir, optional: S.store, ffmpeg: ffmpeg(), freeMem: () => 1000 * 1048576, fork: () => { forked++; throw new Error('no'); } });
  await a.rejects(asr.transcribe(S.file, {}), (e) => e.code === 'ASR_OPTIONAL_NO_MEMORY' && e.needMB === 4000 && e.freeMB === 1000);
  const S2 = setup(t, { ready: false });
  const asr2 = createOptionalAsr({ asrDir: S2.dir, optional: S2.store, ffmpeg: ffmpeg(), fork: () => { forked++; throw new Error('no'); } });
  await a.rejects(asr2.transcribe(S2.file, {}), (e) => e.code === 'ASR_OPTIONAL_NOT_READY' && /tokens\.txt/.test(e.message));
  a.equal(forked, 0, 'no process started');
});

test('the server: a model agreed to but with a file deleted is not used — transcription goes to the default engine', async (t) => {
  const { startServer, makeDataDir } = require('./helpers');
  const O = require('../asr-optional');
  const dataDir = makeDataDir(t), models = path.join(dataDir, 'models');
  const id = Object.keys(O.manifest.models)[0], x = O.manifest.models[id];
  // a consent record as select() writes it, and no model files at all
  fs.mkdirSync(path.join(models, 'optional', '.consent'), { recursive: true });
  fs.writeFileSync(path.join(models, 'optional', '.consent', id + '.json'), JSON.stringify({ model: id, revision: x.revision, licenseSha256: x.license.sha256, agreedAt: '2026-11-04T00:00:00Z', montclipVersion: 't' }));
  const asrDir = path.join(dataDir, 'asr'); fs.mkdirSync(path.join(asrDir, 'engine', 'node_modules', 'sherpa-onnx-node'), { recursive: true });
  fs.writeFileSync(path.join(asrDir, 'engine', 'node_modules', 'sherpa-onnx-node', 'package.json'), '{}');
  fs.writeFileSync(path.join(asrDir, 'silero_vad.onnx'), Buffer.alloc(manifest.engine.vad.size));
  const s = await startServer(t, dataDir, { MONTCLIP_ASR_DIR: asrDir, MONTCLIP_ASR_MODELS_DIR: models });
  const st = await (await fetch(s.base + '/api/asr/status')).json();
  a.equal(st.optional.active, null);
  const m = st.optional.models.find((y) => y.id === id);
  a.equal(m.consented, true); a.equal(m.installed, false); a.equal(m.ready, false);
  const media = path.join(dataDir, 'media', 'a.wav'); fs.mkdirSync(path.dirname(media), { recursive: true }); fs.writeFileSync(media, wav([['talk', 1]]));
  const r = await fetch(s.base + '/api/asr/transcribe', { method: 'POST', body: JSON.stringify({ src: '/media/a.wav' }) });
  const j = await r.json();
  a.equal(r.status, 409); a.equal(j.code, 'ASR_MODEL_MISSING', 'the default path (its own model is not here either)'); a.equal(j.engine, undefined);
});

// ── the real engine (sherpa-onnx-node 2.0.1 from vendor/asr; CI has none) ──
const VENDOR = path.resolve(process.env.MONTCLIP_ASR_DIR || path.join(ROOT, 'vendor', 'asr'));
const ENGINE = fs.existsSync(path.join(VENDOR, 'engine', 'node_modules', 'sherpa-onnx-node', 'package.json')) && fs.existsSync(path.join(VENDOR, manifest.engine.vad.file));

test('the real engine and a damaged model: the optional engine fails in plain words; the server process is untouched', { skip: !ENGINE && 'no vendor/asr engine here' }, async (t) => {
  const dir = tmp(t), model = path.join(dir, 'model'); fs.mkdirSync(model);
  fs.writeFileSync(path.join(model, 'model.int8.onnx'), Buffer.from('this is not an onnx model'.repeat(100)));
  fs.writeFileSync(path.join(model, 'tokens.txt'), '<s> 0\n<pad> 1\n</s> 2\n<unk> 3\n');
  const file = path.join(dir, 'rec.wav'); fs.writeFileSync(file, wav([['talk', 2]]));
  const store = { active: () => 'omni-broken', status: () => ({ name: 'broken', ramMB: 0, missing: [], bad: [] }), dir: () => model };
  const asr = createOptionalAsr({ asrDir: VENDOR, optional: store, ffmpeg: ffmpeg(), threads: 1 });
  const before = process.memoryUsage().rss;
  await a.rejects(asr.transcribe(file, {}), (e) => /^ASR_OPTIONAL_(MODEL_BROKEN|CRASHED)$/.test(e.code) && e.model === 'omni-broken');
  a.ok(process.memoryUsage().rss > 0 && before > 0, 'this process is still here');
});

const OMNI = process.env.MONTCLIP_TEST_OMNI_DIR;
/** Synthetic English speech (no person's voice): Windows' own TTS, else ffmpeg's lavfi flite voice where ffmpeg has
 *  it (Linux builds with libflite). null where there is neither. */
function tts(dir, text) {
  const out = path.join(dir, 'tts.wav');
  if (process.platform !== 'win32') {
    try { execFileSync(ffmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', `flite=text='${text.replace(/[':\\]/g, ' ')}':voice=slt`, '-ar', '16000', '-y', out], { stdio: 'ignore', timeout: 60000 }); } catch { return null; }
    return fs.existsSync(out) && fs.statSync(out).size > 10000 ? out : null;
  }
  const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1; $s.SetOutputToWaveFile('${out.replace(/'/g, "''")}'); $s.Speak('${text}'); $s.Dispose()`;
  try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 60000 }); } catch { return null; }
  return fs.existsSync(out) && fs.statSync(out).size > 10000 ? out : null;
}
test('the real model on synthetic English speech: whole words with times, through the child process', { skip: !(ENGINE && OMNI) && 'set MONTCLIP_TEST_OMNI_DIR to an Omnilingual model folder (and have vendor/asr)' }, async (t) => {
  const dir = tmp(t), sentence = 'the quick brown fox jumps over the lazy dog. please call stella and ask her to bring these things with her from the store.';
  const speech = tts(dir, sentence);
  if (!speech) { t.skip('no TTS on this computer'); return; }
  const file = path.join(dir, 'speech.mp4');
  // speech, two seconds of silence, speech again: the VAD makes more than one segment
  execFileSync(ffmpeg(), ['-v', 'error', '-i', speech, '-f', 'lavfi', '-t', '2', '-i', 'anullsrc=r=16000:cl=mono', '-i', speech, '-filter_complex', '[0:a]aresample=16000[a];[2:a]aresample=16000[b];[a][1:a][b]concat=n=3:v=0:a=1', '-c:a', 'aac', file]);
  const store = { active: () => 'omni', status: () => ({ name: 'omni', ramMB: 0, missing: [], bad: [] }), dir: () => OMNI };
  const asr = createOptionalAsr({ asrDir: VENDOR, optional: store, ffmpeg: ffmpeg(), threads: 4 });
  const fr = [];
  const r = await asr.transcribe(file, { duration: 30, onProgress: (f) => fr.push(f) });
  a.equal(r.status, 'complete'); a.ok(r.segments >= 2, 'segments: ' + r.segments);
  const said = sentence.replace(/[.,]/g, '').split(' ');
  const got = new Set(r.words.map((w) => w[0]));
  const hit = said.filter((w) => got.has(w)).length / said.length;
  a.ok(hit >= 0.7, `words recognised ${hit.toFixed(2)}: ${T.text(r.words)}`);
  for (const w of r.words) a.ok(w[2] >= w[1] && w[1] >= 0 && w[2] <= r.duration + 0.01, JSON.stringify(w));
  a.ok(r.words.some((w) => w[1] > r.words[0][1] + 5), 'the second sentence is placed after the silence');
  a.ok(fr.length > 0);
});
