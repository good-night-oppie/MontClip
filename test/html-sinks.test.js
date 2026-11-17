'use strict';
// #366 (QQ 6930219147 2): no outside text reaches the page as HTML. Every `${…}` of a template that builds HTML, and every
// innerHTML / outerHTML / insertAdjacentHTML / document.write, in every script the editor page loads and in desktop/, must pass
// the rule in test/html-check.js — escaped, a number, fixed text, markup the check itself covers — or be one of the reviewed
// places in test/html-allow.json (each with its reason). A new bare interpolation turns this test red.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { findings, sinkFindings } = require('./html-check');
const ROOT = path.join(__dirname, '..');
const ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'html-allow.json'), 'utf8'));

/** the page's scripts (index.html) and the desktop app's own scripts and pages (its *-smoke.cjs test harnesses, which only
 *  drive a window in a test run and are not shipped, are not the app) */
function files() {
  const page = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
  const desk = fs.readdirSync(path.join(ROOT, 'desktop')).filter((f) => /\.(js|html)$/.test(f) || (/\.cjs$/.test(f) && !/smoke/.test(f))).map((f) => 'desktop/' + f);
  return [...new Set([...page, ...desk])].filter((f) => fs.existsSync(path.join(ROOT, f)));
}

test('every script the page loads, and desktop/, builds HTML only from escaped text or markup the check covers', () => {
  const list = files(), bad = [], unused = [];
  assert.ok(list.length > 40, 'the page scripts were found: ' + list.length);
  for (const f of list) {
    if (ALLOW.exclude && ALLOW.exclude[f]) continue;
    const conf = (ALLOW.files && ALLOW.files[f]) || {};
    const opts = { numeric: conf.numeric || [], allow: conf.allow || [], unused: [] };
    for (const x of findings(path.join(ROOT, f), opts)) bad.push(`${f}:${x.line}  \${${x.text}}${x.arg ? '  (passed to ' + x.arg + ')' : ''}`);
    for (const x of sinkFindings(path.join(ROOT, f), { ...opts, unused: [] })) bad.push(`${f}:${x.line}  sink ${x.text}`);
    for (const u of opts.unused.filter((u) => !u.sink)) unused.push(`${f}: ${u.expr} @ ${u.at}`);
  }
  assert.deepEqual(bad, [], 'wrap these in escapeHtml(…) — or, for markup this file builds itself, add a reviewed entry to test/html-allow.json');
  assert.deepEqual(unused, [], 'allowlist entries that no longer match anything must go');
});

test('every reviewed exception says why it is safe, and every excluded file says why', () => {
  for (const [f, conf] of Object.entries(ALLOW.files)) for (const a of conf.allow) {
    assert.ok(typeof a.why === 'string' && a.why.length >= 20, `${f}: ${a.expr || a.sink} needs a reason`);
    assert.ok(typeof a.at === 'string', `${f}: ${a.expr || a.sink} needs its place`);
  }
  for (const [f, why] of Object.entries(ALLOW.exclude || {})) assert.ok(why.length >= 40, f);
});

/* the rule itself, on small synthetic files */
function check(t, code, allow = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'html-check-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = path.join(dir, 'x.js'); fs.writeFileSync(f, 'function escapeHtml(s) { return String(s); }\n' + code);
  return [...findings(f, { allow }).map((x) => x.text), ...sinkFindings(f, { allow }).map((x) => 'sink ' + x.text)];
}
test('the rule: a bare value in markup is caught; escaped values, numbers, fixed text and checked markup pass', (t) => {
  assert.deepEqual(check(t, 'el.innerHTML = `<b>${p.text}</b>`;'), ['p.text']);
  assert.deepEqual(check(t, 'el.innerHTML = `<b title="${name}">x</b>`;'), ['name']);
  assert.deepEqual(check(t, 'el.innerHTML = `<b>${escapeHtml(p.text)}</b>`;'), []);
  assert.deepEqual(check(t, 'el.innerHTML = `<b style="left:${(x * 2).toFixed(1)}px">${n.length} ${3 + 4}</b>`;'), []);
  assert.deepEqual(check(t, 'el.innerHTML = `<b class="${on ? "on" : ""}">${xs.map((v) => `<i>${escapeHtml(v)}</i>`).join("")}</b>`;'), []);
  // text inside a template that sits in markup is markup too
  assert.deepEqual(check(t, 'el.innerHTML = `<b title="${bus ? `Bus ${id}` : "x"}">x</b>`;'), ['id']);
  // the sink itself: a bare value, a variable built from bare values, a concatenation
  assert.deepEqual(check(t, 'el.innerHTML = name;'), ['sink name']);
  assert.deepEqual(check(t, 'let h = "<i>" + p.name + "</i>"; el.innerHTML = h;'), ['sink h']);
  assert.deepEqual(check(t, 'let h = `<i>x</i>`; h += `<b>${escapeHtml(n)}</b>`; el.innerHTML = h;'), []);
  assert.deepEqual(check(t, 'el.insertAdjacentHTML("beforeend", "<i>" + who);'), ['sink "<i>" + who']);
  // a builder's markup parameter: its callers are checked
  const builder = 'const row = (label, inner) => `<div>${escapeHtml(label)}${inner}</div>`;\n';
  const allow = [{ expr: 'inner', at: '', why: 'test', callers: { fn: 'row', arg: 1 } }];
  assert.deepEqual(check(t, builder + 'el.innerHTML = row("a", `<i>${escapeHtml(x)}</i>`);', allow), []);
  assert.deepEqual(check(t, builder + 'el.innerHTML = row("a", p.text);', allow), ['p.text']);
});

/* Cindy's list on #366 (S1–S9, lines as of 1682001a), each place pinned as escaped */
test('#366 S1–S9: each place Cindy listed is escaped', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  const has = (re, what) => assert.match(src, re, what);
  has(/<textarea data-k="text">\$\{escapeHtml\(p\.text\)\}<\/textarea>/, 'S1 the inspector Content box');
  has(/<option selected>\$\{escapeHtml\(p\.font\)\}<\/option>/, 'S2 the font list');
  has(/`Submix bus \$\{escapeHtml\(id\)\} — double-click to rename` : `Track \$\{escapeHtml\(id\)\}`/, 'S3 the mixer strip title');
  has(/\$\{escapeHtml\(x\.width\)\}×\$\{escapeHtml\(x\.height\)\}/, 'S4 the new-project templates');
  has(/Composition · \$\{escapeHtml\(comp\.width\)\}×\$\{escapeHtml\(comp\.height\)\} · \$\{escapeHtml\(comp\.duration\)\}s/, 'S5 the comp list');
  has(/data-t="\$\{escapeHtml\(t\)\}" title="\$\{escapeHtml\(label\)\}">\$\{badge\}/, 'S6 the keyframe marks (drawn as the project loads)');
  has(/<h3>Clip — \$\{escapeHtml\(c\.kind\)\}<\/h3>/, 'S7 the clip kind');
  has(/data-k="color" value="\$\{escapeHtml\(p\.color\)\}"/, 'S7 a colour field');
  has(/value="\$\{escapeHtml\(p\.cropL\)\}"/, 'S7 the crop fields');
  has(/<option value="\$\{escapeHtml\(id\)\}" \$\{cur === id \? "selected" : ""\}>\$\{escapeHtml\(id\)\}<\/option>/, 'S8 the matte track options');
  has(/\$\{escapeHtml\(isMaster \? "Master" : id\)\}/, 'S9 the mixer FX title');
});
