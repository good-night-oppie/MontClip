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
/* Another MontClip has the same projects open (writer-lock.js): the engine refuses to start. Said in plain words, to the
   page and to the chat, by who it is — JJ's final words (2026-11-04); no pid, no port. The plugin's pages are Chinese
   for now; the English is kept with it (messageEn) for when they follow Cindy's language. */
const DATA_DIR_IN_USE_TEXT = {
  desktop: {
    zh: 'MontClip 桌面版正在用这些项目。两边同时改，会互相盖掉。先把桌面版关掉，再打开这里。找不到桌面版的窗口，就重启电脑再试。',
    en: "The MontClip desktop app is using these projects. If both edit at once, one overwrites the other. Close the MontClip desktop app first, then open this one. If you can't find it, restart the computer and try again.",
  },
  // anything else (a server started by hand, or a holder that cannot be told): the desktop app's own words for it
  other: {
    zh: '另一个 MontClip 窗口正在用这些项目。两边同时改，会互相盖掉。先把那边的 MontClip 关掉，再打开这里。找不到那边的窗口，就重启电脑再试。',
    en: "Another MontClip window is using these projects. If both edit at once, one overwrites the other. Close the other MontClip first, then open this one. If you can't find it, restart the computer and try again.",
  },
};
function engineError(r) {
  const message = String(r.message || 'MontClip engine failed');
  if (/DATA_DIR_IN_USE|Another MontClip \(/.test(message)) {
    const who = /Another MontClip \(([\w-]+),/.exec(message);
    const t = DATA_DIR_IN_USE_TEXT[who && who[1] === 'desktop' ? 'desktop' : 'other'];
    return Object.assign(new Error(t.zh), { code: 'DATA_DIR_IN_USE', messageEn: t.en });
  }
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

/* The export card in the chat (card capability: HTML + CSS only, no script; progress is a width). */
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
/* The export card's words (JJ's final words, 2026-11-04). The plugin's pages are Chinese for now; the English is kept
   beside them for when they follow Cindy's language. */
const EXPORT_TEXT = {
  zh: {
    pick: '等你选文件夹…', start: '正在开始导出…', running: (p) => '正在导出 ' + p + '%', copy: (f) => '正在存到「' + f + '」…',
    done: '导出完成', still: '还在导出', failed: '导出没有完成', cancelled: '没有导出',
    savedTo: (f) => '已存到「' + f + '」', savedDefault: '存在 MontClip 自己的导出文件夹里',
    stillNote: '这次等不到它导完。导完以后，文件会在 MontClip 自己的导出文件夹里。',
    noFolder: '没有选文件夹，所以没有导出。',
    copyFailed: (why) => '视频已经导出好了，但没能存进你选的文件夹（' + why + '）。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。',
    renamed: '同名文件已经有了，这次存成这个名字',
  },
  en: {
    pick: 'Waiting for you to choose a folder…', start: 'Starting the export…', running: (p) => 'Exporting ' + p + '%', copy: (f) => 'Saving to “' + f + '”…',
    done: 'Export finished', still: 'Still exporting', failed: "The export didn't finish", cancelled: 'Not exported',
    savedTo: (f) => 'Saved to “' + f + '”', savedDefault: "Saved in MontClip's own export folder",
    stillNote: "This time it can't wait for the export to finish. When it's done, the file will be in MontClip's own export folder.",
    noFolder: 'No folder was chosen, so nothing was exported.',
    copyFailed: (why) => "The video is exported, but it couldn't be saved to the folder you chose (" + why + "). The file is still in MontClip's own export folder; you can export again to another folder.",
    renamed: 'A file with this name was already there, so this one was saved under this name',
  },
};
/** A file size: bytes under 1 KB (字节), then KB, MB, GB — as the main view says it. */
function sizeText(b, lang) {
  b = Math.max(0, Math.round(+b || 0));
  if (b < 1024) return b + (lang === 'en' ? ' bytes' : ' 字节');
  if (Math.round(b / 1024) < 1024) return Math.round(b / 1024) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(1) + ' GB';
}
function exportCard(c, lang) {
  const t = EXPORT_TEXT[lang === 'en' ? 'en' : 'zh'];
  const pct = Math.max(0, Math.min(100, Math.round((c.progress || 0) * 100)));
  const small = 'margin:8px 0 0;font-size:12px;color:var(--text-secondary,#6b6b66)';
  // copyFailed has no head of its own: its sentence says it all (the export did finish)
  const head = { pick: t.pick, start: t.start, running: t.running(pct), copy: t.copy(esc(c.folder)),
    done: t.done, still: t.still, failed: t.failed, cancelled: t.cancelled }[c.phase] || '';
  const bar = ['start', 'running', 'copy'].includes(c.phase)
    ? '<div style="height:4px;margin-top:10px;background:var(--border-default,#e4e4e0);border-radius:2px;overflow:hidden"><div style="height:100%;width:' + (c.phase === 'copy' ? 100 : pct) + '%;background:var(--accent,#4b3fd6)"></div></div>' : '';
  const files = (c.files || []).map((f) => '<li style="overflow-wrap:anywhere">' + esc(f.name) + (f.bytes ? ' · ' + sizeText(f.bytes, lang) : '') +
    (f.renamed ? '<div style="' + small + ';margin-top:2px">' + t.renamed + '</div>' : '') + '</li>').join('');
  const where = c.phase === 'done' ? '<p style="margin:8px 0 0">' + (c.folder ? t.savedTo(esc(c.folder)) : t.savedDefault) + '</p>' : '';
  const body = c.phase === 'still' ? '<p style="' + small + '">' + t.stillNote + '</p>'
    : c.phase === 'cancelled' ? '<p style="' + small + '">' + t.noFolder + '</p>'
    : c.phase === 'copyFailed' ? '<p style="margin:0">' + t.copyFailed(esc(c.reason)) + '</p>' : '';
  const note = c.note ? '<p style="margin:8px 0 0;color:' + (c.phase === 'failed' ? 'var(--text-danger,#b42318)' : 'var(--text-secondary,#6b6b66)') + '">' + esc(c.note) + '</p>' : '';
  return '<div style="padding:12px 14px;color:var(--text-primary,#1a1a1a);font:13px/1.45 system-ui,sans-serif">' +
    (head ? '<div style="font-weight:600">' + head + '</div>' : '') + bar + where + body +
    (files ? '<ul style="margin:8px 0 0;padding-left:18px">' + files + '</ul>' : '') + note + '</div>';
}
function sendCard(callId, c) {
  const done = ['done', 'failed', 'cancelled', 'still', 'copyFailed'].includes(c.phase);
  return cindy.send({ type: 'card-update', callId, v: 2, state: done ? 'done' : 'working', html: exportCard(c), height: done ? 150 : 110 });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  /* Export, and save the file into a folder the user picks in the system dialog (folder:"default" keeps it in the
     MontClip data folder's exports/). Progress shows on this call's card. */
  async montclip_export(args, msg) {
    const callId = msg.callId;
    let folder = null, dir = null;
    if (args.folder !== 'default') {
      if (typeof cindy.pick !== 'function') return { error: 'This Cindy cannot show a folder dialog for plugins; update Cindy, or pass folder:"default".', code: 'HOST_TOO_OLD' };
      sendCard(callId, { phase: 'pick' });
      const picked = await cindy.pick({ mode: 'directory', title: '选择 MontClip 导出到哪个文件夹', callId });
      if (!picked || !picked.ok || !picked.path) {
        await sleep(1000);
        sendCard(callId, { phase: 'cancelled' });
        return { cancelled: true, code: (picked && picked.errorCode) || 'CANCELLED' };
      }
      folder = picked.name || 'folder'; dir = picked.path;
    }
    await sleep(1000);
    sendCard(callId, { phase: 'start', folder });
    let job;
    try { job = await node('montclip/export-start', { range: args.range, preset: args.preset, profile: args.profile, outputs: args.outputs }); }
    catch (e) { await sleep(1000); sendCard(callId, { phase: 'failed', note: e.message }); return { error: e.message, code: e.code }; }
    const t0 = Date.now();
    while ((job.status === 'pending' || job.status === 'running') && Date.now() - t0 < 14 * 60000) {
      await sleep(1500);
      job = await node('montclip/export-job', { id: job.id });
      sendCard(callId, { phase: 'running', progress: job.progress, folder });
    }
    if (job.status !== 'done') {
      await sleep(1000);
      // still going when this call can wait no longer: the card says so in plain words; how to follow it is for the agent
      if (job.status === 'pending' || job.status === 'running') {
        sendCard(callId, { phase: 'still' });
        return { job: job.id, status: job.status, hint: 'The export is still running. Check it with call_tool fablecut_export {job:"' + job.id + '"}; when it is done the file is in the MontClip data folder\'s exports/.' };
      }
      sendCard(callId, job.status === 'cancelled' ? { phase: 'cancelled' } : { phase: 'failed', note: job.error || job.status });
      return { job: job.id, status: job.status, error: job.error || null };
    }
    const outs = job.result && Array.isArray(job.result.outputs) ? job.result.outputs : [];
    const report = outs.map((o) => o.report && o.report.line).filter(Boolean);
    let files = [];
    if (dir) {
      sendCard(callId, { phase: 'copy', folder });
      try { files = (await node('montclip/export-deliver', { id: job.id, dir }, { timeoutMs: 60000, maxTotalMs: 900000 })).files; }
      catch (e) { await sleep(1000); sendCard(callId, { phase: 'copyFailed', reason: e.message }); return { job: job.id, status: 'done', copied: false, error: e.message }; }
    } else files = outs.filter((o) => o.ok).map((o) => ({ name: o.file })).concat(outs.length ? [] : [{ name: String(job.src || '').split('/').pop() }]);
    await sleep(1000);
    sendCard(callId, { phase: 'done', folder, files, note: report.join(' · ') });
    return { job: job.id, status: 'done', files: files.map((f) => f.file || f.name), report };
  },
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
  } catch (err) { a = { error: String(err.message || err), code: err.code || null, ...(err.messageEn ? { errorEn: err.messageEn } : {}) }; }
  a = Object.assign({ reqId: m.reqId, answer: true }, a);
  answered.set(m.reqId, a);
  if (answered.size > 200) answered.delete(answered.keys().next().value);
  channel.postMessage(a);
};
