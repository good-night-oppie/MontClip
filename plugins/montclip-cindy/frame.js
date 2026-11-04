/* Main view and panel: wake the logic page, ask it where the MontClip engine's local page is, and
   frame it. The frame talks to the engine itself (same 127.0.0.1 host:port — Cindy allows that for
   a plugin with node + preview.hosts localhost); this page only places it. */
(function () {
  const status = document.getElementById('status');
  const path = document.body.dataset.enginePath || '/';
  const channel = new BroadcastChannel('montclip');
  const show = (text, error) => { status.textContent = text; status.className = error ? 'error' : ''; status.hidden = false; };

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

  let origin = null, frame = null;
  function place(o) {
    origin = o;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'engine';
      frame.title = 'MontClip';
      frame.addEventListener('load', () => { status.hidden = true; });
      document.body.appendChild(frame);
    }
    frame.src = origin + path + (path.includes('?') ? '&' : '?') + 'host=cindy';
  }
  async function boot() {
    try { await fetch('/wake'); } catch (e) { /* a page of a stopped plugin: the asks below simply wait */ }
    const a = await ask('origin');
    if (a.error || !a.origin) { show('MontClip 没能启动：' + (a.error || '没有地址'), true); return; }
    place(a.origin);
    /* While a page is open the engine must stay up: asking again keeps the worker from going idle,
       and when it was restarted (another port) the frame follows it. */
    setInterval(async () => {
      try { await fetch('/wake'); } catch (e) { }
      const b = await ask('origin');
      if (b.origin && b.origin !== origin) place(b.origin);
    }, 60000);
  }

  // spike: the logic page asks the main view to measure playback of a file in this sandbox
  if (document.body.dataset.probe) {
    channel.addEventListener('message', (e) => {
      const m = e.data || {};
      if (m.type !== 'run-probe' || !m.origin) return;
      const old = document.querySelector('iframe.probe');
      if (old) old.remove();
      const p = document.createElement('iframe');
      p.className = 'probe';
      p.src = m.origin + '/cindy/probe.html?src=' + encodeURIComponent(m.src || '') + '&where=' + encodeURIComponent(location.href.split('?')[0]);
      document.body.appendChild(p);
    });
  }
  boot();
})();
