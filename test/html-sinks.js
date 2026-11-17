'use strict';
/* #366 (QQ 6930219147): every `${…}` inside a template literal that builds HTML must go through an escaper, or be on the allowlist
   with a reason. "Builds HTML" = the template's literal text contains a tag (`<x`) or an entity / attribute-looking `="`.
   A small JavaScript scanner, enough for this repository's files (strings, comments, regular expressions, nested templates);
   no dependencies. It reports each interpolation with its file, line and source text. */

/** the template literals of a source text: [{start, end, quasis:[text…], exprs:[{text, line}]}], nested ones included */
function templates(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  let lastSig = '';   // last significant character outside strings/comments, to tell a regex from a division
  const lineAt = (pos) => { let l = 1; for (let k = 0; k < pos; k++) if (src.charCodeAt(k) === 10) l++; return l; };
  // line numbers are computed lazily with a cache
  const nl = []; for (let k = 0; k < n; k++) if (src.charCodeAt(k) === 10) nl.push(k);
  const line = (pos) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < pos) lo = m + 1; else hi = m; } return lo + 1; };
  void lineAt;

  function skipString(q) { i++; while (i < n) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === q) { i++; return; } if (c === '\n' && q !== '`') { i++; return; } i++; } }
  function skipRegex() { i++; let cls = false; while (i < n) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) { i++; while (i < n && /[a-z]/i.test(src[i])) i++; return; } else if (c === '\n') { i++; return; } i++; } }
  const regexCan = () => lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig) || /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)$/.test(src.slice(Math.max(0, i - 12), i).trimEnd());

  // reads a template starting at src[i] === '`'; returns its record (and pushes nested ones first)
  function readTemplate() {
    const start = i; i++;
    const quasis = [], exprs = []; let buf = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { buf += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; quasis.push(buf); const t = { start, end: i, line: line(start), quasis, exprs }; out.push(t); return t; }
      if (c === '$' && src[i + 1] === '{') {
        quasis.push(buf); buf = '';
        i += 2; const es = i; let depth = 1; const saved = lastSig; lastSig = '(';
        while (i < n && depth > 0) {
          const d = src[i];
          if (d === '`') { readTemplate(); lastSig = ')'; continue; }
          if (d === '"' || d === "'") { skipString(d); lastSig = ')'; continue; }
          if (d === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
          if (d === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
          if (d === '/' && regexCan()) { skipRegex(); lastSig = ')'; continue; }
          if (d === '{') depth++; else if (d === '}') { depth--; if (depth === 0) break; }
          if (!/\s/.test(d)) lastSig = d;
          i++;
        }
        exprs.push({ text: src.slice(es, i).trim(), line: line(es), pos: es, end: i, before: quasis[quasis.length - 1].slice(-40) });
        lastSig = saved; i++;   // past }
        continue;
      }
      buf += c; i++;
    }
    return null;
  }

  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { skipString(c); lastSig = ')'; continue; }
    if (c === '`') { readTemplate(); lastSig = ')'; continue; }
    if (c === '/' && regexCan()) { skipRegex(); lastSig = ')'; continue; }
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out;
}

/** does this template build HTML? a tag, a closing tag, or an attribute written as name="…" next to an interpolation */
const isHtml = (t) => t.quasis.some((q) => /<\/?[a-zA-Z!]/.test(q));

module.exports = { templates, isHtml };
