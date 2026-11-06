"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {makeDataDir,startServer}=require("./helpers");
test("runtime tool detection notifies an open editor without replacing project or undo state",{timeout:30000},async t=>{
 const dir=makeDataDir(t);const {base,child}=await startServer(t,dir,{MONTCLIP_FFMPEG_PACKAGED:"1",MONTCLIP_FFMPEG_DIR:path.join(dir,"absent-tools"),FABLECUT_NO_FS_WATCH:"1"});
 const project=await(await fetch(base+"/api/project")).json();
 const undoUrl=base+"/api/ui/undo-stack?project=default";
 assert.equal((await fetch(undoUrl,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({current:"synthetic",undo:["one","two"],redo:["three"],revision:project.revision})})).status,200);
 const before=await(await fetch(undoUrl)).json();
 const abort=new AbortController();t.after(()=>abort.abort());
 const events=await fetch(base+"/api/events",{signal:abort.signal});const reader=events.body.getReader();
 const reading=(async()=>{let data="";while(!data.includes("event: ffmpeg-state")){const {value,done}=await reader.read();if(done)break;data+=Buffer.from(value).toString();}return data;})();
 const timeout=setTimeout(()=>abort.abort(),3000);t.after(()=>clearTimeout(timeout));
 const detected=await fetch(base+"/api/ffmpeg/detect",{method:"POST"});assert.equal(detected.status,200);
 assert.match(await reading,/event: ffmpeg-state/);abort.abort();
 assert.deepEqual(await(await fetch(base+"/api/project")).json(),project);
 assert.deepEqual(await(await fetch(undoUrl)).json(),before);assert.equal(child.exitCode,null);
});
test("editor responds to tool-state notification without reloading or touching editing state",async()=>{
 const source=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8"),events={};let refreshed=0;
 const begin=source.indexOf("function listenSSE()"),end=source.indexOf("/* Pull the server",begin);
 vm.runInNewContext(source.slice(begin,end)+";listenSSE();",{EventSource:class{addEventListener(k,f){events[k]=f;}},refreshFfmpegCard:async()=>refreshed++});
 assert.equal(typeof events["ffmpeg-state"],"function");await events["ffmpeg-state"]();assert.equal(refreshed,1);
});
