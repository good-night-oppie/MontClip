/* Desktop host for the existing editor and compositor. No renderer Node API. */
"use strict";
const { app, BrowserWindow, dialog, session, utilityProcess } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { createCloseController } = require("./close-controller");
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
      contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: !app.isPackaged } });
  win.removeMenu();
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
app.whenReady().then(start).catch((error) => {
  if (smoke) { console.error(error); process.exitCode = 1; }
  else dialog.showErrorBox("MontClip 启动失败", `${error.message}\n请关闭后重试，并检查工作目录是否可写。`);
  closing = true; app.quit();
});
