'use strict';
// QQ, review of #28 (2026-11-02): libopenh264 is never an encoder MontClip chooses, whatever
// the build lists; and the path of a local FFmpeg is masked before it reaches the page or a log.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Delivery=require('../delivery'),X=require('../external-ffmpeg');
const ROOT=path.join(__dirname,'..'),server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');

test('libopenh264 is on the never-use list',()=>{
 a.ok(Array.isArray(Delivery.NEVER_ENCODERS)&&Delivery.NEVER_ENCODERS.includes('libopenh264'));
 for(const c of Object.keys(Delivery.CODECS))for(const e of Delivery.NEVER_ENCODERS)a.ok(!Delivery.CODECS[c].encoders.includes(e),`${c} never lists ${e}`);
});

test('a build that lists libopenh264 never gets it chosen, for any preset, codec or requested encoder',()=>{
 const builds=[['libopenh264'],['libopenh264','h264_mf'],['libopenh264','h264_nvenc','h264_mf'],['libopenh264','libx264']];
 for(const b of builds){
  const available=new Set(b);
  a.ok(!Delivery.encodersFor('h264',available).includes('libopenh264'),b.join(','));
  for(const preset of Delivery.PRESET_IDS)for(const encoder of [undefined,'libopenh264']){
   const r=Delivery.normalize({preset,video:encoder?{codec:'h264',encoder}:undefined},{available});
   a.notEqual(r.spec.video.encoder,'libopenh264',`${preset} on ${b.join(',')} asked ${encoder}`);
  }
 }
 // asking for it by name says so
 const asked=Delivery.normalize({preset:'youtube',video:{encoder:'libopenh264'}},{available:new Set(['libopenh264','h264_mf'])});
 a.equal(asked.spec.video.encoder,'h264_mf');a.ok(asked.notes.some(n=>/libopenh264/.test(n)),asked.notes.join('; '));
 // with nothing else, the export fails with "no H.264 encoder" rather than falling back to it
 const only=Delivery.normalize({preset:'youtube'},{available:new Set(['libopenh264'])});
 a.notEqual(only.spec.video.encoder,'libopenh264');a.ok(only.notes.some(n=>/no H\.264 encoder/.test(n)));
});

test('raw encoding-profile args naming libopenh264 are refused',()=>{
 a.equal(Delivery.forbiddenEncoder(['-c:v','libopenh264','-b:v','4M']),'libopenh264');
 a.equal(Delivery.forbiddenEncoder(['-vcodec','libopenh264']),'libopenh264');
 a.equal(Delivery.forbiddenEncoder(['-codec:v','libopenh264']),'libopenh264');
 a.equal(Delivery.forbiddenEncoder(['-c:v','h264_mf']),null);
 const at=server.indexOf('const profile = resolveProfile(profileId);');a.ok(at>0);
 a.match(server.slice(at,at+600),/Delivery\.forbiddenEncoder\(profile\.args\)/,'the export refuses such a profile before running it');
 // and the delivery-spec path refuses it too, in the ffmpeg args it would build
 const spec=Delivery.normalize({preset:'youtube'},{available:new Set(['h264_mf'])}).spec;spec.video.encoder='libopenh264';
 a.throws(()=>Delivery.ffmpegArgs(spec,{fps:30,input:'jpeg',canvasW:640,canvasH:360,frame:Delivery.reframe(spec,640,360),outPath:'o.mp4'}),/libopenh264/);
});

test('user folders in a path are masked',()=>{
 const m=X.maskUserPath;
 a.equal(m('C:\\Users\\Ada Lovelace\\ffmpeg\\bin\\ffmpeg.exe'),'%USERPROFILE%\\ffmpeg\\bin\\ffmpeg.exe');
 a.equal(m('c:\\users\\ada\\x.exe'),'%USERPROFILE%\\x.exe');
 a.equal(m('C:/Users/ada/tools/ffmpeg.exe'),'%USERPROFILE%/tools/ffmpeg.exe');
 a.equal(m('There is no file at C:\\Users\\ada\\f.exe any more.'),'There is no file at %USERPROFILE%\\f.exe any more.');
 a.equal(m('/home/ada/bin/ffmpeg'),'~/bin/ffmpeg');
 a.equal(m('/Users/ada/bin/ffmpeg'),'~/bin/ffmpeg');
 a.equal(m('D:\\tools\\ffmpeg.exe'),'D:\\tools\\ffmpeg.exe');
 a.equal(m('C:\\Users\\Public\\ffmpeg.exe'),'C:\\Users\\Public\\ffmpeg.exe','shared folders carry no name');
 const home=os.homedir();a.ok(!m(path.join(home,'ffmpeg.exe')).includes(path.basename(home)),'the real home folder is masked');
 a.equal(m(null),null);
});

test('reasons and paths from the local FFmpeg check carry no user name',async t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-mask-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const fake='C:\\Users\\Ada Lovelace\\ffmpeg.exe';
 const missing=await X.check(process.platform==='win32'?fake:'/home/ada/ffmpeg',{run:async()=>({code:0,stdout:''})});
 a.equal(missing.ok,false);a.ok(!/Ada|ada/.test(missing.reason),missing.reason);
 a.ok(!/Ada|ada/.test(JSON.stringify(X.forPage(missing))),'what the page gets');
 const exe=path.join(d,'ffmpeg.exe');fs.writeFileSync(exe,'x');
 const ok=await X.check(exe,{run:async(f,args)=>({code:0,stdout:args.includes('-version')?'ffmpeg version 7':' V....D libx264  H.264'})});
 a.equal(ok.ok,true);a.equal(ok.path,exe,'the main process keeps the real path to run it');
 a.equal(X.forPage(ok).path,X.maskUserPath(exe));a.ok(!('version' in X.forPage(ok))||!/Users\\[^%]/.test(X.forPage(ok).version));
});

test('desktop and server hand the page masked results only',()=>{
 const main=fs.readFileSync(path.join(ROOT,'desktop/main.js'),'utf8');
 for(const op of ['get','choose']){const at=main.indexOf('ipcMain.handle("montclip:ffmpeg:'+op+'"');const body=main.slice(at,main.indexOf('ipcMain.handle(',at+10));a.match(body,/External\.forPage\(/,op+' masks what it returns');}
 // every reason the server forwards from the local check is masked
 const shown=server.match(/[\w.(]*ext\.reason\)?(?!\s*[!=]==)/g)||[];a.ok(shown.length>=2);
 for(const u of shown)a.equal(u,'X.maskUserPath(ext.reason)','a forwarded reason is masked: '+u);
});

test('ffmpeg refusals forwarded to the page are masked (dry-run output paths sit in the user temp folder)',()=>{
 a.match(server,/rejected these settings \(\$\{Delivery\.describe\(o\.spec\)\}\): \$\{X\.maskUserPath\(why\)/);
 a.match(server,/was rejected by ffmpeg: \$\{X\.maskUserPath\(dry\.error\)\}/);
 a.equal(require('../external-ffmpeg').maskUserPath('Could not open C:\\Users\\ada\\AppData\\Local\\Temp\\fablecut-dry-1\\probe0.mp4'),'Could not open %USERPROFILE%\\AppData\\Local\\Temp\\fablecut-dry-1\\probe0.mp4');
});
