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
  // …not even one the write stream opens after the read has already failed (Linux CI, Node 18): try it many times
  for (let i = 0; i < 25; i++) await assert.rejects(deliverFiles([path.join(ex, "missing-" + i + ".mp4")], dest));
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(fs.readdirSync(dest).filter((f) => f.endsWith(".part")), [], "no late .part either");
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
  for (const html of [running, done, exportCard({ phase: "failed", stage: "start", code: "EXPORT_REFUSED", reason: "<b>x</b>" }), exportCard({ phase: "pick" }),
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
    ["导出完成", "已存到「成片」", "a.mp4 · 2.0 MB", "打开导出文件夹"], "no dir: the files are in exports");
  assert.deepEqual(plain(exportCard({ phase: "done", folder: "成片", dir: "D:\\成片", job: "x_1", files: [{ name: "a.mp4", bytes: 2097152 }] })),
    ["导出完成", "已存到「成片」", "a.mp4 · 2.0 MB", "打开文件夹"], "JJ: 打开文件夹 opens the folder she chose");
  assert.deepEqual(plain(exportCard({ phase: "done", files: [{ name: "a.mp4", bytes: 2097152 }] })),
    ["导出完成", "存在 MontClip 自己的导出文件夹里", "a.mp4 · 2.0 MB", "打开导出文件夹"], "no folder chosen");
  assert.deepEqual(plain(exportCard({ phase: "cancelled" })), ["没有导出", "没有选文件夹，所以没有导出。"]);
});

test("the chat card: still exporting is not a failure, and says nothing for the AI", () => {
  const exportCard = card();
  const still = exportCard({ phase: "still" });
  assert.deepEqual(plain(still), ["还在导出", "这次等不到它导完。导完以后，文件会在 MontClip 自己的导出文件夹里。"]);
  assert.doesNotMatch(still, /导出没有完成|call_tool|fablecut_|montclip_/);
  assert.equal(plain(exportCard({ phase: "failed", stage: "job", reason: "ffmpeg exited 1" }))[0], "导出没有完成", "only a real failure");
  const main = fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8");
  const tool = main.slice(main.indexOf("async montclip_export("), main.indexOf("async montclip_install_ffmpeg("));
  assert.match(tool, /sendCard\(callId, \{ phase: 'still' \}\);\n\s+return \{ job: job\.id, status: job\.status, hint: 'The export is still running\. Check it with call_tool fablecut_export/,
    "the way to follow it goes back to the AI only");
});

test("the chat card: the copy that failed, and a file saved under another name", () => {
  const exportCard = card();
  assert.deepEqual(plain(exportCard({ phase: "copyFailed", code: "ENOSPC", reason: "ENOSPC: no space left on device" })),
    ["视频已经导出好了，但没能存进你选的文件夹（空间不够）。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。", "打开导出文件夹", "复制问题信息", "会打开 MontClip 任务页，在那里复制。"]);
  assert.deepEqual(plain(exportCard({ phase: "done", folder: "成片", files: [{ name: "clip (2).mp4", bytes: 300000, renamed: true }] })),
    ["导出完成", "已存到「成片」", "clip (2).mp4 · 293 KB", "同名文件已经有了，这次存成这个名字", "打开导出文件夹"]);
});

test("the chat card: sizes in 字节, KB, MB and GB, as the overview says them", () => {
  const exportCard = card();
  const size = (bytes, lang) => plain(exportCard({ phase: "done", files: [{ name: "a", bytes }] }, lang))[2];   // [head, where, file, button]
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
  assert.deepEqual(plain(exportCard({ phase: "copyFailed", code: "ENOSPC", reason: "ENOSPC: no space left on device" }, "en")),
    ["The video is exported, but it couldn't be saved to the folder you chose (not enough space). The file is still in MontClip's own export folder; you can export again to another folder.", "Open the export folder", "Copy problem details", "Opens the MontClip task page, where you can copy it."]);
  assert.deepEqual(plain(exportCard({ phase: "done", files: [{ name: "clip (2).mp4", bytes: 2097152, renamed: true }] }, "en")),
    ["Export finished", "Saved in MontClip's own export folder", "clip (2).mp4 · 2.0 MB", "A file with this name was already there, so this one was saved under this name", "Open the export folder"]);
  assert.equal(plain(exportCard({ phase: "done", dir: "D:\\x", job: "x_1", files: [] }, "en")).at(-1), "Open folder");
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

/* VV (2026-11-04): 还在导出 is not red; 打开文件夹 on a finished export and on a failed copy, opened by the worker —
   only MontClip's exports folder or the folder that export went into, every other path refused. The button's words
   wait for JJ. */
/* JJ v2 (2026-11-04, section 1, rule 2) and Deja's decisions for #115–#117: the card says what happened and what she can
   do, in JJ's final words — never a raw error or a code. 〔复制问题信息〕 on the card opens this task's MontClip page,
   which shows the sentence and copies the problem for her (the card cannot copy: Cindy gives plugins no text
   clipboard). The tool result goes through the AI service, so it carries only the plain sentence and the code; the
   raw error stays on this computer (the log, and the task page on her click). */
const KEPT = "你的剪辑都还在，没有丢。";
const ENGLISH_RUN = /[A-Za-z]+[ ,;:'-]+[A-Za-z]+[ ,;:'-]+[A-Za-z]+/;   // three English words in a row: a raw error
const CODES = /\b(ENOENT|EACCES|EPERM|ENOSPC|EBUSY|NO_EDITOR|EXPORT_REFUSED|EDITOR_NOT_READY|TIMEOUT|PROTOCOL_ERROR|h264None\w*|ffmpeg(Missing|Dev)|NO_FOLDER|FOLDER_NOT_ALLOWED)\b/;
const COPY_NOTE = "会打开 MontClip 任务页，在那里复制。";

test("导出没有完成 (JJ's final words): plain words, the right buttons, nothing raw on the card", () => {
  const exportCard = card();
  const cases = [
    // stage, code, raw error (the engine's own words), the sentence, the first button
    ["start", "ffmpegMissing", "FFmpeg is not bundled", "缺一个处理视频的工具，这次没有做完。点下面的按钮装上（约 160 MB，只装一次），装好以后会接着做。", ["install-ffmpeg", "下载并安装"]],
    ["job", "h264NoneWin", "This computer has no H.264 encoder MontClip can use: no graphics-card encoder answered", "这台电脑上找不到 MontClip 能用的视频编码器，所以这次没能导出。可以先更新显卡驱动再试。", ["retry", "重试"]],
    ["job", undefined, "ffmpeg: Error writing trailer: No space left on device", "电脑空间不够，这次没有做完。空出一些地方以后点〔重试〕。原片没有改动。", ["retry", "重试"]],
    ["start", "EDITOR_NOT_READY", "The editor is not ready; open it and retry.", "这次导出要剪辑器开着才能做，它没开或者还没准备好。打开右侧栏的「MontClip 剪辑器」，等时间线出来，再点〔重试〕。原片没有改动。", ["retry", "重试"]],
    ["start", "EXPORT_REFUSED", "no editor tab is open and no Chrome / Edge was found to export headless", "这次导出要剪辑器开着才能做，它没开或者还没准备好。打开右侧栏的「MontClip 剪辑器」，等时间线出来，再点〔重试〕。原片没有改动。", ["retry", "重试"]],
    ["start", "JOB_BUSY", "export x_1 is still running — wait for it, or cancel it", "上一次导出还没做完，要等它做完才能开始这一个。把 MontClip 剪辑器切到前面，过半分钟再点〔重试〕。", ["retry", "重试"]],
    ["start", "TIMEOUT", "Node request timed out after 120000 ms", "MontClip 一直没有回应，这次没有做完。关掉剪辑器再打开，再点〔重试〕。原片没有改动。", ["retry", "重试"]],
    ["job", undefined, "the editor stopped reporting progress (tab closed or browser crashed)", "导出到一半停下了，这次没有做完。原片没有改动。再点〔重试〕。", ["retry", "重试"]],
    ["start", "EXPORT_REFUSED", "export request failed (500)", "这次没有做完，出了个我们没预料到的问题。原片没有改动。再点〔重试〕；还不行，点〔复制问题信息〕发给我们。", ["retry", "重试"]],
  ];
  for (const [stage, code, raw, words, btn] of cases) {
    const html = exportCard({ phase: "failed", stage, code, reason: raw });
    const lines = plain(html);
    assert.deepEqual(lines, ["导出没有完成", words + KEPT, btn[1], "复制问题信息", COPY_NOTE], raw);
    assert.ok(html.includes('data-ghost-action="' + btn[0] + '"') && html.includes('data-ghost-action="copy-problem"'), btn[0]);
    assert.doesNotMatch(lines.join("\n"), ENGLISH_RUN, "no English on the card");
    assert.doesNotMatch(lines.join("\n"), CODES, "no error code on the card");
    assert.doesNotMatch(lines.join("\n"), /跟 AI 说/, "no 'ask the AI' any more");
  }
  // the data folder in use: JJ's own sentence, as it is (nothing to copy)
  const inUse = "MontClip 桌面版正在用这些项目。两边同时改，会互相盖掉。先把桌面版关掉，再打开这里。找不到桌面版的窗口，就重启电脑再试。";
  assert.deepEqual(plain(exportCard({ phase: "failed", stage: "start", code: "DATA_DIR_IN_USE", reason: inUse })), ["导出没有完成", inUse]);
  // the install that failed
  assert.ok(plain(exportCard({ phase: "failed", stage: "start", code: "ffmpegMissing", reason: "x", installFailed: true }))
    .includes("导出工具这次没装上。点〔下载并安装〕再试一次；还不行，点〔复制问题信息〕发给我们。"));
  // English beside it
  assert.equal(plain(exportCard({ phase: "failed", stage: "job", progress: 0.4, reason: "export failed" }, "en"))[1],
    "The export stopped halfway, so it didn't finish. The original is unchanged. Click Retry.Your edits are all still there.");
});

test("a failed copy or open: a plain reason in the sentence, nothing raw on the card (JJ v2)", () => {
  const exportCard = card();
  const copy = plain(exportCard({ phase: "copyFailed", code: "EBUSY", reason: "EBUSY: resource busy or locked, rename 'D:\\成片\\a.mp4.part'", job: "x_1" }));
  assert.deepEqual(copy, ["视频已经导出好了，但没能存进你选的文件夹（出了点问题）。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。", "打开导出文件夹", "换个文件夹", "复制问题信息", COPY_NOTE]);
  const open = plain(exportCard({ phase: "done", dir: "D:\\x", job: "x_1", openFailed: { code: "PROTOCOL_ERROR", message: "spawn explorer.exe ENOENT" } }));
  assert.equal(open.at(-1), "没能打开文件夹（出了点问题）。");
  for (const lines of [copy, open]) { assert.doesNotMatch(lines.join("\n"), ENGLISH_RUN); assert.doesNotMatch(lines.join("\n"), CODES); }
});

/* a sandboxed logic page: main.js with a stand-in cindy, for the tool results and the card buttons */
function logic({ start, deliver } = {}) {
  const vm = require("node:vm");
  const asked = [], sent = [], picks = [], views = [], posted = [];
  let handler = null;
  const cindy = {
    node: { request: async (r) => {
      asked.push([r.method, JSON.parse(JSON.stringify(r.params || {}))]);
      if (r.method === "montclip/ffmpeg-spec") return { ok: true, result: { supported: true, platform: "win32-x64", url: "https://github.com/x", sha256: "a".repeat(64), bytes: 1, state: "missing" } };
      if (r.method === "montclip/ffmpeg-install") return { ok: true, result: { installed: true } };
      if (r.method === "montclip/export-start") return start || { ok: false, errorCode: "PROTOCOL_ERROR", message: "export request failed (500) at C:\\Users\\me\\clips-data\\exports", data: { code: "EXPORT_REFUSED" } };
      if (r.method === "montclip/export-job") return { ok: true, result: { id: "x_1", status: "failed", progress: 0.4, error: "ffmpeg: could not write 'C:\\Users\\me\\clips-data\\exports\\a.mp4'" } };
      if (r.method === "montclip/export-deliver") return deliver || { ok: true, result: { files: [{ name: "a.mp4", bytes: 1 }] } };
      return { ok: true, result: {} };
    } },
    downloads: { start: async () => ({ ok: true, token: "t", bytes: 1 }) },
    pick: async (o) => { picks.push(o); return { ok: true, path: "E:\\new", name: "new" }; },
    taskView: async (o) => { views.push(JSON.parse(JSON.stringify(o))); return { ok: true }; },
    send: async (m) => { sent.push(JSON.parse(JSON.stringify(m))); return { ok: true }; },
    onHostMessage: (fn) => { handler = fn; },
  };
  const channels = [];
  class BroadcastChannel { constructor() { channels.push(this); } postMessage(m) { posted.push(JSON.parse(JSON.stringify(m))); } addEventListener() { } }
  const ctx = { cindy, BroadcastChannel, setTimeout: (f) => f(), clearTimeout, console: { warn() { }, log() { } }, Map, Promise };
  vm.runInNewContext(fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8") + "\n;this.__card = sendCard; this.__H = HANDLERS;", ctx);
  return { ctx, asked, sent, picks, views, posted, click: (callId, actionId, sessionId = "task-a") => handler({ type: "event", name: "card-action", callId, actionId, sessionId }),
    page: async (m) => { await channels[0].onmessage({ data: m }); return posted.at(-1); } };
}

test("the tool result for the AI: the plain sentence and the code only — no raw error, no path (Deja, 2026-11-04)", async () => {
  const L = logic();
  const results = [
    JSON.parse(JSON.stringify(await L.ctx.__H.montclip_export({ folder: "default" }, { callId: "c1" }))),
  ];
  const J = logic({ start: { ok: true, result: { id: "x_1", status: "running", progress: 0 } } });
  results.push(JSON.parse(JSON.stringify(await J.ctx.__H.montclip_export({ folder: "default" }, { callId: "c2" }))));
  const K = logic({ start: { ok: true, result: { id: "x_1", status: "done", src: "/exports/a.mp4", result: { outputs: [{ ok: true, file: "a.mp4" }] } } },
    deliver: { ok: false, errorCode: "PROTOCOL_ERROR", message: "EACCES: permission denied, open 'E:\\成片\\a.mp4.part'", data: { code: "EACCES" } } });
  results.push(JSON.parse(JSON.stringify(await K.ctx.__H.montclip_export({}, { callId: "c3" }))));
  assert.deepEqual(results.map((r) => [r.code, r.error]), [
    ["EXPORT_REFUSED", "这次没有做完，出了个我们没预料到的问题。原片没有改动。再点〔重试〕；还不行，点〔复制问题信息〕发给我们。" + KEPT],
    ["EXPORT_FAILED", "导出到一半停下了，这次没有做完。原片没有改动。再点〔重试〕。" + KEPT],
    ["EACCES", "视频已经导出好了，但没能存进你选的文件夹（没有写入权限）。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。"],
  ]);
  for (const r of results) {
    const text = JSON.stringify(r);
    assert.ok(!("problem" in r), "no problem line for the AI");
    for (const leak of ["Users", "clips-data", "成片", "export request failed", "could not write", "permission denied", ":\\\\"]) assert.ok(!text.includes(leak), leak + " in " + text);
  }
  const main = fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8");
  assert.doesNotMatch(main, /problem: problem|problemLine|function rawLine|phase: 'failed', note:/);
  assert.match(main, /console\.warn\('\[MontClip\] ' \+ new Date\(\)\.toISOString\(\) \+ ' ' \+ \(code \|\| 'UNKNOWN'\) \+ ': ' \+ String\(error\)\);/, "the log keeps all of it");
});

test("复制问题信息 on the card: opens this task's MontClip page and shows the problem there, to copy (Deja, 2026-11-04)", async () => {
  const L = logic();
  L.ctx.__card("c1", { phase: "failed", stage: "start", code: "EXPORT_REFUSED", reason: "export request failed (500) at C:\\Users\\me\\x" });
  await L.click("c1", "copy-problem", "task-a");
  assert.deepEqual(L.views.at(-1), { sessionId: "task-a", focus: true }, "the task page of the card's own task, brought to the front");
  const shown = L.posted.find((m) => m.type === "show-problem");
  assert.deepEqual(shown, { type: "show-problem", session: "task-a",
    text: "这次没有做完，出了个我们没预料到的问题。原片没有改动。再点〔重试〕；还不行，点〔复制问题信息〕发给我们。" + KEPT,
    problem: { code: "EXPORT_REFUSED", error: "export request failed (500) at C:\\Users\\me\\x" } }, "on this computer only: logic page → task page");
  // a page that loads afterwards asks for it, once
  const a = await L.page({ reqId: "p1", type: "problem", session: "task-a" });
  assert.equal(a.shown.problem.code, "EXPORT_REFUSED");
  const b = await L.page({ reqId: "p2", type: "problem", session: "task-a" });
  assert.equal(b.shown, null, "shown once");
  assert.equal((await L.page({ reqId: "p3", type: "problem", session: "task-b" })).shown, null, "another task's page gets nothing");
  // nothing to copy, or an unknown card: nothing opens
  const before = L.views.length;
  L.ctx.__card("c2", { phase: "failed", stage: "start" });
  await L.click("c2", "copy-problem"); await L.click("c-none", "copy-problem");
  assert.equal(L.views.length, before);
});

test("the task page: shows the card's sentence with 〔复制问题信息〕, focused, for its own task only; nothing raw", async () => {
  const src = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(src, /if \(!problemBox \|\| !p \|\| p\.session !== session \|\| !p\.problem\) return;/, "its own task only");
  assert.match(src, /document\.getElementById\('problemText'\)\.textContent = p\.text;/, "the plain sentence, as text");
  assert.match(src, /const b = copyButton\(box, p\.problem\);[\s\S]{0,120}b\.focus\(\);/, "the focus on the copy button");
  assert.match(src, /ask\('problem', \{ session \}\)\.then/, "a page opened by the click asks for it");
  assert.doesNotMatch(src.slice(src.indexOf("function showProblem"), src.indexOf("async function boot")), /p\.problem\.error/, "the raw error is never put on the page");
  const view = fs.readFileSync(path.join(PLUGIN, "task-view.html"), "utf8");
  assert.match(view, /<div id="problem" role="region" aria-label="问题信息" hidden>\n  <p id="problemText"><\/p>\n  <div class="copybox" id="problemCopy"><\/div>\n  <button type="button" id="problemClose">知道了<\/button>\n<\/div>/);
});

test("the card's buttons: 重试 runs the same export again, 下载并安装 installs then carries on, 换个文件夹 asks again", async () => {
  const L = logic();
  await L.ctx.__H.montclip_export({ folder: "default" }, { callId: "c1" });
  const failed = L.sent.filter((m) => m.callId === "c1").at(-1);
  assert.ok(failed.html.includes('data-ghost-action="retry"') && !failed.html.includes("export request failed"));
  const before = L.asked.filter((a) => a[0] === "montclip/export-start").length;
  await L.click("c1", "retry");
  assert.equal(L.asked.filter((a) => a[0] === "montclip/export-start").length, before + 1);
  L.ctx.__card("c2", { phase: "failed", stage: "start", code: "ffmpegMissing", reason: "FFmpeg is not bundled", again: { args: { folder: "default" }, msg: {} } });
  const starts = L.asked.filter((a) => a[0] === "montclip/export-start").length;
  await L.click("c2", "install-ffmpeg");
  assert.ok(L.asked.some((a) => a[0] === "montclip/ffmpeg-install"), "installed");
  assert.equal(L.asked.filter((a) => a[0] === "montclip/export-start").length, starts + 1, "then the export again");
  L.ctx.__card("c3", { phase: "copyFailed", code: "NO_FOLDER", reason: "x", job: "x_9" });
  await L.click("c3", "pick-again");
  assert.equal(L.picks.at(-1).callId, "c3");
  assert.deepEqual(L.asked.filter((a) => a[0] === "montclip/export-deliver").at(-1)[1], { id: "x_9", dir: "E:\\new" });
  assert.match(L.sent.filter((m) => m.callId === "c3").at(-1).html, /已存到「new」/);
});

test("the chat card: 还在导出 is not drawn as a failure (no red), 导出没有完成 is", () => {
  const exportCard = card();
  const still = exportCard({ phase: "still" });
  assert.doesNotMatch(still, /text-danger|#b42318/, "no red while it is still exporting");
  assert.doesNotMatch(still, /data-ghost-action/, "nothing to open yet");
  assert.match(exportCard({ phase: "failed", stage: "job", reason: "ffmpeg exited 1" }), /font-weight:600;color:var\(--text-danger,#b42318\)">导出没有完成</, "a real failure: its head is red");
});

test("the chat card: 打开文件夹 opens the folder she chose; 打开导出文件夹 MontClip's own export folder", () => {
  const exportCard = card();
  const button = (c) => [...exportCard(c).matchAll(/data-ghost-action="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(button({ phase: "done", folder: "成片", dir: "D:\\成片", job: "x_1", files: [] }), [["open-folder:picked", "打开文件夹"]]);
  assert.deepEqual(button({ phase: "done", files: [] }), [["open-folder:exports", "打开导出文件夹"]], "no folder chosen: the files are in exports");
  assert.deepEqual(button({ phase: "copyFailed", code: "NO_FOLDER", reason: "x", dir: "D:\\gone" }), [["open-folder:exports", "打开导出文件夹"], ["copy-problem", "复制问题信息"]], "JJ: a failed copy opens the export folder");
  for (const phase of ["pick", "start", "running", "copy", "still", "cancelled"]) assert.deepEqual(button({ phase }), [], phase);
  assert.deepEqual(button({ phase: "failed", stage: "job", reason: "export failed" }), [["retry", "重试"], ["copy-problem", "复制问题信息"]], "a failure offers 重试 and 复制问题信息 (JJ v2)");
  assert.deepEqual(button({ phase: "failed", stage: "start" }), [["retry", "重试"]], "nothing to copy: no copy button");
  assert.deepEqual(button({ phase: "copyFailed", code: "NO_FOLDER", reason: "x", job: "x_1" }), [["open-folder:exports", "打开导出文件夹"], ["pick-again", "换个文件夹"], ["copy-problem", "复制问题信息"]], "JJ v2: 〔打开导出文件夹〕〔换个文件夹〕〔复制问题信息〕");
  for (const [id] of button({ phase: "done", dir: "D:\\x", job: "x_1" }).concat(button({ phase: "done" }))) assert.match(id, /^[A-Za-z0-9_:-]{1,128}$/, "Cindy's GHOST_CARD_ACTION_ID_RE");
  assert.doesNotMatch(exportCard({ phase: "done", dir: "D:\\私人\\成片", job: "x_1" }), /私人/, "the full path is not in the card");
});
test("the chat card: a failed copy says why in words for the codes it knows", () => {
  const exportCard = card();
  assert.equal(plain(exportCard({ phase: "copyFailed", code: "NO_FOLDER", reason: "the folder to export into is not there" }))[0],
    "视频已经导出好了，但没能存进你选的文件夹（选的文件夹找不到了，可能被删了或拔掉了 U 盘）。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。");
  assert.match(plain(exportCard({ phase: "copyFailed", code: "ENOSPC", reason: "ENOSPC: no space left" }))[0], /（空间不够）/);
  assert.match(plain(exportCard({ phase: "copyFailed", code: "EPERM", reason: "EPERM" }))[0], /（没有写入权限）/);
  assert.doesNotMatch(exportCard({ phase: "copyFailed", code: "NO_FOLDER", reason: "the folder to export into is not there" }), /is not there/);
});

const { openFolder, rememberFolder, folderOfJob } = require(path.join(PLUGIN, "node", "lib.cjs"));
function fakeSpawn() {
  const calls = [];
  const spawn = (cmd, args, opts) => { calls.push([cmd, args, opts]); return { on() { }, unref() { } }; };
  return { calls, spawn };
}

test("open folder: the allowed folders open in the file manager; nothing else does", (t) => {
  const data = tmp(t, "montclip-open-"), picked = tmp(t, "montclip-picked-"), other = tmp(t, "montclip-other-");
  const exportsDir = path.join(data, "exports");
  fs.mkdirSync(exportsDir);
  const allowed = [exportsDir, picked];
  const s = fakeSpawn();
  const real = (p) => fs.realpathSync.native(p);
  assert.deepEqual(openFolder(exportsDir, { allowed, platform: "win32", spawn: s.spawn, env: { SystemRoot: "C:\\Windows" } }), { opened: real(exportsDir) });
  assert.deepEqual(s.calls[0].slice(0, 2), [path.join("C:\\Windows", "explorer.exe"), [real(exportsDir)]], "explorer.exe with the folder as one argument");
  assert.deepEqual(s.calls[0][2], { detached: true, stdio: "ignore" });
  openFolder(picked, { allowed, platform: "darwin", spawn: s.spawn });
  assert.deepEqual(s.calls[1].slice(0, 2), ["/usr/bin/open", [real(picked)]]);
  openFolder(picked + path.sep, { allowed, platform: "linux", spawn: s.spawn });
  assert.deepEqual(s.calls[2].slice(0, 2), ["xdg-open", [real(picked)]]);
  if (process.platform === "win32") openFolder(exportsDir.toUpperCase(), { allowed, platform: "win32", spawn: s.spawn, env: {} });
  const n = s.calls.length;
  const refused = (target, code = "FOLDER_NOT_ALLOWED", list = allowed) =>
    assert.throws(() => openFolder(target, { allowed: list, platform: process.platform, spawn: s.spawn }), (e) => e.code === code, String(target));
  refused(other);                                   // a folder that exists, not on the list
  refused(data);                                    // the data folder above exports
  refused(path.join(exportsDir, ".."));             // .. out of exports
  refused(path.join(exportsDir, "sub"));            // inside exports is not exports
  refused(path.dirname(picked));                    // the picked folder's parent
  refused(os.homedir());
  refused("exports");                               // a relative path
  refused("");
  refused(null);
  refused(["C:\\"]);
  refused(process.platform === "win32" ? "C:\\Windows\\System32" : "/etc");
  refused(picked, "FOLDER_NOT_ALLOWED", [exportsDir]);   // another export's folder is not on this list
  assert.equal(s.calls.length, n, "nothing refused was opened");
  fs.rmSync(picked, { recursive: true, force: true });
  refused(picked, "NO_FOLDER");                      // on the list, gone now: said so, not opened
  assert.equal(s.calls.length, n);
});

test("open folder: which folder each export went into, by its job, newest 50", (t) => {
  const file = path.join(tmp(t, "montclip-folders-"), "cindy-export-folders.json");
  assert.equal(folderOfJob(file, "x_1"), null);
  rememberFolder(file, "x_1", "D:\\a"); rememberFolder(file, "x_2", "D:\\b"); rememberFolder(file, "x_1", "D:\\c");
  assert.deepEqual([folderOfJob(file, "x_1"), folderOfJob(file, "x_2"), folderOfJob(file, "x_3")], ["D:\\c", "D:\\b", null]);
  for (let i = 0; i < 60; i++) rememberFolder(file, "j" + i, "D:\\f" + i);
  assert.equal(folderOfJob(file, "j59"), "D:\\f59");
  assert.equal(folderOfJob(file, "j9"), null, "only the newest 50");
  fs.writeFileSync(file, "not json");
  assert.equal(folderOfJob(file, "j59"), null, "a broken file opens nothing");
});

test("open folder: the card button asks the worker by the export's job, never a path, and the card is drawn again", async () => {
  const vm = require("node:vm");
  const asked = [], sent = [];
  let handler = null, answer = { ok: true, result: { opened: "x" } };
  const cindy = {
    node: { request: async (r) => { asked.push([r.method, JSON.parse(JSON.stringify(r.params))]); return answer; } },
    send: async (m) => { sent.push(JSON.parse(JSON.stringify(m))); return { ok: true }; },
    onHostMessage: (fn) => { handler = fn; },
  };
  class BroadcastChannel { postMessage() { } addEventListener() { } }
  const ctx = { cindy, BroadcastChannel, setTimeout, clearTimeout, console, Map, Promise };
  vm.runInNewContext(fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8") + "\n;this.__card = sendCard;", ctx);
  ctx.__card("call-a", { phase: "done", folder: "成片", dir: "D:\\成片", job: "x_a", files: [] });
  ctx.__card("call-b", { phase: "copyFailed", code: "NO_FOLDER", reason: "x", dir: "D:\\gone" });
  const click = (callId, actionId) => handler({ type: "event", name: "card-action", callId, actionId });
  await click("call-a", "open-folder:picked");
  assert.deepEqual(asked.at(-1), ["montclip/open-folder", { job: "x_a" }]);
  assert.equal(sent.at(-1).callId, "call-a");
  assert.match(sent.at(-1).html, /data-ghost-action="open-folder:picked"/, "drawn again, so Cindy lets go of the button");
  await click("call-b", "open-folder:exports");
  assert.deepEqual(asked.at(-1), ["montclip/open-folder", { folder: "exports" }]);
  const before = asked.length;
  await click("call-a", "open-folder:C:\\Windows");
  await click("call-zzz", "open-folder:exports");
  await click("call-b", "open-folder:picked");   // a failed copy has no folder of its own to open
  assert.equal(asked.length, before, "a forged action, an unknown card, a failed copy's picked folder: nothing asked");
  for (const [, params] of asked) assert.ok(!Object.values(params).some((v) => /[\\/]/.test(String(v))), "no request names a path");
  // the worker refused or the folder is gone: the card says so, small
  answer = { ok: false, errorCode: "PROTOCOL_ERROR", message: "the folder is not there", data: { code: "NO_FOLDER" } };
  await click("call-a", "open-folder:picked");
  assert.ok(plain(sent.at(-1).html).includes("没能打开文件夹（选的文件夹找不到了，可能被删了或拔掉了 U 盘）。"));
});

test("worker: the allow-list is the exports folder and that export's own folder — nothing else opens", async (t) => {
  const dir = tmp(t, "montclip-cindy-open-");
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(seedProject()));
  const child = spawn(process.execPath, [path.join(PLUGIN, "node", "worker.cjs")], {
    env: { ...process.env, MONTCLIP_CINDY_APP: ROOT, MONTCLIP_CINDY_DATA: dir, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" }, stdio: ["pipe", "pipe", "ignore"] });
  t.after(() => new Promise((r) => { if (child.exitCode !== null) return r(); child.once("exit", r); child.kill(); }));
  let buf = "", n = 0; const pend = new Map();
  child.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
  const rpc = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  // a path is never accepted, whatever it is — only {folder:"exports"} or {job}
  for (const folder of [dir, path.join(dir, "exports"), os.homedir(), path.join(dir, "exports", ".."), "..", process.platform === "win32" ? "C:\\Windows" : "/etc", 42, null]) {
    const r = await rpc("montclip/open-folder", { folder });
    assert.equal(r.error && r.error.data && r.error.data.code, "FOLDER_NOT_ALLOWED", String(folder));
  }
  // an export nobody knows, and exports asked together with a job: refused
  assert.equal((await rpc("montclip/open-folder", { job: "x_unknown" })).error.data.code, "FOLDER_NOT_ALLOWED");
  assert.equal((await rpc("montclip/open-folder", { folder: "exports", job: "x_unknown" })).error.data.code, "FOLDER_NOT_ALLOWED");
  // a known export whose folder is gone: said so, not opened
  fs.writeFileSync(path.join(dir, "cindy-export-folders.json"), JSON.stringify({ jobs: [{ job: "x_1", dir: path.join(dir, "gone") }] }));
  assert.equal((await rpc("montclip/open-folder", { job: "x_1" })).error.data.code, "NO_FOLDER");
});
