// Deterministic frame renderer for page/demo.html.
// The page exposes window.__seek(t) and window.__ready; we never play it, we seek to each frame and
// screenshot it as FRAMES_DIR/00000.png … build.sh encodes the sequence (this file never runs ffmpeg).
// usage: node render.cjs PAGE.html FRAMES_DIR [--duration=22] [--fps=60] [--chrome=/usr/bin/google-chrome]
// Needs: playwright (npm i playwright).
// playwright is not a MontClip dependency: install it anywhere and point NODE_PATH at that node_modules.
const { mkdirSync, lstatSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {

const [page, dir, ...rest] = process.argv.slice(2);
if (!page || !dir) { console.error('usage: node render.cjs PAGE.html FRAMES_DIR [--duration=22] [--fps=60] [--chrome=PATH]'); process.exit(2); }
// FRAMES_DIR must be a real directory we own: refuse symlinks / Windows junctions even when empty,
// because frames would be written through them into the link target. Then create it before rendering.
const st = (() => { try { return lstatSync(dir); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } })();
if (st && st.isSymbolicLink()) { console.error(`refusing ${dir}: is a symlink/junction (nothing was changed)`); process.exit(65); }
if (st && !st.isDirectory()) { console.error(`refusing ${dir}: not a directory (nothing was changed)`); process.exit(65); }
if (st && readdirSync(dir).length) { console.error(`refusing ${dir}: not empty (nothing was changed)`); process.exit(65); }
if (!st) mkdirSync(dir, { recursive: true });
if (lstatSync(dir).isSymbolicLink()) { console.error(`refusing ${dir}: became a symlink (nothing was changed)`); process.exit(65); }
const { chromium } = require('playwright');
const opt = Object.fromEntries(rest.map(a => a.replace(/^--/, '').split('=')));
const duration = Number(opt.duration || 22), fps = Number(opt.fps || 60), frames = Math.round(duration * fps);
const browser = await chromium.launch(opt.chrome ? { executablePath: opt.chrome } : {});
const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await tab.route(/^https?:/, r => r.abort()); // no network while rendering
await tab.goto(pathToFileURL(resolve(page)).href);
await tab.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
try {
  for (let i = 0; i < frames; i++) {
    await tab.evaluate(t => window.__seek(t), i / fps);
    await tab.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await tab.screenshot({ path: join(dir, String(i).padStart(5, '0') + '.png') });
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${frames}\r`);
  }
  console.log(`\nwrote ${frames} frames to ${dir}`);
} finally {
  await browser.close();
}
})().catch(e => { console.error(e); process.exit(1); });
