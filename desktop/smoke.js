"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "MontClip 中文 smoke "));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const fault = process.argv.includes("--close-crash") ? "--close-crash" : process.argv.includes("--close-timeout") ? "--close-timeout" : null;
const m0 = process.argv.includes("--m0");
const flv = process.argv.includes("--flv");
const nativeFlv = process.argv.includes("--flv-native");
const child = spawn(require("electron"), [__dirname, "--montclip-smoke", ...(fault ? [fault] : []), ...(m0 ? ["--m0"] : []), ...(flv ? ["--flv"] : []), ...(nativeFlv ? ["--flv-native"] : []), "--user-data-dir=" + dir], {
  env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (data) => { output += data; process.stdout.write(data); });
child.stderr.on("data", (data) => process.stderr.write(data));
const timer = setTimeout(() => { console.error("Electron smoke timed out; data retained at " + dir); child.kill(); }, m0 ? 180000 : 45000);
child.on("exit", (code) => {
  clearTimeout(timer);
  let pass = false;
  try {
    if (fault) {
      const prompts = output.split(/\r?\n/).filter((line) => line.startsWith("MONTCLIP_CLOSE_PROMPT ")).map((line) => JSON.parse(line.slice("MONTCLIP_CLOSE_PROMPT ".length)));
      pass = prompts.length === 2 && prompts[0].choice === 0 && prompts[1].choice === 1 && prompts.every((p) => p.default === 0);
    } else {
    const line = output.split(/\r?\n/).find((line) => line.startsWith("MONTCLIP_SMOKE "));
    const result = JSON.parse(line.slice("MONTCLIP_SMOKE ".length));
    pass = result.apiStatus === 200 && ["nodeUnavailable", "projectLoaded", "externalBlocked", "viewPreserved", "compositor", "saved"]
      .every((key) => result[key] === true);
    }
  } catch { }
  if (m0 && !output.includes("MONTCLIP_M0 ")) pass = false;
  if (flv && !output.includes("MONTCLIP_FLV ")) pass = false;
  if (nativeFlv && !output.includes("MONTCLIP_NATIVE_FLV ")) pass = false;
  process.exitCode = code || (pass ? 0 : 1);
  console.log("Smoke data: " + dir);
});
