'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {makeDataDir,seedProject,startMcp}=require('./helpers');
test('failed jobs: direct, durable receipt and old replay all keep errors private',async t=>{
 const dir=path.join(makeDataDir(t),'Users','someone','data');
 fs.mkdirSync(path.join(dir,'media'),{recursive:true});
 const project=seedProject({media:[{id:'m',src:'/media/a.wav',kind:'audio',duration:60}],clips:[]});
 fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(project));fs.writeFileSync(path.join(dir,'media','a.wav'),'synthetic');
 let error='',submitted=0;
 const server=http.createServer((req,res)=>{
  req.resume();res.setHeader('Content-Type','application/json');
  let out={};
  if(req.url==='/api/project')out=project;
  else if(req.url==='/api/transcript/status')out={status:{'/media/a.wav':false}};
  else if(req.url==='/api/transcribe/request'){submitted++;out={id:'failure-job',status:'running'};}
  else if(req.url.includes('export-check'))out={id:'export-check',status:'done',src:'/exports/a.mp4',result:{outputs:[{ok:true,file:'a.mp4',report:{ok:false,line:'could not check '+path.join(dir,'private.bin')}}]}};
  else if(req.url.startsWith('/api/export/job'))out={id:'failure-job',status:'failed',error};
  res.end(JSON.stringify(out));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const env={FABLECUT_PORT:String(server.address().port)};
 let mcp=startMcp(t,dir,env);
 const shapes=[String.raw`C:\Users\someone\video.mp4`,String.raw`\\NAS-01\streamers\Someone\live.mkv`,'/home/someone/live.mkv',String.raw`C:\Users\Someone Else\Desktop\replay.mp4`,'analysis/transcripts/relative.json'];
 const privateFree=x=>a.doesNotMatch(JSON.stringify(x),/Users[\\/]|someone|NAS-01|streamers|Someone Else/i);
 let file,last;
 for(const [i,p] of shapes.entries()){
  error="decode failed: cannot open '"+p+"' (ENOENT); tried fallback "+p+".bak";
  const args={mediaIds:['m'],timeout:30+i};
  const direct=await mcp.callTool('fablecut_transcribe',args);
  const result=JSON.parse((await mcp.callTool('fablecut_transcribe',{...args,wait_ms:5000})).text);
  a.equal(direct.text,'Error: '+result.error);a.equal(result.status,'failed');privateFree({direct,result});
  a.match(result.error,/decode failed: cannot open/);
  if(i===4)a.ok(result.error.includes(p));
  file=path.join(dir,'analysis','tool-tasks',result.taskId+'.json');last=result;
  privateFree(JSON.parse(fs.readFileSync(file,'utf8')));
  const replay=JSON.parse((await mcp.callTool('fablecut_transcribe',{taskId:result.taskId,wait_ms:0})).text);
  a.deepEqual(replay,result);
 }
 const exported=await mcp.callTool('fablecut_export',{job:'export-check'});
 a.match(exported.text,/CHECK: could not check …\/private.bin/);
 privateFree(exported.text.split('CHECK: ')[1]);
 await new Promise(resolve=>{mcp.child.once('exit',resolve);mcp.child.stdin.end();});
 const old=JSON.parse(fs.readFileSync(file,'utf8'));
 old.error='legacy error at '+path.join(dir,'private.bin');old.saved=[path.join(dir,'analysis','transcripts','kept.json')];old.code='ASR_CANCELLED';
 delete old.privacyVersion;
 fs.writeFileSync(file,JSON.stringify(old));
 const before=submitted;mcp=startMcp(t,dir,env);
 const replay=JSON.parse((await mcp.callTool('fablecut_transcribe',{taskId:last.taskId,wait_ms:0})).text);
 privateFree(replay);a.equal(replay.code,'ASR_CANCELLED');a.deepEqual(replay.saved,['analysis/transcripts/kept.json']);
 privateFree(JSON.parse(fs.readFileSync(file,'utf8')));a.equal(submitted,before,'no repeated mutation');
 await new Promise(resolve=>{mcp.child.once('exit',resolve);mcp.child.stdin.end();});
 // An old successful envelope can still contain an error/warning string.
 old.status='complete';delete old.error;delete old.saved;delete old.code;delete old.privacyVersion;
 old.result='Export job failed: '+path.join(dir,'private.bin')+'; source /media/a.wav';
 fs.writeFileSync(file,JSON.stringify(old));mcp=startMcp(t,dir,env);
 const legacy=JSON.parse((await mcp.callTool('fablecut_transcribe',{taskId:last.taskId})).text);
 privateFree(legacy);privateFree(JSON.parse(fs.readFileSync(file,'utf8')));
 a.match(legacy.result,/source \/media\/a.wav/);a.equal(submitted,before);
 a.equal(legacy.status,'complete');
 const again=JSON.parse((await mcp.callTool('fablecut_transcribe',{taskId:last.taskId})).text);
 a.deepEqual(again,legacy);a.equal(submitted,before);
});

