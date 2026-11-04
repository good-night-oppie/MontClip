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
  assert.deepEqual(out.map((f) => [f.name, f.bytes, f.renamed]), [["clip (2).mp4", 300000, true]]);
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
  for (const html of [running, done, exportCard({ phase: "failed", note: "x" }), exportCard({ phase: "pick" }),
    exportCard({ phase: "copyFailed", reason: '<b>"x"</b>' }), exportCard({ phase: "still" })]) {
    assert.doesNotMatch(html, /<script|<iframe|<svg|<img|<b>|<[^>]*\son\w+=|!important/i);
    assert.ok(Buffer.byteLength(html) < 32 * 1024);
  }
});

/* JJ's final words for the export card (2026-11-04), word for word */
const plain = (html) => html.replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);

test("the chat card in JJ's words: waiting, starting, exporting, saving, done", () => {
  const exportCard = card();
  assert.deepEqual(plain(exportCard({ phase: "pick" })), ["等你选文件夹…"]);
  assert.deepEqual(plain(exportCard({ phase: "start" })), ["正在开始导出…"]);
  assert.deepEqual(plain(exportCard({ phase: "running", progress: 0.42 })), ["正在导出 42%"]);
  assert.deepEqual(plain(exportCard({ phase: "copy", folder: "成片" })), ["正在存到「成片」…"]);
  assert.deepEqual(plain(exportCard({ phase: "done", folder: "成片", files: [{ name: "a.mp4", bytes: 2097152 }] })),
    ["导出完成", "已存到「成片」", "a.mp4 · 2.0 MB"]);
  assert.deepEqual(plain(exportCard({ phase: "done", files: [{ name: "a.mp4", bytes: 2097152 }] })),
    ["导出完成", "存在 MontClip 自己的导出文件夹里", "a.mp4 · 2.0 MB"], "no folder chosen");
  assert.deepEqual(plain(exportCard({ phase: "cancelled" })), ["没有导出", "没有选文件夹，所以没有导出。"]);
});

test("the chat card: still exporting is not a failure, and says nothing for the AI", () => {
  const exportCard = card();
  const still = exportCard({ phase: "still" });
  assert.deepEqual(plain(still), ["还在导出", "这次等不到它导完。导完以后，文件会在 MontClip 自己的导出文件夹里。"]);
  assert.doesNotMatch(still, /导出没有完成|call_tool|fablecut_|montclip_/);
  assert.deepEqual(plain(exportCard({ phase: "failed", note: "ffmpeg exited 1" })), ["导出没有完成", "ffmpeg exited 1"], "only a real failure");
  const main = fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8");
  const tool = main.slice(main.indexOf("async montclip_export("), main.indexOf("async montclip_install_ffmpeg("));
  assert.match(tool, /sendCard\(callId, \{ phase: 'still' \}\);\n\s+return \{ job: job\.id, status: job\.status, hint: 'The export is still running\. Check it with call_tool fablecut_export/,
    "the way to follow it goes back to the AI only");
});

test("the chat card: the copy that failed, and a file saved under another name", () => {
  const exportCard = card();
  assert.deepEqual(plain(exportCard({ phase: "copyFailed", reason: "磁盘满了" })),
    ["视频已经导出好了，但没能存进你选的文件夹（磁盘满了）。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。"]);
  assert.deepEqual(plain(exportCard({ phase: "done", folder: "成片", files: [{ name: "clip (2).mp4", bytes: 300000, renamed: true }] })),
    ["导出完成", "已存到「成片」", "clip (2).mp4 · 293 KB", "同名文件已经有了，这次存成这个名字"]);
});

test("the chat card: sizes in 字节, KB, MB and GB, as the overview says them", () => {
  const exportCard = card();
  const size = (bytes, lang) => plain(exportCard({ phase: "done", files: [{ name: "a", bytes }] }, lang))[2];
  assert.equal(size(512), "a · 512 字节");
  assert.equal(size(900 * 1024), "a · 900 KB");
  assert.equal(size(1048575), "a · 1.0 MB", "not 1024 KB");
  assert.equal(size(1.5 * 1048576), "a · 1.5 MB");
  assert.equal(size(2.3 * 1073741824), "a · 2.3 GB");
  assert.equal(size(512, "en"), "a · 512 bytes");
});

test("the chat card in plain English (kept beside JJ's words for when the card follows Cindy's language)", () => {
  const exportCard = card();
  assert.deepEqual(plain(exportCard({ phase: "pick" }, "en")), ["Waiting for you to choose a folder…"]);
  assert.deepEqual(plain(exportCard({ phase: "still" }, "en")),
    ["Still exporting", "This time it can't wait for the export to finish. When it's done, the file will be in MontClip's own export folder."]);
  assert.deepEqual(plain(exportCard({ phase: "copyFailed", reason: "disk full" }, "en")),
    ["The video is exported, but it couldn't be saved to the folder you chose (disk full). The file is still in MontClip's own export folder; you can export again to another folder."]);
  assert.deepEqual(plain(exportCard({ phase: "done", files: [{ name: "clip (2).mp4", bytes: 2097152, renamed: true }] }, "en")),
    ["Export finished", "Saved in MontClip's own export folder", "clip (2).mp4 · 2.0 MB", "A file with this name was already there, so this one was saved under this name"]);
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
