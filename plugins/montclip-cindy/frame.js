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
  const show = (text, error, retry) => {
    status.textContent = text; status.className = error ? 'error' : ''; status.hidden = false;
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
    if (b.error) { show(inUse(b) ? b.error : 'MontClip 没能打开这个任务的项目：' + b.error, true, inUse(b)); return false; }
    return true;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && url) bind(); });

  /* First use: export and noise reduction need ffmpeg. The banner asks once (以后再说 is remembered); the download
     starts only from its button — the user's own click — or when the user asks the chat (montclip_install_ffmpeg). */
  const banner = document.getElementById('ffmpeg');
  const LATER = 'montclip.ffmpeg.later';
  function bannerText(text, error) {
    document.getElementById('ffmpegText').textContent = text;
    if (banner) banner.classList.toggle('error', !!error);
  }
  function progress(m) {
    if (!banner) return;
    const bar = document.getElementById('ffmpegBar'), get = document.getElementById('ffmpegGet'), later = document.getElementById('ffmpegLater');
    banner.hidden = false;
    const busy = !['installed', 'failed', 'cancelled'].includes(m.phase);
    get.hidden = busy || m.phase === 'installed'; later.hidden = busy;
    bar.hidden = !busy;
    const pct = m.total ? Math.floor((m.loaded / m.total) * 100) : null;
    bar.firstElementChild.style.width = (pct === null ? 0 : pct) + '%';
    const mb = (n) => (n / 1048576).toFixed(0);
    if (m.phase === 'queued') bannerText('正在准备下载 ffmpeg…');
    else if (m.phase === 'downloading') bannerText(pct === null ? '正在下载 ffmpeg…' : `正在下载 ffmpeg：${pct}%（${mb(m.loaded)} / ${mb(m.total)} MB${m.speedBps ? '，' + (m.speedBps / 1048576).toFixed(1) + ' MB/s' : ''}）`);
    else if (m.phase === 'retrying') bannerText('网络断了一下，正在重试下载 ffmpeg…');
    else if (m.phase === 'verifying') bannerText('下载完了，正在核对校验值…');
    else if (m.phase === 'installing') bannerText('正在安装 ffmpeg，并确认是 LGPL 版本…');
    else if (m.phase === 'installed') {
      bannerText('ffmpeg 已装好，现在可以导出了。');
      later.hidden = true;
      setTimeout(() => { banner.hidden = true; }, 4000);
      // the engine restarts to use it: follow it to its new address soon, not at the next minute
      setTimeout(async () => { const b = await ask('editor'); if (b.url && at(b.url) !== url) place(at(b.url)); }, 1500);
    } else if (m.phase === 'failed' || m.phase === 'cancelled') { bannerText('ffmpeg 没装上：' + (m.message || m.phase) + '。可以再试一次。', true); get.textContent = '重试'; }
  }
  if (banner) {
    channel.addEventListener('message', (e) => { const m = e.data || {}; if (m.type === 'ffmpeg-progress') progress(m); });
    document.getElementById('ffmpegGet').addEventListener('click', async () => {
      progress({ phase: 'queued' });
      const r = await ask('ffmpeg-install');
      if (r.error) progress({ phase: 'failed', message: r.error });
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
    if (s.supported && s.state !== 'downloaded' && !later) banner.hidden = false;
  }

  async function boot() {
    try { await fetch('/wake'); } catch (e) { /* a page of a stopped plugin: the asks below simply wait */ }
    if (!(await bind())) return;
    const a = await ask('editor');
    if (a.error || !a.url) { show(inUse(a) ? a.error : 'MontClip 没能启动：' + (a.error || '没有地址'), true, inUse(a)); return; }
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
