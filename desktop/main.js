/* Desktop host for the existing editor and compositor. No renderer Node API. */
"use strict";
const { app, BrowserWindow, dialog, session, utilityProcess, ipcMain } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore, allowed: settingsAllowed } = require("./view-settings");
const { createCloseController } = require("./close-controller");
const External = require("../external-ffmpeg");
const fs = require("node:fs");
let worker, win, stopping = false, closing = false, workerExited = false;
const smoke = !app.isPackaged && process.argv.includes("--montclip-smoke");
const faultTest = smoke && (process.argv.includes("--close-crash") ? "crash" : process.argv.includes("--close-timeout") ? "timeout" : null);

app.enableSandbox();
app.setName("MontClip");
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => { if (win && !win.isDestroyed()) { win.restore(); win.focus(); } });
app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("will-navigate", (event) => event.preventDefault());
});

async function start() {
  const token = crypto.randomBytes(32).toString("hex");
  const env = { ...process.env, PORT: "0", HOST: "127.0.0.1", MONTCLIP_DESKTOP: "1",
    MONTCLIP_SESSION_TOKEN: token, FABLECUT_DATA_DIR: path.join(app.getPath("userData"), "workspace") };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  // The server runs only the FFmpeg shipped in resources/ffmpeg once packaged
  // (see ffmpeg-path.js); development keeps MONTCLIP_FFMPEG* or vendor/.
  // the user's own FFmpeg (H.264 export only): chosen in Settings, stored here, read by the server
  env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS = path.join(app.getPath("userData"), "external-ffmpeg.json");
  delete env.MONTCLIP_FFMPEG_PACKAGED;
  if (app.isPackaged) {
    delete env.MONTCLIP_FFMPEG;
    delete env.MONTCLIP_FFPROBE;
    env.MONTCLIP_FFMPEG_PACKAGED = "1";
    env.MONTCLIP_FFMPEG_DIR = path.join(process.resourcesPath, "ffmpeg");
  }
  worker = utilityProcess.fork(path.join(__dirname, "..", "server.js"), [], { env, stdio: "pipe" });
  worker.once("exit", () => { workerExited = true; });
  worker.stdout?.on("data", (data) => { if (!app.isPackaged) process.stdout.write(data); });
  worker.stderr?.on("data", (data) => { if (!app.isPackaged) process.stderr.write(data); });
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("启动本地编辑服务超时。")), 30000);
    worker.once("exit", () => { clearTimeout(timeout); reject(new Error("本地编辑服务已退出。")); });
    worker.on("message", (msg) => {
      if (msg?.type !== "montclip-ready" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(msg.origin)) return;
      clearTimeout(timeout); resolve(msg.origin);
    });
  });
  const ses = session.fromPartition("persist:montclip");
  ses.setPermissionRequestHandler((_, __, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  const local = (url) => { try { return new URL(url).origin === origin; } catch { return false; } };
  ses.webRequest.onBeforeRequest((details, callback) => {
    const embedded = /^(blob:|data:)/.test(details.url);
    callback({ cancel: !local(details.url) && !embedded });
  });
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (local(details.url)) details.requestHeaders["X-MontClip-Session"] = token;
    callback({ requestHeaders: details.requestHeaders });
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (local(details.url) && details.resourceType === "mainFrame") {
      headers["Content-Security-Policy"] = ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"];
    }
    callback({ responseHeaders: headers });
  });
  ses.on("will-download", (event, item, contents) => {
    // Editor-owned exports only. Native save dialog remains the user's destination choice.
    const url = item.getURL();
    if (!win || contents !== win.webContents ||
        !(url.startsWith("blob:" + origin + "/") || local(url) && new URL(url).pathname.startsWith("/exports/"))) event.preventDefault();
  });
  win = new BrowserWindow({ width: 1280, height: 820, minWidth: 640, minHeight: 480,
    title: "MontClip", show: false, webPreferences: { session: ses, sandbox: true,
      preload: path.join(__dirname, "view-preload.js"), contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: !app.isPackaged } });
  win.removeMenu();
  const settings = createStore(app.getPath("userData"));
  for (const operation of ["get", "set"]) ipcMain.on("montclip:view:" + operation, (event, value) => {
    event.returnValue = settingsAllowed(event, win, origin)
      ? settings[operation](value) : {ok:false,code:"VIEW_SETTINGS_FORBIDDEN"};
  });
  const externalFile = path.join(app.getPath("userData"), "external-ffmpeg.json");
  const externalStatus = async () => {
    const saved = External.readSetting(externalFile);
    if (!saved) return { ok: false, reason: "none" };
    if (saved.bad) return { ok: false, reason: "The saved local FFmpeg setting could not be read. Choose the program again." };
    return External.check(saved.path);
  };
  const forbidden = { ok: false, code: "EXTERNAL_FFMPEG_FORBIDDEN" };
  ipcMain.handle("montclip:ffmpeg:get", async (event) => settingsAllowed(event, win, origin) ? External.forPage(await externalStatus()) : forbidden);
  ipcMain.handle("montclip:ffmpeg:choose", async (event) => {
    if (!settingsAllowed(event, win, origin)) return forbidden;
    // only a file the user picks in this dialog; nothing is searched or guessed
    const pick = await dialog.showOpenDialog(win, { title: "FFmpeg (libx264)", properties: ["openFile"],
      filters: process.platform === "win32" ? [{ name: "FFmpeg", extensions: ["exe"] }] : [] });
    if (pick.canceled || !pick.filePaths[0]) return { ok: false, code: "CANCELLED" };
    const result = await External.check(pick.filePaths[0]);
    if (!result.ok) return External.forPage(result);
    const temp = externalFile + "." + crypto.randomUUID() + ".tmp";
    try { fs.writeFileSync(temp, JSON.stringify({ version: 1, path: result.path }), { flag: "wx" }); fs.renameSync(temp, externalFile); }
    catch { try { fs.unlinkSync(temp); } catch { } return { ok: false, reason: "The choice could not be saved." }; }
    return External.forPage(result);
  });
  ipcMain.handle("montclip:ffmpeg:clear", async (event) => {
    if (!settingsAllowed(event, win, origin)) return forbidden;
    try { fs.rmSync(externalFile, { force: true }); return { ok: false, reason: "none" }; } catch { return { ok: false, reason: "The choice could not be removed." }; }
  });
  let rendererFault = null, prompts = 0;
  const closeController = createCloseController({
    save: (attempt) => {
      if (rendererFault || win.webContents.isDestroyed()) return false;
      return win.webContents.executeJavaScript(`typeof flushSaveForClose === 'function' && flushSaveForClose(${attempt})`);
    },
    cancel: (attempt) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed())
        return win.webContents.executeJavaScript(`typeof cancelCloseSave === 'function' && cancelCloseSave(${attempt})`);
    },
    prompt: async (reason) => {
      if (faultTest) {
        prompts++;
        process.stdout.write("MONTCLIP_CLOSE_PROMPT " + JSON.stringify({ reason, prompts, default: 0, choice: prompts === 1 ? 0 : 1 }) + "\n");
        if (prompts === 1) setTimeout(() => { win.close(); win.close(); }, 50);
        return prompts === 1 ? 0 : 1;
      }
      const result = await dialog.showMessageBox(win, { type: "warning", title: "保存尚未确认 / Save not confirmed",
        message: "页面可能未响应，最近修改尚未确认保存。\nThe editor may be unresponsive; recent changes are not confirmed saved.",
        detail: "继续等：保持窗口打开，恢复后可重试关闭。强制关闭：最近修改可能丢失。\nKeep waiting: leave the window open and retry closing after recovery. Force close: recent changes may be lost.",
        buttons: ["继续等 / Keep waiting", "强制关闭（最近修改可能丢失） / Force close (may lose changes)"], defaultId: 0, cancelId: 0, noLink: true });
      return result.response;
    },
    close: () => { closing = true; win.destroy(); },
  });
  win.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    closeController.request();
  });
  win.on("closed", () => closeController.dispose());
  win.on("unresponsive", () => { rendererFault = "unresponsive"; closeController.fault(rendererFault); });
  win.on("responsive", () => { if (rendererFault === "unresponsive") rendererFault = null; });
  win.webContents.on("render-process-gone", () => { rendererFault = "crashed"; closeController.fault(rendererFault); });
  worker.on("exit", () => {
    if (!stopping) dialog.showErrorBox("MontClip", "本地编辑服务意外退出。请保留窗口中的修改，重新启动后检查项目。 / The local editor service stopped unexpectedly.");
  });
  await win.loadURL(origin);
  if (faultTest) {
    if (faultTest === "crash") {
      await new Promise((resolve) => { win.webContents.once("render-process-gone", resolve); win.webContents.forcefullyCrashRenderer(); });
    } else await win.webContents.executeJavaScript("flushSaveForClose = () => new Promise(() => {}); true");
    win.close(); win.close();
    return;
  }
  if (smoke) {
    if (process.argv.includes("--view-check")) await require("./view-smoke").run(win);
    if (process.argv.includes("--m0")) await require("./m0-smoke").run(win, origin, token, env.FABLECUT_DATA_DIR);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 15000;
      while ((typeof project === 'undefined' || !project || !project.clips) && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 50));
      const response = await fetch('/api/project');
      const doc = await response.json();
      let externalBlocked = false;
      try { await fetch('https://example.com/'); } catch { externalBlocked = true; }
      return { nodeUnavailable: typeof require === 'undefined' && typeof process === 'undefined',
        projectLoaded: Array.isArray(doc.clips), apiStatus: response.status, externalBlocked,
        compositor: typeof drawFrame === 'function', saved: await flushSaveForClose() };
    })()`);
    process.stdout.write("MONTCLIP_SMOKE " + JSON.stringify(result) + "\n");
    const pass = result.nodeUnavailable && result.projectLoaded && result.externalBlocked &&
      result.compositor && result.saved && result.apiStatus === 200;
    if (!pass) process.exitCode = 1;
    closing = true; win.close();
  } else win.show();
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (win && !win.isDestroyed() && !closing) { event.preventDefault(); win.close(); return; }
  if (worker && !workerExited && !stopping) {
    event.preventDefault(); stopping = true;
    const timer = setTimeout(() => { worker.kill(); app.quit(); }, 4000);
    worker.once("exit", () => { clearTimeout(timer); app.quit(); });
    worker.postMessage({ type: "shutdown" });
  }
});
// Electron does not consistently propagate process.exitCode through app.quit().
app.on("will-quit", (event) => { if (smoke && process.exitCode) { event.preventDefault(); app.exit(process.exitCode); } });
app.whenReady().then(start).catch((error) => {
  if (smoke) { console.error(error); process.exitCode = 1; }
  else dialog.showErrorBox("MontClip 启动失败", `${error.message}\n请关闭后重试，并检查工作目录是否可写。`);
  closing = true; app.quit();
});
