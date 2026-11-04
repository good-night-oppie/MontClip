'use strict';
// What the Chinese interface shows of index.html, without a browser: applyI18n replayed on the markup (ui-preferences.js —
// data-i18n replaces an element's text, data-i18n-tail its last text). Key caps (<kbd>) and code samples are left out.
// Used by test/error-text.test.js to find English left in the zh-CN interface (Deja, 2026-11-04).
const fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences');
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'track', 'param']);
const SKIP = new Set(['script', 'style', 'kbd', 'code', 'template', 'svg']);
const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|[^<]+/g;
const attrsOf = (s) => { const o = {}; for (const m of s.matchAll(/([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+))?/g)) o[m[1]] = m[3] ?? m[4] ?? m[2] ?? ''; return o; };
const textOf = (s) => s.replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();

/** [{text, ids}] — each piece of text the zh-CN page shows, with the ids of the elements around it (outermost first). */
function shown(html, language = 'zh-CN') {
  const out = [], stack = [];
  for (const m of html.matchAll(TOKEN)) {
    if (m[0].startsWith('<!')) continue;
    const muted = stack.some((e) => e.muted);
    if (m[2]) {
      const tag = m[2].toLowerCase();
      if (m[1]) { while (stack.length && stack.pop().tag !== tag); continue; }
      const a = attrsOf(m[3]), el = { tag, id: a.id, muted: muted || SKIP.has(tag) };
      const ids = () => [...stack, el].map((e) => e.id).filter(Boolean);
      if (!muted && a['data-i18n'] && V.t(language, a['data-i18n'])) { out.push({ text: V.t(language, a['data-i18n']), ids: ids() }); el.muted = true; }
      if (!muted && a['data-i18n-tail'] && V.t(language, a['data-i18n-tail'])) { out.push({ text: V.t(language, a['data-i18n-tail']), ids: ids() }); el.tail = true; }
      if (!VOID.has(tag) && !m[4]) stack.push(el);
      continue;
    }
    if (muted || (stack.length && stack[stack.length - 1].tail)) continue;
    const text = textOf(m[0]);
    if (text) out.push({ text, ids: stack.map((e) => e.id).filter(Boolean) });
  }
  return out;
}
const words = (s, allowed) => [...new Set((s.match(/[A-Za-z]{3,}/g) || []).filter((w) => !allowed.has(w)))].join(',');

/** English words of three letters or more the zh-CN page shows: {"help:<section>/<keys>": words} for the shortcuts in the
 *  help layer, one row each; {"html:<id>": words} for the rest of index.html, by the nearest element with an id. */
function englishShown(allowed) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), found = {};
  const a = html.indexOf('id="helpKeys"'), b = html.indexOf('id="helpEmpty"');
  const help = html.slice(a, b);
  for (const sec of help.split(/<section class="keys-sec"/).slice(1)) {
    const head = (sec.match(/<h3[^>]*data-i18n="([^"]+)"/) || [])[1] || '?';
    for (const row of sec.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
      if (cells.length < 2) continue;
      let key = 'help:' + head.replace(/^term\./, '') + '/' + textOf(cells[0].replace(/<[^>]+>/g, ' '));
      while (key in found) key += '+';
      const w = words(shown(cells.slice(1).join(' ')).map((x) => x.text).join(' '), allowed);
      if (w) found[key] = w;
    }
  }
  const rest = html.slice(0, a) + html.slice(b), byId = {};
  for (const x of shown(rest)) { const id = x.ids[x.ids.length - 1] || '-'; (byId[id] = byId[id] || []).push(x.text); }
  for (const [id, texts] of Object.entries(byId)) { const w = words(texts.join(' '), allowed); if (w) found['html:' + id] = w; }
  return found;
}
module.exports = { shown, englishShown };
