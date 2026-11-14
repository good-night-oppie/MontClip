'use strict';
// Review Inbox on #120: a plan of up to 30 steps was drawn outside .cindy-thread. style.css had dropped the
// list's own height cap, and .cindy-port is overflow:hidden, so the list pushed 〔开始〕 and the input out of
// the panel. The fix puts the plan and the approval card in the thread (the thread scrolls) and leaves the
// input outside it. This smoke loads the real style.css with that shape — no project, no media, no model.
// At 630×460 and 1280×820, with 30 steps. The panel is pinned to the window: offscreen Electron
// resolves position:fixed against the screen, which is not the window, so that rule is not the check.
//  - the input is hittable before any scroll
//  - the thread actually overflows
//  - scrolling the thread makes 〔开始〕 and 〔只批准这次〕 hittable, and the input stays hittable
//   electron desktop/plan-long-layout-smoke.cjs --montclip-smoke --user-data-dir=<fresh>  → PLAN_LONG_LAYOUT_PASS
const electron = require('electron');
const {app, BrowserWindow} = electron;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg = process.argv.find((a) => a.startsWith('--user-data-dir='));
if (!profileArg || !profileArg.slice('--user-data-dir='.length).trim()) throw Error('A fresh --user-data-dir is required');

const root = path.join(__dirname, '..');
const cssUrl = 'file:///' + path.join(root, 'app/style.css').replace(/\\/g, '/');
const steps = Array.from({length: 30}, (_, i) =>
  `<li data-step-state="todo"><span data-step-label>第 ${i + 1} 步 保留一段</span> <span class="cindy-plan-state">待做</span></li>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${cssUrl}"></head>
<body style="margin:0">
<section class="panel mc-assistant">
<div id="mcAgentContent">
<div class="cindy-port">
<div class="cindy-thread">
<div role="log" aria-live="polite"><section class="cindy-message assistant"><strong>助手</strong>这是一条计划</section></div>
<section class="cindy-plan" data-plan aria-label="计划"><ol>${steps}</ol><div class="agent-toolbar"><button data-plan-start>开始</button><button data-plan-discard>放弃</button></div></section>
<div class="host-card" data-host-card="approval" tabindex="-1"><button data-host-choice="once">只批准这次</button><button data-host-choice="deny">不同意</button></div>
</div>
<div class="cindy-composer"><textarea data-cindy-draft rows="3"></textarea></div>
</div></div></section></body></html>`;
const htmlPath = path.join(os.tmpdir(), 'montclip-plan-long-layout.html');
fs.writeFileSync(htmlPath, html);

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const measure = `(() => {
  const h = innerHeight, w = innerWidth;
  const pin = (el, pairs) => { for (const [k, v] of pairs) el.style.setProperty(k, v, 'important'); };
  const panel = document.querySelector('.mc-assistant');
  pin(panel, [['position','relative'],['top','0'],['left','0'],['height',h+'px'],['width',w+'px'],['max-height','none'],['overflow','hidden'],['display','flex'],['flex-direction','column'],['min-height','0']]);
  pin(document.getElementById('mcAgentContent'), [['flex','1 1 auto'],['min-height','0'],['overflow','hidden'],['display','flex'],['flex-direction','column'],['height','auto']]);
  const hit = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return {missing: true};
    const r = e.getBoundingClientRect();
    const x = Math.round(r.left + Math.min(Math.max(r.width / 2, 4), 24));
    const y = Math.round(r.top + Math.min(Math.max(r.height / 2, 4), 12));
    const inside = y >= 0 && y < innerHeight && x >= 0 && x < innerWidth;
    const n = inside ? document.elementFromPoint(x, y) : null;
    return {hit: !!(n && (n === e || e.contains(n))), top: Math.round(r.top), bottom: Math.round(r.bottom), inThread: !!e.closest('.cindy-thread')};
  };
  const scrollInto = (sel) => {
    const e = document.querySelector(sel), t = document.querySelector('.cindy-thread');
    t.scrollTop += e.getBoundingClientRect().top - t.getBoundingClientRect().top + 2;
  };
  const thread = document.querySelector('.cindy-thread');
  const before = {composer: hit('[data-cindy-draft]'), start: hit('[data-plan-start]'), once: hit('[data-host-choice="once"]'), threadH: thread.clientHeight, scrollH: thread.scrollHeight};
  scrollInto('[data-plan-start]');
  const startAfter = hit('[data-plan-start]'), composerAfterStart = hit('[data-cindy-draft]');
  scrollInto('[data-host-choice="deny"]');
  const denyAfter = hit('[data-host-choice="deny"]'), composerAfterCard = hit('[data-cindy-draft]');
  return {size: [innerWidth, innerHeight], before, startAfter, composerAfterStart, denyAfter, composerAfterCard, pageOverflow: document.documentElement.scrollHeight - innerHeight};
})()`;

app.whenReady().then(async () => {
  const report = {};
  let ok = false;
  const win = new BrowserWindow({
    show: false, frame: false, width: 630, height: 460,
    webPreferences: {offscreen: true, backgroundThrottling: false},
  });
  try {
    await win.loadFile(htmlPath);
    await wait(300);
    for (const [w, h, name] of [[630, 460, 'narrow'], [1280, 820, 'wide']]) {
      win.setContentSize(w, h);
      await wait(200);
      const seen = await win.webContents.executeJavaScript(measure);
      report[name] = seen;
      process.stdout.write('PLAN_LONG_LAYOUT ' + JSON.stringify({name, ...seen}) + '\n');
      assert.ok(seen.before.threadH > 40 && seen.before.scrollH > seen.before.threadH + 40, name + ': 30 steps overflow the thread');
      assert.equal(seen.before.composer.hit, true, name + ': the input is hittable before scrolling ' + JSON.stringify(seen.before.composer));
      assert.equal(seen.before.start.inThread, true, name + ': 〔开始〕 is in the thread');
      assert.equal(seen.before.once.inThread, true, name + ': the approval button is in the thread');
      assert.equal(seen.startAfter.hit, true, name + ': scrolling the thread reaches 〔开始〕 ' + JSON.stringify(seen.startAfter));
      assert.equal(seen.composerAfterStart.hit, true, name + ': scrolling to 〔开始〕 leaves the input hittable');
      assert.equal(seen.denyAfter.hit, true, name + ': scrolling the thread reaches 〔不同意〕 ' + JSON.stringify(seen.denyAfter));
      assert.equal(seen.composerAfterCard.hit, true, name + ': scrolling to the card leaves the input hittable');
      assert.ok(seen.pageOverflow <= 1, name + ': the page itself does not scroll');
    }
    ok = true;
  } catch (e) {
    report.error = String(e && e.stack || e).slice(0, 1500);
  } finally {
    process.stdout.write((ok ? 'PLAN_LONG_LAYOUT_PASS' : 'PLAN_LONG_LAYOUT_FAIL') + ' ' + JSON.stringify(report) + '\n');
    process.exitCode = ok ? 0 : 1;
    app.exit(ok ? 0 : 1);
  }
  await new Promise(() => {});
});
