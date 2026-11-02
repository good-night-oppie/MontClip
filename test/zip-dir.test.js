'use strict';
// QQ (#57, fccc225): the package zip named its entries with "\" (.NET Framework's ZipFile.CreateFromDirectory). The zip
// format's separator is "/"; "\" breaks extraction outside Windows and in some tools. desktop/zip-dir.cjs writes the
// entries itself with "/", names in UTF-8; desktop/zip-entries.cjs reads the names back from the central directory.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { zipEntries } = require('../desktop/zip-entries.cjs');
const win = process.platform === 'win32';

test('zipDir: every entry name uses "/", none has "\\", non-ASCII names are UTF-8, and the files come back as they were', { skip: !win && 'zipDir uses Windows PowerShell' }, () => {
  const { zipDir } = require('../desktop/zip-dir.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-zip-'));
  try {
    const top = path.join(root, 'MontClip-test'), files = { 'a.txt': 'a', '子目录/中文 文件.txt': '内容', 'resources/app/x.js': 'x;', 'resources/ffmpeg/b.bin': crypto.randomBytes(5000) };
    for (const [rel, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true }); fs.writeFileSync(path.join(top, rel), body); }
    const zip = path.join(root, 'out.zip');
    zipDir(top, zip);
    const entries = zipEntries(zip);
    a.deepEqual(entries.map((e) => e.name).sort(), Object.keys(files).map((r) => 'MontClip-test/' + r).sort());
    a.deepEqual(entries.filter((e) => e.name.includes('\\')), [], 'no "\\" in any entry name');
    for (const e of entries) if (/[^\x00-\x7f]/.test(e.name)) a.equal(e.utf8, true, 'UTF-8 flag on ' + e.name);
    // and it unpacks to the same bytes
    const back = path.join(root, 'back');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:Z -DestinationPath $env:D'], { env: { ...process.env, Z: zip, D: back }, encoding: 'utf8', windowsHide: true });
    a.equal(r.status, 0, r.stderr);
    for (const [rel, body] of Object.entries(files)) a.deepEqual(fs.readFileSync(path.join(back, 'MontClip-test', rel)), Buffer.from(body));
    // an existing zip is never overwritten, and a failed run leaves nothing behind
    a.throws(() => zipDir(top, zip), /exists/);
    a.throws(() => zipDir(path.join(root, 'missing'), path.join(root, 'none.zip')));
    a.equal(fs.existsSync(path.join(root, 'none.zip')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('zipEntries reads names and the UTF-8 flag from the central directory', { skip: !win && 'the fixture is made with zipDir' }, () => {
  const { zipDir } = require('../desktop/zip-dir.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-zip-'));
  try {
    fs.mkdirSync(path.join(root, 'T')); fs.writeFileSync(path.join(root, 'T', '先看我.txt'), 'x');
    zipDir(path.join(root, 'T'), path.join(root, 'o.zip'));
    a.deepEqual(zipEntries(path.join(root, 'o.zip')).map((e) => [e.name, e.utf8]), [['T/先看我.txt', true]]);
    fs.writeFileSync(path.join(root, 'bad.zip'), 'not a zip');
    a.throws(() => zipEntries(path.join(root, 'bad.zip')), /not a zip/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the package is zipped with zipDir, and its smoke checks the entry names', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  a.match(read('desktop/package-win.cjs'), /require\('\.\/zip-dir\.cjs'\)\.zipDir\(/);
  a.doesNotMatch(read('desktop/package-win.cjs'), /CreateFromDirectory/);
  a.match(read('desktop/package-smoke.cjs'), /zipEntries\(zip\)/);
});
