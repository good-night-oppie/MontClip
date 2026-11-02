'use strict';
// Deja 2026-11-02 on #28 0744468: openh264 must not ship. A bundled build that links libopenh264
// fails release-check (no longer a warning); every BtbN variant links it, so a manifest still
// pointing at BtbN fails too until our own --disable-libopenh264 build replaces it.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const audit=require('../desktop/ffmpeg-audit');

test('a build that links libopenh264 is a release blocker',()=>{
 const conf='configuration: --prefix=/ffbuild/prefix --enable-version3 --enable-libdav1d --enable-libopenh264 --enable-libvpx';
 a.deepEqual(audit.auditBuild({configuration:conf,encoders:''}).map(p=>p.code),['OPENH264']);
 a.deepEqual(audit.auditBuild({configuration:'configuration: --disable-libopenh264',encoders:' V....D libopenh264           OpenH264 H.264'}).map(p=>p.code),['OPENH264'],'an encoder named libopenh264 counts too');
 a.deepEqual(audit.auditBuild({configuration:'configuration: --enable-version3 --disable-libopenh264',encoders:' V....D h264_mf  H264 via MediaFoundation'}),[]);
});
test('GPL or non-free components stay blockers',()=>{
 for(const c of ['--enable-gpl','--enable-nonfree','--enable-libx264','--enable-libx265'])a.deepEqual(audit.auditBuild({configuration:'configuration: '+c,encoders:''}).map(p=>p.code),['GPL'],c);
 a.deepEqual(audit.auditBuild({configuration:'',encoders:''}).map(p=>p.code),['NO_CONFIGURATION']);
});
test('a manifest still on a BtbN release is a blocker: every BtbN variant links openh264',()=>{
 const man=JSON.parse(fs.readFileSync(path.join(__dirname,'..','desktop','ffmpeg-manifest.json'),'utf8'));
 const btbn={...man,builds:{'win32-x64':{url:'https://github.com/BtbN/FFmpeg-Builds/releases/download/x/ffmpeg-win64-lgpl-9.0.zip',sha256:'0'.repeat(64)}}};
 a.ok(audit.auditManifest(btbn).some(p=>p.code==='OPENH264_SOURCE'));
 const ours={...man,openh264:false,builds:{'win32-x64':{url:'https://github.com/good-night-oppie/MontClip/releases/download/ffmpeg-n9.0.2-lgpl-noh264/x.zip',sha256:'0'.repeat(64)}}};
 a.ok(!audit.auditManifest(ours).some(p=>p.code==='OPENH264_SOURCE'));
 a.ok(audit.auditManifest({...ours,openh264:undefined}).some(p=>p.code==='OPENH264_UNDECLARED'),'the manifest must say openh264:false');
});
test('release-check fails on these instead of warning',()=>{
 const rc=fs.readFileSync(path.join(__dirname,'..','.github','scripts','release-check.js'),'utf8');
 a.ok(!/::warning::[^\n]*openh264/.test(rc),'no openh264 warning left');
 a.match(rc,/require\("\.\.\/\.\.\/desktop\/ffmpeg-audit"\)/);
 a.match(rc,/auditBuild\(/);a.match(rc,/auditManifest\(/);
});
test('no test looks for ffmpeg or ffprobe on PATH',()=>{
 const dir=__dirname;
 for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')&&f!=='ffmpeg-audit.test.js')){const s=fs.readFileSync(path.join(dir,f),'utf8');
  a.ok(!/(execFileSync|spawnSync|spawn|execFile)\(\s*["'](ffmpeg|ffprobe)["']/.test(s),f+' runs ffmpeg/ffprobe from PATH');
  a.ok(!/not on PATH/.test(s),f+' still says "not on PATH"');}
});
test('CI runs for every PR, draft included, whatever branch it targets; the FFmpeg build is manual',()=>{
 const ci=fs.readFileSync(path.join(__dirname,'..','.github','workflows','ci.yml'),'utf8');
 const on=ci.slice(ci.indexOf('\non:'),ci.indexOf('\njobs:'));
 a.match(on,/pull_request:\n    types: \[opened, synchronize, reopened, ready_for_review\]/);a.ok(!/pull_request:\n    branches:/.test(on),'no base-branch filter');a.match(on,/workflow_dispatch:/);
 const b=fs.readFileSync(path.join(__dirname,'..','.github','workflows','build-ffmpeg.yml'),'utf8');
 a.match(b,/BTBN_COMMIT: 5ece62897c650b863c1ddda7b6964845344aef2d/);a.match(b,/verify-build\.cjs/);a.ok(!/pull_request/.test(b),'never on every PR');
 // every input pinned: BtbN's build image by digest (no :latest), FFmpeg by the manifest's commit
 const images=b.match(/image: ghcr\.io\/btbn\/ffmpeg-builds\/(win64|linux64)-lgpl-9\.0@sha256:[0-9a-f]{64}/g)||[];a.equal(images.length,2,'both images pinned by digest');
 a.ok(!/ffmpeg-builds\/[\w.-]+:latest"?\s*$/m.test(b.replace(/docker tag[^\n]*/g,'')),'never pulls :latest');
 const manifest=require('../desktop/ffmpeg-manifest.json');const short=manifest.source.split('/').pop();
 const commit=(b.match(/FFMPEG_COMMIT: ([0-9a-f]{40})/)||[])[1];a.ok(commit&&commit.startsWith(short),'FFmpeg is the manifest\'s commit');
 a.match(b,/case "\$a" in \*n9\.0\.2-42-gd7643a0fe3\*\)/);a.ok(b.includes(manifest.version),'the artifact must carry the manifest version');
 a.match(b,/FF_CONFIGURE="\\\$\{FF_CONFIGURE\/\/--enable-libopenh264\/--disable-libopenh264\}"/);a.match(b,/\*--enable-libopenh264\*\) exit 1/);
 a.ok(!/makeimage\.sh/.test(b),'the toolchain image is not rebuilt from gnu.org sources');
});
test('the H.264 tests run on a Windows CI job (h264_mf), not only on machines with a graphics card',()=>{
 const ci=fs.readFileSync(path.join(__dirname,'..','.github','workflows','ci.yml'),'utf8');
 a.match(ci,/test-windows:\n[\s\S]*?runs-on: windows-latest[\s\S]*?--platform win32-x64[\s\S]*?node --test/);
});
test('every library in the build has its license text collected and classified, version by version',()=>{
 const inv=path.join(__dirname,'..','licenses','ffmpeg','inventory.json');a.ok(fs.existsSync(inv),'licenses/ffmpeg/inventory.json');
 const list=JSON.parse(fs.readFileSync(inv,'utf8'));a.ok(list.length>=100,'whole build, not a sample: '+list.length);
 a.ok(!list.some(e=>/openh264/.test(e.repo)),'openh264 is not in our build');
 for(const e of list){a.match(e.ref,/\S/,e.name+' pinned');for(const f of e.files)a.ok(fs.existsSync(path.join(path.dirname(inv),'texts',f.saved)),f.saved);}
 // what is still missing or unclassified is a release blocker, reported by name
 const problems=audit.auditLicenses(list);
 for(const p of problems)a.match(p.code,/^(LICENSE_MISSING|LICENSE_UNCLASSIFIED)$/);
 a.deepEqual(audit.auditLicenses([{name:'x',ref:'1',files:[{saved:'a'}],kinds:['MIT']}]),[]);
 a.deepEqual(audit.auditLicenses([{name:'x',ref:'1',files:[],kinds:[]}]).map(p=>p.code),['LICENSE_MISSING']);
 a.deepEqual(audit.auditLicenses([{name:'x',ref:'1',files:[{saved:'a'}],kinds:['?']}]).map(p=>p.code),['LICENSE_UNCLASSIFIED']);
 a.deepEqual(audit.auditLicenses([{name:'x',ref:'1',files:[{saved:'a'}],kinds:['?'],reviewed:'MIT (read by hand)'}]),[],'a hand review settles it');
 a.match(fs.readFileSync(path.join(__dirname,'..','.github','scripts','release-check.js'),'utf8'),/auditLicenses\(/);
});
test('every licence text is stored byte for byte (its SHA-256 matches the inventory)',()=>{
 const base=path.join(__dirname,'..','licenses','ffmpeg'),list=JSON.parse(fs.readFileSync(path.join(base,'inventory.json'),'utf8'));
 const crypto=require('node:crypto');
 for(const e of list)for(const f of e.files)a.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'texts',f.saved),'utf8')).digest('hex'),f.sha256,f.saved);
 a.match(fs.readFileSync(path.join(__dirname,'..','.gitattributes'),'utf8'),/licenses\/ffmpeg\/texts\/\*\* -text/);
});

test('a win64 ffmpeg.exe: "--disable-libopenh264" in its configure string is not openh264; the encoder or its entry points are',()=>{
 const {scanExe}=require('../desktop/ffmpeg-audit');
 const cfg='--prefix=/ffbuild/prefix --enable-version3 --disable-libopenh264 --enable-libdav1d';
 const exe=(...parts)=>Buffer.concat(parts.map(p=>Buffer.from(p+'\0','latin1')));
 // FFmpeg embeds its configure line once per library: several copies
 a.deepEqual(scanExe(exe('MZ',cfg,'x',cfg,cfg,'h264_mf')),[]);
 a.deepEqual(scanExe(exe('MZ',cfg,'libopenh264','OpenH264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10')),['libopenh264','OpenH264 H.264']);
 a.deepEqual(scanExe(exe('MZ',cfg,'WelsCreateSVCEncoder')),['WelsCreateSVCEncoder']);
 const enabled=cfg.replace('--disable-libopenh264','--enable-libopenh264');
 a.deepEqual(scanExe(exe('MZ',enabled)),['libopenh264'],'an enabled flag is not hidden');
 const v=fs.readFileSync(path.join(__dirname,'..','desktop','ffmpeg-build','verify-build.cjs'),'utf8');a.match(v,/scanExe\(buf\)/);a.ok(!/buf\.includes\(needle\)/.test(v));
});

test('libiconv: its texts at the pinned commit, fetched from a mirror by commit hash, LGPL for the library', () => {
 const inv = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'licenses', 'ffmpeg', 'inventory.json'), 'utf8'));
 const e = inv.find((x) => x.name === 'libiconv');
 a.equal(e.ref, 'b5a1735e02bf43ee6e490fcf9395e8abc8d32432');
 a.deepEqual(e.files.map((f) => f.file).sort(), ['COPYING', 'COPYING.LIB', 'README']);
 a.match(e.fetchedFrom, /^https:\/\/github\.com\/GitMirroring\/libiconv/);
 a.match(e.reviewed, /LGPL-2\.1/);a.match(e.reviewed, /iconv program/);
 for (const f of e.files) {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'licenses', 'ffmpeg', 'texts', f.saved));
  a.equal(require('node:crypto').createHash('sha256').update(buf).digest('hex'), f.sha256, f.saved);
 }
 a.ok(!/Still missing \(release blocker\): \*\*libiconv/.test(fs.readFileSync(path.join(__dirname, '..', 'LICENSES.md'), 'utf8')));
});

test('QQ (2026-11-02): the build to publish is recorded in the repository; the build checkout keeps no token', () => {
 const adr = fs.readFileSync(path.join(__dirname, '..', 'docs', 'decisions', '2026-11-02-h264-encoder.md'), 'utf8');
 for (const v of ['41397853139', '34c222b793c0e396ad3178791fc082d772f0cad9',
   '67c30e30206b5bddcc2af9ea4f0215bbbcd2519533316997945a0fd9602a2f96', '69a9690a4c0eb7e7059f2141de54b4ec57100741a95a04809734c6adc9a0b8ae',
   'sha256:dd7fbc6957cff74bc49f1b606892971057366617a388a6a1ad8483d70157b0a2', 'sha256:86d5d0355c8b98ef1f9dba4cc15328a7ddcd36a6cf62f2ef5499cfc7507a424d', '2027-01-31',
   // QQ (2026-11-02): the ffmpeg.exe inside the win64 archive, the binary MontClip runs
   '393413629e4cd237ab6c18c2e0724fd4d7d4cdd41a94f0bea6c393a1f8768fee'])
  a.ok(adr.includes(v), 'ADR records ' + v);
 const b = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build-ffmpeg.yml'), 'utf8');
 a.match(b, /uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+persist-credentials: false/);
});

test('the manifest points at our own build without openh264: release assets of this repository, the SHA-256 the ADR records', () => {
 const man = require('../desktop/ffmpeg-manifest.json'), {auditManifest} = require('../desktop/ffmpeg-audit');
 const adr = fs.readFileSync(path.join(__dirname, '..', 'docs', 'decisions', '2026-11-02-h264-encoder.md'), 'utf8');
 a.equal(man.openh264, false);
 a.deepEqual(auditManifest(man), []);
 const want = { 'win32-x64': ['win64', 'zip', '67c30e30206b5bddcc2af9ea4f0215bbbcd2519533316997945a0fd9602a2f96'],
   'linux-x64': ['linux64', 'tar.xz', '69a9690a4c0eb7e7059f2141de54b4ec57100741a95a04809734c6adc9a0b8ae'] };
 for (const [plat, [t, ext, sha]] of Object.entries(want)) {
  const b = man.builds[plat], file = `ffmpeg-n9.0.2-42-gd7643a0fe3-${t}-lgpl-9.0.${ext}`;
  a.equal(b.url, 'https://github.com/good-night-oppie/MontClip/releases/download/ffmpeg-n9.0.2-42-noh264/' + file, plat);
  a.equal(b.sha256, sha, plat); a.ok(adr.includes(sha), plat + ': the ADR records this SHA-256');
  a.equal(b.root, file.replace(/\.(zip|tar\.xz)$/, ''), plat);
 }
 a.match(man.builder, /41397853139/); a.match(man.builder, /disable-libopenh264/);
});
