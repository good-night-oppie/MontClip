'use strict';
// index.html: every editor overlay sits at the top of the page, and every <div> is closed. Since #90 the settings box's
// .dialog-body was left open, so the shortcuts overlay ended up inside the hidden settings overlay and never showed
// (desktop/dialogs-smoke.cjs: 「help: off centre」), and 设置's 〔关闭〕 scrolled with the body at 630×460.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');

test('the overlays are not nested in one another, and every div is closed', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const re = /<(\/?)div\b[^>]*>/g, overlays = [];
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[1]) { depth--; a.ok(depth >= 0, 'a </div> closes nothing, near ' + html.slice(Math.max(0, m.index - 80), m.index)); continue; }
    if (/class="overlay\b/.test(m[0])) overlays.push([m[0].match(/id="([^"]+)"/)?.[1], depth]);
    depth++;
  }
  a.equal(depth, 0, 'every <div> is closed');
  a.ok(overlays.length >= 7);
  for (const [id, d] of overlays) a.equal(d, 0, id + ' is at the top of the page');
  // 设置's 〔关闭〕 stays outside the part that scrolls
  const settings = html.slice(html.indexOf('id="settingsOverlay"'), html.indexOf('id="helpOverlay"'));
  const body = settings.indexOf('class="dialog-body"'), actions = settings.indexOf('class="dialog-actions"');
  a.ok(body > 0 && actions > body);
  let open = 0;
  for (const t of settings.slice(body, actions).matchAll(/<(\/?)div\b/g)) open += t[1] ? -1 : 1;
  a.equal(open, 0, 'the settings body is closed before its actions');
});
