"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "MontClip 中文 smoke "));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [__dirname, "--montclip-smoke", "--user-data-dir=" + dir], {
  env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (data) => { output += data; process.stdout.write(data); });
child.stderr.on("data", (data) => process.stderr.write(data));
const timer = setTimeout(() => { console.error("Electron smoke timed out; data retained at " + dir); child.kill(); }, 45000);
child.on("exit", (code) => {
  clearTimeout(timer);
  let pass = false;
  try {
    const line = output.split(/\r?\n/).find((line) => line.startsWith("MONTCLIP_SMOKE "));
    const result = JSON.parse(line.slice("MONTCLIP_SMOKE ".length));
    pass = result.apiStatus === 200 && ["nodeUnavailable", "projectLoaded", "externalBlocked", "compositor", "saved"]
      .every((key) => result[key] === true);
  } catch { }
  process.exitCode = code || (pass ? 0 : 1);
  console.log("Smoke data: " + dir);
});
