'use strict';
// Copies the assistant pane's Cindy parts from a makecindy/cindy checkout at 43001ea into agent-ui/cindy-43001ea,
// unchanged, and records them (Deja, 2026-11-04).
//   node agent-ui/vendor-cindy.cjs <cindy checkout>
// - the files: what esbuild reads when it bundles the eight entry points (cindy-resolve.cjs ENTRIES) through the same
//   resolver as build.cjs, minus the files a stand-in replaces; plus LICENSE, NOTICE and the package.json of each
//   @cindy package they import (its exports map is how '@cindy/x/y' resolves);
// - SOURCES.json "parts": each file's path, git blob and sha256 at the commit;
// - cindy-strings.json: the zh-CN and en strings of Cindy's common.json that these files can ask for (a string literal
//   in them that names a key or a group of keys, a `prefix.${…}` template, or a key's plural forms). Cindy's whole
//   common.json is 2 MB per language.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const esbuild = require('esbuild'), ts = require('typescript');
const { COMMIT, ENTRIES, plugin, rel } = require('./cindy-resolve.cjs');
const src = path.resolve(process.argv[2] || ''), out = path.join(__dirname, 'cindy-43001ea');
const git = (...a) => execFileSync('git', ['-C', src, ...a], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== COMMIT) throw Error('the checkout is not at ' + COMMIT);

(async () => {
  const r = await esbuild.build({ entryPoints: ENTRIES.map((e) => path.join(src, e)), bundle: true, write: false, metafile: true, outdir: 'x',
    format: 'esm', jsx: 'automatic', platform: 'browser', logLevel: 'error', loader: { '.css': 'empty' },
    nodePaths: [path.join(__dirname, 'node_modules')], plugins: [plugin({ root: src })] });
  const files = new Set(Object.keys(r.metafile.inputs).map((f) => path.resolve(f)).filter((f) => !f.includes('node_modules') && !rel(src, f).startsWith('..')).map((f) => rel(src, f)));
  const packages = new Set([...files].map((f) => /^packages\/([^/]+)\//.exec(f)?.[1]).filter(Boolean));
  for (const p of packages) files.add(`packages/${p}/package.json`);
  files.add('LICENSE'); files.add('NOTICE');
  fs.rmSync(out, { recursive: true, force: true });
  const list = [...files].sort().map((f) => {
    const bytes = execFileSync('git', ['-C', src, 'show', `${COMMIT}:${f}`]);
    fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    fs.writeFileSync(path.join(out, f), bytes);
    return { file: f, blob: git('rev-parse', `${COMMIT}:${f}`), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  });
  const sourcesPath = path.join(__dirname, 'SOURCES.json'), sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  sources.parts = { commit: COMMIT, root: 'cindy-43001ea', files: list };
  fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n');

  // the strings these files can ask for
  const locale = (l) => `apps/desktop/src/renderer/i18n/locales/${l}/common.json`;
  const tables = { 'zh-CN': JSON.parse(git('show', `${COMMIT}:${locale('zh-CN')}`)), en: JSON.parse(git('show', `${COMMIT}:${locale('en')}`)) };
  const literals = new Set(), prefixes = new Set();
  for (const { file } of list) {
    if (!/\.(tsx?|mjs|js)$/.test(file)) continue;
    // TypeScript's parser finds the string literals (a regex pairs quotes wrongly at escapes and apostrophes in comments)
    const sf = ts.createSourceFile(file, fs.readFileSync(path.join(out, file), 'utf8'), ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isStringLiteralLike(node)) { if (/^[A-Za-z][\w-]*(\.[\w-]+)+$/.test(node.text)) literals.add(node.text); }
      else if (ts.isTemplateExpression(node)) { const s = node.head.text; if (/^[A-Za-z][\w-]*(\.[\w-]+)*\.$/.test(s)) prefixes.add(s.slice(0, -1)); }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const at = (t, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), t);
  const put = (t, key, v) => { const ks = key.split('.'); let o = t; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; o[ks.at(-1)] = v; };
  const pick = (t) => {
    const o = {};
    for (const key of [...literals, ...prefixes]) {
      const v = at(t, key);
      if (v !== undefined) put(o, key, v);
      // plural forms and contexts of a key: key_one, key_other, …
      const parent = key.split('.').slice(0, -1).join('.'), leaf = key.split('.').at(-1), group = parent ? at(t, parent) : t;
      if (group && typeof group === 'object') for (const k of Object.keys(group)) if (k.startsWith(leaf + '_')) put(o, (parent ? parent + '.' : '') + k, group[k]);
    }
    return o;
  };
  const strings = { source: { commit: COMMIT, files: Object.fromEntries(['zh-CN', 'en'].map((l) => [locale(l), git('rev-parse', `${COMMIT}:${locale(l)}`)])) },
    'zh-CN': pick(tables['zh-CN']), en: pick(tables.en) };
  fs.writeFileSync(path.join(__dirname, 'cindy-strings.json'), JSON.stringify(strings, null, 1) + '\n');
  const count = (o) => Object.values(o).reduce((n, v) => n + (v && typeof v === 'object' ? count(v) : 1), 0);
  console.log(`copied ${list.length} files; strings zh-CN ${count(strings['zh-CN'])}, en ${count(strings.en)}`);
})().catch((e) => { console.error(e); process.exit(1); });
