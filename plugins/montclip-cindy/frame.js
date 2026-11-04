/* The task view: wake the logic page, bind this task's project, ask where the MontClip editor is, and frame it.
   The frame talks to the engine itself (same 127.0.0.1 host:port — Cindy allows that for a plugin that declares
   node and preview.hosts 127.0.0.1); this page only places it. The editor URL carries the engine's session token
   once; the engine trades it for a cookie and drops it from the address. */
(function () {
  const status = document.getElementById('status');
  const view = document.body.dataset.view || 'task';
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

  async function boot() {
    try { await fetch('/wake'); } catch (e) { /* a page of a stopped plugin: the asks below simply wait */ }
    if (!(await bind())) return;
    const a = await ask('editor');
    if (a.error || !a.url) { show(inUse(a) ? a.error : 'MontClip 没能启动：' + (a.error || '没有地址'), true, inUse(a)); return; }
    place(a.url);
    /* While the page is open the engine must stay up: asking keeps the worker from going idle, and when it was
       restarted (another port or a new token) the frame follows it — the editor keeps its undo history on the
       engine, so the reload loses nothing. */
    setInterval(async () => {
      try { await fetch('/wake'); } catch (e) { }
      const b = await ask('editor');
      if (b.url && b.url !== url) place(b.url);
    }, 60000);
  }
  boot();
})();
