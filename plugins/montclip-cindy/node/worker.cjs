/* MontClip inside Cindy — the plugin's Node worker (JSON-RPC over stdio, one message per line).

   It runs the MontClip engine itself, in this process: app/server.js (the editor's HTTP server on 127.0.0.1,
   which the plugin's task view frames) and app/mcp-server.js's fablecut_* tools, called in-process. Nothing
   here re-implements editing: every change goes through the engine's own tools and its one project /
   revision / undo chain. app/ is a copy of the repository root made by build.cjs; never edit it.

   stdout carries protocol messages only, so console output goes to stderr before the engine loads. */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const readline = require("node:readline");
const { fillWindowsEnv, newToken, createBinder, flatten } = require("./lib.cjs");

for (const k of ["log", "info", "debug", "warn", "error"]) console[k] = (...a) => process.stderr.write(a.map(String).join(" ") + "\n");

const APP = path.resolve(process.env.MONTCLIP_CINDY_APP || path.join(__dirname, "app"));
// the plugin's work lives in the user's home, never inside the plugin (an update replaces the plugin folder)
const DATA = path.resolve(process.env.MONTCLIP_CINDY_DATA || path.join(os.homedir(), "MontClip-Cindy"));
const FFMPEG_DIR = path.join(DATA, "ffmpeg", `${process.platform}-${process.arch}`);
/* The same port each time when it is free, so the editor frame keeps its address across worker restarts. */
const PREFERRED_PORT = process.env.MONTCLIP_CINDY_PORT !== undefined ? Number(process.env.MONTCLIP_CINDY_PORT) : 47777;

const reply = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const note = (entry) => process.stderr.write("[montclip] " + JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");

function freePort(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (e) => (port ? freePort(0).then(resolve, reject) : reject(e)));
    s.listen(port, "127.0.0.1", () => { const got = s.address().port; s.close(() => resolve(got)); });
  });
}

let started = null, starting = null;   // the running engine: {origin, port, token, tools, callTool, …}
function api(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(started.origin + urlPath, { method, headers: { "Content-Type": "application/json", "X-MontClip-Session": started.token } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { data += d; });
      res.on("end", () => { let j = null; try { j = JSON.parse(data); } catch { j = { raw: data }; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("the MontClip engine did not answer")));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function boot() {
  fs.mkdirSync(DATA, { recursive: true });
  const envFilled = fillWindowsEnv(process.env);
  const port = await freePort(PREFERRED_PORT);
  const token = newToken();
  Object.assign(process.env, {
    PORT: String(port), FABLECUT_PORT: String(port), HOST: "127.0.0.1",
    FABLECUT_DATA_DIR: DATA,
    MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token, MONTCLIP_SHELL: "cindy",
    FABLECUT_NO_AUTOSTART: "1",   // the engine is this process: mcp-server must never spawn a second one
    // only the pinned LGPL build fetched into the data folder (montclip_install_ffmpeg); never one from PATH
    MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: FFMPEG_DIR,
  });
  require(path.join(APP, "server.js"));   // throws DATA_DIR_IN_USE when the Windows app has this data folder
  started = { origin: `http://127.0.0.1:${port}`, port, token };
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await api("GET", "/api/project").then((r) => r.status === 200, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error("the MontClip engine did not start");
  const mcp = require(path.join(APP, "mcp-server.js"));
  const browser = require(path.join(APP, "export-jobs.js")).findBrowser() || null;
  Object.assign(started, { tools: mcp.TOOLS, callTool: mcp.callTool, envFilled, browser,
    ffmpeg: fs.existsSync(path.join(FFMPEG_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")) ? "downloaded" : "missing" });
  // names only, never values
  note({ event: "engine-started", origin: started.origin, node: process.version, envFilled, browser: !!browser, ffmpeg: started.ffmpeg });
  return started;
}
function start() {
  if (started && started.tools) return Promise.resolve(started);
  if (!starting) starting = boot().catch((e) => { starting = null; started = null; throw e; });
  return starting;
}

const binder = createBinder({ file: path.join(DATA, "sessions.json"), api: (...a) => api(...a) });

const METHODS = {
  async "montclip/start"() {
    const s = await start();
    return { origin: s.origin, url: `${s.origin}/?host=cindy&token=${s.token}`, ffmpeg: s.ffmpeg, node: process.version,
      dataDir: DATA, browser: !!s.browser, envFilled: s.envFilled };
  },
  async "montclip/tools"() {
    const s = await start();
    return { tools: s.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  },
  async "montclip/call"(p) {
    const s = await start();
    const name = String(p.name || "");
    if (!s.tools.some((t) => t.name === name)) throw Object.assign(new Error("no such MontClip tool: " + name), { code: -32602 });
    const t0 = Date.now();
    const out = await s.callTool(name, p.arguments && typeof p.arguments === "object" ? p.arguments : {});
    note({ event: "tool", name, ms: Date.now() - t0 });
    return flatten(out, path.join(DATA, "frames"));
  },
  /* undo / redo / seek / state run in the open editor tab (POST /api/ui/command) */
  async "montclip/ui"(p) {
    await start();
    if (!["undo", "redo", "seek", "state"].includes(p.cmd)) throw Object.assign(new Error("cmd must be undo, redo, seek or state"), { code: -32602 });
    const r = await api("POST", "/api/ui/command", { cmd: p.cmd, t: p.t });
    return { status: r.status, ...r.body };
  },
  async "montclip/bind"(p) {
    await start();
    const b = await binder.bind(p.session);
    const proj = (await api("GET", "/api/project")).body || {};
    const out = { ...b, name: proj.name, revision: proj.revision, clips: (proj.clips || []).length };
    note({ event: "bind", ...out });
    return out;
  },
};

readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  if (req.id === undefined || req.id === null) return;   // a notification: nothing to answer
  const fn = Object.hasOwn(METHODS, req.method) ? METHODS[req.method] : null;
  if (!fn) { reply({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } }); return; }
  try { reply({ jsonrpc: "2.0", id: req.id, result: await fn(req.params || {}) }); }
  catch (e) {
    note({ event: "error", method: req.method, message: String(e && e.message) });
    reply({ jsonrpc: "2.0", id: req.id, error: { code: typeof e.code === "number" ? e.code : -32000, message: String((e && e.message) || e), data: typeof e.code === "string" ? { code: e.code } : undefined } });
  }
});
