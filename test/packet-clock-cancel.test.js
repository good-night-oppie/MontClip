"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const { EventEmitter } = require("node:events"), { PassThrough } = require("node:stream");
function fixture() {
  const child = new EventEmitter(); child.stdout = new PassThrough();
  child.kill = () => { queueMicrotask(() => child.emit("close", null, "SIGTERM")); return true; };
  let started; const ready = new Promise(r => { started = r; });
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../packet-clock"), "utf8"), {
    module: mod, setTimeout, clearTimeout, require(name) {
      if (name === "node:fs") return { promises: { stat: async () => ({ size: 10 }) } };
      if (name === "./ffmpeg-path") return { path: name => name };
      if (name === "node:child_process") return {
        execFile(_bin, _args, _options, callback) { queueMicrotask(() => callback(null, JSON.stringify({ streams: [{ index: 0, codec_type: "video" }] }))); },
        spawn() { started(); return child; },
      };
      throw new Error(name);
    },
  });
  return { scan: mod.exports.scanFile, child, ready };
}
test("cancelling an active scanner handles SIGTERM without throwing from close", async () => {
  const f = fixture(), ctrl = new AbortController();
  const result = f.scan("file", { signal: ctrl.signal }); await f.ready;
  ctrl.abort(); await a.rejects(result, /cancelled/);
});
test("packet timeout discards the partial scan even on signal termination", async () => {
  const f = fixture(); const result = f.scan("file", { timeoutMs: 1 });
  await f.ready; f.child.stdout.write("pts_time=0|dts_time=0|duration_time=1\n");
  await a.rejects(result, /partial scan discarded/);
});
test("normal completion removes the caller's abort listener", async () => {
  const f = fixture(), ctrl = new AbortController(); let listeners = 0;
  const add = ctrl.signal.addEventListener.bind(ctrl.signal), remove = ctrl.signal.removeEventListener.bind(ctrl.signal);
  ctrl.signal.addEventListener = (...args) => { listeners++; add(...args); };
  ctrl.signal.removeEventListener = (...args) => { listeners--; remove(...args); };
  const result = f.scan("file", { signal: ctrl.signal }); await f.ready;
  f.child.stdout.write("pts_time=0|dts_time=0|duration_time=1\n"); f.child.emit("close", 0, null);
  await result; a.equal(listeners, 0);
});
