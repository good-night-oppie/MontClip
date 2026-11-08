'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {makeDataDir,seedProject,startMcp}=require('./helpers');
for(const partial of [false,true]) test('MCP timeout privacy and direct/bounded parity, partial='+partial,async t=>{
 const parent=makeDataDir(t), dir=path.join(parent,'Users','someone','data');
 fs.mkdirSync(path.join(dir,'media'),{recursive:true});
 const project=seedProject({media:[{id:'m',src:'/media/a.wav',kind:'audio',duration:60}],clips:[]});
 fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(project));
 fs.writeFileSync(path.join(dir,'media','a.wav'),'synthetic');
 const cache=require('../transcripts').createTranscripts({dir:path.join(dir,'analysis','transcripts'),resolveSrc:()=>path.join(dir,'media','a.wav')});
 if(partial) cache.put('/media/a.wav',{duration:60,words:[['kept',0,1]],gaps:[],spans:[[0,1]]});
 let injectedError=null;
 const server=http.createServer((req,res)=>{
  req.resume(); res.setHeader('Content-Type','application/json');
  if(injectedError && req.url.startsWith('/api/export/job')) {
   res.statusCode=500; res.end(JSON.stringify({error:injectedError})); return;
  }
  let out={};
  if(req.url==='/api/project')out=project;
  else if(req.url==='/api/transcript/status')out={status:{'/media/a.wav':false}};
  else if(req.url.startsWith('/api/transcribe/request')||req.url.startsWith('/api/export/job'))out={id:'test-job',status:'running'};
  res.end(JSON.stringify(out));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const mcp=startMcp(t,dir,{FABLECUT_PORT:String(server.address().port)});
 const args={mediaIds:['m'],timeout:0.01};
 const direct=await mcp.callTool('fablecut_transcribe',args);
 const bounded=JSON.parse((await mcp.callTool('fablecut_transcribe',{...args,wait_ms:5000})).text);
 a.equal(direct.isError,true);a.equal(bounded.status,'failed');
 const wire=JSON.stringify({direct,bounded});
 a.ok(!wire.includes(dir)&&!wire.includes(dir.replaceAll('\\','/')));
 a.doesNotMatch(wire,/someone/);
 a.equal(direct.text,'Error: '+bounded.error);
 a.match(bounded.error,/没听完/);
 if(partial){
  a.equal(bounded.saved.length,1);a.match(bounded.saved[0],/^analysis\/transcripts\/[^/]+\.json$/);
  a.equal(JSON.parse(fs.readFileSync(path.join(dir,bounded.saved[0]),'utf8')).words[0][0],'kept');
 }else {a.deepEqual(bounded.saved,[]);a.match(bounded.error,/analysis\/transcripts/);}
 for(const [i,p] of require('./fixtures/private-paths.cjs').entries()){
  injectedError="could not open '"+p+"' (EACCES)";
  const input={mediaIds:['m'],timeout:30+i};
  const raw=await mcp.callTool('fablecut_transcribe',input);
  const receipt=JSON.parse((await mcp.callTool('fablecut_transcribe',{...input,wait_ms:5000})).text);
  a.equal(raw.text,'Error: '+receipt.error,p);
  a.doesNotMatch(JSON.stringify({raw,receipt}),/someone|Some One|Some%20One|O'Brien|server|share/i,p);
  a.match(receipt.error,/could not open '…\/x.json' \(EACCES\)/);
  a.deepEqual(receipt.saved,bounded.saved);
 }
});

