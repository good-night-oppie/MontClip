'use strict';
// The look of the Cindy parts (助手面板 v7.2, the second change): Cindy's own styles, generated at build time from the files
// copied unchanged at 43001ea, with MontClip's colours laid over them.   node agent-ui/styles.cjs   → ../cindy-parts.css
//  1. Tailwind 3.4.19 with Cindy's tailwind.config.ts, over the parts' own files only (the copied components, hooks and lib,
//     the stand-ins and parts.tsx). Tailwind's preflight (its reset of every element) applies inside the parts only: MontClip's
//     own page keeps its look. tokens.css (Cindy's sizes, fonts, motion) and button.css (Cindy's button face) as they are.
//  2. Cindy's colours: its theme code (themes/colors.ts, theme-service.ts) turns the cindy-dark theme into CSS variables,
//     as Cindy does when it applies a theme. Two of its names are also MontClip's, with other values (--border, --accent):
//     they are written as --cindy-border / --cindy-accent instead of overwriting MontClip's, and Cindy's config reads them there.
//  3. MontClip's colours over Cindy's (montclip-theme.css): its accent #7b6cff, not Cindy's (Deja; v7.2 §1).
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const esbuild = require('esbuild'), postcss = require('postcss'), tailwind = require('tailwindcss');
const { plugin } = require('./cindy-resolve.cjs');
const ROOT = path.join(__dirname, 'cindy-43001ea'), R = path.join(ROOT, 'apps/desktop/src/renderer');
const SKIP = ['__tests__'];
const COLLIDE = ['border', 'accent'];

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
  // the two names MontClip has too go under --cindy-…, and the config below reads them there
  const vars = Object.entries(theme.colors).map(([k, v]) => `  --${COLLIDE.includes(k) ? 'cindy-' + k : k}: ${v};`).join('\n');

  // 1. Tailwind with Cindy's config, over the parts' files
  const cfg = await load(path.join(ROOT, 'apps/desktop/tailwind.config.ts'));
  const config = cfg.default || cfg;
  // Cindy's colours border and accent read hsl(var(--border)) / hsl(var(--accent)) (its hslVar); here they read the
  // --cindy-… copies (the same function, the other name), so a part using Cindy's border-border / bg-accent gets Cindy's
  // value, never an invalid hsl() of MontClip's hex. (None of the parts copied today does; preflight's own default border
  // colour is Tailwind's gray-200, as in Cindy.) The config file itself is not changed.
  const hslVar = (name) => { const color = `hsl(var(--${name}))`; return ({ opacityValue } = {}) => opacityValue === undefined || String(opacityValue).startsWith('var(') ? color : `color-mix(in srgb, ${color} calc(${opacityValue} * 100%), transparent)`; };
  const colors = config.theme.extend.colors;
  if (typeof colors.border !== 'function' || typeof colors.accent?.DEFAULT !== 'function') throw Error('Cindy\'s border / accent colours are not where they were');
  colors.border = hslVar('cindy-border'); colors.accent = { ...colors.accent, DEFAULT: hslVar('cindy-accent') };
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => SKIP.includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const content = [...walk(path.join(R, 'components')), ...walk(path.join(R, 'hooks')), ...walk(path.join(R, 'lib')), ...walk(path.join(__dirname, 'stand-ins')), path.join(__dirname, 'parts.tsx')]
    .filter((f) => /\.(tsx?|js)$/.test(f));
  // Cindy's parts count on Tailwind's preflight (a button has no face of its own, a field no frame…). MontClip's page does
  // not: preflight here applies only inside the parts — the box a part is rendered in ([data-cindy-parts], parts.tsx) and
  // what they open over the page (Radix popovers and tooltips, Cindy's MorphPopover panel, the confirm dialog). Its rules
  // for html and body are left out.
  const SCOPE = ':where([data-cindy-parts], [data-radix-popper-content-wrapper], [data-morph-side], [role="alertdialog"])';
  const pre = postcss.parse(fs.readFileSync(require.resolve('tailwindcss/src/css/preflight.css'), 'utf8'));
  pre.walkRules((rule) => {
    const sel = rule.selectors.filter((s) => !/(^|[\s,(])(html|:host|body)\b/.test(s));
    if (!sel.length) { rule.remove(); return; }
    rule.selectors = sel.flatMap((s) => /::/.test(s) ? [`${SCOPE} ${s}`] : [`${SCOPE} ${s}`, s === '*' ? SCOPE : `${s}${SCOPE}`]);
  });
  const input = ['@tailwind base;', '@layer base {', pre.toString(), '}', fs.readFileSync(path.join(R, 'styles/generated/tokens.css'), 'utf8'), '@tailwind components;', '@tailwind utilities;',
    fs.readFileSync(path.join(R, 'components/ui/button.css'), 'utf8')].join('\n');
  const css = (await postcss([tailwind({ ...config, content, corePlugins: { ...(config.corePlugins || {}), preflight: false } })]).process(input, { from: undefined })).css;
  const own = fs.readFileSync(path.join(__dirname, 'montclip-theme.css'), 'utf8');
  const banner = `/* MontClip generated, agent-ui/styles.cjs: the Cindy parts' styles, from makecindy/cindy @ 43001eaaa31ef322de9ae148c4051087277d6198
   (Apache-2.0, Copyright 2026 XD Inc.; tailwind.config.ts, tokens.css, button.css and the cindy-dark theme, unchanged in
   agent-ui/cindy-43001ea), built with Tailwind CSS 3.4.19 (MIT; its preflight, scoped to the parts); then MontClip's colours (agent-ui/montclip-theme.css).
   Do not edit: run node agent-ui/styles.cjs. */\n`;
  fs.writeFileSync(path.join(__dirname, '../cindy-parts.css'), `${banner}\n/* Cindy's cindy-dark theme (themes/theme-service.ts exportThemeColors); ${COLLIDE.map((c) => '--' + c).join(', ')} as --cindy-… */\n:root {\n${vars}\n}\n\n${css}\n\n${own}`);
  // the npm packages whose code is in cindy-parts.css (Tailwind's preflight and generated rules), for licenses.cjs
  fs.writeFileSync(path.join(__dirname, 'STYLE-PACKAGES.json'), JSON.stringify(['tailwindcss'], null, 1) + '\n');
  console.log(`cindy-parts.css: ${Object.keys(theme.colors).length} theme variables, ${(css.match(/\{/g) || []).length} rules`);
})().catch((e) => { console.error(e); process.exit(1); });
