"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
test("desktop queue never spawns a system browser for any job kind", () => {
  let spawned = 0;
  const ctx = { module: { exports: {} }, process: { ...process, env: { ...process.env, FABLECUT_CHROME: process.execPath } },
    setInterval, clearInterval, setTimeout, console,
    require: (id) => id === "child_process" || id === "node:child_process"
      ? { spawn: () => { spawned++; throw new Error("SYSTEM_BROWSER_SPAWNED"); } } : require(id) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../server/export-jobs.js"), "utf8"), ctx);
  for (const editors of [0, 1]) {
    const jobs = ctx.module.exports.createExportJobs({ allowHeadless: false, editors: () => editors, url: () => "http://127.0.0.1:1", broadcast() {} });
    try {
      for (const kind of ["export", "transcribe", "scopes", "track"]) {
        assert.throws(() => jobs.request({ kind, where: "headless" }), (e) => e.code === 409 && e.errorCode === "HEADLESS_DISABLED");
        if (!editors) assert.throws(() => jobs.request({ kind, where: "auto" }), (e) => e.code === 409 && e.errorCode === "EDITOR_NOT_READY");
      }
      if (editors) assert.equal(jobs.request({ where: "auto" }).via, "tab");
    } finally { jobs.shutdown(); }
  }
  assert.equal(spawned, 0);
});
