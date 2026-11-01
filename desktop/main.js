/* Desktop host for the existing editor and compositor. No renderer Node API. */
"use strict";
const { app, BrowserWindow, dialog, session, utilityProcess, ipcMain } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore, allowed: settingsAllowed } = require("./view-settings");
const { nativeText, languageOf } = require("./native-text");
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
    const timeout = setTimeout(() => reject(Object.assign(new Error("serviceStartTimeout"), { textKey: "serviceStartTimeout" })), 30000);
    worker.once("exit", () => { clearTimeout(timeout); reject(Object.assign(new Error("serviceExitedAtStart"), { textKey: "serviceExitedAtStart" })); });
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
  const paneSettings = createStore(app.getPath("userData"), {pane:true});
  for (const operation of ["get", "set"]) ipcMain.on("montclip:pane:" + operation, (event, value) => {
    event.returnValue = settingsAllowed(event, win, origin)
      ? paneSettings[operation](value) : {ok:false,code:"VIEW_SETTINGS_FORBIDDEN"};
  });
  const workspaceSettings = require('./workspace-settings').createStore(app.getPath('userData'));
  for (const operation of ['get','set','migrate']) ipcMain.on('montclip:workspace:'+operation,(event,value)=>{
    event.returnValue=settingsAllowed(event,win,origin)?workspaceSettings[operation](value):{ok:false,code:'WORKSPACE_FORBIDDEN'};
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
      // in the interface language the user chose, read now (it may have changed since the window opened)
      const t = nativeText(languageOf(settings.get()));
      if (faultTest) {
        prompts++;
        process.stdout.write("MONTCLIP_CLOSE_PROMPT " + JSON.stringify({ reason, prompts, default: 0, choice: prompts === 1 ? 0 : 1,
          title: t.closeTitle, buttons: [t.closeKeepWaiting, t.closeForce] }) + "\n");
        if (prompts === 1) setTimeout(() => { win.close(); win.close(); }, 50);
        return prompts === 1 ? 0 : 1;
      }
      const result = await dialog.showMessageBox(win, { type: "warning", title: t.closeTitle, message: t.closeMessage, detail: t.closeDetail,
        buttons: [t.closeKeepWaiting, t.closeForce], defaultId: 0, cancelId: 0, noLink: true });
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
    if (!stopping) dialog.showErrorBox("MontClip", nativeText(languageOf(settings.get())).serviceStopped);
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
    if (process.argv.includes("--workspace-check")) await require("./workspace-smoke").run(win);
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
  else {
    // the interface language from view-settings.json (Chinese when it cannot be read)
    let t; try { t = nativeText(languageOf(createStore(app.getPath("userData")).get())); } catch { t = nativeText("zh-CN"); }
    dialog.showErrorBox(t.startFailedTitle, `${(error && error.textKey && t[error.textKey]) || String((error && error.message) || error)}\n${t.startFailedHint}`);
  }
  closing = true; app.quit();
});
