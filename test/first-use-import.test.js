'use strict';
// First use (Deja's D, 2026-11-04, after VV's walk on europa): the 〔✨ 自动出切片〕 dialog said 「先用「+ 导入」导入」 with no
// import button in it; a project with one recording still had it unticked; and an MP4 import left the bin empty
// (「把视频拖到这里」) for the ~7 minutes the copy and the faststart tidy took. Now the dialog has 〔+ 导入录像〕, a lone
// recording is ticked, and the bin shows 「正在导入… n%」 for the file until it is in.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const http=require('node:http'),{execFileSync}=require('node:child_process');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const V=require('../shared/ui-preferences'),M=require('../shared/media-lib'),FF=require('../server/ffmpeg-path');
const zh=(k,v)=>V.t('zh-CN','own.'+k,v),en=(k,v)=>V.t('en','own.'+k,v);
const fnBody=(src,name)=>{const i=src.indexOf('function '+name+'(');a.ok(i>=0,name);return src.slice(i,src.indexOf('\n}',i)+2);};

test('the new words, in both languages',()=>{
 a.equal(zh('as-import'),'+ 导入录像');a.equal(en('as-import'),'+ Import recording');
 a.equal(zh('bin-importing',{pct:42}),'正在导入… 42%');a.equal(en('bin-importing',{pct:42}),'Importing… 42%');
 for(const k of ['as-import','bin-importing','as-no-recs']){a.equal(zh(k,{pct:1}).match(/[A-Za-z]{2,}/),null,k);a.ok(!/[一-鿿]/.test(en(k,{pct:1}).replace(/[「」]/g,'')),k);}
 a.match(zh('as-no-recs'),/「\+ 导入录像」/,'the empty list points at the button that is now right there');
});

test('the dialog has 〔+ 导入录像〕, running the same import as the main 〔+ 导入〕, and draws itself again after it',()=>{
 const app=read('app/app.js'),start=fnBody(app,'autoStartHtml');
 a.match(start,/data-as-act="import"/);a.match(start,/autoSay\("as-import"\)/);
 const click=fnBody(app,'autoClick');
 a.match(click,/act === "import"\) \{ openFileImport\(\); return; \}/,'the shared #fileInput, so it is the same import');
 const imp=fnBody(app,'importFiles');
 a.match(imp,/autoAfterImport\(\)/,'the dialog hears about the new recording');
 const after=fnBody(app,'autoAfterImport');
 a.match(after,/AUTO\.el && AUTO\.el\.open/);a.match(after,/autoRender\("start"\)/);
});

test('one recording in the project: it is ticked, once (unticking it again sticks)',()=>{
 const app=read('app/app.js'),start=fnBody(app,'autoStartHtml');
 a.match(start,/recs\.length === 1 && st\.soloTicked !== recs\[0\]\.id/);
 // run the rule itself on a state that was made before any recording existed (VV: dialog opened first, then imported)
 const rule=start.slice(start.indexOf('if (recs.length === 1'),start.indexOf('\n',start.indexOf('if (recs.length === 1')));
 const run=(st,recs)=>vm.runInNewContext(rule,{st,recs});
 const st={picked:new Set()};run(st,[{id:'m_1'}]);a.deepEqual([...st.picked],['m_1']);
 st.picked.delete('m_1');run(st,[{id:'m_1'}]);a.equal(st.picked.size,0,'the streamer unticked it: it stays unticked');
 const two={picked:new Set()};run(two,[{id:'m_1'},{id:'m_2'}]);a.equal(two.picked.size,0,'two recordings: she picks');
 // seeded on first open (the lone recording already ticked), then unticked: it stays unticked
 const seeded={picked:new Set(['m_1'])};run(seeded,[{id:'m_1'}]);seeded.picked.delete('m_1');run(seeded,[{id:'m_1'}]);a.equal(seeded.picked.size,0);
});

test('how far an import is: the copy, then the faststart tidy for MP4 / MOV / M4V',()=>{
 a.equal(M.importTidies('a.mp4'),true);a.equal(M.importTidies('b.MOV'),true);a.equal(M.importTidies('c.m4v'),true);
 a.equal(M.importTidies('d.mkv'),false);a.equal(M.importTidies('e.flv'),false);
 a.equal(M.importPercent({sent:0.5,tidy:0,tidies:true}),25);a.equal(M.importPercent({sent:1,tidy:0.5,tidies:true}),75);
 a.equal(M.importPercent({sent:0.5,tidies:false}),50);
 a.equal(M.importPercent({sent:1,tidy:1,tidies:true}),99,'100% only once the file is in the bin');
 a.equal(M.importPercent({sent:NaN,tidy:-1,tidies:true}),0);
});

test('the bin shows a placeholder per file being imported, updated in place, gone when it is in or failed',()=>{
 const app=read('app/app.js'),bin=fnBody(app,'renderBin');
 a.match(bin,/\.bin-importing/,'redrawn with the bin');a.match(bin,/IMPORTING\.size/,'an import in progress is not 「把视频拖到这里」');
 a.match(fnBody(app,'importingHtml'),/uiText\("own\.bin-importing", \{ pct/);
 const imp=fnBody(app,'importFiles');
 a.match(imp,/importingStart\(file\.name\)/);a.match(imp,/finally \{ importingEnd\(ticket\); \}/);
 a.match(imp,/uploadWithProgress\(file, ticket/);
 const up=fnBody(app,'uploadWithProgress');a.match(up,/new XMLHttpRequest\(\)/);a.match(up,/xhr\.upload\.onprogress/);a.match(up,/&ticket=/);
 a.match(app,/es\.addEventListener\("upload", \(e\) => onUploadEvent\(e\.data\)\)/);
 a.match(fnBody(app,'autoStartHtml'),/importingHtml\(/,'the dialog shows the import too (it covers the bin)');
});

test('maybeFaststart reports how much of the tidied copy is written, ending at 1',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-faststart-progress-')),file=path.join(dir,'clip.mp4');
 fs.writeFileSync(file,Buffer.alloc(4000,1));
 const mod={exports:{}};
 const proc={spawnSync:()=>({status:0}),execFile(_cmd,args,_opts,cb){const out=args.at(-1);fs.writeFileSync(out,Buffer.alloc(1000,2),{flag:'wx'});
  setTimeout(()=>{fs.appendFileSync(out,Buffer.alloc(3000,2));cb(null);},700);}};
 const ffp={...require('../server/ffmpeg-path'),available:()=>true};
 try{
  vm.runInNewContext(read('server/import-url.js'),{module:mod,exports:mod.exports,require:id=>id==='child_process'?proc:id==='./ffmpeg-path'?ffp:id==='./delivery'?require('../shared/delivery'):require(id),URL,Buffer,setTimeout,clearTimeout,setInterval,clearInterval});
  const seen=[];const r=await mod.exports.maybeFaststart(file,{onProgress:f=>seen.push(f)});
  a.equal(r.optimized,true);a.ok(seen.length>=2,'during and at the end: '+seen);a.equal(seen.at(-1),1);
  a.ok(seen.slice(0,-1).every(f=>f>0&&f<1),'while writing: a fraction '+seen);
  a.deepEqual(fs.readdirSync(dir),['clip.mp4']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// The real thing, where an FFmpeg is there (CI's Linux, or MONTCLIP_FFMPEG): a synthetic MP4 from lavfi uploaded with a
// ticket, and the server's "upload" events for that ticket.
const ffmpegOk=FF.available('ffmpeg');
test('POST /api/upload with a ticket sends the tidy progress for that ticket over SSE',{skip:!ffmpegOk&&'no FFmpeg here'},async(t)=>{
 const {makeDataDir,startServer}=require('./helpers');
 const dir=makeDataDir(t),src=path.join(dir,'lavfi.mp4');
 execFileSync(FF.path('ffmpeg'),['-v','error','-f','lavfi','-i','testsrc=size=320x180:rate=30:duration=2','-f','lavfi','-i','sine=frequency=440:duration=2',
  '-c:v','mpeg4','-c:a','aac','-shortest',src],{windowsHide:true});
 const {port}=await startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1'});
 const events=[];let sse;
 await new Promise((resolve)=>{sse=http.get({host:'127.0.0.1',port,path:'/api/events'},(res)=>{let buf='';res.on('error',()=>{});
  res.on('data',(c)=>{buf+=c;let i;while((i=buf.indexOf('\n\n'))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
   if(/^event: upload$/m.test(block))events.push(JSON.parse(block.match(/^data: (.*)$/m)[1]));}});resolve();});sse.on('error',()=>{});});
 t.after(()=>sse.destroy());
 const body=fs.readFileSync(src);
 const r=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/upload?name=lavfi.mp4&ticket=t_abc123',method:'POST',headers:{'Content-Length':body.length}},
  (res)=>{const parts=[];res.on('data',(c)=>parts.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(parts).toString('utf8'))}));});
  req.on('error',reject);req.end(body);});
 a.equal(r.status,200);a.match(r.body.src,/^\/media\/lavfi/);
 await new Promise((resolve)=>setTimeout(resolve,200));
 const mine=events.filter((e)=>e.ticket==='t_abc123');
 a.ok(mine.length>=1,'at least the end: '+JSON.stringify(events));a.equal(mine.at(-1).frac,1);
});

test('a ticket that is not a plain id is ignored (nothing of the request echoed into the event stream)',()=>{
 const s=read('server/server.js'),at=s.indexOf('if (p === "/api/upload" && req.method === "POST")'),route=s.slice(at,s.indexOf('return;\n  }',at));
 a.match(route,/\/\^\[A-Za-z0-9_-\]\{1,40\}\$\/\.test\(/);a.match(route,/broadcast\("upload", JSON\.stringify\(\{ ticket, frac \}\)\)/);
});
