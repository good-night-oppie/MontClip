// Which audio track does each MontClip module read? node probe-tracks.cjs <file>... (MONTCLIP_FFMPEG_DIR as for the app)
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const repo = path.join(__dirname, "..", "..", ".."), files = process.argv.slice(2);
const ffmpeg = require(path.join(repo, "ffmpeg-path")).path("ffmpeg");
const AW = require(path.join(repo, "audio-window"));
const { manifest } = require(path.join(repo, "asr-models"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-probe-"));
// classify from per-0.5s dB levels (and optional per-0.5s Hz)
function classify(db, hz) {
  const at = (t) => db[Math.floor(t / 0.5)] ?? -90;
  const early = Math.max(at(1), at(2), at(3)), mid = Math.min(at(7), at(10), at(13)), late = Math.max(at(16), at(18));
  let who;
  const f10 = hz && hz[Math.floor(10 / 0.5)];
  if (early < -60 && late < -60 && mid > -40) who = "第1轨 麦克风";
  else if (f10) who = f10 < 330 ? "第0轨 游戏声" : f10 > 660 ? "第2轨 BGM" : "?";
  else who = at(1) > -33 ? "第0轨 游戏声" : "第2轨 BGM";
  who += " [" + Math.round(at(1)) + "/" + Math.round(at(10)) + " dB]";
  const f = hz ? " ~" + Math.round(hz[Math.floor(10 / 0.5)]) + "Hz@10s" : "";
  return who + f;
}
function pcmStats(samples, rate) {
  const per = rate / 2, db = [], hz = [];
  for (let i = 0; i + per <= samples.length; i += per) {
    let s = 0, zc = 0;
    for (let k = i; k < i + per; k++) { s += samples[k] * samples[k]; if (k > i && (samples[k - 1] < 0) !== (samples[k] < 0)) zc++; }
    db.push(10 * Math.log10(s / per + 1e-12)); hz.push(zc / 2 / 0.5);
  }
  return { db, hz };
}
async function main() {
  for (const file of files) {
    const out = { file: path.basename(file) };
    // song-scan
    const ss = require(path.join(repo, "song-scan")).createSongScan({ dir: path.join(tmp, "songs-" + out.file), ffmpeg });
    const r = await ss.scan(file);
    out.songScan = classify(r.rows.map((x) => x[0]), r.rows.map((x) => x[2]));
    // signals
    const sg = require(path.join(repo, "signals")).createSignals({ dir: path.join(tmp, "sig-" + out.file), ffmpeg });
    out.signals = classify((await sg.loudness(file)).values);
    // audio-window (export mix)
    const wav = path.join(tmp, out.file + ".wav");
    const p = spawnSync(ffmpeg, AW.windowArgs(file, 0, 20, wav));
    if (p.status) throw new Error(String(p.stderr));
    const buf = fs.readFileSync(wav), h = AW.wavChunks(buf);
    const ch = h.fmt.channels, n = h.data.size / 4 / ch, mono = new Float32Array(n);
    for (let i = 0; i < n; i++) mono[i] = buf.readFloatLE(h.data.offset + i * ch * 4);   // channel 0
    const st = pcmStats(mono, 48000);
    out.audioWindow = classify(st.db, st.hz) + " ch=" + ch;
    // asr-local with a stand-in engine that keeps every sample it is given
    const got = [];
    class Vad { constructor() { this.q = []; } acceptWaveform(f) { for (const x of f) got.push(x); } flush() {} isEmpty() { return true; } front() {} pop() {} }
    const sherpa = { Vad, OfflineRecognizer: { createAsync: async () => ({}) }, OfflinePunctuation: class {} };
    const dir = path.join(tmp, "asr-" + out.file);
    const pkg = path.join(dir, "engine", "node_modules", "sherpa-onnx-node"); fs.mkdirSync(pkg, { recursive: true }); fs.writeFileSync(path.join(pkg, "package.json"), "{}");
    const vad = path.join(dir, manifest.engine.vad.file); fs.mkdirSync(path.dirname(vad), { recursive: true }); fs.writeFileSync(vad, ""); fs.truncateSync(vad, manifest.engine.vad.size);
    const model = path.join(dir, "model"); fs.mkdirSync(model);
    const store = { dir: (k) => (k === "asr" ? model : null), status: () => ({ asr: { ready: true, missing: [], bad: [] }, punct: { ready: false, missing: [], bad: [] } }) };
    const asr = require(path.join(repo, "asr-local")).createAsr({ asrDir: dir, store, ffmpeg, sherpa });
    try { await asr.transcribe(file); } catch (e) { /* no words: fine, we only want the samples */ }
    const sa = pcmStats(Float32Array.from(got), 16000);
    out.asrLocal = classify(sa.db, sa.hz);
    console.log(JSON.stringify(out));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
