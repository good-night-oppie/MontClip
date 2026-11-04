/* The Cindy plugin's export: the engine renders into <data dir>/exports/, the files are copied into the folder the
   user picked (never over a file that is there), and the chat card shows the progress. Generated files only. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ROOT, seedProject } = require("./helpers");
const PLUGIN = path.join(ROOT, "plugins", "montclip-cindy");
const { exportFiles, freeName, deliverFiles } = require(path.join(PLUGIN, "node", "lib.cjs"));

function tmp(t, prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test("the files a finished job made: its src, or every ok output of a batch; nothing for an unfinished job", (t) => {
  const ex = tmp(t, "montclip-ex-");
  for (const f of ["Cut_youtube_1080p.mp4", "Cut_reel_1080x1920.mp4"]) fs.writeFileSync(path.join(ex, f), "x");
  assert.deepEqual(exportFiles({ status: "done", src: "/exports/Cut_youtube_1080p.mp4" }, ex), [path.join(ex, "Cut_youtube_1080p.mp4")]);
  const batch = { status: "done", src: "/exports/Cut_youtube_1080p.mp4", result: { outputs: [
    { file: "Cut_youtube_1080p.mp4", ok: true }, { file: "Cut_reel_1080x1920.mp4", ok: true }, { file: "Cut_bad.mov", ok: false } ] } };
  assert.deepEqual(exportFiles(batch, ex).map((f) => path.basename(f)), ["Cut_youtube_1080p.mp4", "Cut_reel_1080x1920.mp4"]);
  assert.deepEqual(exportFiles({ status: "running", src: "/exports/Cut_youtube_1080p.mp4" }, ex), []);
  assert.deepEqual(exportFiles({ status: "done", src: "/exports/..%2F..%2Fsecret.txt" }, ex), [], "only names inside exports/");
});

test("delivery copies into the picked folder, never over a file that is there, and leaves no half file", async (t) => {
  const ex = tmp(t, "montclip-ex-"), dest = tmp(t, "montclip-dest-");
  const a = path.join(ex, "clip.mp4");
  fs.writeFileSync(a, Buffer.alloc(300000, 7));
  fs.writeFileSync(path.join(dest, "clip.mp4"), "the user's own file");
  let seen = 0;
  const out = await deliverFiles([a], dest, (n) => { seen += n; });
  assert.deepEqual(out.map((f) => [f.name, f.bytes]), [["clip (2).mp4", 300000]]);
  assert.equal(fs.readFileSync(path.join(dest, "clip.mp4"), "utf8"), "the user's own file", "not overwritten");
  assert.equal(seen, 300000);
  assert.deepEqual(fs.readdirSync(dest).sort(), ["clip (2).mp4", "clip.mp4"]);
  assert.equal(freeName(dest, "clip.mp4"), "clip (3).mp4");
  await assert.rejects(deliverFiles([a], path.join(dest, "gone")), (e) => e.code === "NO_FOLDER");
  await assert.rejects(deliverFiles([a], "relative/dir"), (e) => e.code === "NO_FOLDER");
  await assert.rejects(deliverFiles([path.join(ex, "missing.mp4")], dest));
  assert.deepEqual(fs.readdirSync(dest).filter((f) => f.endsWith(".part")), [], "a failed copy leaves no .part");
});

function card() {
  const main = fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8");
  const i = main.indexOf("function esc("), j = main.indexOf("function sendCard(");
  return new Function(main.slice(i, j) + "\nreturn exportCard;")();
}

test("the chat card: progress as a width, the folder's name escaped, no script, within the size limit", () => {
  const exportCard = card();
  const running = exportCard({ phase: "running", progress: 0.42 });
  assert.match(running, /正在导出 42%/);
  assert.match(running, /width:42%/);
  const done = exportCard({ phase: "done", folder: '<img src=x onerror="alert(1)">', files: [{ name: "a.mp4", bytes: 2097152 }], note: "Checks passed: 1920×1080" });
  assert.match(done, /已存到「&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;」/);
  assert.match(done, /a\.mp4 · 2\.0 MB/);
  for (const html of [running, done, exportCard({ phase: "failed", note: "x" }), exportCard({ phase: "pick" })]) {
    assert.doesNotMatch(html, /<script|<iframe|<svg|<img|<[^>]*\son\w+=|!important/i);
    assert.ok(Buffer.byteLength(html) < 32 * 1024);
  }
});

test("manifest: the card and the folder dialog are declared, with the export tool", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGIN, "ghost.json"), "utf8"));
  assert.deepEqual(m.card, {});
  assert.equal(m.pick, true);
  const tool = m.tools.find((x) => x.name === "montclip_export");
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ["folder", "preset", "range"]);
  const main = fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8");
  assert.match(main, /cindy\.pick\(\{ mode: 'directory', title: '选择 MontClip 导出到哪个文件夹', callId \}\)/);
});

test("worker: an export without ffmpeg is refused with the engine's reason", async (t) => {
  const dir = tmp(t, "montclip-cindy-ex-");
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(seedProject()));
  const child = spawn(process.execPath, [path.join(PLUGIN, "node", "worker.cjs")], {
    env: { ...process.env, MONTCLIP_CINDY_APP: ROOT, MONTCLIP_CINDY_DATA: dir, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" }, stdio: ["pipe", "pipe", "ignore"] });
  t.after(() => new Promise((r) => { if (child.exitCode !== null) return r(); child.once("exit", r); child.kill(); }));
  let buf = "", n = 0; const pend = new Map();
  child.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
  const rpc = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const r = await rpc("montclip/export-start", { preset: "youtube" });
  assert.ok(r.error, JSON.stringify(r));
  assert.match(r.error.message, /ffmpeg/i);
  assert.match(r.error.message, /montclip_install_ffmpeg/, "the plugin's own next step");
  assert.equal((await rpc("montclip/export-job", { id: "nope" })).error.data.code, "NO_JOB");
  assert.equal((await rpc("montclip/export-deliver", { id: "nope", dir })).error.data.code, "NOT_DONE");
});
