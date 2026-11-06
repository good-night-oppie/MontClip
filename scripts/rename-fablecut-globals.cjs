'use strict';
/* Idempotent rename of the internal "FableCut" name to "MontClip" (A-class).

   It rewrites only the capitalised word "FableCut" — the user-visible brand and
   the internal UMD globals `FableCutXxx` — to "MontClip". It never touches:

     B-class (breaking, see docs/decisions/2026-11-04-rename-internal-globals.md):
       - MCP tool names `fablecut_*` and the serverInfo name `fablecut`
       - `FABLECUT_*` environment variables
       - the `~/FableCut` data folder (paths.js)
       - `.mcp.json` / `.claude-plugin/*.json` registration names
       - `X-FableCut-*` HTTP headers
       - `fablecut-*` localStorage/settings keys and worklet processor names
       - the `fablecut` command (package.json `bin`)
     Upstream references, kept forever:
       - `ronak-create/FableCut`, `*.fablecut.space`, `io.github.ronak-create/fablecut`
       - the `FableCut` that names the upstream inside JJ's public copy
       - the brand-guard tests (test/brand.test.js, test/ui-terms-page.test.js)
       - historical records (docs/decisions/, docs/backlog/, docs/validation/)

   Usage (repo root, on a clean checkout or a branch that merged main afterwards):

       node scripts/rename-fablecut-globals.cjs

   The script regenerates the generated docs itself (docs/docs/build.js,
   docs/demo/sync.js), so docs/ stays in sync with CLAUDE.md and the root
   modules. Re-running on an already-renamed tree is a no-op (0 diff); running
   on a clean origin/main reproduces the same diff, so a branch that merged main
   after the rename can run it once to resolve conflicts.
*/
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SELF = path.relative(ROOT, __filename).replace(/\\/g, '/');

const EXCLUDE_DIRS = ['docs/validation/', 'docs/decisions/', 'docs/backlog/', '.claude-plugin/'];
const EXCLUDE_FILES = new Set([
  SELF,
  '.mcp.json',
  // Release history: entries for 1.18.0 and earlier are the upstream's own and
  // keep its name; MontClip's newer entries already say MontClip.
  'CHANGELOG.md',
  // Brand-guard tests: they assert the old name is *absent*; do not rename them.
  'test/brand.test.js',
  'test/ui-terms-page.test.js',
  // JJ's public copy — the "FableCut" here names the upstream, so it stays.
  'README.md',
  'docs/index.html',
  'docs/start/index.html',
  'docs/en/index.html',
  'docs/en/start/index.html',
  'docs/i18n/README.zh-CN.md',
  'test/fixtures/montclip-public-copy-v1.md',
]);

const TEXT_RE = /\.(js|cjs|mjs|py|html|css|md|json|yml|yaml|svg|txt|sh|xml)$/;

// [original, placeholder, onlyIf?] — the placeholder must not appear in source
// and must not contain "FableCut"/"MontClip", so the middle replacement leaves
// it alone. Order among these does not matter (none is a substring of another).
// `onlyIf(file)` limits a rule to some files.
const PROTECT = [
  ['ronak-create/FableCut', '@@UPSTREAM@@'],
  ['ronak-create\\/FableCut', '@@UPSTREAM_ESC@@'], // the escaped-slash form in regexes
  ['~/FableCut', '@@DATADIR@@'],
  ['X-FableCut', '@@HEADER@@'],
  ['FableCut project folder', '@@PJ_FOLDER@@'],
  ['FableCut data folder', '@@DATA_FOLDER@@'],
  ['FableCut folder', '@@FOLDER@@'],
  // The upstream's hosted product (studio.fablecut.space) — only where docs name it.
  ['FableCut Studio', '@@STUDIO@@', (f) => f.startsWith('docs/')],
  ['upstream FableCut', '@@UPSTREAM_NAME@@'],
  ['Upstream FableCut', '@@UPSTREAM_NAME_CAP@@'],
  ['based on FableCut by ronak-create', '@@BASED_ON@@'],
  ['FableCut\\\\', '@@BS_PATH@@'], // two backslashes: a Windows data-dir path in test fixtures
  ['os.homedir(), "FableCut"', '@@DD_HOME@@'],
  ['path.join(home, "FableCut"', '@@DD_JOIN@@'],
];

function renameTree() {
  const files = execSync('git ls-files', { encoding: 'utf8', cwd: ROOT }).split('\n').filter(Boolean);
  let changed = 0;
  let occurrences = 0;
  for (const f of files) {
    if (EXCLUDE_FILES.has(f) || EXCLUDE_DIRS.some((d) => f.startsWith(d)) || !TEXT_RE.test(f)) continue;
    const full = path.join(ROOT, f);
    const src = fs.readFileSync(full, 'utf8');
    if (!src.includes('FableCut')) continue;
    const rules = PROTECT.filter(([, , onlyIf]) => !onlyIf || onlyIf(f));
    let text = src;
    for (const [from, ph] of rules) text = text.split(from).join(ph);
    const count = (text.match(/FableCut/g) || []).length;
    if (!count) continue; // every occurrence was a protected one — nothing to rename
    text = text.split('FableCut').join('MontClip');
    for (const [from, ph] of rules) text = text.split(ph).join(from);
    if (text === src) continue;
    fs.writeFileSync(full, text);
    changed += 1;
    occurrences += count;
  }
  console.log(`renamed ${occurrences} occurrence(s) across ${changed} file(s)`);
  console.log('regenerating docs (docs/docs/build.js, docs/demo/sync.js) …');
  execSync('node docs/docs/build.js', { stdio: 'inherit', cwd: ROOT });
  execSync('node docs/demo/sync.js', { stdio: 'inherit', cwd: ROOT });
}

if (require.main === module) renameTree();
module.exports = { renameTree, PROTECT, EXCLUDE_FILES, EXCLUDE_DIRS };
