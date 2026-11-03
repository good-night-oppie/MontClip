// Keep-alive race behind the flaky "Fast JPEG image2pipe" (rest-api) and contact-sheet (frame) tests.
//   node docs/validation/2026-11-02-keepalive-race.cjs <repo> after|after-async|before [ms-per-child=600] [children=12]
// after:       request, then N synchronous child processes (the old tests), then request again
// after-async: the same children awaited (the frame.test.js fix)
// before:      the children first, then start the server and make the requests (the rest-api fix)
// Each run is a fresh process: a fresh server and a fresh fetch pool. Prints: <mode> <gap ms> <ok|error code>.
const cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const [root,order,each='600',n='12']=process.argv.slice(2);
const work=async(async_)=>{const t0=Date.now();for(let i=0;i<+n;i++){if(async_)await new Promise((ok,no)=>cp.execFile(process.execPath,['-e',`setTimeout(()=>{},${each})`],e=>e?no(e):ok()));else cp.execFileSync(process.execPath,['-e',`setTimeout(()=>{},${each})`]);}return Date.now()-t0;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let gap=0;if(order==='before')gap=await work(false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'or-'));fs.mkdirSync(path.join(dir,'media'));const port=21000+Math.floor(Math.random()*900);
 const srv=cp.spawn(process.execPath,[path.join(root,'server.js')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',FABLECUT_DATA_DIR:dir,FABLECUT_NO_FS_WATCH:'1'},stdio:'ignore'});
 for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${port}/api/project`)).text();break;}catch{await sleep(100);}}
 if(order==='after'||order==='after-async'){await (await fetch(`http://127.0.0.1:${port}/api/export/ffmpeg`)).json();gap=await work(order==='after-async');}
 let res='ok';try{await (await fetch(`http://127.0.0.1:${port}/api/project`)).text();}catch(e){res=(e.cause&&e.cause.code)||String(e);}
 console.log(order,gap,res);srv.kill();})();
