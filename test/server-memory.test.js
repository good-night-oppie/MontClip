"use strict";
// Deja (2026-11-03): a MontClip server.js that had run for 9 hours held 54 GB of commit memory and starved the machine.
// Reproduced with synthetic files (scratch script, numbers in the PR):
//  - /api/upload read the whole file into memory (readBody + Buffer.concat): a 1 GB upload took the server to 2.1 GB of
//    private memory, kept afterwards; a multi-GB recording costs about twice its size.
//  - /api/export/audio read the whole mix the same way.
//  - a Range read the client dropped (every <video> seek) left its file stream open (.pipe does not close the source when
//    the response closes): one handle and a buffer each; after ~8,400 the server died with EMFILE.
// Now uploads and the export audio stream to disk, and file responses use stream.pipeline, which closes the file when the
// client goes away.
const test = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { makeDataDir, startServer } = require("./helpers");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

// the server process's open handles and private memory (Windows: Get-Process; Linux: /proc)
function stats(pid) {
  if (process.platform === "win32") {
    const o = execFileSync("powershell", ["-NoProfile", "-Command", `$p=Get-Process -Id ${pid}; "$($p.HandleCount) $($p.PrivateMemorySize64)"`],
      { encoding: "utf8", windowsHide: true }).trim().split(" ").map(Number);
    return { handles: o[0], privateMB: o[1] / 1048576 };
  }
  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
  return { handles: fs.readdirSync(`/proc/${pid}/fd`).length, privateMB: Number((/VmRSS:\s+(\d+)/.exec(status) || [])[1] || 0) / 1024 };
}
const supported = process.platform === "win32" || process.platform === "linux";

test("a Range read the client drops closes its file (no handle left behind per seek)", { skip: !supported && "needs Get-Process or /proc" }, async (t) => {
  const dir = makeDataDir(t);
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  const size = 8 * 1048576;
  fs.writeFileSync(path.join(dir, "media", "clip.mp4"), Buffer.alloc(size, 1));
  const { port, child } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const dropped = () => new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/media/clip.mp4", headers: { Range: `bytes=${Math.floor(Math.random() * size / 2)}-` } }, (res) => {
      res.once("data", () => { req.destroy(); resolve(); });
    });
    req.on("error", () => resolve());
  });
  for (let i = 0; i < 20; i++) await dropped();
  await new Promise((r) => setTimeout(r, 300));
  const before = stats(child.pid).handles;
  for (let round = 0; round < 10; round++) await Promise.all(Array.from({ length: 30 }, dropped));
  await new Promise((r) => setTimeout(r, 500));
  const after = stats(child.pid).handles;
  a.ok(after - before < 60, `300 dropped reads left ${after - before} more handles open`);
  // and the server still answers
  a.equal((await fetch(`http://127.0.0.1:${port}/api/project`)).status, 200);
});

function upload(port, name, mb, { abortAt } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/api/upload?name=" + encodeURIComponent(name),
      headers: { "Content-Type": "application/octet-stream", "Content-Length": mb * 1048576 } }, (res) => {
      let body = ""; res.on("data", (d) => { body += d; }); res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", () => resolve({ status: 0 }));
    const chunk = Buffer.alloc(1048576, 9);
    let i = 0;
    const pump = () => {
      while (i < mb) {
        if (abortAt !== undefined && i === abortAt) { req.destroy(); return setTimeout(() => resolve({ status: 0 }), 300); }
        i++; if (!req.write(chunk)) return req.once("drain", pump);
      }
      req.end();
    };
    pump();
  });
}

test("an upload is written to disk as it arrives, not held in memory", { skip: !supported && "needs Get-Process or /proc" }, async (t) => {
  const dir = makeDataDir(t);
  const { port, child } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const start = stats(child.pid).privateMB;
  let peak = start;
  const timer = setInterval(() => { try { peak = Math.max(peak, stats(child.pid).privateMB); } catch {} }, 150);
  const r = await upload(port, "big-recording.bin", 384);
  clearInterval(timer);
  a.equal(r.status, 200, r.body);
  const file = path.join(dir, "media", "big-recording.bin");
  a.equal(fs.statSync(file).size, 384 * 1048576, "every byte arrived");
  a.ok(peak - start < 160, `a 384 MB upload raised the server's memory by ${Math.round(peak - start)} MB`);
});

test("uploads keep their rules: never overwrite, the bytes intact, a dropped upload leaves nothing", async (t) => {
  const dir = makeDataDir(t);
  const { port } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const media = path.join(dir, "media");
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, "a.bin"), "already here");
  const r = await upload(port, "a.bin", 3);
  a.equal(r.status, 200, r.body);
  a.equal(fs.readFileSync(path.join(media, "a.bin"), "utf8"), "already here", "the existing file is untouched");
  a.equal(JSON.parse(r.body).src, "/media/a_1.bin");
  const got = fs.readFileSync(path.join(media, "a_1.bin"));
  a.equal(got.length, 3 * 1048576); a.ok(got.every((b) => b === 9));
  const before = fs.readdirSync(media).sort();
  await upload(port, "dropped.bin", 64, { abortAt: 8 });
  await new Promise((r2) => setTimeout(r2, 500));
  a.deepEqual(fs.readdirSync(media).sort(), before, "no file from a dropped upload");
  // the dot folders uploads stage in (a dot file such as .montclip-writer.lock is not one)
  const staging = fs.readdirSync(dir).filter((f) => f.startsWith(".") && fs.statSync(path.join(dir, f)).isDirectory());
  for (const s of staging) a.deepEqual(fs.readdirSync(path.join(dir, s)), [], "nothing left in " + s);
});

test("the export audio is streamed to disk too; uploads and audio no longer go through readBody", () => {
  const server = read("server.js");
  const at = (m) => server.slice(server.indexOf(m), server.indexOf("\n  }\n", server.indexOf(m)));
  a.doesNotMatch(at('if (p === "/api/upload" && req.method === "POST")'), /readBody\(/);
  a.doesNotMatch(at('if (p === "/api/export/audio" && req.method === "POST")'), /readBody\(/);
  const serve = server.slice(server.indexOf("function serveFile("), server.indexOf("/* ── Server ── */"));
  a.doesNotMatch(serve, /\.pipe\(res\)/, "file responses use stream.pipeline");
});

// QQ (review of 4849c16): starting must not empty .uploads — another server on the same DATA_DIR may be receiving an
// upload there. Only .part files older than 24 hours are removed (left over from a crash); anything else stays.
test("at start only .part files older than 24 hours are removed from .uploads", async (t) => {
  const dir = makeDataDir(t);
  const up = path.join(dir, ".uploads");
  fs.mkdirSync(up, { recursive: true });
  const old = path.join(up, "old.part"), fresh = path.join(up, "fresh.part"), other = path.join(up, "note.txt");
  for (const f of [old, fresh, other]) fs.writeFileSync(f, "x");
  const day = Date.now() / 1000 - 25 * 3600;
  fs.utimesSync(old, day, day); fs.utimesSync(other, day, day);
  await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  a.equal(fs.existsSync(old), false, "a .part older than 24 h goes");
  a.equal(fs.existsSync(fresh), true, "a .part another server may still be writing stays");
  a.equal(fs.existsSync(other), true, "only .part files are touched");
});
