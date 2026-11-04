/* MontClip in Cindy — the plugin's logic page (browser sandbox, no Node).
   Tools from the chat go to the Node worker, which runs the MontClip engine; the main view and the
   panel ask, over BroadcastChannel, where the engine's local page is so they can frame it. */

// The pinned LGPL FFmpeg MontClip ships (desktop/ffmpeg-manifest.json, win32-x64).
const FFMPEG = {
  'win32-x64': {
    url: 'https://github.com/good-night-oppie/MontClip/releases/download/ffmpeg-lgpl-n9.0.2-montclip1/ffmpeg-n9.0.2-42-gd7643a0fe3-win64-lgpl-9.0.zip',
    sha256: '67c30e30206b5bddcc2af9ea4f0215bbbcd2519533316997945a0fd9602a2f96',
    bytes: 167488790,
    root: 'ffmpeg-n9.0.2-42-gd7643a0fe3-win64-lgpl-9.0',
  },
};

/* The fablecut_* tools grouped for list_tools(category); anything not listed falls in "other". */
const CATEGORIES = {
  project: ['fablecut_status', 'fablecut_docs', 'fablecut_get_project', 'fablecut_patch_project', 'fablecut_set_project', 'fablecut_import_media', 'fablecut_projects', 'fablecut_frame', 'fablecut_scopes'],
  versions: ['fablecut_versions'],
  audio: ['fablecut_normalize_audio', 'fablecut_auto_duck', 'fablecut_silence', 'fablecut_denoise', 'fablecut_beats', 'fablecut_songs'],
  speech: ['fablecut_transcribe', 'fablecut_captions'],
  export: ['fablecut_export', 'fablecut_encode_profiles', 'fablecut_proxy'],
};
const RULES = {
  project: 'Times are seconds on the timeline. To cut a range out of the edit (e.g. "删掉 1:00–1:30"), call fablecut_patch_project with {ops:[{op:"extract", from:60, to:90}]} — extract closes the gap, lift leaves it. Read the timeline with fablecut_get_project {compact:true} first, and pass its revision as baseRevision. Every edit becomes one step of the open editor\'s undo stack: montclip_undo / montclip_redo take it back or put it back.',
  versions: 'fablecut_versions {action:"list"} lists checkpoints; {action:"save", name} makes one before a big edit; {action:"restore", version} goes back to one — what was there is saved as a version first. Restore only when the user asked.',
  audio: 'These change clip gain / keyframes / cuts in the open project; each is one undo step in the editor.',
  speech: 'Transcription runs in the open editor tab (the MontClip main view in Cindy) or headless. Captions are text clips timed to the words.',
  export: 'fablecut_export renders in the open editor tab and writes the file into the MontClip data folder (exports/). It needs ffmpeg: montclip_status says which one is in use; montclip_install_ffmpeg fetches the pinned build.',
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

const HANDLERS = {
  async montclip_status() {
    const s = await node('montclip/start');
    let editor = null;
    try { editor = await node('montclip/ui', { cmd: 'state' }); } catch (e) { editor = { error: String(e.message) }; }
    return { engine: s, editorTab: editor.status === 200 ? editor : { open: false, note: 'Open MontClip from the left navigation to load the editor; undo / redo need it.' } };
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
  async call_tool(args, msg) {
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
  async montclip_install_ffmpeg(args, msg) {
    const build = FFMPEG['win32-x64'];
    if (typeof cindy.downloads !== 'object' || typeof cindy.downloads.start !== 'function') return { error: 'This Cindy has no cindy.downloads; update Cindy.' };
    const d = await cindy.downloads.start({ id: 'ffmpeg-win32-x64', url: build.url, sha256: build.sha256, bytes: build.bytes });
    if (!d.ok) return { error: d.message || d.errorCode || 'download failed', errorCode: d.errorCode };
    const out = await node('montclip/ffmpeg-install', { sha256: build.sha256, root: build.root }, { downloadTokens: { archive: d.token }, timeoutMs: 120000 });
    return { download: { bytes: d.bytes, sha256: d.sha256, fromCache: d.fromCache }, install: out };
  },
  /* Spike evidence: ask the open main view to play `src` in a <video> inside the Cindy sandbox,
     seek it, and report; then read what it reported. */
  async montclip_probe(args) {
    const s = await node('montclip/start');
    const before = (await node('montclip/probe-log')).entries.length;
    pageRequest({ type: 'run-probe', src: String(args.src || ''), origin: s.origin, view: args.view === 'task' ? 'task' : 'main' });
    const deadline = Date.now() + Math.min(Math.max(Number(args.waitMs) || 45000, 5000), 110000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const log = (await node('montclip/probe-log')).entries;
      const done = log.slice(before).find((e) => e.kind === 'probe-done');
      if (done) return { origin: s.origin, results: log.slice(before) };
    }
    return { origin: s.origin, results: (await node('montclip/probe-log')).entries.slice(before), note: 'no probe-done yet: is the MontClip main view open?' };
  },
  async montclip_probe_log() { return node('montclip/probe-log'); },
  /* Open (or focus) the editor as this task's own tab in the task's right sidebar. */
  async montclip_open_task_view(args) {
    if (typeof cindy.taskView !== 'function') return { error: 'This Cindy has no taskView; update Cindy.' };
    const peek = await cindy.taskView({ peek: true });
    const opened = await cindy.taskView(args.sessionId ? { sessionId: String(args.sessionId) } : {});
    return { peek, opened };
  },
  async montclip_test_click(args) { return node('montclip/test-click', { line: Number(args.line) || 0 }); },
};

cindy.onHostMessage(async function (msg) {
  if (msg.type !== 'tool-call') return;
  const fn = HANDLERS[msg.tool];
  if (!fn) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'TOOL_NOT_FOUND', message: msg.tool }); return; }
  try {
    const result = await fn(msg.args || {}, msg);
    await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result });
  } catch (e) {
    await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: e.code || 'FAILED', message: String(e.message || e) });
  }
});

/* Pages ↔ logic page. A page posts {reqId, type}; the answer carries the same reqId. Pages resend
   until answered, so a request is answered again (not re-run) when it repeats. */
const channel = new BroadcastChannel('montclip');
const answered = new Map();
function pageRequest(m) { channel.postMessage(m); }
channel.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === 'layout') { node('montclip/log', { entry: m.entry }).catch(() => {}); return; }
  if (!m.reqId || m.answer) return;
  if (answered.has(m.reqId)) { const a = answered.get(m.reqId); if (a) channel.postMessage(a); return; }
  answered.set(m.reqId, null);
  let a;
  try {
    if (m.type === 'origin') a = { origin: (await node('montclip/start')).origin };
    else if (m.type === 'bind') a = await node('montclip/bind', { session: String(m.session || '') });
    else a = { error: 'unknown request ' + m.type };
  } catch (err) { a = { error: String(err.message || err) }; }
  a = Object.assign({ reqId: m.reqId, answer: true }, a);
  answered.set(m.reqId, a);
  if (answered.size > 200) answered.delete(answered.keys().next().value);
  channel.postMessage(a);
};
