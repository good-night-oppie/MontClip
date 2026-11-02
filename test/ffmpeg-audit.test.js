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
