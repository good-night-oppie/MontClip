/* FableCut speech-to-text worker (a module worker started by the editor).

   Runs Whisper with transformers.js, imported from the app (transcribe.js
   LIBRARY) only when something is transcribed. The ONNX Runtime wasm and the
   model files load from the app too (transcribe.js ASSETS); remote models are
   off, so nothing is fetched from the network (owner, 2026-11-03).
   One piece of audio at a time (≤ 30 s, 16 kHz mono, planned by
   transcribe.js), so the editor can report progress and stop between pieces.

   in:  {type:"run", id, lib, assets, model, pcm: Float32Array, language: "en" | null}
   out: {type:"progress", status, file, loaded, total}   — while the model loads
        {type:"done", id, chunks:[{text, timestamp:[s, e]}]} · {type:"error", id, error} */
let asr = null, asrModel = "";

async function load(m) {
  const { model } = m;
  if (asr && asrModel === model) return asr;
  const T = await import(new URL(m.lib, self.location.href).href);
  // everything from the app: no Hugging Face, no CDN, no browser cache of a download
  T.env.allowRemoteModels = false;
  T.env.allowLocalModels = true;
  // a path, not an http URL: transformers.js 4.3.1 checks that a local file exists (the tokenizer files) only for paths
  // without a protocol, and with a URL would load no tokenizer
  T.env.localModelPath = m.assets + "models/";
  T.env.useBrowserCache = false;
  T.env.backends.onnx.wasm.wasmPaths = { mjs: new URL(m.assets + "ort/ort-wasm-simd-threaded.jsep.mjs", self.location.href).href,
    wasm: new URL(m.assets + "ort/ort-wasm-simd-threaded.jsep.wasm", self.location.href).href };
  asr = await T.pipeline("automatic-speech-recognition", model, {
    dtype: "q8", device: "wasm",
    progress_callback: (p) => {
      if (!p || (p.status !== "progress" && p.status !== "initiate" && p.status !== "done")) return;
      self.postMessage({ type: "progress", status: p.status, file: p.file || "", loaded: p.loaded || 0, total: p.total || 0 });
    },
  });
  asrModel = model;
  return asr;
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type !== "run") return;
  try {
    const run = await load(m);
    const out = await run(m.pcm, { return_timestamps: "word", ...(m.language ? { language: m.language, task: "transcribe" } : {}) });
    self.postMessage({ type: "done", id: m.id, chunks: (out && out.chunks) || [] });
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, error: String((err && err.message) || err) });
  }
};
