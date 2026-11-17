'use strict';
/* #366 (QQ 6930219147 2): the rule the HTML check applies to every `${…}` in a template literal that builds HTML (html-sinks.js).
   An interpolation passes when it cannot carry markup from outside:
     - an escaper call: escapeHtml(…), or a helper of the same file whose every definition is `(…) => escapeHtml(…)`;
     - a number: a numeric literal or arithmetic on literals, Math.round / Number / parseInt / parseFloat (…), anything .toFixed(n),
       x.length / x.size, +x, !!x, or a numeric formatter listed in html-allow.json ("numeric", each with its reason);
     - fixed text: a string literal, "…".repeat(n), or a ternary / || / ?? / + whose every part passes;
     - HTML that is itself checked: a template literal, xs.map(… => `…`).join(…), or a call to a builder of the same file —
       a name whose every callable definition builds a template with a tag (those templates are checked here too);
     - an entry of html-allow.json ("allow"): this file, this exact expression, and the reason it is safe.
   Anything else fails: wrap it in escapeHtml(…) (it escapes " and ' too, so it is right inside quoted attributes). */
const fs = require('node:fs');
const { templates, isHtml } = require('./html-sinks');

/** x[i] opens a string or a template: the index of its closing quote (a template's ${…} may hold strings and templates) */
function skipQ(x, i) {
  const q = x[i];
  for (let k = i + 1; k < x.length; k++) {
    const c = x[k];
    if (c === '\\') { k++; continue; }
    if (c === q) return k;
    if (q === '`' && c === '$' && x[k + 1] === '{') {
      let d = 1; k += 2;
      for (; k < x.length && d > 0; k++) { const e = x[k]; if (e === '"' || e === "'" || e === '`') { k = skipQ(x, k); continue; } if (e === '{') d++; else if (e === '}') d--; }
      k--;
    }
  }
  return x.length;
}
/** split at the first top-level operator of `ops` → [left, op, right] or null (depth-aware: () [] {} strings templates) */
function topSplit(x, ops) {
  let d = 0;
  for (let i = 0; i < x.length; i++) {
    const c = x[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQ(x, i); continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (d === 0) for (const op of ops) if (x.startsWith(op, i)) return [x.slice(0, i), op, x.slice(i + op.length)];
  }
  return null;
}
/** the top-level ternary `a ? b : c` → [a, b, c] or null */
function ternary(x) {
  let d = 0, q = null, at = -1;
  for (let i = 0; i < x.length; i++) {
    const c = x[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQ(x, i); continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (d === 0 && c === '?' && x[i + 1] !== '.' && x[i + 1] !== '?' && x[i - 1] !== '?') { at = i; break; }
  }
  if (at < 0) return null;
  const rest = x.slice(at + 1); let depth = 0; d = 0; q = null;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQ(rest, i); continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (d === 0 && c === '?' && rest[i + 1] !== '.' && rest[i + 1] !== '?' && rest[i - 1] !== '?') depth++;
    else if (d === 0 && c === ':') { if (depth === 0) return [x.slice(0, at), rest.slice(0, i), rest.slice(i + 1)]; depth--; }
  }
  return null;
}
function closes(x) { let d = 0, q = null; for (let i = 0; i < x.length; i++) { const c = x[i]; if (c === '"' || c === "'" || c === '`') { i = skipQ(x, i); continue; } if (c === '(') d++; else if (c === ')') { d--; if (d === 0 && i < x.length - 1) return false; } } return true; }
const strip = (x) => { x = x.trim(); while (x.startsWith('(') && x.endsWith(')') && closes(x)) x = x.slice(1, -1).trim(); return x; };
/** the whole expression is one call `name(…)` → name, else null */
function callName(x) {
  const m = /^([\w$.]+)\(/.exec(x); if (!m) return null;
  let d = 0, q = null;
  for (let i = m[0].length - 1; i < x.length; i++) {
    const c = x[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQ(x, i); continue; }
    if (c === '(') d++; else if (c === ')') { d--; if (d === 0) return i === x.length - 1 ? m[1] : null; }
  }
  return null;
}
/** one template literal and nothing else */
function oneTemplate(x) {
  if (!x.startsWith('`') || !x.endsWith('`')) return false;
  let d = 0;
  for (let i = 1; i < x.length - 1; i++) {
    const c = x[i];
    if (c === '\\') { i++; continue; }
    if (c === '$' && x[i + 1] === '{') { d++; i++; continue; }
    if (d > 0) { if (c === '{') d++; else if (c === '}') d--; continue; }
    if (c === '`') return false;
  }
  return true;
}

const LIT = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?(?:e-?\d+)?|true|false|null|undefined)$/;
const NUMERIC_EXPR = /^[\d\s.+\-*/%()]+$/;

/** the body of a callable definition whose `=` / `(` is at index i: to the brace that closes it, or the end of the line
 *  for an expression arrow (at most 6000 characters) */
function bodyAt(src, i) {
  const s = src.slice(i, i + 6000), arrow = s.indexOf('=>'), nl = s.indexOf('\n');
  const lineEnd = nl < 0 ? s.length : nl;
  if (arrow >= 0 && arrow < lineEnd && !/^\s*\{/.test(s.slice(arrow + 2))) {
    // an expression arrow: to the end of the expression — a ';' or ',' at depth 0, or a new statement on the next line
    let d = 0, q = null, t = 0;
    for (let k = arrow + 2; k < s.length; k++) {
      const c = s[k];
      if (q) { if (c === '\\') { k++; continue; } if (q === '`' && c === '$' && s[k + 1] === '{') { t++; d++; k++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) { d--; if (d < 0) return s.slice(0, k); if (t > 0 && c === '}') { t--; q = '`'; } }
      else if (d === 0 && (c === ';' || c === ',')) return s.slice(0, k);
      else if (d === 0 && c === '\n' && /^\s*(?:const |let |var |function |if |for |return |\}|\/\/)/.test(s.slice(k + 1, k + 40))) return s.slice(0, k);
    }
    return s;
  }
  const brace = s.indexOf('{'); if (brace < 0) return s.slice(0, lineEnd);
  let d = 0, q = null;
  for (let k = brace; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { k = skipQ(s, k); continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return s.slice(0, k + 1); }
  }
  return s;
}
/** every callable definition of the file: name → [{pos, kind}] in source order; kind is "esc" (`(…) => escapeHtml(…)`),
 *  "build" (its body holds a template with a tag — checked here like any other) or "other" */
function helperDefs(src) {
  const defs = new Map();
  for (const m of src.matchAll(/(?:^|[^\w$.])(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|\()/g)) {
    const n = m[1], at = m.index + m[0].indexOf(n) + n.length, b = bodyAt(src, at);
    const kind = /^\s*=\s*(?:\([^)]*\)|[\w$]+)\s*=>\s*escapeHtml\(/.test(b) || /^\s*\([^)]*\)\s*\{\s*return escapeHtml\([^;]*;\s*\}$/.test(b) ? 'esc'
      : /`[^`]*<\/?[a-zA-Z]/.test(b) ? 'build' : 'other';
    if (!defs.has(n)) defs.set(n, []); defs.get(n).push({ pos: at, kind });
  }
  return defs;
}
/** the kind of `name` as seen from `pos`: its nearest definition above (the local helper a template calls is defined just
 *  above it), else its only kind when every definition agrees, else "other" */
function kindAt(defs, name, pos) {
  const d = defs.get(name); if (!d) return null;
  let near = null; for (const x of d) if (x.pos < pos) near = x;
  if (near) return near.kind;
  return d.every((x) => x.kind === d[0].kind) ? d[0].kind : 'other';
}
function helperKinds(src) {
  const defs = helperDefs(src), esc = new Set(['escapeHtml']), build = new Set();
  for (const [n, d] of defs) { if (d.every((x) => x.kind === 'esc')) esc.add(n); else if (d.every((x) => x.kind === 'build')) build.add(n); }
  return { esc, build, defs };
}

/** every expression a block `{ … }` returns, at any depth — nested functions' returns included, which can only make the
 *  check stricter: [expr] */
function returns(block) {
  const out = [];
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQ(block, i); continue; }
    if (block.startsWith('return ', i) && !/[\w$]/.test(block[i - 1] || '')) {
      let e = i + 7, dd = 0;
      for (; e < block.length; e++) { const x = block[e]; if (x === '"' || x === "'" || x === '`') { e = skipQ(block, e); continue; } if ('([{'.includes(x)) dd++; else if (')]}'.includes(x)) { if (dd === 0) break; dd--; } else if (x === ';' && dd === 0) break; }
      out.push(block.slice(i + 7, e)); i = e;
    }
  }
  return out;
}
/** split at top-level commas */
function splitTop(x) { const out = []; let d = 0, st = 0; for (let i = 0; i < x.length; i++) { const c = x[i]; if (c === '"' || c === "'" || c === '`') { i = skipQ(x, i); continue; } if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === ',' && d === 0) { out.push(x.slice(st, i)); st = i + 1; } } out.push(x.slice(st)); return out; }
/** x is one bracketed group [ … ] */
function closesBracket(x) { let d = 0; for (let i = 0; i < x.length; i++) { const c = x[i]; if (c === '"' || c === "'" || c === '`') { i = skipQ(x, i); continue; } if (c === '[') d++; else if (c === ']') { d--; if (d === 0 && i < x.length - 1) return false; } } return true; }
/** `<receiver>.map(<fn>)` at the end of x → fn source, else null (balanced) */
function mapArg(x) {
  if (!x.endsWith(')')) return null;
  let d = 0, q = null;
  for (let i = x.length - 1; i >= 0; i--) {
    const c = x[i];
    if (c === ')') d++; else if (c === '(') { d--; if (d === 0) return x.slice(0, i).endsWith('.map') ? x.slice(i + 1, -1) : null; }
    void q;
  }
  return null;
}

/** the expression without its comments (strings and templates kept as they are) */
function dropComments(x) {
  let out = '';
  for (let i = 0; i < x.length; i++) {
    const c = x[i];
    if (c === '"' || c === "'" || c === '`') { const e = skipQ(x, i); out += x.slice(i, e + 1); i = e; continue; }
    if (c === '/' && x[i + 1] === '/') { const nl = x.indexOf('\n', i); i = nl < 0 ? x.length : nl - 1; continue; }
    if (c === '/' && x[i + 1] === '*') { const e = x.indexOf('*/', i + 2); i = e < 0 ? x.length : e + 1; continue; }
    out += c;
  }
  return out;
}
function makeChecker(src, { numeric = new Set(), allow = new Set(), identOk = null } = {}) {
  const { esc, build, defs } = helperKinds(src);
  const kind = (name, pos) => (esc.has(name) ? 'esc' : build.has(name) ? 'build' : kindAt(defs, name, pos));
  function safe(raw, pos = Infinity) {
    const x = strip(dropComments(raw).replace(/\s+/g, ' '));
    if (!x) return false;
    if (allow.has(x)) return true;
    if (identOk && /^[A-Za-z_$][\w$]*$/.test(x) && identOk(x, pos)) return true;   // a variable whose every assignment passes (sinks)
    if (LIT.test(x) || NUMERIC_EXPR.test(x)) return true;
    if (oneTemplate(x)) return true;                                       // checked itself (templates() lists nested ones)
    const t = ternary(x); if (t) return safe(t[1], pos) && safe(t[2], pos);
    for (const op of ['||', '??']) { const s = topSplit(x, [op]); if (s) return safe(s[0], pos) && safe(s[2], pos); }
    { const s = topSplit(x, ['&&']); if (s) return safe(s[2], pos); }       // a && b is false (renders "false") or b
    { const s = topSplit(x, [' + ']); if (s) return safe(s[0], pos) && safe(s[2], pos); }
    if (/^!!/.test(x) || /^\+[\w$.[\]]+$/.test(x)) return true;            // a boolean, a number
    if (/^[\w$.[\]]+\.(length|size)$/.test(x)) return true;
    if (/^\(.*\)\.length$/.test(x) && closes(x.slice(0, -'.length'.length))) return true;   // (a || b).length
    if (/\.toFixed\(\d*\)$/.test(x)) return true;                           // whatever it is called on, the result is digits
    if (/^"[^"]*"\.repeat\(/.test(x)) return true;
    // xs.map(fn).join(…): fn's result is what is joined
    const j = /\.join\((?:"[^"]*"|'[^']*'|)\)$/.exec(x);
    if (j && /^\[[\s\S]*\]$/.test(x.slice(0, j.index)) && closesBracket(x.slice(0, j.index))) {   // [a, b, …].join(…)
      const items = splitTop(x.slice(1, j.index - 1)).filter((e) => e.trim());
      if (items.every((e) => safe(e, pos))) return true;
    }
    if (j) {
      const fn = (mapArg(x.slice(0, j.index)) || '').replace(/,\s*$/, '') || null;
      if (fn != null) {
        const arrow = /^(?:\([^)]*\)|[\w$]+)\s*=>\s*([\s\S]+)$/.exec(fn.trim());
        if (arrow && !/^\{/.test(arrow[1].trim()) && safe(arrow[1], pos)) return true;
        if (arrow && /^\{[\s\S]*\}$/.test(arrow[1].trim())) { const r = returns(arrow[1].trim()); if (r.length && r.every((e) => safe(e, pos))) return true; }   // (x) => { …; return a; … return b; }
        if (/^[\w$]+$/.test(fn.trim()) && ['esc', 'build'].includes(kind(fn.trim(), pos))) return true;
      }
    }
    const name = callName(x);
    if (name) {
      if (numeric.has(name)) return true;
      if (/^(?:Math\.\w+|Number|parseInt|parseFloat)$/.test(name)) return true;
      if (/^[\w$]+$/.test(name) && ['esc', 'build'].includes(kind(name, pos))) return true;
    }
    return false;
  }
  return { safe, esc, build };
}

/** the arguments of every call `fn(…)` in src (not its definitions, not a method `.fn(`): [{pos, args:[{text, pos, end}]}] */
function callSites(src, fn) {
  const out = [];
  const re = new RegExp(String.raw`(?:^|[^\w$.])` + fn.replace(/\$/g, '\\$') + String.raw`\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    if (/(?:const|let|var|function)\s+$/.test(src.slice(Math.max(0, open - fn.length - 12), open - fn.length))) continue;   // its definition
    const args = []; let d = 0, start = open + 1;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') { i = skipQ(src, i); continue; }
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { d--; if (d === 0) { args.push({ text: src.slice(start, i), pos: start, end: i }); break; } }
      else if (c === ',' && d === 1) { args.push({ text: src.slice(start, i), pos: start, end: i }); start = i + 1; }
    }
    out.push({ pos: m.index, args });
  }
  return out;
}

/** every interpolation of an HTML template in `file` that does not pass: [{line, text, pos, end, before}].
 *  A template counts as HTML when its text has a tag, or when it sits inside an interpolation of an HTML template, or when it is
 *  passed to a builder's markup parameter — whatever it holds ends up in the page as HTML.
 *  opts.allow: [{expr, at, why, callers?}] — `expr` is the interpolation (spaces collapsed); `at` is text the template has just
 *  before it (so an entry covers that one place, not every place the same words appear); `why` says why it is safe. With
 *  `callers: {fn, arg}` the entry is a builder's markup parameter: every call fn(…) in the file must pass, as argument `arg`
 *  (0-based), something that itself passes this check — else the call is reported. Unused entries are returned in opts.unused. */
function findings(file, opts = {}) {
  const src = fs.readFileSync(file, 'utf8');
  const entries = (opts.allow || []).filter((a) => a.expr).map((a) => ({ ...a, expr: a.expr.replace(/\s+/g, ' ').trim(), used: 0 }));
  const ck = makeChecker(src, { numeric: new Set(opts.numeric || []) });
  const kinds = helperKinds(src);
  const kindAtSrc = (n, pos) => (kinds.esc.has(n) ? 'esc' : kinds.build.has(n) ? 'build' : kindAt(kinds.defs, n, pos));
  const all = templates(src);
  // HTML context: tagged templates, then (to a fixpoint) templates inside their interpolations or passed to markup parameters
  const ranges = [];
  for (const a of entries) if (a.callers) for (const site of callSites(src, a.callers.fn)) { const g = site.args[a.callers.arg]; if (g) ranges.push([g.pos, g.end]); }
  const html = new Set(all.filter(isHtml));
  const escaped = (e) => { const n = callName(strip(e.text)); return n && kindAtSrc(n, e.pos) === 'esc'; };   // its output is escaped text
  for (let grew = true; grew;) {
    grew = false;
    const rs = [...ranges]; for (const t of html) for (const e of t.exprs) if (!escaped(e)) rs.push([e.pos, e.end]);
    for (const t of all) if (!html.has(t) && rs.some(([a, b]) => t.start >= a && t.start < b)) { html.add(t); grew = true; }
  }
  const out = [];
  for (const t of html) for (const e of t.exprs) {
    if (ck.safe(e.text, e.pos)) continue;
    const text = e.text.replace(/\s+/g, ' ').trim(), before = e.before.replace(/\s+/g, ' ');
    const hit = entries.find((a) => a.expr === text && before.endsWith(a.at.replace(/\s+/g, ' ')));
    if (hit) { hit.used++; continue; }
    out.push({ line: e.line, text, pos: e.pos, end: e.end, before: e.before });
  }
  // a markup parameter's callers
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  for (const a of entries) if (a.callers) for (const site of callSites(src, a.callers.fn)) {
    const g = site.args[a.callers.arg]; if (!g || !g.text.trim()) continue;
    if (!ck.safe(g.text, g.pos)) out.push({ line: lineOf(g.pos), text: g.text.replace(/\s+/g, ' ').trim(), pos: g.pos, end: g.end, before: '', arg: a.callers.fn + '#' + a.callers.arg });
  }
  out.sort((x, y) => x.pos - y.pos);
  if (opts.unused) for (const a of entries) if (!a.used) opts.unused.push(a);
  return out;
}

/** the end of the expression that starts at `start`: a ';' or ',' at depth 0, a closing bracket of an outer level, or a
 *  line end at depth 0 that neither ends with an operator nor is followed by one */
function exprEnd(src, start) {
  let d = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQ(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl - 1; continue; }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { if (d === 0) return i; d--; }
    else if (d === 0 && (c === ';' || c === ',')) return i;
    else if (d === 0 && c === '\n') {
      const before = src.slice(start, i).replace(/\/\/[^\n]*$/, '').trimEnd(), after = src.slice(i + 1, i + 40).trimStart();
      if (!/[+\-*/?:,(|&=]$/.test(before) && !/^(?:\+|\.|\?|:|\|\||&&)/.test(after)) return i;
    }
  }
  return src.length;
}
/** every HTML sink of `file` whose markup does not pass: x.innerHTML / x.outerHTML / x.srcdoc (= or +=), insertAdjacentHTML(pos, markup),
 *  setHTMLUnsafe(markup), parseFromString(markup, …), createContextualFragment(markup),
 *  document.write(markup). A variable passes when every assignment to it from its declaration down to the sink passes.
 *  opts.allow / opts.numeric as for findings(); a sink entry is {sink: <the sink's markup expression>, at, why}. */
function sinkFindings(file, opts = {}) {
  const src = fs.readFileSync(file, 'utf8');
  let ck = null;
  /* a variable passes when every assignment to it, from its nearest declaration above `pos` down to `pos`, passes */
  const identOk = (name, pos) => {
    if (!isFinite(pos)) return false;
    const n = name.replace(/\$/g, '\\$');
    const decl = [...src.slice(0, pos).matchAll(new RegExp(String.raw`(?:^|[^\w$.])(?:let|const|var)\s+(?:[^;=]*?,\s*)?` + n + String.raw`\b`, 'g'))].pop();
    if (!decl) return false;
    const region = src.slice(decl.index, pos), base = decl.index;
    const as = [...region.matchAll(new RegExp(String.raw`(?:^|[^\w$.])` + n + String.raw`\s*(\+?=)(?![=>])\s*`, 'g'))];
    return as.length > 0 && as.every((a) => { const s0 = base + a.index + a[0].length; return ck.safe(src.slice(s0, exprEnd(src, s0)), s0); });
  };
  ck = makeChecker(src, { numeric: new Set(opts.numeric || []), identOk });
  const entries = (opts.allow || []).filter((a) => a.sink).map((a) => ({ ...a, sink: a.sink.replace(/\s+/g, ' ').trim(), used: 0 }));
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  const out = [];
  // also the newer and the less common ones (QQ, #373 review): setHTMLUnsafe(markup), DOMParser.parseFromString(markup, …),
  // Range.createContextualFragment(markup) and an iframe's srcdoc
  const re = /\.(?:innerHTML|outerHTML|srcdoc)\s*\+?=(?!=)\s*|\binsertAdjacentHTML\(\s*(?:"[^"]*"|'[^']*'|[\w$.]+)\s*,\s*|\bdocument\.write(?:ln)?\(\s*|\.(?:setHTMLUnsafe|parseFromString|createContextualFragment)\(\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const st = m.index + m[0].length, en = exprEnd(src, st), rhs = src.slice(st, en).trim();
    let ok = ck.safe(rhs, st);
    if (ok) continue;
    const text = rhs.replace(/\s+/g, ' '), at = src.slice(Math.max(0, m.index - 30), st).replace(/\s+/g, ' ');
    const hit = entries.find((a) => a.sink === text && at.endsWith(a.at.replace(/\s+/g, ' ')));
    if (hit) { hit.used++; continue; }
    out.push({ line: lineOf(st), text, at: at.slice(-24) });
  }
  if (opts.unused) for (const a of entries) if (!a.used) opts.unused.push(a);
  return out;
}

module.exports = { findings, sinkFindings, makeChecker, helperKinds, ternary, topSplit, callName, strip, exprEnd };
