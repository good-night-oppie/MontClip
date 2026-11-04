/* Development only: fetch an optional model with MontClip's own download code (asr-optional.js download(): the pinned
   hosts, redirects checked, every file against its SHA-256, the folder moved into place in one step), into a folder of
   your choosing, for the tests (MONTCLIP_TEST_OMNI_DIR) and rtf.cjs. It writes NO consent record: in the app only the
   streamer agrees, in the host's own box.
     node docs/validation/2026-11-04-omnilingual-asr/fetch-model.cjs <dir> [model id] [source index]
   → <dir>/optional/<model id>/{model.int8.onnx, tokens.txt, LICENSE} */
"use strict";
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..", "..");
const O = require(path.join(ROOT, "asr-optional"));
const D = require(path.join(ROOT, "asr-download"));
const [dir, id = Object.keys(O.manifest.models)[0], source = "0"] = process.argv.slice(2);
if (!dir) { console.error("usage: fetch-model.cjs <dir> [model id] [source index]"); process.exit(2); }
const store = O.createOptional({ userDir: path.resolve(dir) });
let last = 0;
store.download(id, { source: Number(source), fetchFile: (u, d, o) => D.fetchFile(u, d, { ...o, hosts: O.manifest.hosts }),
  onProgress: (p) => { if (Date.now() - last > 2000) { last = Date.now(); process.stderr.write(`${p.file} ${Math.round(p.loaded / 1048576)}/${Math.round(p.total / 1048576)} MB\n`); } } })
  .then((r) => { const s = store.status(id); console.log(JSON.stringify({ id, source: r.source, installed: s.installed, consented: s.consented, dir: path.join(path.resolve(dir), "optional", id) })); },
    (e) => { console.error(e.code, e.message); process.exit(1); });
