"use strict";
// Closing MontClip during an export asks first (Deja, 2026-11-03; VV's spec §5 and §7 items 10–11; JJ's final copy,
// 「追加 3」 and 「预备稿 4 补充」 for one video). × and Alt+F4 both ask; not exporting closes at once. 「继续导出」 is the
// default and Enter / Esc mean it. 「停止导出并关闭」 stops ffmpeg, deletes the half-finished file and the export's
// fablecut-XXXX folder, then quits, within before-quit's 4 s; exported copies that were not saved are kept.
const test = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn, fork } = require("node:child_process");
const crypto = require("node:crypto");
const Close = require("../desktop/export-close");
const Cleanup = require("../server/export-cleanup");
const { makeDataDir } = require("./helpers");
const FF = require("../server/ffmpeg-path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("the prompt: JJ's final copy, 「继续导出」 the default and what Enter / Esc mean", () => {
  const o = Close.dialogOptions("zh-CN", 0);
  a.equal(o.message, "还在导出，现在关掉吗？");
  a.equal(o.detail, "关掉 MontClip 会停止导出。导到一半的视频不会留下，下次要从头再导。");
  a.deepEqual(o.buttons, ["停止导出并关闭", "继续导出"]);
  a.equal(o.buttons[o.defaultId], "继续导出", "default focus on 继续导出: Enter keeps exporting");
  a.equal(o.buttons[o.cancelId], "继续导出", "Esc keeps exporting");
  a.equal(o.buttons[Close.STOP], "停止导出并关闭");
  a.equal(o.noLink, true);
});

test("the extra sentence appears only with unsaved videos in the queue, with the right n (one video: 它)", () => {
  a.ok(!Close.dialogOptions("zh-CN", 0).detail.includes("导出队列"));
  a.equal(Close.dialogOptions("zh-CN", 1).detail.split("\n")[1],
    "导出队列里还有 1 个没保存的视频，关掉以后它不会再出现在队列里，但还占着 C 盘空间。");
  a.equal(Close.dialogOptions("zh-CN", 2).detail.split("\n")[1],
    "导出队列里还有 2 个没保存的视频，关掉以后它们不会再出现在队列里，但还占着 C 盘空间。");
  a.equal(Close.dialogOptions("zh-CN", 3).detail.split("\n")[1],
    "导出队列里还有 3 个没保存的视频，关掉以后它们不会再出现在队列里，但还占着 C 盘空间。");
});

test("English has its own copy and no Chinese; both languages go through the shared text table (uiText keys)", () => {
  const o = Close.dialogOptions("en", 2);
  a.doesNotMatch([o.message, o.detail, ...o.buttons].join(" "), /[一-鿿]/);
  a.match(o.detail, /\b2\b/);
  const prefs = read("ui-preferences.js");
  for (const k of ["export-close-title", "export-close-body", "export-close-unsaved-1", "export-close-unsaved-n", "export-close-stop", "export-close-keep"])
    a.match(prefs, new RegExp(`"${k}": \\[`), k);
});

test("unsaved = queue entries with status done and not saved", () => {
  a.equal(Close.unsavedCount([{ status: "done" }, { status: "done", saved: true }, { status: "pending" }, { status: "running" },
    { status: "failed" }, { status: "cancelled" }, { status: "done", saved: false }]), 2);
  a.equal(Close.unsavedCount(null), 0);
});

test("asks when the server has an export session, or the page is still mixing the audio before it has one", async () => {
  const st = (server, renderer) => Close.exportState({ server: async () => server, renderer: async () => renderer, timeoutMs: 200 });
  a.deepEqual(await st(1, { exporting: true, unsaved: 2 }), { exporting: true, unsaved: 2 });
  a.deepEqual(await st(1, null), { exporting: true, unsaved: 0 }, "the server alone is enough (page not answering)");
  a.deepEqual(await st(0, { exporting: true, unsaved: 0 }), { exporting: true, unsaved: 0 }, "audio mix: no server session yet");
  a.deepEqual(await st(0, { exporting: false, unsaved: 3 }), { exporting: false, unsaved: 3 });
  // nothing answers: closing is never blocked
  const hang = () => new Promise(() => {});
  const t0 = Date.now();
  a.deepEqual(await Close.exportState({ server: hang, renderer: hang, timeoutMs: 200 }), { exporting: false, unsaved: 0 });
  a.ok(Date.now() - t0 < 1000);
  a.deepEqual(await Close.exportState({ server: async () => { throw Error("x"); }, renderer: async () => { throw Error("y"); }, timeoutMs: 200 }),
    { exporting: false, unsaved: 0 });
});

test("main.js asks on every close (× and Alt+F4 are the same window close) before the save-and-close controller", () => {
  const main = read("desktop/main.js");
  a.match(main, /require\("\.\/export-close"\)/);
  a.match(main, /\/api\/export\/active/);
  a.match(main, /exportCloseState/);
  a.match(read("app.js"), /function exportCloseState\(\) \{/);
});

test("main.js holds every quit until the service has exited (a second quit used to cut its cleanup short)", () => {
  const main = read("desktop/main.js");
  a.match(main, /if \(worker && !workerExited\) \{\s*event\.preventDefault\(\);\s*if \(stopping\) return;/);
});

// ffmpeg holding the half-finished file open: on Windows it cannot be deleted until ffmpeg has exited, which is why
// the old cleanup (kill, then delete at once) could leave it behind.
function liveEncode(dir) {
  const part = path.join(dir, "clip.part.mp4");
  const proc = spawn(FF.path("ffmpeg"), ["-y", "-v", "error", "-re", "-f", "lavfi", "-i", "testsrc=s=160x90:r=30", "-t", "60", "-f", "mp4", part],
    { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
  return { part, proc };
}
const waitFor = async (f, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test("stopping: ffmpeg first, then the half-finished file and the export's folder go", async (t) => {
  const exportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-close-"));
  t.after(() => fs.rmSync(exportsDir, { recursive: true, force: true }));
  const dir = fs.mkdtempSync(path.join(exportsDir, "fablecut-"));
  fs.writeFileSync(path.join(dir, "audio.wav"), "x");
  const { part, proc } = liveEncode(exportsDir);
  a.ok(await waitFor(() => fs.existsSync(part) && fs.statSync(part).size > 0), "ffmpeg is writing");
  const kept = path.join(exportsDir, "已导出 没保存.mp4"); fs.writeFileSync(kept, "done");
  const t0 = Date.now();
  const r = await Cleanup.stopSessions([{ proc, partPath: part, dir }], { timeoutMs: 3000 });
  a.deepEqual(r.left, []);
  a.ok(Date.now() - t0 < 3500);
  a.equal(fs.existsSync(part), false, "no half-finished file");
  a.equal(fs.existsSync(dir), false, "no fablecut-XXXX folder");
  a.equal(fs.existsSync(kept), true, "an exported copy that was not saved stays");
  a.ok(proc.exitCode !== null || proc.signalCode !== null);
});

test("past the time limit it gives up, says which paths are left, and does not hang", async (t) => {
  const exportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-close-"));
  t.after(() => fs.rmSync(exportsDir, { recursive: true, force: true }));
  const part = path.join(exportsDir, "x.part.mp4"); fs.writeFileSync(part, "x");
  const logged = [];
  const t0 = Date.now();
  const r = await Cleanup.stopSessions([{ partPath: part, proc: { exitCode: null, signalCode: null, kill() {}, once() {} } }],
    { timeoutMs: 300, rm: () => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); }, log: (left) => logged.push(...left) });
  a.ok(Date.now() - t0 < 1500);
  a.deepEqual(r.left, [part]); a.deepEqual(logged, [part]);
});

// The desktop server, as main.js runs it (token, IPC "shutdown"), during a real export.
async function desktopServer(t, dir) {
  const token = crypto.randomBytes(32).toString("hex");
  const child = fork(path.join(__dirname, "..", "server/server.js"), [], { env: { ...process.env, PORT: "0", HOST: "127.0.0.1",
    MONTCLIP_DESKTOP: "1", MONTCLIP_SESSION_TOKEN: token, FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1" }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let exited = false; child.on("exit", () => { exited = true; });
  t.after(() => { if (!exited) child.kill(); });
  const origin = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(Error("server did not start")), 20000);
    child.on("message", (m) => { if (m && m.type === "montclip-ready") { clearTimeout(timer); res(m.origin); } });
  });
  const api = (p, init = {}) => fetch(origin + p, { ...init, headers: { ...(init.headers || {}), "X-MontClip-Session": token } });
  return { child, api, exitedP: new Promise((r) => (exited ? r() : child.once("exit", r))) };
}

test("the server: /api/export/active counts running exports; shutdown stops ffmpeg and leaves no half-finished file or folder", async (t) => {
  const dir = makeDataDir(t);
  const { child, api, exitedP } = await desktopServer(t, dir);
  const active = async () => (await (await api("/api/export/active")).json()).active;
  a.equal(await active(), 0);
  const h264 = await (await api("/api/export/h264")).json();
  if (!h264.encoder) return t.skip("no H.264 encoder on this machine: " + h264.reason);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-close-f-")); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const jpg = path.join(tmp, "f.jpg");
  require("node:child_process").execFileSync(FF.path("ffmpeg"), ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180", "-frames:v", "1", jpg]);
  const begin = await (await api("/api/export/begin", { method: "POST", body: JSON.stringify({ fps: 30, name: "导出中关窗", hasAudio: false, duration: 20,
    delivery: { preset: "custom", width: 320, height: 180 }, canvasW: 320, canvasH: 180 }) })).json();
  a.ok(begin.id, begin.error);
  a.equal(await active(), 1);
  const r = await api("/api/export/frame?id=" + begin.id, { method: "POST", body: Buffer.concat(Array(30).fill(fs.readFileSync(jpg))) });
  a.equal(r.status, 200);
  const exportsDir = path.join(dir, "exports");
  a.ok(fs.readdirSync(exportsDir).some((f) => f.includes(".part")), "a half-finished file exists while exporting");
  const t0 = Date.now();
  child.send({ type: "shutdown" });
  await exitedP;
  a.ok(Date.now() - t0 < 4000, "within before-quit's 4 s");
  a.deepEqual(fs.readdirSync(exportsDir).filter((f) => f.includes(".part") || f.startsWith("fablecut-")), []);
});

// Not exporting, but videos in the queue were exported and not saved (Deja, 2026-11-03; VV §5 and image 16; JJ's
// 「预备稿 4」 and its one-video forms): closing asks [删掉它们并关闭] [不删，直接关闭] [先去保存]. 先去保存 is the default and the
// Enter/Esc answer: the window stays and the export queue opens. Deleting asks nothing more and deletes only the copies this
// session exported (the server's own list, matched by base name; nothing else in exports/ is looked at). A copy that cannot
// be deleted keeps the window open: 有 {k} 个视频删不掉… [再试一次] (only those again) [不删了，直接关闭]. Asked in the
// window's close event, before any quit, so a failed delete can keep the window.
test("the unsaved prompt: JJ's 预备稿 4 copy, 先去保存 the default and the Enter/Esc answer", () => {
  const o = Close.unsavedDialogOptions("zh-CN", 2);
  a.equal(o.message, "还有 2 个视频没保存，现在关掉吗？");
  a.equal(o.detail, "这些视频已经导出好了，还没存到你选的地方。关掉以后，导出队列里就找不到它们了，但它们还占着 C 盘空间。");
  a.deepEqual(o.buttons, ["删掉它们并关闭", "不删，直接关闭", "先去保存"]);
  a.equal(o.buttons[o.defaultId], "先去保存"); a.equal(o.buttons[o.cancelId], "先去保存");
  // one video: JJ's final copy (预备稿 4 补充, 2026-11-03); the same button order as for several (VV's image 16)
  const one = Close.unsavedDialogOptions("zh-CN", 1);
  a.equal(one.message, "还有 1 个视频没保存，现在关掉吗？");
  a.equal(one.detail, "这个视频已经导出好了，还没存到你选的地方。关掉以后，导出队列里就找不到它了，但它还占着 C 盘空间。");
  a.deepEqual(one.buttons, ["删掉它并关闭", "不删，直接关闭", "先去保存"]);
  a.equal(one.defaultId, o.defaultId); a.equal(one.cancelId, o.cancelId);
  const en = Close.unsavedDialogOptions("en", 3);
  a.doesNotMatch([en.message, en.detail, ...en.buttons].join(" "), /[一-鿿]/);
});

// JJ (2026-11-03): [再试一次] [不删了，直接关闭]; under the names, what to do first
test("a copy that cannot be deleted: 有 {k} 个视频删不掉… with their names and what to do; [再试一次] [不删了，直接关闭]", () => {
  const o = Close.deleteFailedOptions("zh-CN", ["直播切片 11-02.mp4", "直播切片 11-02 竖屏.mp4"]);
  a.equal(o.message, "有 2 个视频删不掉，可能正被别的软件打开着。");
  a.deepEqual(o.detail.split("\n"), ["直播切片 11-02.mp4", "直播切片 11-02 竖屏.mp4", "先关掉正在用它们的软件（比如播放器），再点「再试一次」。"]);
  a.deepEqual(o.buttons, ["再试一次", "不删了，直接关闭"]);
  a.equal(o.buttons[o.defaultId], "再试一次"); a.equal(o.cancelId, o.defaultId, "Esc does not close the window");
  const one = Close.deleteFailedOptions("zh-CN", ["直播切片 11-02.mp4"]);
  a.deepEqual(one.detail.split("\n"), ["直播切片 11-02.mp4", "先关掉正在用它的软件（比如播放器），再点「再试一次」。"]);
  const en = Close.deleteFailedOptions("en", ["a.mp4"]);
  a.doesNotMatch([en.message, en.detail.split("\n").slice(1).join(" "), ...en.buttons].join(" "), /[一-鿿]/);
  a.deepEqual(en.buttons, ["Try again", "Don't delete, just close"]);
  a.equal(en.detail.split("\n")[1], "Close the program that has it open (such as a player), then click Try again.");
});

test("JJ: the English body of the export prompt ends with exporting it again from the start", () => {
  a.equal(Close.dialogOptions("en", 0).detail,
    "Closing MontClip stops the export. The half-finished video won't be kept; next time you'll need to export it again from the start.");
});

// decideClose with the boxes and the deleting injected: what each answer does
function flow(state, answers, deletes = []) {
  const asked = [], deleted = []; let opened = 0;
  const done = Close.decideClose({ language: "zh-CN", state,
    ask: async (o) => { asked.push(o); const r = answers.shift(); if (r === undefined) throw Error("asked once too often: " + o.message); return r; },
    deleteFiles: async (files) => { deleted.push(files.slice()); return deletes.shift() || { deleted: files, failed: [], refused: [] }; },
    openQueue: async () => { opened++; } });
  return done.then((close) => ({ close, asked, deleted, opened }));
}
const U = { exporting: false, unsaved: 2, files: ["直播切片 11-02.mp4", "直播切片 11-02 竖屏.mp4"] };

test("先去保存 (also Enter and Esc): the window stays and the export queue opens; nothing is deleted", async () => {
  const r = await flow(U, [Close.UNSAVED.SAVE]);
  a.equal(r.close, false); a.equal(r.opened, 1); a.deepEqual(r.deleted, []);
  a.equal(r.asked[0].message, "还有 2 个视频没保存，现在关掉吗？");
});

test("不删，直接关闭: closes, nothing is deleted", async () => {
  const r = await flow(U, [Close.UNSAVED.KEEP]);
  a.equal(r.close, true); a.deepEqual(r.deleted, []); a.equal(r.opened, 0);
});

test("删掉它们并关闭: deletes the queue's unsaved copies, asks nothing more, closes", async () => {
  const r = await flow(U, [Close.UNSAVED.DELETE]);
  a.equal(r.close, true); a.deepEqual(r.deleted, [U.files]); a.equal(r.asked.length, 1);
});

test("a delete fails: the window stays, the count is right, 关掉它再试 (再试一次) retries only that one, then closes", async () => {
  const r = await flow(U, [Close.UNSAVED.DELETE, Close.FAILED.RETRY], [{ deleted: [U.files[0]], failed: [U.files[1]], refused: [] }]);
  a.equal(r.asked[1].message, "有 1 个视频删不掉，可能正被别的软件打开着。");
  a.equal(r.asked[1].detail.split("\n")[0], U.files[1], "names the one that could not be deleted");
  a.deepEqual(r.deleted,[U.files, [U.files[1]]], "the retry only tries the one that failed");
  a.equal(r.close, true);
  // giving up closes without deleting again
  const g = await flow(U, [Close.UNSAVED.DELETE, Close.FAILED.GIVE_UP], [{ deleted: [], failed: U.files, refused: [] }]);
  a.equal(g.close, true); a.equal(g.deleted.length, 1); a.equal(g.asked[1].message, "有 2 个视频删不掉，可能正被别的软件打开着。");
  // while the failure prompt is up the window is not closed (decideClose has not answered)
  let release; const hold = new Promise((r2) => { release = r2; });
  let answered = false;
  const pending = Close.decideClose({ language: "zh-CN", state: U, openQueue: async () => {},
    ask: async (o) => o.buttons.length === 3 ? Close.UNSAVED.DELETE : (await hold, Close.FAILED.GIVE_UP),
    deleteFiles: async (files) => ({ deleted: [], failed: files, refused: [] }) }).then((c) => { answered = true; return c; });
  await new Promise((r2) => setTimeout(r2, 50));
  a.equal(answered, false, "the window waits on the failure prompt");
  release(); a.equal(await pending, true);
});

test("nothing unsaved and not exporting: no prompt; exporting: the export prompt, not this one", async () => {
  const none = await flow({ exporting: false, unsaved: 0, files: [] }, []);
  a.equal(none.close, true); a.equal(none.asked.length, 0);
  const exp = await flow({ exporting: true, unsaved: 2, files: U.files }, [Close.KEEP]);
  a.equal(exp.close, false); a.equal(exp.asked[0].message, "还在导出，现在关掉吗？");
  const stop = await flow({ exporting: true, unsaved: 2, files: U.files }, [Close.STOP]);
  a.equal(stop.close, true); a.deepEqual(stop.deleted, [], "stopping an export never deletes the finished copies");
});

test("main.js decides the close with decideClose, in the window's close event (before any quit)", () => {
  const main = read("desktop/main.js");
  a.match(main, /ExportClose\.decideClose\(/);
  a.match(main, /\/api\/export\/delete-unsaved/);
  a.match(main, /openQueue\(\)/);
  const close = main.slice(main.indexOf('win.on("close"'), main.indexOf('win.on("closed"'));
  a.match(close, /event\.preventDefault\(\);/);
});

test("the server deletes only copies this session exported, by base name; unrelated files stay; a locked one is reported", async (t) => {
  const dir = makeDataDir(t);
  const { api } = await desktopServer(t, dir);
  const h264 = await (await api("/api/export/h264")).json();
  if (!h264.encoder) return t.skip("no H.264 encoder on this machine: " + h264.reason);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-close-d-")); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const jpg = path.join(tmp, "f.jpg");
  require("node:child_process").execFileSync(FF.path("ffmpeg"), ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180", "-frames:v", "1", jpg]);
  const exportOne = async (name) => {
    const b = await (await api("/api/export/begin", { method: "POST", body: JSON.stringify({ fps: 30, name, hasAudio: false, duration: 0.2,
      delivery: { preset: "custom", width: 320, height: 180 }, canvasW: 320, canvasH: 180 }) })).json();
    a.ok(b.id, b.error);
    await api("/api/export/frame?id=" + b.id, { method: "POST", body: Buffer.concat(Array(6).fill(fs.readFileSync(jpg))) });
    const e = await (await api("/api/export/end?id=" + b.id, { method: "POST" })).json();
    a.ok(e.src, e.error); return decodeURIComponent(e.src.split("/").pop());
  };
  const one = await exportOne("直播切片 11-02"), two = await exportOne("直播切片 11-02 竖屏");
  const exportsDir = path.join(dir, "exports");
  const other = path.join(exportsDir, "别的软件放的.mp4"); fs.writeFileSync(other, "not ours");
  const del = async (files) => (await api("/api/export/delete-unsaved", { method: "POST", body: JSON.stringify({ files }) })).json();
  // not exported by this session, a path, a half-finished name: refused, untouched
  const r0 = await del(["别的软件放的.mp4", "../project.json", "sub/" + one, one.replace(".mp4", ".part.mp4")]);
  a.deepEqual(r0.deleted, []); a.equal(r0.refused.length, 4);
  a.ok(fs.existsSync(other)); a.ok(fs.existsSync(path.join(dir, "project.json")));
  if (process.platform === "win32") {
    // a player holding the file: Windows will not delete it
    const target = path.join(exportsDir, two).split("'").join("''");
    const lock = spawn("powershell", ["-NoProfile", "-Command",
      "$f=[IO.File]::Open('" + target + "','Open','Read','None'); [Console]::Out.WriteLine('LOCKED'); [Console]::In.ReadLine() | Out-Null; $f.Close()"],
      { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    t.after(() => { try { lock.kill(); } catch {} });
    await new Promise((r) => lock.stdout.on("data", (d) => { if (String(d).includes("LOCKED")) r(); }));
    const r1 = await del([one, two]);
    a.deepEqual(r1.deleted, [one]); a.deepEqual(r1.failed, [two]);
    a.ok(!fs.existsSync(path.join(exportsDir, one))); a.ok(fs.existsSync(path.join(exportsDir, two)));
    lock.stdin.write("\n"); await new Promise((r) => lock.once("exit", r));
    const r2 = await del([two]);
    a.deepEqual(r2.deleted, [two]); a.deepEqual(r2.failed, []);
  } else {
    a.deepEqual((await del([one, two])).deleted, [one, two]);
  }
  a.ok(!fs.existsSync(path.join(exportsDir, two)));
  a.ok(fs.existsSync(other), "the unrelated file is still there");
  a.deepEqual((await del([one])).refused, [one], "a deleted copy is no longer on the list");
});

// QQ (28b23bf review) and Deja (2026-11-03): a copy the desktop is still writing to where the streamer chose is not
// "not saved" (deleting it would leave half a file); a file the server refuses to delete is not deleted either — it
// is named and the window stays; local paths in the cleanup log and stderr are masked.
test("a copy being saved (q.saving) is not counted as not saved, in the page and in the main process", () => {
  const queue = [{ status: "done", file: "a.mp4" }, { status: "done", file: "b.mp4", saving: true }, { status: "done", file: "c.mp4", saved: true }];
  a.equal(Close.unsavedCount(queue), 1);
  const app = read("app.js"), i = app.indexOf("function exportCloseState()"), fn = app.slice(i, app.indexOf("\n}", i) + 2);
  const state = new Function("exportQueue", "state", "bgExportBusy", fn + "return exportCloseState();")(queue, { exporting: false }, () => false);
  a.deepEqual(state, { exporting: false, unsaved: 1, files: ["a.mp4"] });
  // a background export (#263) counts as exporting: closing the window would stop it
  a.equal(new Function("exportQueue", "state", "bgExportBusy", fn + "return exportCloseState();")(queue, { exporting: false }, () => true).exporting, true);
});
test("a file the server refuses to delete counts as not deleted: it is named, the window stays until the streamer answers", async () => {
  const r = await flow(U, [Close.UNSAVED.DELETE, Close.FAILED.GIVE_UP], [{ deleted: [U.files[0]], failed: [], refused: [U.files[1]] }]);
  a.equal(r.asked.length, 2, "asked again instead of closing as if all were deleted");
  a.equal(r.asked[1].message, "有 1 个视频删不掉，可能正被别的软件打开着。");
  a.equal(r.asked[1].detail.split("\n")[0], U.files[1], "names the file that was not deleted");
  a.equal(r.close, true);
  const k = await flow(U, [Close.UNSAVED.DELETE, Close.FAILED.RETRY, Close.FAILED.GIVE_UP], [{ deleted: [], failed: [U.files[0]], refused: [U.files[1]] }, { deleted: [U.files[0]], failed: [], refused: [U.files[1]] }]);
  a.deepEqual(k.deleted, [U.files, U.files], "the retry tries both again");
  a.equal(k.asked[2].detail.split("\n")[0], U.files[1], "still named while it is refused");
});
test("the cleanup log and stderr show no user name: paths are masked", () => {
  const server = read("server/server.js"), i = server.indexOf("function logCleanupLeft("), fn = server.slice(i, server.indexOf("\n}", i) + 2);
  a.match(fn, /X\.maskUserPath\(p\)/, "each path is masked before it is written or printed");
  a.ok(!/not removed: \$\{p\}/.test(fn));
});

// JJ (2026-11-03, review of #66): "not yet saved where you choose" reads oddly; "saved to a place you chose".
test("the unsaved-export sentence says 'saved to a place you chose'", () => {
  const View = require("../ui-preferences");
  for (const k of ["own.export-unsaved-body-1", "own.export-unsaved-body-n"]) {
    a.match(View.text.en[k], /not yet saved to a place you chose\./, k);
    a.ok(!/where you choose/.test(View.text.en[k]), k);
  }
});
