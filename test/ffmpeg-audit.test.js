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
