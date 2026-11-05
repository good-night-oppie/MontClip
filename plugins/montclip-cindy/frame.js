/* What a page says when MontClip could not open (JJ v2, 2026-11-04, section 1, rule 2): what happened and what to do,
   in plain words; never the raw error. When there is one, 〔复制问题信息〕 copies it for us (scrubbed: problem-details.js)
   and the whole of it goes to the log. → {text, problem} */
const COPY = {   // JJ v2, finalised (the same words as the editor's, ui-preferences.js)
  button: '复制问题信息', note: '复制的内容不含你的文件夹路径、密钥和观众信息。',
  done: '已经复制好了，粘贴到发给我们的消息里就行。', failed: '这次没能复制，再点一次按钮试试。',
};
function failureText(head, error, code) {
  const raw = error == null ? '' : String(error).trim();
  if (!raw) return { text: head + '关掉这个页签再打开试试。', problem: null };
  const problem = { code: code || 'UNKNOWN', error: raw };
  console.warn(window.MontClipProblem ? MontClipProblem.logLine(problem) : '[MontClip] ' + raw);   // the whole of it: the log
  // draft, waiting for JJ: #112's sentence, with the copy button in place of the raw line
  return { text: head + '关掉这个页签再打开试试；还不行，点「复制问题信息」发给我们。', problem };
}
/** Put the copy button (and its small print) into `box`: a click copies the scrubbed line, never shown on the page. */
function copyButton(box, problem) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'copy'; b.textContent = COPY.button;
  const note = document.createElement('small');
  note.className = 'note'; note.textContent = COPY.note;
  b.addEventListener('click', async () => {
    const line = MontClipProblem.copyLine(problem);
    let ok = false;
    try { await navigator.clipboard.writeText(line); ok = true; } catch (e) {
      // an older webview: copy through a hidden field, still from this click
      const t = document.createElement('textarea');
      t.value = line; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      t.remove();
    }
    note.textContent = ok ? COPY.done : COPY.failed;
  });
  box.append(b, note);
  return b;
}
/* The task view: wake the logic page, bind this task's project, ask where the MontClip editor is, and frame it.
   The frame talks to the engine itself (same 127.0.0.1 host:port — Cindy allows that for a plugin that declares
   node and preview.hosts 127.0.0.1); this page only places it. The editor URL carries the engine's session token
   once; the engine trades it for a cookie and drops it from the address. */
(function () {
  const status = document.getElementById('status');
  const view = document.body.dataset.view || 'task';              // task (the editor) · panel (文稿 / 属性)
  const enginePath = document.body.dataset.enginePath || '/';     // the engine page this view frames
  const at = (u) => { const x = new URL(u); x.pathname = enginePath; return x.href; };
  const session = new URLSearchParams(location.search).get('session') || '';   // the task this page belongs to
  const channel = new BroadcastChannel('montclip');
  const show = (text, error, retry, problem) => {
    status.textContent = text; status.className = error ? 'error' : ''; status.hidden = false;
    if (problem) copyButton(status, problem);   // never the raw error itself
    if (retry) {   // e.g. the Windows app has these projects open: once it is closed, try again here
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '重试';
      b.addEventListener('click', () => location.reload());
      status.appendChild(b);
    }
  };
  const inUse = (m) => m && m.code === 'DATA_DIR_IN_USE';

  function ask(type, extra) {
    const reqId = type + '-' + Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      let timer = null;
      const onMsg = (e) => {
        const m = e.data || {};
        if (m.reqId !== reqId || !m.answer) return;
        channel.removeEventListener('message', onMsg);
        clearInterval(timer);
        resolve(m);
      };
      channel.addEventListener('message', onMsg);
      const send = () => channel.postMessage(Object.assign({ reqId, type }, extra || {}));
      send();
      timer = setInterval(send, 700);   // the logic page may still be waking: repeat until it answers
    });
  }

  /* Cindy's light / dark theme: the host declares color-scheme on this page (and keeps it in step with its theme).
     The editor gets it in its URL, then a message whenever it changes (host-embed.js listens). */
  function scheme() {
    const cs = String(getComputedStyle(document.documentElement).colorScheme || '').trim().split(/\s+/)[0];
    if (cs === 'light' || cs === 'dark') return cs;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  let sent = null;
  function sendTheme() {
    const now = scheme();
    if (!frame || !url || now === sent) return;
    sent = now;
    try { frame.contentWindow.postMessage({ type: 'montclip-host-theme', scheme: now }, new URL(url).origin); } catch (e) { }
  }
  setInterval(sendTheme, 1500);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sendTheme);

  let url = null, frame = null;
  function place(next) {
    url = next;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'engine';
      frame.title = 'MontClip';
      frame.allow = 'autoplay; fullscreen; clipboard-write';
      frame.addEventListener('load', () => { status.hidden = true; sent = null; sendTheme(); });
      document.body.appendChild(frame);
    }
    frame.src = url + (url.includes('?') ? '&' : '?') + 'theme=' + scheme();
  }
  /* A task view shows its own task's project: bind it when the page opens and whenever the task comes back to the
     front (another task's view may have opened a different project meanwhile). The worker runs binds one at a time. */
  async function bind() {
    if (view !== 'task' || !session) return true;
    const b = await ask('bind', { session });
    if (b.error) {
      if (inUse(b)) show(b.error, true, true);
      else { const f = failureText('MontClip 没能打开这个任务的项目。', b.error, b.code); show(f.text, true, false, f.problem); }
      return false;
    }
    return true;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && url) bind(); });

  /* First use: export and noise reduction need ffmpeg. The banner asks once (以后再说 is remembered); the download
     starts only from its button — the user's own click — or when the user asks the chat (montclip_install_ffmpeg). */
  const banner = document.getElementById('ffmpeg');
  const LATER = 'montclip.ffmpeg.later';
  function bannerText(text, error, note, problem) {
    document.getElementById('ffmpegText').textContent = text;
    const d = document.getElementById('ffmpegDetail');
    d.textContent = note || ''; d.hidden = !note;          // the first banner's small print (never a raw error)
    const box = document.getElementById('ffmpegCopy');
    box.textContent = ''; box.hidden = !problem;
    if (problem) copyButton(box, problem);
    if (banner) banner.classList.toggle('error', !!error);
  }
  function progress(m) {
    if (!banner) return;
    const B = window.MontClipFfmpegBanner, W = B.TEXT.zh;
    const bar = document.getElementById('ffmpegBar'), get = document.getElementById('ffmpegGet'), later = document.getElementById('ffmpegLater');
    banner.hidden = false;
    const busy = !['installed', 'failed', 'cancelled'].includes(m.phase);
    get.hidden = busy || m.phase === 'installed'; later.hidden = busy;
    bar.hidden = !busy;
    bar.firstElementChild.style.width = (m.total ? Math.floor((m.loaded / m.total) * 100) : 0) + '%';
    if (busy) bannerText(B.progressText(m));
    else if (m.phase === 'installed') {
      bannerText(B.progressText(m));
      later.hidden = true;
      setTimeout(() => { banner.hidden = true; }, 4000);
      // the engine restarts to use it: follow it to its new address soon, not at the next minute
      setTimeout(async () => { const b = await ask('editor'); if (b.url && at(b.url) !== url) place(at(b.url)); }, 1500);
    } else {
      // why, in plain words; the raw error small below where the sentence points to it; 重试 where trying again can help
      const f = B.describe(m.code || (m.phase === 'cancelled' ? 'CANCELLED' : ''), m.message, { need: m.need });
      if (m.message) console.warn(MontClipProblem.logLine({ code: m.code || 'INSTALL_FAILED', error: m.message }));   // the log
      bannerText(f.text, f.reason !== 'cancelled', '', f.copy ? { code: m.code || 'INSTALL_FAILED', error: m.message } : null);
      get.hidden = !f.button; get.textContent = f.button === 'install' ? W.install : W.retry;
      later.hidden = f.reason === 'cancelled';   // 下载取消了: only 下载并安装
    }
  }
  if (banner) {
    channel.addEventListener('message', (e) => { const m = e.data || {}; if (m.type === 'ffmpeg-progress') progress(m); });
    document.getElementById('ffmpegGet').addEventListener('click', async () => {
      progress({ phase: 'queued' });
      const r = await ask('ffmpeg-install');
      if (r.error) progress({ phase: 'failed', code: r.code, need: r.need, message: r.error });
      else if (r.already || r.install) progress({ phase: 'installed' });
    });
    document.getElementById('ffmpegLater').addEventListener('click', () => {
      banner.hidden = true;
      try { localStorage.setItem(LATER, '1'); } catch (e) { }
    });
  }
  async function offerFfmpeg() {
    if (!banner) return;
    let later = false;
    try { later = localStorage.getItem(LATER) === '1'; } catch (e) { }
    const s = await ask('ffmpeg-state');
    if (!s.supported || s.state === 'downloaded' || later) return;
    // the files were changed since they were installed: say so, and offer 重新安装
    if (s.state === 'changed') { bannerText(window.MontClipFfmpegBanner.TEXT.zh.changed, false, window.MontClipFfmpegBanner.TEXT.zh.firstNote); document.getElementById('ffmpegGet').textContent = window.MontClipFfmpegBanner.TEXT.zh.reinstall; }
    banner.hidden = false;
  }

  /* 复制问题信息 from an export card (Deja, 2026-11-04): the card cannot copy, so this page shows the card's plain
     sentence with the button, and puts the focus on it. The raw error is never shown, only copied (scrubbed). */
  const problemBox = document.getElementById('problem');
  function showProblem(p) {
    if (!problemBox || !p || p.session !== session || !p.problem) return;
    document.getElementById('problemText').textContent = p.text;
    const box = document.getElementById('problemCopy');
    box.textContent = '';
    const b = copyButton(box, p.problem);
    console.warn(MontClipProblem.logLine(p.problem));
    problemBox.hidden = false;
    b.focus();
  }
  if (problemBox) {
    channel.addEventListener('message', (e) => { const m = e.data || {}; if (m.type === 'show-problem') showProblem(m); });
    document.getElementById('problemClose').addEventListener('click', () => { problemBox.hidden = true; });
    ask('problem', { session }).then((r) => { if (r && r.shown) showProblem(r.shown); });
  }

  async function boot() {
    try { await fetch('/wake'); } catch (e) { /* a page of a stopped plugin: the asks below simply wait */ }
    if (!(await bind())) return;
    const a = await ask('editor');
    if (a.error || !a.url) {
      if (inUse(a)) show(a.error, true, true);
      else { const f = failureText('MontClip 没能启动。', a.error, a.code); show(f.text, true, false, f.problem); }
      return;
    }
    place(at(a.url));
    offerFfmpeg();
    /* While the page is open the engine must stay up: asking keeps the worker from going idle, and when it was
       restarted (another port or a new token) the frame follows it — the editor keeps its undo history on the
       engine, so the reload loses nothing. */
    setInterval(async () => {
      try { await fetch('/wake'); } catch (e) { }
      const b = await ask('editor');
      if (b.url && at(b.url) !== url) place(at(b.url));
    }, 60000);
  }
  boot();
})();
