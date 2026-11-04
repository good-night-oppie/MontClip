/* MontClip inside Cindy — the plugin's Node worker (JSON-RPC over stdio, one request per line).

   It runs the MontClip engine itself, in this process: app/server.js (the editor's HTTP server
   on 127.0.0.1, which the plugin's main view and panel frame) and app/mcp-server.js's fablecut_*
   tools, called in-process. Nothing here re-implements editing: every change goes through the
   engine's own tools and its one project / revision / undo chain.

   stdout carries protocol messages only, so console output is moved to stderr before the engine
   loads. */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const readline = require("node:readline");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

for (const k of ["log", "info", "debug", "warn"]) console[k] = (...a) => process.stderr.write(a.map(String).join(" ") + "\n");

const APP = path.join(__dirname, "app");
// the plugin's work lives beside the user's other MontClip work, never inside the plugin (an update replaces it)
const DATA = path.resolve(process.env.MONTCLIP_CINDY_DATA || path.join(os.homedir(), "MontClip-Cindy"));
const FFMPEG_DIR = path.join(DATA, "ffmpeg", `${process.platform}-${process.arch}`);
const LOG_FILE = path.join(DATA, "cindy-spike-log.jsonl");
const exe = (n) => (process.platform === "win32" ? n + ".exe" : n);

function reply(m) { process.stdout.write(JSON.stringify(m) + "\n"); }
function note(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  try { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(LOG_FILE, line + "\n"); } catch { }
  process.stderr.write("[montclip] " + line + "\n");
}

/* ffmpeg: the pinned LGPL build fetched by cindy.downloads (montclip/ffmpeg-install), else — for a
   development machine only — the one on PATH. Reported as such, never silently. */
function resolveFfmpeg() {
  if (fs.existsSync(path.join(FFMPEG_DIR, exe("ffmpeg"))) && fs.existsSync(path.join(FFMPEG_DIR, exe("ffprobe"))))
    return { source: "downloaded", dir: FFMPEG_DIR };
  const which = (n) => {
    const r = spawnSync(process.platform === "win32" ? "where.exe" : "which", [n], { encoding: "utf8", windowsHide: true });
    const p = (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s));
    return p || null;
  };
  const ff = which(exe("ffmpeg")), fp = which(exe("ffprobe"));
  if (ff && fp) return { source: "path", ffmpeg: ff, ffprobe: fp };
  return { source: "missing" };
}

/* The same port each time when it is free, so the editor page keeps its origin (and what it keeps in
   the browser) across worker restarts; any free port otherwise. */
const PREFERRED_PORT = 47777;
function freePort(port = PREFERRED_PORT) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (e) => (port ? freePort(0).then(resolve, reject) : reject(e)));
    s.listen(port, "127.0.0.1", () => { const got = s.address().port; s.close(() => resolve(got)); });
  });
}

/* Spike evidence: the framed pages report what they measured (playback, seeking, sync) here.
   /__cindy/* is answered before the engine sees the request; everything else is the engine's. */
const probeLog = [];
function logEntry(entry) {
  probeLog.push({ at: new Date().toISOString(), ...entry });
  if (probeLog.length > 500) probeLog.shift();
  note({ from: "page", ...entry });
}
/* Test-only click hook: the transcript page listens on /__cindy/test/events and clicks the line it is
   told to (montclip/test-click). It exists because the desktop driver mis-places clicks inside nested
   frames; the page reports the click it ran (isTrusted:false) like a real one. */
const testClients = new Set();
function wrapCreateServer() {
  const real = http.createServer;
  http.createServer = function (handler) {
    return real.call(http, async (req, res) => {
      if (req.url.startsWith("/__cindy/test/events")) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
        res.write("data: hello\n\n");
        testClients.add(res);
        req.on("close", () => testClients.delete(res));
        return;
      }
      if (req.url.startsWith("/__cindy/log")) {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (c) => { if (body.length < 65536) body += c; });
          req.on("end", () => {
            let entry;
            try { entry = JSON.parse(body); } catch { entry = { raw: body.slice(0, 2000) }; }
            logEntry(entry);
            res.writeHead(204); res.end();
          });
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(probeLog));
        return;
      }
      return handler(req, res);
    });
  };
}

let started = null;   // the running engine: {origin, port, tools, callTool, ffmpeg}
async function start() {
  if (started) return started;
  fs.mkdirSync(DATA, { recursive: true });
  const ff = resolveFfmpeg();
  if (ff.source === "downloaded") process.env.MONTCLIP_FFMPEG_DIR = ff.dir;
  else if (ff.source === "path") { process.env.MONTCLIP_FFMPEG = ff.ffmpeg; process.env.MONTCLIP_FFPROBE = ff.ffprobe; }
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port), FABLECUT_PORT: String(port), HOST: "127.0.0.1",
    FABLECUT_DATA_DIR: DATA,
    FABLECUT_NO_AUTOSTART: "1",   // the engine is this process; mcp-server must never spawn a second one
  });
  wrapCreateServer();
  require(path.join(APP, "server.js"));
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise((r) => http.get(origin + "/api/project", (res) => { res.resume(); r(res.statusCode === 200); }).on("error", () => r(false)));
    if (ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const mcp = require(path.join(APP, "mcp-server.js"));
  started = { origin, port, tools: mcp.TOOLS, callTool: mcp.callTool, ffmpeg: ff, node: process.version, data: DATA };
  note({ event: "engine-started", origin, ffmpeg: ff.source, node: process.version, execPath: process.execPath, pid: process.pid });
  return started;
}

function api(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(started.origin + urlPath, { method, headers: { "Content-Type": "application/json" } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { data += d; });
      res.on("end", () => { let j = null; try { j = JSON.parse(data); } catch { j = { raw: data }; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("engine did not answer")));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/* The tool's answer as the Agent should see it: text blocks joined; an image block (fablecut_frame) is
   too big for a tool result through main.js, so it is written to the data folder and named. */
function flatten(out) {
  if (!Array.isArray(out)) return { text: String(out) };
  const text = [], images = [];
  for (const b of out) {
    if (b.type === "text") text.push(b.text);
    else if (b.type === "image" && b.data) {
      const f = path.join(DATA, "frames", `${Date.now()}-${crypto.randomBytes(3).toString("hex")}.${b.mimeType === "image/png" ? "png" : "jpg"}`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.from(b.data, "base64"));
      images.push(f);
    }
  }
  return { text: text.join("\n"), ...(images.length ? { images } : {}) };
}

function sha256File(file) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r"), buf = Buffer.alloc(1 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest("hex");
}

const METHODS = {
  async "montclip/start"() {
    const s = await start();
    return { origin: s.origin, ffmpeg: s.ffmpeg.source, node: s.node, dataDir: s.data };
  },
  async "montclip/tools"() {
    await start();
    return { tools: started.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  },
  async "montclip/call"(p) {
    await start();
    const name = String(p.name || "");
    if (!started.tools.some((t) => t.name === name)) throw Object.assign(new Error("no such MontClip tool: " + name), { code: -32602 });
    const t0 = Date.now();
    const out = await started.callTool(name, p.arguments || {});
    note({ event: "tool", name, ms: Date.now() - t0 });
    return flatten(out);
  },
  async "montclip/ui"(p) {
    await start();
    const r = await api("POST", "/api/ui/command", { cmd: p.cmd, t: p.t });
    note({ event: "ui-command", cmd: p.cmd, status: r.status, body: r.body });
    return { status: r.status, ...r.body };
  },
  async "montclip/probe-log"() { await start(); return { entries: probeLog.slice(-200) }; },
  // what the plugin's own pages (main view, task view, panel) measured: sizes, visibility, binding
  async "montclip/log"(p) { logEntry({ kind: "page", ...(p.entry || {}) }); return { ok: true }; },
  async "montclip/test-click"(p) {
    await start();
    const msg = JSON.stringify({ line: Number(p.line) || 0 });
    for (const c of testClients) c.write(`data: ${msg}\n\n`);
    return { sent: testClients.size };
  },
  /* A task view belongs to one Cindy task: each task keeps its own MontClip project (sessions.json).
     Binding opens that task's project when it is not the open one; the editor tabs reload with it. */
  async "montclip/bind"(p) {
    await start();
    const session = String(p.session || "");
    if (!session) throw new Error("no session");
    const file = path.join(DATA, "sessions.json");
    let map = {};
    try { map = JSON.parse(fs.readFileSync(file, "utf8")); } catch { }
    const list = (await api("GET", "/api/projects")).body || {};
    let id = map[session];
    if (id && !(list.projects || []).some((x) => x.id === id)) id = null;
    let created = false;
    if (!id) {
      // the first task to bind takes the project that is open now; later tasks get a new one
      const taken = new Set(Object.values(map));
      if (list.active && !taken.has(list.active)) id = list.active;
      else {
        const r = await api("POST", "/api/projects", { action: "new", name: "任务 " + session.slice(0, 8), open: false });
        id = r.body && r.body.id;
        created = true;
      }
      map[session] = id;
      fs.writeFileSync(file, JSON.stringify(map, null, 2));
    }
    let switched = false;
    if (list.active !== id) { await api("POST", "/api/projects", { action: "open", id }); switched = true; }
    const proj = (await api("GET", "/api/project")).body || {};
    const out = { session, project: id, created, switched, name: proj.name, revision: proj.revision, clips: (proj.clips || []).length };
    logEntry({ kind: "bind", ...out });
    return out;
  },
  /* The pinned FFmpeg, fetched by cindy.downloads (sha256 + byte count checked by Cindy) — this only
     unpacks it: params.downloads.archive is the host's file, read before this request ends. */
  async "montclip/ffmpeg-install"(p) {
    const archive = p.downloads && p.downloads.archive;
    if (!archive || !fs.existsSync(archive)) throw new Error("no downloaded archive was handed over");
    const got = sha256File(archive);
    if (p.sha256 && got !== p.sha256) throw new Error("archive sha256 mismatch");
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ffmpeg-"));
    try {
      const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar";
      const t = spawnSync(tar, ["-xf", archive, "-C", work], { encoding: "utf8", windowsHide: true });
      if (t.status !== 0) throw new Error("unpacking failed: " + (t.stderr || t.error));
      const bin = path.join(work, p.root || "", "bin");
      fs.mkdirSync(FFMPEG_DIR, { recursive: true });
      for (const n of ["ffmpeg", "ffprobe"]) fs.copyFileSync(path.join(bin, exe(n)), path.join(FFMPEG_DIR, exe(n)));
      const v = spawnSync(path.join(FFMPEG_DIR, exe("ffmpeg")), ["-hide_banner", "-version"], { encoding: "utf8", windowsHide: true });
      const files = Object.fromEntries(["ffmpeg", "ffprobe"].map((n) => [exe(n), sha256File(path.join(FFMPEG_DIR, exe(n)))]));
      note({ event: "ffmpeg-installed", archiveSha256: got, files, version: (v.stdout || "").split(/\r?\n/)[0] });
      // the engine read its ffmpeg when it loaded: the next request starts a fresh worker that uses this one
      if (started) setTimeout(() => process.exit(0), 300);
      return { installed: true, archiveSha256: got, files, version: (v.stdout || "").split(/\r?\n/)[0], restarting: !!started };
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  },
};

readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  if (req.id === undefined || req.id === null) return;   // a notification: nothing to answer
  const fn = METHODS[req.method];
  if (!fn) { reply({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } }); return; }
  try { reply({ jsonrpc: "2.0", id: req.id, result: await fn(req.params || {}) }); }
  catch (e) { note({ event: "error", method: req.method, message: String(e && e.message) }); reply({ jsonrpc: "2.0", id: req.id, error: { code: e.code || -32000, message: String(e && e.message || e) } }); }
});
