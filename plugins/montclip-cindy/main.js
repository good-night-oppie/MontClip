/* MontClip in Cindy — the plugin's logic page (browser sandbox, no Node).
   Tools from the chat go to the Node worker, which runs the MontClip engine; the task view asks, over
   BroadcastChannel, where the engine's editor page is (with its session token) and which project is its task's. */

/* The fablecut_* tools grouped for list_tools(category); anything not listed falls in "other". */
const CATEGORIES = {
  project: ['fablecut_status', 'fablecut_docs', 'fablecut_get_project', 'fablecut_patch_project', 'fablecut_set_project', 'fablecut_import_media', 'fablecut_projects', 'fablecut_frame', 'fablecut_scopes'],
  versions: ['fablecut_versions'],
  audio: ['fablecut_normalize_audio', 'fablecut_auto_duck', 'fablecut_silence', 'fablecut_denoise', 'fablecut_beats', 'fablecut_songs'],
  speech: ['fablecut_transcribe', 'fablecut_captions'],
  export: ['fablecut_export', 'fablecut_encode_profiles', 'fablecut_proxy'],
};
const RULES = {
  project: 'Times are seconds on the timeline. To cut a range out of the edit (e.g. "删掉 1:00–1:30"), call fablecut_patch_project with {ops:[{op:"extract", from:60, to:90}]} — extract closes the gap, lift leaves it. Read the timeline with fablecut_get_project {compact:true} first and pass its revision as baseRevision. Every edit becomes one step of the open editor\'s undo stack: montclip_undo / montclip_redo take it back or put it back. Import a large local recording with fablecut_import_media {path, link:true} (no second copy on disk).',
  versions: 'fablecut_versions {action:"list"} lists checkpoints; {action:"save", name} makes one before a big edit; {action:"restore", version} goes back to one — what was there is saved as a version first. Restore only when the user asked.',
  audio: 'These change clip gain / keyframes / cuts in the open project; each is one undo step in the editor.',
  speech: 'Transcription runs in the open editor tab (montclip_open_task_view) or headless. Captions are text clips timed to the words.',
  export: 'fablecut_export renders in the open editor tab and writes the file into the MontClip data folder (exports/). It needs the pinned ffmpeg: montclip_status says whether it is installed.',
};
const categoryOf = (name) => Object.keys(CATEGORIES).find((c) => CATEGORIES[c].includes(name)) || 'other';

let toolsCache = null;
async function node(method, params, extra) {
  const r = await cindy.node.request(Object.assign({ method, params: params || {}, timeoutMs: 120000 }, extra || {}));
  if (!r.ok) throw Object.assign(new Error(r.message || 'MontClip engine failed'), { code: r.errorCode || 'NODE_REQUEST_FAILED' });
  return r.result;
}
async function engineTools() {
  if (!toolsCache) toolsCache = (await node('montclip/tools')).tools;
  return toolsCache;
}
/* the engine's answer without the editor's session token (it only goes to the plugin's own pages) */
function publicStart(s) { const o = Object.assign({}, s); delete o.url; return o; }

/* ffmpeg (export, noise reduction): the pinned LGPL build the Windows app bundles, ~160 MB from GitHub, fetched by
   cindy.downloads (SHA-256 and exact size checked by Cindy) and unpacked by the worker, which checks it is LGPL.
   One install at a time, whether the chat or the editor tab's banner asked. Progress goes to the plugin's pages. */
let installing = null;
function installFfmpeg() {
  if (installing) return installing;
  installing = (async () => {
    const spec = await node('montclip/ffmpeg-spec');
    if (!spec.supported) return { error: 'MontClip has no pinned ffmpeg for ' + spec.platform, code: 'UNSUPPORTED_PLATFORM' };
    if (spec.state === 'downloaded') return { installed: true, already: true, version: spec.version };
    if (typeof cindy.downloads !== 'object' || typeof cindy.downloads.start !== 'function')
      return { error: 'This Cindy cannot download files for plugins; update Cindy.', code: 'HOST_TOO_OLD' };
    channel.postMessage({ type: 'ffmpeg-progress', phase: 'queued' });
    const d = await cindy.downloads.start({ id: 'ffmpeg-' + spec.platform, url: spec.url, sha256: spec.sha256, bytes: spec.bytes });
    if (!d.ok) { channel.postMessage({ type: 'ffmpeg-progress', phase: 'failed', message: d.message || d.errorCode }); return { error: d.message || d.errorCode || 'download failed', code: d.errorCode || 'DOWNLOAD_FAILED' }; }
    channel.postMessage({ type: 'ffmpeg-progress', phase: 'installing' });
    try {
      const out = await node('montclip/ffmpeg-install', {}, { downloadTokens: { archive: d.token }, timeoutMs: 120000 });
      channel.postMessage({ type: 'ffmpeg-progress', phase: 'installed', version: out.version });
      return { download: { bytes: d.bytes, sha256: d.sha256, fromCache: d.fromCache }, install: out };
    } catch (e) {
      channel.postMessage({ type: 'ffmpeg-progress', phase: 'failed', message: String(e.message || e) });
      return { error: String(e.message || e), code: e.code || 'INSTALL_FAILED' };
    }
  })().finally(() => { installing = null; });
  return installing;
}
function onDownloadProgress(d) {
  if (!d || !String(d.id || '').startsWith('ffmpeg-')) return;
  channel.postMessage({ type: 'ffmpeg-progress', phase: d.phase, loaded: d.loaded, total: d.total, speedBps: d.speedBps });
}

const HANDLERS = {
  async montclip_status() {
    const s = await node('montclip/start');
    let editor = null;
    try { editor = await node('montclip/ui', { cmd: 'state' }); } catch (e) { editor = { error: String(e.message) }; }
    return { engine: publicStart(s), editorTab: editor && editor.status === 200 ? editor
      : { open: false, note: 'The editor is not open in this task: montclip_open_task_view opens it. Undo / redo need it; without it, go back with fablecut_versions.' } };
  },
  async list_tools(args) {
    const tools = await engineTools();
    if (!args.category) {
      const counts = {};
      for (const t of tools) counts[categoryOf(t.name)] = (counts[categoryOf(t.name)] || 0) + 1;
      return { categories: Object.entries(counts).map(([category, count]) => ({ category, count })), hint: 'list_tools({category}) returns each operation with its parameters and the category RULES.' };
    }
    const list = tools.filter((t) => categoryOf(t.name) === args.category);
    if (!list.length) return { error: 'unknown category', categories: Object.keys(CATEGORIES).concat('other') };
    return { category: args.category, rules: RULES[args.category] || '', tools: list };
  },
  async call_tool(args) {
    const tools = await engineTools();
    const name = String(args.name || '');
    const tool = tools.find((t) => t.name === name);
    if (!tool) return { error: 'unknown operation ' + name, available: tools.map((t) => t.name), hint: 'list_tools({category}) shows each one with its parameters.' };
    try {
      return await node('montclip/call', { name, arguments: args.args || {} }, { timeoutMs: 60000, maxTotalMs: 900000 });
    } catch (e) {
      return { error: String(e.message), inputSchema: tool.inputSchema, rules: RULES[categoryOf(name)] || '' };
    }
  },
  async montclip_undo() { return node('montclip/ui', { cmd: 'undo' }); },
  async montclip_redo() { return node('montclip/ui', { cmd: 'redo' }); },
  async montclip_seek(args) { return node('montclip/ui', { cmd: 'seek', t: Number(args.t) }); },
  /* Only when the user agreed to the download (about 160 MB). */
  async montclip_install_ffmpeg() { return installFfmpeg(); },
  /* Open (or focus) the editor as this task's own tab in the task's right sidebar. */
  async montclip_open_task_view(args) {
    if (typeof cindy.taskView !== 'function') return { error: 'This Cindy has no task views; update Cindy.' };
    const opened = await cindy.taskView(args.sessionId ? { sessionId: String(args.sessionId) } : {});
    return opened;
  },
};

cindy.onHostMessage(async function (msg) {
  if (msg.type === 'event' && msg.name === 'download-progress') { onDownloadProgress(msg.data); return; }
  if (msg.type !== 'tool-call') return;
  const fn = Object.prototype.hasOwnProperty.call(HANDLERS, msg.tool) ? HANDLERS[msg.tool] : null;
  if (!fn) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'TOOL_NOT_FOUND', message: msg.tool }); return; }
  try {
    const result = await fn(msg.args || {}, msg);
    await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result });
  } catch (e) {
    await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: e.code || 'FAILED', message: String(e.message || e) });
  }
});

/* Pages ↔ logic page. A page posts {reqId, type}; the answer carries the same reqId. Pages resend until answered,
   so a request that repeats is answered again, not run again. */
const channel = new BroadcastChannel('montclip');
const answered = new Map();
channel.onmessage = async (e) => {
  const m = e.data || {};
  if (!m.reqId || m.answer) return;
  if (answered.has(m.reqId)) { const a = answered.get(m.reqId); if (a) channel.postMessage(a); return; }
  answered.set(m.reqId, null);
  let a;
  try {
    if (m.type === 'editor') { const s = await node('montclip/start'); a = { origin: s.origin, url: s.url }; }
    else if (m.type === 'bind') a = await node('montclip/bind', { session: String(m.session || '') });
    else if (m.type === 'ffmpeg-state') a = await node('montclip/ffmpeg-spec');
    else if (m.type === 'ffmpeg-install') a = await installFfmpeg();   // the banner's button: the user's own click
    else a = { error: 'unknown request ' + m.type };
  } catch (err) { a = { error: String(err.message || err), code: err.code || null }; }
  a = Object.assign({ reqId: m.reqId, answer: true }, a);
  answered.set(m.reqId, a);
  if (answered.size > 200) answered.delete(answered.keys().next().value);
  channel.postMessage(a);
};
