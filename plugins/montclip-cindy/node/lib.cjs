/* The worker's parts that need no running engine, kept apart so they can be tested on their own. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/* Cindy 0.1.122 starts the worker with a trimmed environment (17 variables, seen in the spike): no PROGRAMFILES,
   so the engine's headless export (export-jobs.js findBrowser) finds no Chrome or Edge. Put back the usual Windows
   folders that are missing, from SystemDrive and USERPROFILE, when they exist. Returns the names it filled. */
function fillWindowsEnv(env, { platform = process.platform, exists = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } } } = {}) {
  if (platform !== "win32") return [];
  const has = (k) => typeof env[k] === "string" && env[k] !== "";
  const drive = (has("SystemDrive") ? env.SystemDrive : has("SystemRoot") ? path.win32.parse(env.SystemRoot).root.replace(/\\$/, "") : "C:");
  const want = {
    PROGRAMFILES: path.win32.join(drive + "\\", "Program Files"),
    "PROGRAMFILES(X86)": path.win32.join(drive + "\\", "Program Files (x86)"),
    ProgramW6432: path.win32.join(drive + "\\", "Program Files"),
  };
  if (has("USERPROFILE")) {
    want.LOCALAPPDATA = path.win32.join(env.USERPROFILE, "AppData", "Local");
    want.APPDATA = path.win32.join(env.USERPROFILE, "AppData", "Roaming");
  }
  const filled = [];
  for (const [k, v] of Object.entries(want)) if (!has(k) && exists(v)) { env[k] = v; filled.push(k); }
  return filled;
}

/** A fresh token the engine answers to (server.js MONTCLIP_EMBED_TOKEN): 64 hex characters, never written to disk. */
const newToken = () => crypto.randomBytes(32).toString("hex");

/* Each Cindy task has its own MontClip project (sessions.json: task id → project id). Binding opens the task's
   project when another one is open. Binds run one at a time: a task view binds when it opens and again when it
   becomes visible, and two binds of a new task racing each created a project (seen in Cindy, 2026-11-04).
   `api(method, path, body)` → {status, body} talks to the engine. */
function createBinder({ file, api, name = (session) => "任务 " + session.slice(0, 8) }) {
  let chain = Promise.resolve();
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return j && typeof j === "object" ? j : {}; } catch { return {}; } };
  const write = (map) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(map, null, 2));
    fs.renameSync(tmp, file);
  };
  async function once(session) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(session)) throw Object.assign(new Error("bind needs the task's session id"), { code: -32602 });
    const map = read();
    const list = (await api("GET", "/api/projects")).body || {};
    const known = new Set((list.projects || []).map((p) => p.id));
    let id = map[session];
    if (id && !known.has(id)) id = null;          // its project was deleted: a new one
    let created = false;
    if (!id) {
      // the first task to bind takes the project that is open now (when no task has it); later tasks get a new one
      const taken = new Set(Object.values(map));
      if (list.active && !taken.has(list.active)) id = list.active;
      else {
        const r = await api("POST", "/api/projects", { action: "new", name: name(session), open: false });
        if (!r.body || !r.body.id) throw new Error("could not create a project: " + JSON.stringify(r.body));
        id = r.body.id;
        created = true;
      }
      map[session] = id;
      write(map);
    }
    let switched = false;
    if (list.active !== id) {
      const r = await api("POST", "/api/projects", { action: "open", id });
      if (r.status !== 200) throw new Error("could not open the task's project: " + JSON.stringify(r.body));
      switched = true;
    }
    return { session, project: id, created, switched };
  }
  return {
    bind(session) {
      const run = chain.then(() => once(String(session || "")));
      chain = run.catch(() => { });
      return run;
    },
    map: read,
  };
}

/* A tool's answer as the agent should see it: text blocks joined; an image block (fablecut_frame) is too big for a
   tool result through main.js, so it is written into the data folder and named instead. */
function flatten(out, framesDir) {
  if (typeof out === "string") return { text: out };
  if (!Array.isArray(out)) return { text: JSON.stringify(out) };
  const text = [], images = [];
  for (const b of out) {
    if (b && b.type === "text") text.push(b.text);
    else if (b && b.type === "image" && b.data) {
      const f = path.join(framesDir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}.${b.mimeType === "image/png" ? "png" : "jpg"}`);
      fs.mkdirSync(framesDir, { recursive: true });
      fs.writeFileSync(f, Buffer.from(b.data, "base64"));
      images.push(f);
    }
  }
  return { text: text.join("\n"), ...(images.length ? { images } : {}) };
}

module.exports = { fillWindowsEnv, newToken, createBinder, flatten };
