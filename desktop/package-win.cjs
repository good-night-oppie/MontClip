'use strict';
/* Windows internal test package (Deja, 2026-11-02): a portable win32-x64 folder made with the pinned
   @electron/packager, zipped as MontClip-internal-win-x64-<UTC date>-<short commit>.zip, with its sha256 in
   SHA256SUMS.txt beside it. Nothing is published.

     node desktop/package-win.cjs --out <dir> [--electron-zip-dir <dir holding electron-v<version>-win32-x64.zip>]

   - The app is staged from `git archive HEAD`, never from the working tree, so the package is exactly a commit
     (BUILD-INFO.json records it). A dirty tree is refused.
   - FFmpeg comes from vendor/ffmpeg/win32-x64, which desktop/fetch-ffmpeg.cjs fills from the pinned release and
     checks against desktop/ffmpeg-manifest.json. Here the two programs are checked again against SOURCE.json and
     only ffmpeg.exe, ffprobe.exe, LICENSE.txt and SOURCE.json go into resources/ffmpeg. No ffplay.
   - The packaged app runs only that FFmpeg (desktop/main.js sets MONTCLIP_FFMPEG_PACKAGED; ffmpeg-path.js has no
     PATH fallback).
   - Licences in licenses/: FFmpeg's LGPL text, libiconv's COPYING.LIB and README, LICENSES.md, MontClip's LICENSE.
     Electron's own LICENSE and LICENSES.chromium.html stay where Electron puts them. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const fail = (m) => { throw Error('PACKAGE_FAILED: ' + m); };

// what the app runs: the root page and server files (as in package.json "files"), and the desktop main process with
// every module it requires
const ROOT_FILES = (list) => list.filter((f) => !f.includes('/') && /\.(js|html|css|svg|json)$/.test(f)
  && !/^(package(-lock)?\.json|project\.json|glama\.json|manifest\.json)$/.test(f) && !/^github-result-/.test(f));
const ROOT_DIRS = ['icons/', 'library/elements/', 'library/fonts/', 'library/svg/'];
const ROOT_EXTRA = ['CLAUDE.md', 'LICENSE', 'LICENSES.md', 'encoding-profiles.json', 'library/README.md', 'library/sfx/README.md',
  'agent-ui/upstream/LICENSE', 'agent-ui/upstream/NOTICE', 'agent-ui/SOURCES.json', 'agent-ui/THIRD-PARTY-NOTICES.txt'];
function desktopFiles(stage) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return; seen.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const p = path.resolve(path.dirname(f), m[1]);
      for (const c of [p, p + '.js', p + '.cjs', p + '.json']) if (fs.existsSync(c) && fs.statSync(c).isFile()) { if (c.endsWith('.json')) seen.add(c); else walk(c); break; }
    }
  };
  walk(path.join(stage, 'desktop', 'main.js'));
  seen.add(path.join(stage, 'desktop', 'view-preload.js'));
  return [...seen].filter((f) => f.startsWith(path.join(stage, 'desktop') + path.sep)).map((f) => path.relative(stage, f).split(path.sep).join('/'));
}

async function main() {
  const out = arg('--out') || fail('--out <dir> is required');
  if (process.platform !== 'win32') fail('build on Windows');
  if (git('status', '--porcelain', '--untracked-files=no')) fail('the working tree has changes; commit them first');
  const commit = git('rev-parse', 'HEAD'), short = commit.slice(0, 7), tree = git('rev-parse', 'HEAD^{tree}');
  const electronVersion = require('./package.json').devDependencies.electron;
  const { dependency } = require('./build-tool.js'), dep = dependency(), packager = await dep.load();

  // FFmpeg: the checked vendor folder, checked again
  const ffSrc = path.join(ROOT, 'vendor', 'ffmpeg', 'win32-x64'), source = JSON.parse(fs.readFileSync(path.join(ffSrc, 'SOURCE.json'), 'utf8'));
  const manifest = require('./ffmpeg-manifest.json');
  if (source.sha256 !== manifest.builds['win32-x64'].sha256) fail('vendor FFmpeg is not the pinned release; run node desktop/fetch-ffmpeg.cjs');
  for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) if (sha(path.join(ffSrc, exe)) !== source.files[exe]) fail(exe + ' does not match SOURCE.json');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-pkg-'));
  try {
    // the commit, unpacked
    const src = path.join(work, 'src'); fs.mkdirSync(src);
    execFileSync('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', '-o', path.join(work, 'src.tar'), 'HEAD'], { cwd: ROOT });
    execFileSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', path.join(work, 'src.tar'), '-C', src]);
    const tracked = git('ls-files').split('\n');
    const stage = path.join(work, 'app'); fs.mkdirSync(stage);
    const take = (rel) => { const from = path.join(src, rel), to = path.join(stage, rel); if (!fs.existsSync(from)) fail('missing ' + rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };
    for (const f of ROOT_FILES(tracked)) take(f);
    for (const d of ROOT_DIRS) take(d);
    for (const f of ROOT_EXTRA) take(f);
    const desk = desktopFiles(src);
    for (const f of desk) take(f);
    const rootPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'montclip', productName: 'MontClip', version: rootPkg.version,
      description: 'MontClip internal test build', main: 'desktop/main.js', license: rootPkg.license, private: true }, null, 2));
    // resources/ffmpeg: the four files only
    const ffStage = path.join(work, 'ffmpeg'); fs.mkdirSync(ffStage);
    for (const f of ['ffmpeg.exe', 'ffprobe.exe', 'LICENSE.txt', 'SOURCE.json']) fs.copyFileSync(path.join(ffSrc, f), path.join(ffStage, f));

    const zipDir = arg('--electron-zip-dir');
    const built = await packager({ dir: stage, out: path.join(work, 'out'), name: 'MontClip', executableName: 'MontClip',
      platform: 'win32', arch: 'x64', electronVersion, ...(zipDir ? { electronZipDir: zipDir } : {}),
      asar: false, prune: true, overwrite: true, extraResource: [ffStage], appVersion: rootPkg.version,
      win32metadata: { ProductName: 'MontClip', FileDescription: 'MontClip', CompanyName: 'good-night-oppie' } });
    const appDir = built[0];

    // licences beside the program
    const lic = path.join(appDir, 'licenses'); fs.mkdirSync(lic);
    fs.copyFileSync(path.join(ffSrc, 'LICENSE.txt'), path.join(lic, 'FFmpeg-LGPL-3.0-or-later.txt'));
    const iconv = fs.readdirSync(path.join(src, 'licenses', 'ffmpeg', 'texts')).filter((f) => f.startsWith('libiconv@'));
    for (const f of iconv.filter((f) => /--(COPYING\.LIB|README)$/.test(f))) fs.copyFileSync(path.join(src, 'licenses', 'ffmpeg', 'texts', f), path.join(lic, f.replace(/^libiconv@[0-9a-f]+--/, 'libiconv-') + '.txt'));
    if (!fs.existsSync(path.join(lic, 'libiconv-COPYING.LIB.txt'))) fail('libiconv COPYING.LIB missing');
    fs.copyFileSync(path.join(src, 'LICENSES.md'), path.join(lic, 'LICENSES.md'));
    fs.copyFileSync(path.join(src, 'LICENSE'), path.join(lic, 'MontClip-LICENSE.txt'));

    // what must and must not be in it
    const all = [];
    (function list(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? list(p) : all.push(path.relative(appDir, p).split(path.sep).join('/')); } })(appDir);
    if (all.some((f) => /ffplay/i.test(f))) fail('ffplay found in the package');
    const ffIn = all.filter((f) => f.startsWith('resources/ffmpeg/')).sort();
    if (JSON.stringify(ffIn) !== JSON.stringify(['resources/ffmpeg/LICENSE.txt', 'resources/ffmpeg/SOURCE.json', 'resources/ffmpeg/ffmpeg.exe', 'resources/ffmpeg/ffprobe.exe'])) fail('resources/ffmpeg holds ' + ffIn.join(', '));
    for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) if (sha(path.join(appDir, 'resources', 'ffmpeg', exe)) !== source.files[exe]) fail(exe + ' changed while packaging');
    if (all.some((f) => /(^|\/)(vendor|node_modules|test|real-tests|media|exports|analysis)\//.test(f.replace(/^resources\/app\//, '')) && f.startsWith('resources/app/'))) fail('development folders in the package');
    if (all.some((f) => /openh264/i.test(f))) fail('openh264 found in the package');
    const ver = spawnSync(path.join(appDir, 'resources', 'ffmpeg', 'ffmpeg.exe'), ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true }).stdout || '';
    if (/--enable-gpl|--enable-nonfree|--enable-libopenh264/.test(ver)) fail('the bundled FFmpeg is not the LGPL build without openh264');

    const info = { product: 'MontClip', kind: 'internal test build (not a release)', commit, tree, built: new Date().toISOString(),
      electron: electronVersion, packager: dep.version, platform: 'win32-x64',
      ffmpeg: { release: 'ffmpeg-lgpl-n9.0.2-montclip1', version: source.version, archiveSha256: source.sha256, files: source.files },
      appFiles: all.filter((f) => f.startsWith('resources/app/')).length, notIncluded: ['openh264 (H.264 encoding uses the system: Media Foundation or the graphics card)', 'local speech recognition models', 'ffplay'] };
    fs.writeFileSync(path.join(appDir, 'BUILD-INFO.json'), JSON.stringify(info, null, 2));

    // zip + sha256
    fs.mkdirSync(out, { recursive: true });
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const top = `MontClip-internal-win-x64-${date}-${short}`, zipName = top + '.zip', zip = path.join(out, zipName);
    if (fs.existsSync(zip)) fail(zipName + ' already exists in ' + out);
    fs.renameSync(appDir, path.join(path.dirname(appDir), top));
    execFileSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, top], { cwd: path.dirname(appDir) });
    const zsha = sha(zip), size = fs.statSync(zip).size;
    const sums = path.join(out, 'SHA256SUMS.txt'), line = `${zsha}  ${zipName}\n`;
    fs.appendFileSync(sums, line);
    const unpacked = all.reduce((s, f) => s + fs.statSync(path.join(path.dirname(appDir), top, f)).size, 0);
    process.stdout.write('MONTCLIP_PACKAGE ' + JSON.stringify({ zip: zipName, sha256: zsha, bytes: size, unpackedBytes: unpacked, files: all.length, commit, tree,
      ffmpegExe: source.files['ffmpeg.exe'], ffprobeExe: source.files['ffprobe.exe'], electronZipDir: zipDir ? 'given' : 'downloaded' }) + '\n');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
