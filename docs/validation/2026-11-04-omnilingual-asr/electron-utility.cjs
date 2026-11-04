/* Development check: in the desktop app the local server runs in Electron's utilityProcess, and the optional engine
   forks its own child from there (process.execPath + ELECTRON_RUN_AS_NODE=1). This runs exactly that, in Electron:
     <electron> docs/validation/2026-11-04-omnilingual-asr/electron-utility.cjs <model folder> <audio file> [crash]
   The utility process transcribes with asr-optional-engine.js and reports the words (and, with "crash", what happens
   when the model is damaged: the utility process must stay up and answer a second request). Prints JSON lines. */
"use strict";
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..", "..");
if (process.parentPort) {   // the utility process
  const { createOptionalAsr } = require(path.join(ROOT, "asr-optional-engine"));
  const FF = require(path.join(ROOT, "ffmpeg-path"));
  process.parentPort.on("message", async ({ data }) => {
    const store = { active: () => "check", status: () => ({ name: "check", ramMB: 0, missing: [], bad: [] }), dir: () => data.modelDir };
    const asr = createOptionalAsr({ asrDir: path.join(ROOT, "vendor", "asr"), optional: store, ffmpeg: FF.path("ffmpeg"), threads: 4 });
    try {
      const r = await asr.transcribe(data.file, {});
      process.parentPort.postMessage({ ok: true, pid: process.pid, words: r.words.length, text: r.words.map((w) => w[0]).join(" "), first: r.words[0], maxRssMB: r.maxRssMB });
    } catch (e) { process.parentPort.postMessage({ ok: false, pid: process.pid, code: e.code, message: String(e.message).slice(0, 200) }); }
  });
} else {
  const { app, utilityProcess } = require("electron");
  const [modelDir, file, crash] = process.argv.slice(-3).filter((x) => !x.endsWith(".cjs"));
  app.whenReady().then(async () => {
    const child = utilityProcess.fork(__filename, [], { stdio: "inherit" });
    const ask = (d) => new Promise((resolve) => { child.once("message", resolve); child.postMessage(d); });
    const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
    if (crash === "crash") {
      const fs = require("node:fs"), os = require("node:os");
      const bad = fs.mkdtempSync(path.join(os.tmpdir(), "omni-bad-"));
      fs.writeFileSync(path.join(bad, "model.int8.onnx"), Buffer.alloc(4096, 7));
      fs.writeFileSync(path.join(bad, "tokens.txt"), "<s> 0\n");
      out({ step: "damaged model", ...(await ask({ modelDir: bad, file })) });
    }
    out({ step: "model", ...(await ask({ modelDir: path.resolve(modelDir), file: path.resolve(file) })) });
    child.kill();
    app.quit();
  });
}
