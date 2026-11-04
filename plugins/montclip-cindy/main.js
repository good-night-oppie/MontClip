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
/* The Windows app has the same projects open (writer-lock.js): the engine refuses to start. Said in plain words, to the
   page and to the chat (VV's review of #111; JJ to review). */
const DATA_DIR_IN_USE_TEXT = '另一个 MontClip 正在用这些项目（可能是电脑上单独打开的 MontClip）。两个同时改，会互相盖掉。先把那边的 MontClip 关掉，再回到这里重试。';
function engineError(r) {
  const message = String(r.message || 'MontClip engine failed');
  if (/DATA_DIR_IN_USE|Another MontClip \(/.test(message)) return Object.assign(new Error(DATA_DIR_IN_USE_TEXT), { code: 'DATA_DIR_IN_USE' });
  return Object.assign(new Error(message), { code: r.errorCode || 'NODE_REQUEST_FAILED' });
}
async function node(method, params, extra) {
  const r = await cindy.node.request(Object.assign({ method, params: params || {}, timeoutMs: 120000 }, extra || {}));
  if (!r.ok) throw engineError(r);
  return r.result;
}
async function engineTools() {
  if (!toolsCache) toolsCache = (await node('montclip/tools')).tools;
  return toolsCache;
}
/* the engine's answer without the editor's session token (it only goes to the plugin's own pages) */
function publicStart(s) { const o = Object.assign({}, s); delete o.url; return o; }

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
  /* Open (or focus) the editor as this task's own tab in the task's right sidebar. */
  async montclip_open_task_view(args) {
    if (typeof cindy.taskView !== 'function') return { error: 'This Cindy has no task views; update Cindy.' };
    const opened = await cindy.taskView(args.sessionId ? { sessionId: String(args.sessionId) } : {});
    return opened;
  },
};

cindy.onHostMessage(async function (msg) {
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
    else a = { error: 'unknown request ' + m.type };
  } catch (err) { a = { error: String(err.message || err), code: err.code || null }; }
  a = Object.assign({ reqId: m.reqId, answer: true }, a);
  answered.set(m.reqId, a);
  if (answered.size > 200) answered.delete(answered.keys().next().value);
  channel.postMessage(a);
};
