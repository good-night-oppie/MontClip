'use strict';
// The look of the Cindy parts (助手面板 v7.2, the second change): Cindy's own styles, generated at build time from the files
// copied unchanged at 43001ea, with MontClip's colours laid over them.   node agent-ui/styles.cjs   → ../cindy-parts.css
//  1. Tailwind 3.4.19 with Cindy's tailwind.config.ts, over the parts' own files only (the copied components, hooks and lib,
//     the stand-ins and parts.tsx). Tailwind's preflight (its reset of every element) applies inside the parts only: MontClip's
//     own page keeps its look. tokens.css (Cindy's sizes, fonts, motion) and button.css (Cindy's button face) as they are.
//  2. Cindy's colours: its theme code (themes/colors.ts, theme-service.ts) turns the cindy-dark theme into CSS variables,
//     as Cindy does when it applies a theme.
//  3. MontClip's colours over Cindy's (montclip-theme.css): its accent #7b6cff, not Cindy's (Deja; v7.2 §1).
//  4. Everything stays inside the parts (VV on f3df7db; Deja, 2026-11-04): every rule (Cindy's variables, Tailwind's
//     utilities, tokens.css, button.css) applies only within SCOPE (a part's box and what the parts open over the page),
//     never on :root or on MontClip's own elements. A variable MontClip uses (style.css, app.js, index.html, pane.tsx) that
//     Cindy also has (--border, --accent, --muted…) is written as --cindy-<name> here, so MontClip's var(--muted, #9a9aaa)
//     keeps its own grey, even inside a part's box.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const esbuild = require('esbuild'), postcss = require('postcss'), tailwind = require('tailwindcss');
const { plugin } = require('./cindy-resolve.cjs');
const ROOT = path.join(__dirname, 'cindy-43001ea'), R = path.join(ROOT, 'apps/desktop/src/renderer');
const SKIP = ['__tests__'];
// a part's box (parts.tsx), Radix popovers and tooltips, Cindy's MorphPopover panel, its confirm dialog and that dialog's scrim
const SCOPE = ':where([data-cindy-parts], [data-radix-popper-content-wrapper], [data-morph-side], [role="alertdialog"], .modal-scrim)';
// the variables MontClip's own page uses or sets
const OWN = ['style.css', 'app/app.js', 'index.html', 'agent-ui/pane.tsx'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const montclipNames = () => new Set(OWN.flatMap((t) => [...t.matchAll(/var\(\s*--([\w-]+)|(?:^|[{;\s'"])--([\w-]+)\s*:|setProperty\(\s*['"]--([\w-]+)/g)].map((m) => m[1] || m[2] || m[3])));
// where a selector's first compound ends (at a combinator or a pseudo-element), so SCOPE can go on that element itself
function firstCompoundEnd(s) {
  let depth = 0, quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // a CSS code-point escape: \ + 1–6 hex digits + one optional trailing whitespace (Tailwind writes a comma in an
    // arbitrary value as `\2c `). The whole escape is part of the class name; its trailing whitespace is NOT a
    // descendant combinator (QQ on #109: 22 rules were split at that space, e.g. `.hover\:bg-\[var\(--x\2c …`).
    if (c === '\\') {
      if (/[0-9a-fA-F]/.test(s[i + 1] || '')) {
        let j = i + 1;
        while (j < s.length && j - i <= 6 && /[0-9a-fA-F]/.test(s[j])) j++;
        if (j < s.length && /\s/.test(s[j])) j++;
        i = j - 1;
      } else i++;
      continue;
    }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (!depth && (/[\s>+~]/.test(c) || (c === ':' && s[i + 1] === ':'))) return i;
  }
  return s.length;
}
// a selector inside the parts: under SCOPE, or on a SCOPE element itself (a popover's panel, the dialog)
const scoped = (s) => s.includes(SCOPE) ? [s] : /^(:root|html|:host)$/.test(s) ? [SCOPE]
  : [`${SCOPE} ${s}`, s.slice(0, firstCompoundEnd(s)) + SCOPE + s.slice(firstCompoundEnd(s))];

// bundle a Cindy module for Node and load it (its imports resolve as in Cindy; pictures are empty)
async function load(entry) {
  const r = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'error',
    loader: { '.png': 'empty', '.svg': 'empty', '.jpg': 'empty', '.webp': 'empty' }, nodePaths: [path.join(__dirname, 'node_modules')],
    plugins: [plugin({ root: ROOT }), { name: 'no-pictures', setup(b) { b.onResolve({ filter: /\.(png|svg|jpe?g|webp)$/ }, (a) => ({ path: a.path, namespace: 'empty' })); b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' })); } }] });
  const m = new Module(entry); m.paths = Module._nodeModulePaths(__dirname); m._compile(r.outputFiles[0].text, entry); return m.exports;
}

(async () => {
  // 2. Cindy's cindy-dark theme as variables
  const entry = path.join(__dirname, '.theme-entry.ts');
  fs.writeFileSync(entry, `import './cindy-43001ea/apps/desktop/src/renderer/themes/colors';
import { exportThemeColors } from './cindy-43001ea/apps/desktop/src/renderer/themes/theme-service';
import { cindyDark as theme } from './cindy-43001ea/apps/desktop/src/renderer/themes/builtin/cindy-dark';
export const colors = exportThemeColors(theme as any); export const id = (theme as any).id;\n`);
  let theme;
  try { theme = await load(entry); } finally { fs.rmSync(entry, { force: true }); }
  if (theme.id !== 'cindy-dark' || Object.keys(theme.colors).length < 100) throw Error('the cindy-dark theme did not resolve');
  const vars = Object.entries(theme.colors).map(([k, v]) => `  --${k}: ${v};`).join('\n');

  // 1. Tailwind with Cindy's config, over the parts' files
  const cfg = await load(path.join(ROOT, 'apps/desktop/tailwind.config.ts'));
  const config = cfg.default || cfg;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => SKIP.includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const content = [...walk(path.join(R, 'components')), ...walk(path.join(R, 'hooks')), ...walk(path.join(R, 'lib')), ...walk(path.join(__dirname, 'stand-ins')), path.join(__dirname, 'parts.tsx'), path.join(__dirname, 'HostCard.tsx')]
    .filter((f) => /\.(tsx?|js)$/.test(f));
  // Cindy's parts count on Tailwind's preflight (a button has no face of its own, a field no frame…). MontClip's page does
  // not: preflight, like every rule here, applies only inside the parts (SCOPE, step 4). Its rules for html and body are
  // left out.
  const pre = postcss.parse(fs.readFileSync(require.resolve('tailwindcss/src/css/preflight.css'), 'utf8'));
  pre.walkRules((rule) => {
    const sel = rule.selectors.filter((s) => !/(^|[\s,(])(html|:host|body)\b/.test(s));
    if (!sel.length) rule.remove(); else rule.selectors = sel;
  });
  // from Cindy's globals.css (its whole app's rules) only ThinkingCard's three dots, the 「…」 of 「正在想…」: their rules,
  // their animation, and the reduced-motion rule that stops it (VV on f3df7db)
  const DOTS = ['.thinking-dot', '.thinking-dot-1', '.thinking-dot-2', '.thinking-dot-3'];
  // and the menu panel's surface (QQ on #109): MorphPopover's panel reads var(--menu-panel-surface) — defined only in
  // globals.css, so without it the 计划/手动/自动/Yolo menu is transparent over the timeline. Its :root rule (scoped
  // below, → the opaque --cmd-palette-bg) and the [data-menu-surface] blur come along; the [data-theme=…] variants
  // never match here (MontClip sets no data-theme), so the panel is solid, as on Cindy's win32 path.
  const menuSurface = (rule) => rule.selectors.some((s) => /\[data-menu-surface\]/.test(s)) ||
    (rule.nodes || []).some((n) => n.type === 'decl' && n.prop === '--menu-panel-surface');
  const globals = postcss.parse(fs.readFileSync(path.join(R, 'styles/globals.css'), 'utf8'));
  globals.walkAtRules((a) => { if (/keyframes$/.test(a.name) ? a.params !== 'thinking-dot-wave' : a.name !== 'media') a.remove(); });
  globals.walkRules((rule) => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    if (menuSurface(rule)) return;
    const sel = rule.selectors.filter((s) => DOTS.includes(s));
    if (!sel.length) rule.remove(); else rule.selectors = sel;
  });
  globals.each((n) => { if (n.type === 'atrule' && n.name === 'media' && !n.nodes.some((c) => c.type === 'rule')) n.remove(); else if (n.type !== 'rule' && n.type !== 'atrule') n.remove(); });
  const input = ['@tailwind base;', '@layer base {', pre.toString(), '}', fs.readFileSync(path.join(R, 'styles/generated/tokens.css'), 'utf8'), '@tailwind components;', '@tailwind utilities;',
    fs.readFileSync(path.join(R, 'components/ui/button.css'), 'utf8'), globals.toString()].join('\n');
  const css = (await postcss([tailwind({ ...config, content, corePlugins: { ...(config.corePlugins || {}), preflight: false } })]).process(input, { from: undefined })).css;
  const own = fs.readFileSync(path.join(__dirname, 'montclip-theme.css'), 'utf8');
  // 4. every rule inside the parts; MontClip's variable names left to MontClip
  const all = postcss.parse(`:root {\n${vars}\n}\n\n${css}\n\n${own}`), mine = montclipNames(), defined = new Set();
  all.walkDecls(/^--/, (d) => defined.add(d.prop.slice(2)));
  const renamed = [...defined].filter((n) => mine.has(n)).sort();
  all.walkDecls((d) => {
    if (d.prop.startsWith('--') && renamed.includes(d.prop.slice(2))) d.prop = '--cindy-' + d.prop.slice(2);
    d.value = d.value.replace(/var\(\s*--([\w-]+)/g, (m, n) => renamed.includes(n) ? 'var(--cindy-' + n : m);
  });
  all.walkRules((rule) => { if (!(rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name))) rule.selectors = [...new Set(rule.selectors.flatMap(scoped))]; });
  const banner = `/* MontClip generated, agent-ui/styles.cjs: the Cindy parts' styles, from makecindy/cindy @ 43001eaaa31ef322de9ae148c4051087277d6198
   (Apache-2.0, Copyright 2026 XD Inc.; tailwind.config.ts, tokens.css, button.css and the cindy-dark theme, unchanged in
   agent-ui/cindy-43001ea), built with Tailwind CSS 3.4.19 (MIT; its preflight, scoped to the parts); then MontClip's colours (agent-ui/montclip-theme.css).
   Do not edit: run node agent-ui/styles.cjs. */\n`;
  fs.writeFileSync(path.join(__dirname, '../cindy-parts.css'), `${banner}\n/* Cindy's cindy-dark theme (themes/theme-service.ts exportThemeColors) first, then Tailwind, then MontClip's colours.
   Every rule applies inside the parts only (SCOPE); MontClip's own variable names as --cindy-…: ${renamed.map((c) => '--' + c).join(' ')} */\n${all.toString()}\n`);
  // the npm packages whose code is in cindy-parts.css (Tailwind's preflight and generated rules), for licenses.cjs
  fs.writeFileSync(path.join(__dirname, 'STYLE-PACKAGES.json'), JSON.stringify(['tailwindcss'], null, 1) + '\n');
  console.log(`cindy-parts.css: ${Object.keys(theme.colors).length} theme variables, ${(css.match(/\{/g) || []).length} rules; as --cindy-…: ${renamed.join(' ')}`);
})().catch((e) => { console.error(e); process.exit(1); });
