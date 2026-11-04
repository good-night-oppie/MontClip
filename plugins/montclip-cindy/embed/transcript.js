/* The MontClip panel's 文稿 tab: the open project's captions, in time order. Clicking one moves the
   editor's playhead there (POST /api/ui/command → the open editor tab). Refreshes on every project
   change the engine announces, whoever made it (the editor, an agent in the chat). */
(function () {
  const list = document.getElementById('lines'), meta = document.getElementById('meta'), toast = document.getElementById('toast');
  const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  const say = (text) => { toast.textContent = text; toast.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { toast.hidden = true; }, 2500); };
  const report = (data) => fetch('/__cindy/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ kind: 'transcript' }, data)) }).catch(() => {});

  async function load(why) {
    const r = await fetch('/api/project', { cache: 'no-store' });
    const p = await r.json();
    const lines = (p.clips || []).filter((c) => c.kind === 'text' && c.props && (c.props.caption || c.props.text))
      .sort((a, b) => a.start - b.start);
    list.textContent = '';
    for (const c of lines) {
      const li = document.createElement('li');
      li.dataset.t = c.start;
      const time = document.createElement('time');
      time.textContent = fmt(c.start);
      const span = document.createElement('span');
      span.textContent = String(c.props.text || '').replace(/\n/g, ' ');
      li.append(time, span);
      list.appendChild(li);
    }
    meta.textContent = lines.length ? `${lines.length} 句 · 修订 ${p.revision}` : `还没有字幕 · 修订 ${p.revision}`;
    report({ event: 'rendered', why, revision: p.revision, lines: lines.length, ancestorOrigins: Array.from(location.ancestorOrigins || []) });
  }
  list.addEventListener('click', async (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    for (const x of list.querySelectorAll('li.on')) x.classList.remove('on');
    li.classList.add('on');
    const t = +li.dataset.t;
    const r = await fetch('/api/ui/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'seek', t }) });
    const a = await r.json().catch(() => ({}));
    if (r.status === 409) say('剪辑器没打开：从左侧导航打开 MontClip 后再点');
    report({ event: 'seek-click', t, status: r.status, editorTime: a.time, isTrusted: e.isTrusted });
  });
  /* Test-only hook (spike): the plugin's montclip_test_click tool asks this page to click line N, because
     the desktop driver cannot place a click inside this nested frame. The click runs the same handler;
     the report carries isTrusted:false so it is never mistaken for a person's click. */
  const test = new EventSource('/__cindy/test/events');
  test.onmessage = (e) => {
    let m = null;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    if (!m || typeof m.line !== 'number') return;
    const li = list.children[m.line];
    if (li) li.click(); else report({ event: 'test-click-missing', line: m.line, lines: list.children.length });
  };
  const es = new EventSource('/api/events');
  es.addEventListener('change', () => load('change').catch(() => {}));
  load('open').catch((e) => { meta.textContent = '读不到项目：' + e.message; });
})();
