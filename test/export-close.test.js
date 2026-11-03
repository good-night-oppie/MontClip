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
const Cleanup = require("../export-cleanup");
const { makeDataDir } = require("./helpers");
const FF = require("../ffmpeg-path");
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
  const child = fork(path.join(__dirname, "..", "server.js"), [], { env: { ...process.env, PORT: "0", HOST: "127.0.0.1",
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
