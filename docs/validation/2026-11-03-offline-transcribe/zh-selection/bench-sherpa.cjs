'use strict';
// Evaluation only (not product code): sherpa-onnx-node, offline, a long 16 kHz mono WAV split by Silero VAD, each
// segment decoded; reports time, peak memory, CER against a reference text, and whether timestamps come back.
// The WAV is read here, in JavaScript (16-bit PCM mono): sherpa.readWave returns an external buffer, which Electron's
// memory cage refuses ("External buffers are not allowed"), so this also runs under ELECTRON_RUN_AS_NODE=1.
//   node bench-sherpa.cjs --kind paraformer|sensevoice --model <onnx> --tokens <txt> --vad <onnx> --wav <wav> [--ref <txt>] [--threads 4]
const fs = require('fs');
const sherpa = require('sherpa-onnx-node');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const kind = arg('--kind'), threads = Number(arg('--threads', 4));
const modelConfig = { tokens: arg('--tokens'), numThreads: threads, provider: 'cpu', debug: 0 };
if (kind === 'paraformer') modelConfig.paraformer = { model: arg('--model') };
else modelConfig.senseVoice = { model: arg('--model'), language: 'zh', useInverseTextNormalization: 1 };
let peak = 0; const sample = () => { peak = Math.max(peak, process.memoryUsage().rss); };
const tick = setInterval(sample, 200);
const t0 = Date.now();
const recognizer = new sherpa.OfflineRecognizer({ featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig });
const tLoad = Date.now() - t0;
const wave = (() => { const b = fs.readFileSync(arg("--wav")); let o = 12, d = null; while (o < b.length) { const id = b.toString("ascii", o, o + 4), n = b.readUInt32LE(o + 4); if (id === "data") { d = b.subarray(o + 8, o + 8 + n); break; } o += 8 + n + (n & 1); } const s = new Float32Array(d.length >> 1); for (let i = 0; i < s.length; i++) s[i] = d.readInt16LE(i * 2) / 32768; return { samples: s, sampleRate: 16000 }; })();
const vad = new sherpa.Vad({ sileroVad: { model: arg('--vad'), threshold: 0.5, minSpeechDuration: 0.25, minSilenceDuration: 0.5, maxSpeechDuration: 20, windowSize: 512 },
  sampleRate: 16000, debug: false, numThreads: 1 }, 60);
const segs = [];
const decode = () => {
  while (!vad.isEmpty()) {
    const seg = vad.front(false); vad.pop();
    const s = recognizer.createStream();
    s.acceptWaveform({ sampleRate: 16000, samples: seg.samples });
    recognizer.decode(s);
    const r = recognizer.getResult(s);
    segs.push({ start: seg.start / 16000, text: r.text, ts: (r.timestamps || []).length, tokens: (r.tokens || []).length });
    sample();
  }
};
const t1 = Date.now();
for (let i = 0; i < wave.samples.length; i += 512) { vad.acceptWaveform(wave.samples.subarray(i, i + 512)); decode(); }
vad.flush(); decode();
const ms = Date.now() - t1;
clearInterval(tick); sample();
const seconds = wave.samples.length / wave.sampleRate;
const hyp = segs.map((s) => s.text).join('');
const out = { kind, model: arg('--model').split(/[\\/]/).slice(-2).join('/'), threads, audioSeconds: Math.round(seconds * 100) / 100, loadMs: tLoad, decodeMs: ms,
  secondsPerAudioHour: Math.round(ms / 1000 / seconds * 3600), rtf: Math.round(ms / 1000 / seconds * 1000) / 1000, peakRssMB: Math.round(peak / 1048576),
  segments: segs.length, timestamps: segs.every((s) => s.ts > 0 && s.ts === s.tokens) ? 'per token' : segs.some((s) => s.ts > 0) ? 'some' : 'none' };
if (arg('--ref')) Object.assign(out, require('./cer.cjs').cer(fs.readFileSync(arg('--ref'), 'utf8'), hyp));
out.sample = hyp.slice(0, 120);
console.log(JSON.stringify(out));
