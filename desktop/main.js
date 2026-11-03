/* Desktop host for the existing editor and compositor. No renderer Node API. */
"use strict";
const { app, BrowserWindow, dialog, session, utilityProcess, ipcMain, safeStorage } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore, allowed: settingsAllowed } = require("./view-settings");
const { nativeText, languageOf } = require("./native-text");
const { transcribeEnabled } = require("./features");
const { createCloseController } = require("./close-controller");
const External = require("../external-ffmpeg");
const Capabilities = require("../capabilities");   // risk levels are fixed here; the page gets a read-only copy
const fs = require("node:fs");
let worker, win, stopping = false, closing = false, workerExited = false, flvImports = null, flvShutdown = null;
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
  // on-device transcription (#70): the user's downloaded or imported speech models
  env.MONTCLIP_ASR_MODELS_DIR = path.join(app.getPath("userData"), "asr-models");
  if (app.isPackaged) {
    delete env.MONTCLIP_FFMPEG;
    delete env.MONTCLIP_FFPROBE;
    env.MONTCLIP_FFMPEG_PACKAGED = "1";
    env.MONTCLIP_FFMPEG_DIR = path.join(process.resourcesPath, "ffmpeg");
    // the speech engine and the VAD (and, in the 完整版 package, the models) are in the package
    env.MONTCLIP_ASR_DIR = path.join(process.resourcesPath, "asr");
    // the FLV import runs prepareMedia here in the main process: the same FFmpeg, never PATH
    delete process.env.MONTCLIP_FFMPEG;
    delete process.env.MONTCLIP_FFPROBE;
    process.env.MONTCLIP_FFMPEG_PACKAGED = "1";
    process.env.MONTCLIP_FFMPEG_DIR = env.MONTCLIP_FFMPEG_DIR;
  }
  flvImports = require("./flv-import").createFlvImports({ mediaDir: path.join(env.FABLECUT_DATA_DIR, "media") });
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
  // the exports the editor page is about to download (its own export flow, not Open in the queue); one each
  const expectedExports = new Set(), exportDownloads = new Set();   // · the export files being downloaded now
  ipcMain.on("montclip:downloads:expect", (event, name) => { if (settingsAllowed(event, win, origin) && typeof name === "string" && name.length > 0 && name.length <= 255 && !/[\\/]/.test(name)) expectedExports.add(name); });
  ses.on("will-download", (event, item, contents) => {
    // Editor-owned exports only. Native save dialog remains the user's destination choice.
    const url = item.getURL();
    if (!win || contents !== win.webContents ||
        !(url.startsWith("blob:" + origin + "/") || local(url) && new URL(url).pathname.startsWith("/exports/"))) { event.preventDefault(); return; }
    // A plain title and file name in the interface language; this session's export loses its copy once it is saved.
    // one download of an export at a time: a second of the same file while the first is open is cancelled
    if (!require("./export-downloads").attach(item, { origin, exportsDir: path.join(env.FABLECUT_DATA_DIR, "exports"), language: languageOf(settings.get()), downloadsDir: app.getPath("downloads"),
      busy: exportDownloads, take: (n) => expectedExports.delete(n),
      claim: async (n) => { const r = await fetch(origin + "/api/export/claim?name=" + encodeURIComponent(n), { method: "POST", headers: { "X-MontClip-Session": token } }); return r.ok && (await r.json()).fresh === true; },
      onDone: (v) => { if (win && !win.isDestroyed()) win.webContents.send("montclip:download:done", { state: v.state, name: v.name, removed: v.removed }); } })) {
      event.preventDefault();
      if (win && !win.isDestroyed()) win.webContents.send("montclip:download:done", { state: "refused", name: item.getFilename(), removed: false });
    }
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
  ipcMain.on("montclip:capabilities:get", (event) => {
    event.returnValue = settingsAllowed(event, win, origin)
      ? { ok: true, capabilities: Capabilities.list().map((c) => ({ name: c.name, source: c.source, risk: c.risk, summary: c.summary, schema: c.schema })) }
      : { ok: false, code: "CAPABILITIES_FORBIDDEN" };
  });
  // read-only feature switches for the page (desktop/features.js); no channel sets them
  const features = { transcribe: transcribeEnabled({ isPackaged: app.isPackaged, argv: process.argv, env: process.env }) };
  ipcMain.on("montclip:features:get", (event) => {
    event.returnValue = settingsAllowed(event, win, origin) ? { transcribe: features.transcribe } : { transcribe: false };
  });
  // The speech model (#70; ADR 2026-11-03 local capability boundary, row 6): downloaded only here, after the streamer
  // says yes in the host's own box (sizes and sites), from the listed hosts only (asr-download.js); or imported from a
  // folder the streamer picks (a U 盘). Every file is checked against desktop/asr-manifest.json. The page passes no
  // path and no address: only which model.
  const AsrModels = require("../asr-models"), AsrDownload = require("../asr-download"), { asrDownloadText, asrImportTitle } = require("./asr-text");
  // the only sites a model is downloaded from (Deja, 2026-11-03), hf-mirror.com first, github.com second, and the hosts
  // GitHub's release downloads redirect to; written here, not read from a file
  const ASR_HOSTS = Object.freeze(["hf-mirror.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);
  const asrStore = AsrModels.createStore({ roots: [path.join(env.MONTCLIP_ASR_DIR || path.join(__dirname, "..", "vendor", "asr"), "models")],
    userDir: env.MONTCLIP_ASR_MODELS_DIR });
  let asrBusy = null;
  app.once("before-quit", () => { if (asrBusy) asrBusy.abort(); });
  ipcMain.handle("montclip:asr:download", async (event, which) => {
    if (!settingsAllowed(event, win, origin) || !features.transcribe) return { ok: false, code: "ASR_FORBIDDEN" };
    if (which !== "asr" && which !== "punct") return { ok: false, code: "ASR_UNKNOWN_MODEL" };
    if (asrBusy) return { ok: false, code: "ASR_BUSY" };
    const t = asrDownloadText(languageOf(settings.get()), which);
    const answer = smoke ? { response: process.env.MONTCLIP_SMOKE_ASR_CONSENT === "1" ? 1 : 0 }
      : await dialog.showMessageBox(win, { type: "question", title: t.title, message: t.message, detail: t.detail, buttons: t.buttons, defaultId: 0, cancelId: 0, noLink: true });
    if (smoke) process.stdout.write("MONTCLIP_ASR_CONSENT " + JSON.stringify({ which, title: t.title, message: t.message, detail: t.detail, answered: answer.response }) + "\n");
    if (answer.response !== 1) return { ok: false, declined: true };
    asrBusy = new AbortController();
    try {
      const r = await asrStore.download(which, { signal: asrBusy.signal, hosts: ASR_HOSTS,
        fetchFile: (url, dest, o) => AsrDownload.fetchFile(url, dest, { ...o, hosts: ASR_HOSTS }),
        onProgress: (p) => { if (win && !win.isDestroyed() && p.total) win.webContents.send("montclip:asr:progress", { which, loaded: p.loaded, total: p.total }); } });
      return { ok: true, source: r.source };
    } catch (e) {
      return { ok: false, code: e.code || "ASR_DOWNLOAD_FAILED", needBytes: e.needBytes, freeBytes: e.freeBytes, drive: e.drive,
        error: e.failed ? e.failed.map((f) => f.source + ": " + f.error).join("; ") : String(e.message || e) };
    } finally { asrBusy = null; }
  });
  // v10: what the streamer chose on the transcription setup page ("local" | "later"), kept here because the page's
  // origin (a random port) changes each time MontClip opens; and whether a download stopped half-way (it opens on 「没下载完」)
  const asrChoiceFile = path.join(app.getPath("userData"), "asr-choice.json");
  ipcMain.handle("montclip:asr:choice", async (event, set) => {
    if (!settingsAllowed(event, win, origin) || !features.transcribe) return { ok: false, code: "ASR_FORBIDDEN" };
    if (set !== undefined) {
      if (!(set === "local" || set === "later")) return { ok: false, code: "ASR_BAD_CHOICE" };
      const tmp = asrChoiceFile + "." + crypto.randomUUID() + ".tmp";
      try { fs.writeFileSync(tmp, JSON.stringify({ version: 1, choice: set }), { flag: "wx" }); fs.renameSync(tmp, asrChoiceFile); }
      catch { try { fs.unlinkSync(tmp); } catch { } return { ok: false, code: "ASR_CHOICE_NOT_SAVED" }; }
    }
    let choice = null, partial = false;
    try { const j = JSON.parse(fs.readFileSync(asrChoiceFile, "utf8")); if (j && (j.choice === "local" || j.choice === "later")) choice = j.choice; } catch { }
    try { partial = fs.readdirSync(path.join(env.MONTCLIP_ASR_MODELS_DIR, ".partial")).some((f) => f.endsWith(".part")); } catch { }
    return { ok: true, choice, partial };
  });
  // 〔取消下载〕: what came stays for 「接着下载」
  ipcMain.handle("montclip:asr:cancel", async (event) => {
    if (!settingsAllowed(event, win, origin)) return { ok: false, code: "ASR_FORBIDDEN" };
    if (asrBusy) asrBusy.abort();
    return { ok: true };
  });
  ipcMain.handle("montclip:asr:import", async (event) => {
    if (!settingsAllowed(event, win, origin) || !features.transcribe) return { ok: false, code: "ASR_FORBIDDEN" };
    if (asrBusy) return { ok: false, code: "ASR_BUSY" };
    const smokeDir = smoke && process.env.MONTCLIP_SMOKE_ASR_IMPORT;
    const pick = smokeDir ? { canceled: false, filePaths: [smokeDir] }
      : await dialog.showOpenDialog(win, { title: asrImportTitle(languageOf(settings.get())), properties: ["openDirectory"] });
    if (pick.canceled || !pick.filePaths.length) return { ok: false, cancelled: true };
    asrBusy = new AbortController();
    try {
      const r = await asrStore.importPaths(pick.filePaths);
      return { ok: true, imported: r.imported.length, already: r.already, rejected: r.rejected };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    finally { asrBusy = null; }
  });
  const externalFile = path.join(app.getPath("userData"), "external-ffmpeg.json");
  const externalStatus = async () => {
    const saved = External.readSetting(externalFile);
    if (!saved) return { ok: false, code: "none" };
    if (saved.bad) return { ok: false, code: "extSettingBad" };
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
    catch { try { fs.unlinkSync(temp); } catch { } return { ok: false, code: "extSaveFailed" }; }
    return External.forPage(result);
  });
  ipcMain.handle("montclip:ffmpeg:clear", async (event) => {
    if (!settingsAllowed(event, win, origin)) return forbidden;
    try { fs.rmSync(externalFile, { force: true }); return { ok: false, code: "none" }; } catch { return { ok: false, code: "extRemoveFailed" }; }
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
  const agentSessions = require('./agent-session-store').createStore(app.getPath('userData'));
  const AgentService = require('./agent-service');
  // OpenRouter only for tests: development builds, or the main process's own launch switch (never the page)
  const agentService = AgentService.createDiskService(app.getPath('userData'),safeStorage,undefined,{providers:AgentService.testProvidersEnabled({isPackaged:app.isPackaged,argv:process.argv,env:process.env})?AgentService.ALL_PROVIDERS:AgentService.PUBLIC_PROVIDERS});
  for(const operation of ['get','configure','reset','deleteConnection','send','cancel']) ipcMain.handle('montclip:agent:'+operation,(event,value)=>{
    if(!settingsAllowed(event,win,origin))return {ok:false,code:'AGENT_FORBIDDEN'};
    return agentService[operation](value);
  });
  // Desktop FLV import: the page hands over the file the user picked; the path is read by the preload and never
  // returned to the page. Fixed operations, same sender / frame / origin guard as the settings.
  const FLV_CODES = new Set(["FLV_NOT_FOUND", "FLV_NOT_FLV", "FLV_IMPORT_EXPIRED", "FLV_IMPORT_BUSY", "FLV_IMPORT_CANCELED", "FLV_SOURCE_CHANGED", "FLV_COPY_MISMATCH", "FLV_CLEANUP_FAILED"]);
  const { publicPreparationError } = require("../prepare-media");
  for (const op of ["inspect", "prepare", "status", "cancel", "finish"]) ipcMain.handle("montclip:flv:" + op, async (event, value) => {
    if (!settingsAllowed(event, win, origin)) return { ok: false, code: "FLV_FORBIDDEN" };
    try {
      if (op === "inspect") {
        if (typeof value !== "string" || !value) return { ok: false, code: "FLV_NOT_FOUND" };
        return { ok: true, ...(await flvImports.inspect(value)) };
      }
      const id = value && typeof value.id === "string" ? value.id : null;
      if (!id) return { ok: false, code: "FLV_IMPORT_EXPIRED" };
      if (op === "prepare") return { ok: true, ...(await flvImports.prepare(id, { allowTranscode: value.allowTranscode === true, acceptReadable: value.acceptReadable === true })) };
      if (op === "status") return { ok: true, status: flvImports.status(id) };
      flvImports[op](id);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: FLV_CODES.has(error.code) ? error.code : publicPreparationError(error).code };
    }
  });
  win.webContents.on("render-process-gone", () => { flvImports.shutdown().catch(() => {}); });
  win.webContents.on('render-process-gone',()=>agentService.dispose());
  win.on('closed',()=>agentService.dispose());
  for(const operation of ['get','set']) ipcMain.on('montclip:sessions:'+operation,(event,value)=>{
    event.returnValue=settingsAllowed(event,win,origin)?agentSessions[operation](value):{ok:false,code:'SESSION_FORBIDDEN'};
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
  // Closing during an export asks first (× and Alt+F4 alike); 「停止导出并关闭」 goes on to the usual save-and-close,
  // and the server's shutdown in before-quit stops ffmpeg and deletes the half-finished files (export-cleanup.js).
  const ExportClose = require("./export-close");
  let exportAsking = false;
  const confirmExportClose = async () => {
    const state = await ExportClose.exportState({
      server: () => fetch(origin + "/api/export/active", { headers: { "X-MontClip-Session": token } }).then((r) => r.json()).then((j) => j.active),
      renderer: () => rendererFault || win.webContents.isDestroyed() ? null
        : win.webContents.executeJavaScript("typeof exportCloseState === 'function' ? exportCloseState() : null"),
    });
    // asked here, in the close event: a copy that cannot be deleted can still keep the window open
    return ExportClose.decideClose({ language: languageOf(settings.get()), state,
      ask: async (options) => (await dialog.showMessageBox(win, options)).response,
      deleteFiles: (files) => fetch(origin + "/api/export/delete-unsaved", { method: "POST",
        headers: { "X-MontClip-Session": token, "Content-Type": "application/json" }, body: JSON.stringify({ files }) })
        .then((r) => r.json()).catch(() => ({ deleted: [], failed: files, refused: [] })),
      openQueue: () => win.webContents.executeJavaScript("typeof openQueue === 'function' && (openQueue(), true)").catch(() => false) });
  };
  win.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    if (exportAsking) return;
    exportAsking = true;
    confirmExportClose().catch(() => true).then((go) => { exportAsking = false; if (go && !win.isDestroyed()) closeController.request(); });
  });
  win.on("closed", () => closeController.dispose());
  win.on("unresponsive", () => { rendererFault = "unresponsive"; closeController.fault(rendererFault); });
  win.on("responsive", () => { if (rendererFault === "unresponsive") rendererFault = null; });
  win.webContents.on("render-process-gone", () => { rendererFault = "crashed"; closeController.fault(rendererFault); });
  worker.on("exit", () => {
    if (stopping) return;
    // start() only runs once the app is ready, so a message box can show here
    const t = nativeText(languageOf(settings.get()));
    const options = { type: "error", title: t.serviceStoppedTitle, message: t.serviceStopped, buttons: [t.ok], noLink: true };
    // over the editor window while it is open, so the box cannot end up behind it
    if (win && !win.isDestroyed()) dialog.showMessageBox(win, options); else dialog.showMessageBox(options);
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
    if (process.argv.includes("--agent-layout-check")) await require("./agent-layout-smoke").run(win);
    if (process.argv.includes("--sessions-check")) await require("./agent-session-smoke").run(win);
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
  // unfinished FLV imports remove their own files before the app goes; a second quit while it is still running waits
  if (flvImports && !flvShutdown) {
    event.preventDefault();
    const p = flvImports.shutdown().catch(() => {}).finally(() => { flvShutdown = true; app.quit(); });
    flvShutdown = p;
    return;
  }
  if (flvShutdown && flvShutdown !== true) { event.preventDefault(); return; }
  // until the service has exited: a second quit (window-all-closed right after the first) must not cut its shutdown
  // short — it stops running exports and deletes their half-finished files (export-cleanup.js)
  if (worker && !workerExited) {
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => { worker.kill(); app.quit(); }, 4000);
    worker.once("exit", () => { clearTimeout(timer); app.quit(); });
    worker.postMessage({ type: "shutdown" });
  }
});
// Electron does not consistently propagate process.exitCode through app.quit().
app.on("will-quit", (event) => { if (smoke && process.exitCode) { event.preventDefault(); app.exit(process.exitCode); } });
app.whenReady().then(start).catch(async (error) => {
  try {
    if (smoke) { console.error(error); process.exitCode = 1; }
    else {
      // the interface language from view-settings.json (Chinese when it cannot be read); the box is
      // awaited: a message box does not block, and quitting would close it at once
      let t; try { t = nativeText(languageOf(createStore(app.getPath("userData")).get())); } catch { t = nativeText("zh-CN"); }
      await dialog.showMessageBox({ type: "error", title: t.startFailedTitle,
        message: `${(error && error.textKey && t[error.textKey]) || String((error && error.message) || error)}\n${t.startFailedHint}`,
        buttons: [t.ok], noLink: true });
    }
  } finally {
    // quit even when the box could not be shown
    closing = true; app.quit();
  }
});
