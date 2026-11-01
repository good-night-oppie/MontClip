"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const { once } = require("node:events");
const { trackOwnedProcesses } = require("../owned-processes");
const fs = require("node:fs");
const vm = require("node:vm");

test("desktop shutdown kills only children created by this service", async () => {
  const args = ["-e", "setInterval(() => {}, 1000)"];
  const unrelated = cp.spawn(process.execPath, args, { stdio: "ignore" });
  const tracker = trackOwnedProcesses(cp);
  const first = cp.spawn(process.execPath, args, { stdio: "ignore" });
  const second = cp.execFile(process.execPath, args);
  try {
    await Promise.all([once(first, "spawn"), once(second, "spawn")]);
    const exits = Promise.all([once(first, "exit"), once(second, "exit")]);
    tracker.stop();
    await exits;
    assert.equal(unrelated.exitCode, null);
    assert.equal(unrelated.killed, false);
    assert.throws(() => cp.spawn(process.execPath, args), /shutting down/);
    tracker.stop();
  } finally { tracker.restore(); unrelated.kill(); first.kill(); second.kill(); }
});

test("shutdown interrupts a pending denoise probe without blocking the service", async () => {
  const tracker = trackOwnedProcesses(cp);
  let child;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../denoise"), "utf8"), {
    module, require: (name) => name === "child_process" ? {
      spawnSync() { throw new Error("probe must not block shutdown"); },
      execFile(_file, _args, options, callback) {
        child = cp.execFile(process.execPath, ["-e", "setInterval(() => {}, 1000)"], options, callback);
        return child;
      },
    } : require(name),
  });
  try {
    const pending = module.exports.denoiseFile("missing-input.wav", "missing-output", "medium");
    const rejected = assert.rejects(pending, /ffprobe failed/);
    await once(child, "spawn");
    const exited = once(child, "exit");
    tracker.stop();
    await exited;
    await rejected;
  } finally { tracker.restore(); child?.kill(); }
});
