/* The harness's own cleanup (#233 caught it on Windows CI): a test's data folder was removed while the server it
   started — or an ffmpeg.exe that server started from that folder — was still running. Windows refuses to delete a
   running program's file (EPERM); the after hook threw, the hooks after it (the server's stop) never ran, and the test
   file could not exit: Tests (Windows, Node 22) sat silent for 40 and 58 minutes on 2026-11-07.

   Here a stand-in server starts a long-running copy of a small system program from inside its data folder, as
   server.js starts the ffmpeg a user chose. The fixture runs in its own node --test, so a hang shows up as a timeout
   in this test instead of hanging the suite. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const HELPERS = path.join(__dirname, "helpers.js");

const STAND_IN_SERVER = String.raw`"use strict";
const http = require("node:http"), fs = require("node:fs"), path = require("node:path"), { spawn } = require("node:child_process");
const dir = process.env.FABLECUT_DATA_DIR, bin = path.join(dir, "bin");
fs.mkdirSync(bin, { recursive: true });
// a long-running program started from a file inside the data folder (server.js starting the ffmpeg.exe a user chose)
const [src, args] = process.platform === "win32"
  ? [path.join(process.env.SystemRoot || "C:\\Windows", "System32", "PING.EXE"), ["-n", "600", "127.0.0.1"]]
  : ["/bin/sleep", ["600"]];
const exe = path.join(bin, path.basename(src));
fs.copyFileSync(src, exe); fs.chmodSync(exe, 0o755);
const g = spawn(exe, args, { stdio: "ignore", windowsHide: true });
fs.writeFileSync(path.join(dir, "grandchild.pid"), String(g.pid));
http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); })
  .listen(Number(process.env.PORT), "127.0.0.1", () => console.log('MontClip running →  http://localhost:' + process.env.PORT + '\n'));
`;

const FIXTURE = String.raw`"use strict";
const test = require("node:test"), fs = require("node:fs"), path = require("node:path");
const { makeDataDir, startServer } = require(process.env.HELPERS);
test("a server whose child runs a program from the data folder", async (t) => {
  const dir = makeDataDir(t);
  await startServer(t, dir, {}, { serverJs: process.env.STAND_IN });
  const pidFile = path.join(dir, "grandchild.pid");
  for (let i = 0; i < 200 && !fs.existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 50));
  fs.writeFileSync(process.env.OUT, JSON.stringify({ dir, grandchild: Number(fs.readFileSync(pidFile, "utf8")) }));
});
`;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

test("cleanup stops a test's server and what it started before removing the data folder, and the file exits", { timeout: 120_000 }, async (t) => {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "mc-cleanup-"));
  t.after(() => fs.rmSync(w, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const standIn = path.join(w, "stand-in-server.js"), fixture = path.join(w, "fixture.test.js"), out = path.join(w, "out.json");
  fs.writeFileSync(standIn, STAND_IN_SERVER);
  fs.writeFileSync(fixture, FIXTURE);

  // a run of its own: without NODE_TEST_CONTEXT, which would make node --test skip it as a run inside a run
  const env = { ...process.env, HELPERS, STAND_IN: standIn, OUT: out };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--test", "--test-reporter=tap", fixture], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (c) => { output += c; });
  child.stderr.on("data", (c) => { output += c; });
  const started = Date.now();
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timed out"), 60_000);
    child.on("exit", (c) => { clearTimeout(timer); resolve(c); });
  });
  if (code === "timed out") {   // the bug: leave nothing running behind this test either
    if (process.platform === "win32") require("node:child_process").spawnSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  }
  const seen = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
  try {
    assert.notEqual(code, "timed out", `the fixture's test file did not exit within 60 s (the hang)\n${output.slice(-1500)}`);
    assert.equal(code, 0, `the fixture failed\n${output.slice(-1500)}`);
    assert.ok(seen, `the fixture reported its folder and the grandchild's pid\n${output.slice(-1500)}`);
    assert.equal(fs.existsSync(seen.dir), false, "the data folder is removed");
    assert.equal(alive(seen.grandchild), false, "the program the server started is not left running");
    assert.ok(Date.now() - started < 30_000, `cleanup took ${Date.now() - started} ms`);
  } finally {
    if (seen && alive(seen.grandchild)) try { process.kill(seen.grandchild); } catch { }
    if (seen && fs.existsSync(seen.dir)) fs.rmSync(seen.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
