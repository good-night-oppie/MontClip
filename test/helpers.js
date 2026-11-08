/* Shared harness for the MontClip test suite.

   Every test runs against a throwaway FABLECUT_DATA_DIR and a private port, so
   the suite never touches the developer's real project.json or collides with an
   editor they already have open on 7777. Readiness is always established by
   polling for a real response — never by sleeping for a guessed interval. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

/* Cleanup order (#233 caught it on Windows CI, 2026-11-07). A test's folders used to be removed by after hooks that ran
   before its server's stop (hooks run in the order they are added, and a folder is made before the server). Windows
   refuses to delete a running program's file, and server.js runs the ffmpeg in a folder the test made: the removal threw
   EPERM, a throwing after hook skips the hooks after it, the server was never stopped, and the test file could not
   exit — Tests (Windows, Node 22) sat silent for 40 and 58 minutes. Now every folder this harness hands out first stops
   the servers its test started (with everything they started), then is removed, with retries. */
const serversOf = new WeakMap();   // test context → the stop() of each server it started
async function stopServers(t) {
  for (const stop of serversOf.get(t) || []) await stop();
}
function removeFolder(dir) {
  // retries cover a program that is still letting go of its file just after it was ended
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
/* A temporary folder for test t, removed when it finishes (pass or fail) — after t's servers are stopped. */
function tmpDir(t, prefix = "fablecut-tmp-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(async () => { await stopServers(t); removeFolder(dir); });
  return dir;
}
/* End a child and everything it started: server.js starts ffmpeg, and on Windows ending the server alone leaves those
   running, holding their files. taskkill /T ends the tree; on POSIX the child leads its own process group. */
function endTree(child) {
  if (process.platform === "win32") {
    const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    const r = spawnSync(taskkill, ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 10_000 });
    if (r.status === 0) return;
  } else {
    try { process.kill(-child.pid, "SIGTERM"); return; } catch { /* no group: end the child alone */ }
  }
  child.kill();
}

/* A minimal but schema-valid project, used as the starting state for tests. */
function seedProject(over = {}) {
  return {
    name: "Test Project", width: 1280, height: 720, fps: 30, revision: 1,
    media: [{ id: "m_a", name: "a.mp4", kind: "video", src: "/media/a.mp4", duration: 10 }],
    clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 5 }],
    ...over,
  };
}

/* Temp data dir, removed when the test finishes (pass or fail) — after the test's servers are stopped. */
function makeDataDir(t, project = seedProject()) {
  const dir = tmpDir(t, "fablecut-test-");
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(project, null, 2));
  return dir;
}

const readProject = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8"));
const writeProject = (dir, doc) =>
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(doc, null, 2));

/* Ask the OS for a port nobody is using, then release it for the child. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/* Start server.js on its own port + data dir and wait until it actually
   answers. Rejects fast if the child dies instead of hanging until timeout. */
async function startServer(t, dataDir, extraEnv = {}, { serverJs = path.join(ROOT, "server.js") } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const port = await freePort();
    const child = spawn(process.execPath, [serverJs], {
      cwd: ROOT,
      env: {
        ...process.env, ...extraEnv,
        PORT: String(port), HOST: "127.0.0.1",
        FABLECUT_DATA_DIR: dataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",   // POSIX: its own process group, so stop() ends what it started too
    });
    let exited = null;
    child.on("exit", (code, signal) => { exited = code ?? signal ?? "exited"; });   // killed: code is null, so stop() twice would wait forever
    let stderr = "";
    child.stderr.on("data", (c) => { stderr += c; });
    let startup = '', listening = false;
    child.stdout.on('data', c => {
      startup = (startup + c).slice(-8192);
      listening ||= startup.includes(`MontClip running →  http://localhost:${port}\n`);
    });

    const base = `http://127.0.0.1:${port}`;
    const stop = () => new Promise((resolve) => {
      if (exited !== null) return resolve();
      // never wait forever: a stop that hangs would hold the test file open, and with it every result after it
      const timer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); child.unref(); resolve(); }, 10_000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      endTree(child);
    });

    const deadline = Date.now() + 20_000;
    let ready = false;
    while (Date.now() < deadline && exited === null) {
      try {
        const r = await fetch(base + "/api/project");
        await r.text();
        if (r.status === 200 && listening && exited === null) { ready = true; break; }
      } catch { /* not listening yet */ }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (ready) {
      if (!serversOf.has(t)) serversOf.set(t, []);
      serversOf.get(t).push(stop);   // the test's folders stop it before they go
      t.after(stop);
      return { base, port, child, stop };
    }
    await stop();
    // A lost port race is the only retryable failure; anything else is a bug.
    if (!/EADDRINUSE/.test(stderr)) {
      throw new Error(`server.js did not become ready (exit=${exited})\n${stderr}`);
    }
  }
  throw new Error("could not find a free port for server.js after 3 attempts");
}

/* A raw HTTP GET that sends the request line and headers verbatim.

   fetch() cannot express these tests: it refuses to set a Host header, and the
   WHATWG URL parser collapses `%2e%2e` before the request leaves the client, so
   a traversal attempt would never reach the server at all. */
function rawGet(port, rawPath, headers = {}) {
  const http = require("node:http");
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method: "GET", path: rawPath, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { body += c; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
    req.on("error", reject);
    req.end();
  });
}

/* Line-delimited JSON-RPC client for mcp-server.js over stdio. Responses are
   matched by id, so out-of-order or interleaved replies cannot cross wires. */
function startMcp(t, dataDir, env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, "mcp-server.js")], {
    cwd: ROOT,
    // Standalone MCP tests must not reach an editor someone happens to have open on port 7777.
    // Server-backed tests explicitly supply their own temporary server's port.
    env: { ...process.env, FABLECUT_DATA_DIR: dataDir, FABLECUT_PORT: "0", FABLECUT_NO_AUTOSTART: "1", ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  const inbox = [];           // messages with no matching request (notifications)
  let exited = null, stderr = "", buf = "";
  child.on("exit", (code) => {
    exited = code;
    for (const { reject } of pending.values())
      reject(new Error(`mcp-server exited (code ${code}) with the request in flight\n${stderr}`));
    pending.clear();
  });
  child.stderr.on("data", (c) => { stderr += c; });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p.resolve(msg); } else inbox.push(msg);
    }
  });

  let nextId = 1;
  const api = {
    child,
    get exited() { return exited; },
    get stderr() { return stderr; },
    /* Unsolicited messages received so far — used to prove notifications get
       no reply, and that nothing extra is written to the wire. */
    unmatched: () => inbox.slice(),
    notify(method, params) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    },
    request(method, params, { timeout = 15_000 } = {}) {
      if (exited !== null) return Promise.reject(new Error(`mcp-server already exited (${exited})`));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`timed out waiting for a response to ${method}`));
        }, timeout);
        pending.set(id, {
          resolve: (m) => { clearTimeout(timer); resolve(m); },
          reject: (e) => { clearTimeout(timer); reject(e); },
        });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    },
    /* Convenience: call a tool and return its text payload. `content` is the
       full block list for tools that answer with more than text (images). */
    async callTool(name, args = {}) {
      const res = await api.request("tools/call", { name, arguments: args });
      assert.ok(res.result, `tools/call ${name} returned no result: ${JSON.stringify(res)}`);
      const content = res.result.content || [];
      return {
        text: (content.find((c) => c.type === "text") || {}).text || "",
        content,
        isError: !!res.result.isError,
      };
    },
    stop: () => new Promise((resolve) => {
      if (exited !== null) return resolve();
      child.once("exit", () => resolve());
      child.stdin.end();
      child.kill();
    }),
  };
  t.after(api.stop);
  return api;
}

/* The bundled LGPL ffmpeg has no libx264: tests that need an H.264 file use the first of
   its own H.264 encoders that works on this machine, or skip when there is none. */
let h264 = undefined;
function bundledH264() {
  if (h264 !== undefined) return h264;
  const FF = require("../ffmpeg-path");
  h264 = null;
  if (!FF.available("ffmpeg")) return h264;
  for (const [enc, pix] of [["h264_mf", "nv12"], ["h264_nvenc", "yuv420p"], ["h264_qsv", "nv12"], ["h264_amf", "nv12"], ["h264_videotoolbox", "nv12"]]) {
    const r = require("node:child_process").spawnSync(FF.path("ffmpeg"), ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x144:r=30:d=0.1",
      "-frames:v", "2", "-c:v", enc, "-pix_fmt", pix, "-f", "null", "-"], { stdio: "ignore", timeout: 30000 });
    if (r.status === 0) { h264 = { encoder: enc, pix }; break; }
  }
  return h264;
}

module.exports = { ROOT, seedProject, makeDataDir, tmpDir, readProject, writeProject, startServer, startMcp, rawGet, bundledH264, freePort };
