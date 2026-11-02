'use strict';
// H.264 export with only an LGPL FFmpeg in the package (decision 2026-11-02, A + an
// optional local FFmpeg): hardware encoders, then Windows' own h264_mf; libx264 only
// from an FFmpeg the user picked in Settings and that passed a check. That program is
// never found on PATH and never used for preview, decoding or any other export.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Delivery=require('../delivery'),X=require('../external-ffmpeg');
const ROOT=path.join(__dirname,'..'),server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
const pick=(avail,extra={})=>Delivery.normalize({preset:'youtube',...extra},{available:new Set(avail)}).spec.video.encoder;

test('encoder order: your libx264, then hardware, then Windows h264_mf',()=>{
 a.equal(pick(['h264_nvenc','h264_qsv','h264_mf']),'h264_nvenc');
 a.equal(pick(['h264_qsv','h264_mf']),'h264_qsv');
 a.equal(pick(['h264_amf','h264_mf']),'h264_amf');
 a.equal(pick(['h264_mf']),'h264_mf');
 a.equal(pick(['libx264','h264_nvenc','h264_mf']),'libx264','a checked local FFmpeg is the one the user asked for');
 // NVENC refuses frames under 145×49: a tiny output goes to the next encoder
 a.equal(Delivery.normalize({preset:'custom',width:90,height:160},{available:new Set(['h264_nvenc','h264_mf'])}).spec.video.encoder,'h264_mf');
 const none=Delivery.normalize({preset:'youtube'},{available:new Set(['ffv1'])});
 a.ok(none.notes.some(n=>/no H\.264 encoder/.test(n)));
});

test('h264_mf gets rate control it understands',()=>{
 const args=s=>{const spec=Delivery.normalize(s,{available:new Set(['h264_mf'])}).spec;return Delivery.ffmpegArgs(spec,{fps:30,input:'jpeg',canvasW:640,canvasH:360,frame:Delivery.reframe(spec,640,360),outPath:'o.mp4'});};
 const crf=args({preset:'youtube'});a.ok(crf.includes('h264_mf'));a.deepEqual(crf.slice(crf.indexOf('-rate_control'),crf.indexOf('-rate_control')+4),['-rate_control','quality','-quality',String(Math.round((51-18)*100/51))]);
 const vbr=args({preset:'youtube',video:{rate:'vbr',bitrate:8000}});a.ok(vbr.join(' ').includes('-rate_control u_vbr'));
 const cbr=args({preset:'youtube',video:{rate:'cbr',bitrate:8000}});a.ok(cbr.join(' ').includes('-rate_control cbr'));
});

test('the local FFmpeg is only a file the user chose: no PATH, no names, no discovery',async()=>{
 for(const bad of ['ffmpeg','./ffmpeg','x264/ffmpeg.exe',''])a.equal((await X.check(bad,{run:async()=>({code:0,stdout:' V..... libx264 '})})).ok,false,bad);
 const src=fs.readFileSync(path.join(ROOT,'external-ffmpeg.js'),'utf8');
 a.ok(!/process\.env\.PATH|["']which["']|["']where(\.exe)?["']|\$PATH/.test(src),'never searches PATH');
 const ext=X.createExternal({settingsFile:null,run:async()=>{throw new Error('must not run');}});
 a.deepEqual(await ext.current(),{ok:false,reason:'none'});
});

function tmp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-x264-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
const withX264=async(file,args)=>args.includes('-encoders')?{code:0,stdout:' V....D libx264              libx264 H.264 / AVC\n'}:{code:0,stdout:'ffmpeg version 7.1-full_build\nconfiguration: --enable-gpl --enable-libx264\n'};
const withoutX264=async(file,args)=>args.includes('-encoders')?{code:0,stdout:' V....D h264_mf\n'}:{code:0,stdout:'ffmpeg version n9 lgpl\n'};

test('a program without libx264, or one that will not run, is refused with a plain reason',async t=>{
 const d=tmp(t),exe=path.join(d,'ffmpeg.exe');fs.writeFileSync(exe,'x');
 const no=await X.check(exe,{run:withoutX264});a.equal(no.ok,false);a.match(no.reason,/libx264/);
 const dead=await X.check(exe,{run:async()=>({code:1,stdout:'',error:'ENOENT'})});a.equal(dead.ok,false);a.match(dead.reason,/could not be started|did not run/);
 const yes=await X.check(exe,{run:withX264});a.equal(yes.ok,true);a.match(yes.version,/ffmpeg version/);
 const missing=await X.check(path.join(d,'nope.exe'),{run:withX264});a.equal(missing.ok,false);a.match(missing.reason,/no file/);
});

test('when the chosen file disappears the export falls back and says why',async t=>{
 const d=tmp(t),exe=path.join(d,'ffmpeg.exe'),settings=path.join(d,'external-ffmpeg.json');fs.writeFileSync(exe,'x');
 fs.writeFileSync(settings,JSON.stringify({version:1,path:exe}));
 const ext=X.createExternal({settingsFile:settings,run:withX264});
 a.deepEqual((await ext.current()).ok,true);a.equal((await ext.current()).path,exe);
 a.ok((await ext.available(new Set(['h264_mf']))).has('libx264'));
 fs.rmSync(exe);
 const now=await ext.current();a.equal(now.ok,false);a.match(now.reason,/no file/);
 const set=await ext.available(new Set(['h264_mf']));a.ok(!set.has('libx264'),'falls back to the bundled encoders');a.ok(set.has('h264_mf'));
 fs.writeFileSync(settings,'{broken');a.equal((await ext.current()).ok,false);
});

test('the local FFmpeg only ever encodes an H.264 export; preview, decoding and other exports use the bundled one',()=>{
 a.equal(X.isExternalJob(Delivery.normalize({preset:'youtube'},{available:new Set(['libx264'])}).spec),true);
 a.equal(X.isExternalJob(Delivery.normalize({preset:'youtube'},{available:new Set(['h264_mf'])}).spec),false);
 a.equal(X.isExternalJob(Delivery.normalize({preset:'archive'},{available:new Set(['libx264','ffv1'])}).spec),false);
 a.equal(X.argsUseX264(['-c:v','libx264','-crf','18']),true);a.equal(X.argsUseX264(['-c:v','ffv1']),false);
 // every place server.js starts the local program is an export encoder or its dry run
 const enclosing=idx=>{let name=null;for(const m of server.slice(0,idx).matchAll(/\n(?:async )?function (\w+)\(/g))name=m[1];return name;};
 const uses=[...server.matchAll(/externalFfmpeg\.\w+\(|(?<!function )exportBinary\(/g)].map(m=>enclosing(m.index));
 a.ok(uses.length>=4,'wired into the export paths');
 for(const f of uses)a.ok(['deliveryEncoders','exportBinary','h264Status','beginDeliveryExport','beginExport'].includes(f),'external FFmpeg used in '+f);
 for(const fn of ['frameAt','framesSheet','ffprobeJSON','measureLoudness'])if(server.includes('function '+fn)){const body=server.slice(server.indexOf('function '+fn),server.indexOf('\n}',server.indexOf('function '+fn)));a.ok(!/externalFfmpeg|exportBinary/.test(body),fn);}
 for(const f of ['proxy.js','denoise.js','analyze.js','media-probe.js','import-url.js','mcp-server.js'])a.ok(!/external-ffmpeg|externalFfmpeg/.test(fs.readFileSync(path.join(ROOT,f),'utf8')),f);
});

test('no H.264 encoder at all: a plain reason, and Windows N is pointed at the Media Feature Pack',()=>{
 a.match(X.noH264Reason({platform:'win32',mediaFoundation:false}),/Media Feature Pack/);
 const w=X.noH264Reason({platform:'win32',mediaFoundation:true});a.ok(!/Media Feature Pack/.test(w));a.match(w,/H\.264/);
 a.match(X.noH264Reason({platform:'linux'}),/H\.264/);
});

test('server: without a local FFmpeg, libx264 profiles are refused in plain words and the H.264 status says what is used',async t=>{
 const {makeDataDir,seedProject,startServer}=require('./helpers');
 if(!require('../ffmpeg-path').available('ffmpeg'))return t.skip('bundled ffmpeg not installed');
 const dir=makeDataDir(t,seedProject({revision:1}));
 const {base}=await startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1',MONTCLIP_EXTERNAL_FFMPEG_SETTINGS:path.join(dir,'no-setting.json')});
 const st=await (await fetch(base+'/api/export/h264')).json();
 a.deepEqual(st.external,{ok:false,reason:'none'});a.ok(!st.encoders.includes('libx264'));
 if(st.encoder)a.equal(st.reason,null);else a.match(st.reason,/H\.264/);
 const r=await fetch(base+'/api/export/begin',{method:'POST',body:JSON.stringify({fps:30,name:'x',profile:'draft',hasAudio:false})});
 a.equal(r.status,400);a.match((await r.json()).error,/libx264 is only available from your own FFmpeg/);
});

test('desktop: the path comes only from the main-process file dialog and is stored by the main process',()=>{
 const main=fs.readFileSync(path.join(ROOT,'desktop/main.js'),'utf8'),preload=fs.readFileSync(path.join(ROOT,'desktop/view-preload.js'),'utf8'),app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 a.match(preload,/montclipExternalFfmpeg/);
 for(const op of ['get','choose','clear'])a.ok(preload.includes(op+":()=>ipcRenderer.invoke('montclip:ffmpeg:"+op+"')"),'no argument reaches '+op);
 a.ok(!/montclip:ffmpeg:set/.test(main+preload),'no channel takes a path from the page');
 for(const op of ['get','choose','clear']){const at=main.indexOf('ipcMain.handle("montclip:ffmpeg:'+op+'"');a.ok(at>=0,op);a.ok(main.slice(at,at+200).includes('settingsAllowed(event, win, origin)'),op+' is guarded');}
 a.ok(main.includes('dialog.showOpenDialog(win, {')&&main.includes('properties: ["openFile"]'),'file dialog only');
 a.match(main,/MONTCLIP_EXTERNAL_FFMPEG_SETTINGS/);
 a.match(app,/montclipExternalFfmpeg/);a.match(app,/\/api\/export\/h264/);
 const ui=require('../ui-preferences').text;for(const l of ['zh-CN','en'])for(const k of ['h264Title','h264Choose','h264Clear','h264Using','h264None','h264External'])a.ok(ui[l][k],l+' '+k);
});
