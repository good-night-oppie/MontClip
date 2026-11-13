'use strict';
// Deja 2026-11-05: scripts/rename-fablecut-globals.cjs rewrote the upstream credit in docs/hackathon/README.md
// ("a modified version of [FableCut](https://github.com/ronak-create/FableCut)" → "[MontClip]") every time a branch
// ran it before merging main. A line carrying `fablecut-keep` is never touched; licence and notice files are skipped
// whole. Everything else is renamed as before.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const R = require('../scripts/rename-fablecut-globals.cjs');

function repo(t, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-rename-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); }
  const git = (...args) => execFileSync('git', args, { cwd: d, stdio: 'ignore' });
  git('init', '-q'); git('add', '-A');
  return d;
}

test('a line marked fablecut-keep and the licence files keep "FableCut"; everything else is renamed', (t) => {
  const credit = 'MontClip is a modified version of [FableCut](https://github.com/x/FableCut) and keeps its MIT license. <!-- fablecut-keep: upstream credit -->';
  const d = repo(t, {
    'docs/hackathon/README.md': `# Hackathon\n\n${credit}\n\nThe FableCut captions module.\n`,
    'app/app.js': 'window.FableCutCaptions = {};\n// FableCut, by the upstream author  fablecut-keep\nconst x = FableCutDelivery;\n',
    'LICENSES.md': 'Parts come from FableCut (MIT).\n',
    'NOTICE': 'FableCut notice.\n',
    'NOTICE.md': 'FableCut notice.\n',
  });
  const mine = fs.readFileSync(path.join(ROOT, 'docs/hackathon/README.md'), 'utf8');
  R.renameTree({ root: d, regenerate: false });
  a.equal(fs.readFileSync(path.join(ROOT, 'docs/hackathon/README.md'), 'utf8'), mine, 'only the scratch repository was touched, not this one');
  const read = (f) => fs.readFileSync(path.join(d, f), 'utf8');
  a.equal(read('docs/hackathon/README.md'), `# Hackathon\n\n${credit}\n\nThe MontClip captions module.\n`, 'the marked line stays; the other line is renamed');
  a.equal(read('app/app.js'), 'window.MontClipCaptions = {};\n// FableCut, by the upstream author  fablecut-keep\nconst x = MontClipDelivery;\n');
  a.equal(read('LICENSES.md'), 'Parts come from FableCut (MIT).\n');
  a.equal(read('NOTICE'), 'FableCut notice.\n');
  a.equal(read('NOTICE.md'), 'FableCut notice.\n');
  // running again changes nothing
  R.renameTree({ root: d, regenerate: false });
  a.equal(read('app/app.js'), 'window.MontClipCaptions = {};\n// FableCut, by the upstream author  fablecut-keep\nconst x = MontClipDelivery;\n');
});

test('the repository\'s own upstream credit lines carry the marker, so the script leaves them alone', (t) => {
  const readme = fs.readFileSync(path.join(ROOT, 'docs/hackathon/README.md'), 'utf8');
  const credits = readme.split('\n').filter((l) => /modified version of \[FableCut\]/.test(l));
  a.equal(credits.length, 2, 'both credit lines are there');
  for (const l of credits) a.match(l, /<!-- fablecut-keep[^>]*-->/, 'marked in an HTML comment (not shown): ' + l);
  // the real file, run through the script in a scratch repository, comes out unchanged
  const d = repo(t, { 'docs/hackathon/README.md': readme });
  R.renameTree({ root: d, regenerate: false });
  a.equal(fs.readFileSync(path.join(d, 'docs/hackathon/README.md'), 'utf8'), readme);
});

// The script promises a no-op on a tree that is already renamed. On main after #182 it was not: it renamed the
// fixtures of this very test file (FableCutCaptions, "FableCut notice."), which then failed. Every tracked file that
// still says FableCut, copied into a scratch repository and run through the script, must come out unchanged.
test('on this repository the script is a no-op: every file that still says FableCut is meant to', (t) => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const files = {};
  for (const f of tracked) {
    let text;
    try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    if (text.includes('FableCut')) files[f] = text;
  }
  a.ok(Object.keys(files).length > 20, 'the repository still names the upstream in places');
  const d = repo(t, files);
  R.renameTree({ root: d, regenerate: false });
  const changed = Object.keys(files).filter((f) => fs.readFileSync(path.join(d, f), 'utf8') !== files[f]);
  a.deepEqual(changed, [], 'the script would rewrite these files');
  a.ok(R.EXCLUDE_FILES.has('test/rename-script-keep.test.js'), "this test's own fixtures keep the old name");
});
