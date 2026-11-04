/* The main view: an overview across tasks, not an editor (the editor lives in a task, beside its chat). It asks the
   logic page over BroadcastChannel; "在任务中打开" asks it to open that task's editor tab and go to the task —
   Cindy allows that only right after a real click in this page. */
(function () {
  "use strict";
  const V = window.MontClipOverview;
  const $ = (id) => document.getElementById(id);
  const channel = new BroadcastChannel('montclip');
  function ask(type, extra) {
    const reqId = type + '-' + Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      let timer = null;
      const onMsg = (e) => { const m = e.data || {}; if (m.reqId !== reqId || !m.answer) return; channel.removeEventListener('message', onMsg); clearInterval(timer); resolve(m); };
      channel.addEventListener('message', onMsg);
      const send = () => channel.postMessage(Object.assign({ reqId, type }, extra || {}));
      send(); timer = setInterval(send, 700);
    });
  }
  const PIN = 'montclip.pin.done';
  try { if (localStorage.getItem(PIN) === '1') $('pin').hidden = true; } catch (e) { }
  $('pinDone').addEventListener('click', () => { $('pin').hidden = true; try { localStorage.setItem(PIN, '1'); } catch (e) { } });

  function li(name, meta, button) {
    const el = document.createElement('li');
    const n = document.createElement('span'); n.className = 'name'; n.textContent = name;
    const m = document.createElement('span'); m.className = 'meta'; m.textContent = meta;
    el.append(n, m);
    if (button) el.appendChild(button);
    return el;
  }
  // a failure: the sentence, then the raw error on a small line of its own (none without an error)
  function fail(f) {
    $('status').textContent = f.text; $('status').className = 'status error';
    $('statusDetail').textContent = f.detail; $('statusDetail').hidden = !f.detail;
  }
  async function load() {
    const o = await ask('overview');
    const status = $('status');
    if (o.error) { fail(V.FAILED.load(o.error)); return; }
    status.textContent = ''; status.className = 'status'; $('statusDetail').hidden = true;
    const projects = V.projectRows(o), exportsList = V.exportRows(o);
    $('projects').textContent = '';
    for (const p of projects) {
      let b = null;
      if (p.action === 'open-task') {
        b = document.createElement('button'); b.type = 'button'; b.textContent = '在任务中打开';
        b.addEventListener('click', async () => {
          const r = await ask('open-task', { session: p.task });
          if (!r.ok) fail(V.FAILED.openTask(r.message || r.errorCode || r.error));
        });
      }
      $('projects').appendChild(li(p.name, p.meta + (p.task ? '' : ' · 没有对应的任务'), b));
    }
    $('projectsEmpty').hidden = projects.length > 0;
    $('exports').textContent = '';
    for (const e of exportsList) $('exports').appendChild(li(e.name, e.meta));
    $('exportsEmpty').hidden = exportsList.length > 0;
    const where = V.exportsWhere(o.dataDir);
    $('exportsWhere').textContent = where.text;
    $('openExports').hidden = !where.path;
    $('openExports').title = where.path;      // the full path: in the hover text, not on the page
  }
  // 打开文件夹: the logic page asks the worker to open MontClip's exports folder (the only folder this page can name)
  $('openExports').addEventListener('click', async () => {
    const r = await ask('open-folder');
    if (r.error) fail(V.FAILED.openFolder(r.error));
  });
  (async () => { try { await fetch('/wake'); } catch (e) { } load(); })();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
})();
