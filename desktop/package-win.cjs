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
     Electron's own LICENSE and LICENSES.chromium.html stay where Electron puts them.
   - A private test package for one streamer (Deja, 2026-11-04; the owner: 「配置好再打包，私下打包，不发布」), on top of --full:
       node desktop/package-win.cjs --full --out <dir outside the repository> --private-seed <file holding the DeepSeek key> --seed-model <model id>
     The key file is read here and nowhere else; its key goes into resources/montclip-seed-v1.json and nowhere else in the
     package (checked: every file is searched for it). On its first launch the app seals it with safeStorage and deletes the
     seed (desktop/agent-seed.js). The key is never printed; the model id is given, never guessed. Not for CI. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
/** A path under vendor/asr/<dir> (fs.cpSync's filter sees full paths). */
const isUnder = (file, dir) => path.relative(require('./fetch-asr.cjs').VENDOR, file).split(path.sep)[0] === dir;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const fail = (m) => { throw Error('PACKAGE_FAILED: ' + m); };

/** --private-seed / --seed-model, checked before anything is built → null (an ordinary package) or {key, model}. The
 *  messages name the file, never what is in it. */
function privateSeed(argv, { root = ROOT, out } = {}) {
  const at = (k) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
  const file = at('--private-seed'), model = at('--seed-model');
  if (!file && !model) return null;
  if (!file) fail('--seed-model needs --private-seed <file>');
  if (!argv.includes('--full')) fail('a private package is a full one: add --full (the speech models go in, nothing is downloaded later)');
  if (!model) fail('--seed-model <model id> is required: the DeepSeek model id is given, never guessed');
  if (!out) fail('--out <dir> is required');
  const rel = path.relative(path.resolve(root), path.resolve(out));
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) fail('--out must be outside the repository: a private package holds a key');
  let key;
  try { key = fs.readFileSync(file, 'utf8').trim(); } catch (e) { fail('cannot read the key file ' + file + ' (' + (e.code || 'error') + ')'); }
  const AgentSeed = require('./agent-seed.js');
  try { AgentSeed.seedText({ model, apiKey: key }); } catch { fail('the key file ' + file + ' or --seed-model ' + JSON.stringify(model) + ' is not one a seed can hold (one line, no spaces; a model id of letters, digits and _.:/-)'); }
  return { key, model };
}
/** Files of the package (relative paths) whose bytes hold the key. */
function filesHolding(appDir, files, key) {
  const k = Buffer.from(key, 'utf8');
  return files.filter((f) => fs.readFileSync(path.join(appDir, f)).includes(k));
}

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

/** Files the shipped code reads from its own folders — fs.readFileSync / readFile / readdirSync / existsSync /
 *  createReadStream / statSync of path.join(__dirname | ROOT | APP_DIR, "literal", …) — as [{from, target}], repository
 *  paths, for the targets that are tracked files (VV / Deja 2026-11-03: asr-models.js reads desktop/asr-manifest.json, which
 *  no require() names, so the e8d0c16 package failed at start). ROOT / APP_DIR are the install folder (paths.js, server.js). */
function repoReads(base, jsFiles, tracked) {
  const out = [], have = new Set(tracked);
  const call = /\b(?:readFileSync|readFile|readdirSync|existsSync|createReadStream|statSync)\(\s*path\.(?:join|resolve)\(\s*(__dirname|ROOT|APP_DIR)\s*((?:,\s*(?:"[^"\n]*"|'[^'\n]*')\s*)+)\)/g;
  for (const from of jsFiles) {
    const src = fs.readFileSync(path.join(base, from), 'utf8');
    for (const m of src.matchAll(call)) {
      const parts = [...m[2].matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)].map((p) => p[1] ?? p[2]);
      const dir = m[1] === '__dirname' ? path.posix.dirname(from) : '';
      const target = path.posix.normalize(path.posix.join(dir, ...parts));
      if (have.has(target)) out.push({ from, target });
    }
  }
  return out;
}
/** Everything the app takes from the commit, as repository paths (a directory ends with "/"): the root files, the folders
 *  and extras, the desktop main process with what it requires, and every tracked file the shipped code reads. */
function packagedFiles(src, tracked) {
  const list = [...ROOT_FILES(tracked), ...ROOT_DIRS, ...ROOT_EXTRA, ...desktopFiles(src)];
  const has = (rel) => list.some((f) => rel === f || (f.endsWith('/') && rel.startsWith(f)));
  // a smoke module runs only in development (main.js loads it with --montclip-smoke, never when packaged): its fixtures stay out
  const js = list.filter((f) => /\.c?js$/.test(f) && !/-smoke\.c?js$/.test(f) && tracked.includes(f));
  for (const r of repoReads(src, js, tracked)) if (!has(r.target)) list.push(r.target);
  return list;
}

async function main() {
  const out = arg('--out') || fail('--out <dir> is required');
  if (process.platform !== 'win32') fail('build on Windows');
  const seed = privateSeed(process.argv, { out });
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
    // the files the program needs, including those it reads but never require()s (desktop/asr-manifest.json)
    for (const f of packagedFiles(src, tracked)) take(f);
    if (!fs.existsSync(path.join(stage, 'desktop', 'asr-manifest.json'))) fail('desktop/asr-manifest.json is not in the package');
    const rootPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'montclip', productName: 'MontClip', version: rootPkg.version,
      description: 'MontClip internal test build', main: 'desktop/main.js', license: rootPkg.license, private: true }, null, 2));
    // resources/ffmpeg: the four files only
    const ffStage = path.join(work, 'ffmpeg'); fs.mkdirSync(ffStage);
    for (const f of ['ffmpeg.exe', 'ffprobe.exe', 'LICENSE.txt', 'SOURCE.json']) fs.copyFileSync(path.join(ffSrc, f), path.join(ffStage, f));

    // resources/asr: the checked vendor/asr folder (desktop/fetch-asr.cjs) — the speech engine and the VAD always; the
    // speech and punctuation models only in the 完整版 package (--full); the engine test's sentence never
    const full = process.argv.includes('--full');
    const Asr = require('./fetch-asr.cjs'), asrCheck = Asr.verify({ models: full });
    if (!asrCheck.ok) fail('vendor/asr does not match asr-manifest.json (run node desktop/fetch-asr.cjs' + (full ? ' --models asr,punct' : '') + '): ' + asrCheck.bad.join('; '));
    const asrKeep = (f) => !isUnder(f, 'test_wavs') && (full || !isUnder(f, 'models'));
    const asrStage = path.join(work, 'asr'); fs.cpSync(Asr.VENDOR, asrStage, { recursive: true, filter: asrKeep });

    const zipDir = arg('--electron-zip-dir');
    const built = await packager({ dir: stage, out: path.join(work, 'out'), name: 'MontClip', executableName: 'MontClip',
      platform: 'win32', arch: 'x64', electronVersion, ...(zipDir ? { electronZipDir: zipDir } : {}),
      asar: false, prune: true, overwrite: true, extraResource: [ffStage, asrStage], appVersion: rootPkg.version,
      win32metadata: { ProductName: 'MontClip', FileDescription: 'MontClip', CompanyName: 'good-night-oppie' } });
    const appDir = built[0];
    { const r = Asr.verify({ dir: path.join(appDir, 'resources', 'asr'), models: full }); if (!r.ok) fail('resources/asr changed while packaging: ' + r.bad.join('; ')); }

    // licences beside the program
    const lic = path.join(appDir, 'licenses'); fs.mkdirSync(lic);
    fs.copyFileSync(path.join(ffSrc, 'LICENSE.txt'), path.join(lic, 'FFmpeg-LGPL-3.0-or-later.txt'));
    const iconv = fs.readdirSync(path.join(src, 'licenses', 'ffmpeg', 'texts')).filter((f) => f.startsWith('libiconv@'));
    for (const f of iconv.filter((f) => /--(COPYING\.LIB|README)$/.test(f))) fs.copyFileSync(path.join(src, 'licenses', 'ffmpeg', 'texts', f), path.join(lic, f.replace(/^libiconv@[0-9a-f]+--/, 'libiconv-') + '.txt'));
    if (!fs.existsSync(path.join(lic, 'libiconv-COPYING.LIB.txt'))) fail('libiconv COPYING.LIB missing');
    fs.copyFileSync(path.join(src, 'LICENSES.md'), path.join(lic, 'LICENSES.md'));
    // on-device transcription: sherpa-onnx (Apache-2.0), onnxruntime (MIT), Paraformer and CT-Transformer (Apache-2.0), silero VAD (MIT)
    for (const f of fs.readdirSync(path.join(src, 'licenses', 'asr'))) fs.copyFileSync(path.join(src, 'licenses', 'asr', f), path.join(lic, f));
    fs.copyFileSync(path.join(src, 'LICENSE'), path.join(lic, 'MontClip-LICENSE.txt'));

    // JJ's notes for testers, in the zip's root (desktop/package-readme/render.js): placeholders filled, UTF-8 with a BOM
    // and CRLF; when this app hides + URL (#58), JJ's alternative URL line replaces v3's and nothing else changes.
    const date0 = new Date().toISOString().slice(0, 10).replace(/-/g, ''), buildId = date0 + '-' + short;
    const Readme = require(path.join(src, 'desktop', 'package-readme', 'render.js'));
    const urlHidden = Readme.hidesUrl(fs.readFileSync(path.join(src, 'app.js'), 'utf8'));
    const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
    const copyGone = Readme.dropsExportCopy(readOr(path.join(src, 'desktop', 'main.js')), readOr(path.join(src, 'desktop', 'export-downloads.js')), readOr(path.join(src, 'server.js')));
    let readmeVariant = null;
    for (const [lang, to] of [['zh-CN', '先看我-使用说明.txt'], ['en', 'README-first.txt']]) {
      let r; try { r = Readme.render(Readme.read(lang), { lang, buildId, urlHidden, copyGone }); } catch (e) { fail(e.message); }
      fs.writeFileSync(path.join(appDir, to), r.text, 'utf8');
      readmeVariant = r.variant;
    }

    // a private package: the one-time seed (desktop/agent-seed.js)
    const AgentSeed = require('./agent-seed.js');
    if (seed) fs.writeFileSync(path.join(appDir, 'resources', AgentSeed.SEED_NAME), AgentSeed.seedText({ model: seed.model, apiKey: seed.key }));

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
    // the key is in the seed and nowhere else; an ordinary package has no seed
    if (seed) { const holding = filesHolding(appDir, all, seed.key); if (JSON.stringify(holding) !== JSON.stringify(['resources/' + AgentSeed.SEED_NAME])) fail('the key is in ' + holding.length + ' files of the package, not only the seed'); }
    else if (all.includes('resources/' + AgentSeed.SEED_NAME)) fail('a seed in an ordinary package');

    const info = { product: 'MontClip', kind: seed ? 'private test build for one streamer (not a release; holds one DeepSeek key in plain text until its first launch)' : 'internal test build (not a release)',
      ...(seed ? { privateSeed: { provider: 'deepseek', model: seed.model, file: 'resources/' + AgentSeed.SEED_NAME } } : {}), commit, tree, built: new Date().toISOString(),
      electron: electronVersion, packager: dep.version, platform: 'win32-x64',
      ffmpeg: { release: 'ffmpeg-lgpl-n9.0.2-montclip1', version: source.version, archiveSha256: source.sha256, files: source.files },
      appFiles: all.filter((f) => f.startsWith('resources/app/')).length, readme: { source: JSON.parse(fs.readFileSync(path.join(src, 'desktop', 'package-readme', 'SOURCE.json'), 'utf8')).sha256, variant: readmeVariant, urlButtonHidden: urlHidden, exportCopyGone: copyGone }, notIncluded: ['openh264 (H.264 encoding uses the system: Media Foundation or the graphics card)', 'local speech recognition models', 'ffplay'] };
    fs.writeFileSync(path.join(appDir, 'BUILD-INFO.json'), JSON.stringify(info, null, 2));

    // zip + sha256
    fs.mkdirSync(out, { recursive: true });
    const top = `MontClip-${seed ? 'private' : 'internal'}-win-x64${full ? '-full' : ''}-${buildId}`, zipName = top + '.zip', zip = path.join(out, zipName);
    if (fs.existsSync(zip)) fail(zipName + ' already exists in ' + out);
    fs.renameSync(appDir, path.join(path.dirname(appDir), top));
    // entries named with '/' and UTF-8 (desktop/zip-dir.cjs); a failed zip is removed, never left half-written
    try { require('./zip-dir.cjs').zipDir(path.join(path.dirname(appDir), top), zip); } catch (e) { fail(e.message); }
    // every file of the package is in the zip: the files listed above, and BUILD-INFO.json
    { const n = require('./zip-entries.cjs').zipEntries(zip).length; if (n !== all.length + 1) { fs.rmSync(zip, { force: true }); fail(`the zip holds ${n} entries, the package ${all.length + 1} files`); } }
    const zsha = sha(zip), size = fs.statSync(zip).size;
    const sums = path.join(out, 'SHA256SUMS.txt'), line = `${zsha}  ${zipName}\n`;
    fs.appendFileSync(sums, line);
    const unpacked = all.reduce((s, f) => s + fs.statSync(path.join(path.dirname(appDir), top, f)).size, 0);
    process.stdout.write('MONTCLIP_PACKAGE ' + JSON.stringify({ zip: zipName, sha256: zsha, bytes: size, unpackedBytes: unpacked, files: all.length, commit, tree, private: !!seed,
      ffmpegExe: source.files['ffmpeg.exe'], ffprobeExe: source.files['ffprobe.exe'], electronZipDir: zipDir ? 'given' : 'downloaded' }) + '\n');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { ROOT_FILES, ROOT_DIRS, ROOT_EXTRA, desktopFiles, repoReads, packagedFiles, privateSeed, filesHolding };
