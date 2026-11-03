'use strict';
// The streamer's corrections through the real page and main process (Deja, 2026-11-03). Fresh profile, hidden offscreen
// window, no network. From the page: status, keep one, refuse one with a file name, off (nothing kept, nothing used), on,
// empty; on disk under the profile's userData only, numbers and fixed words; never in the project the page saves.
//   electron desktop/corrections-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → CORRECTIONS_PASS / CORRECTIONS_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 let ok=false;const report={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  const C=(js)=>read(`(()=>{const c=window.montclipCorrections;return ${js};})()`);
  report.first=await C(`c.status()`);assert.deepEqual(report.first,{enabled:true,count:0});
  assert.deepEqual(await C(`c.append({type:'trim',kind:'song',startShift:-4,endShift:3,duration:3600})`),{ok:true});
  assert.deepEqual(await C(`c.append({type:'kind',from:'song',to:'other',duration:3600,features:{len:120,level:-25,pause:0.3}})`),{ok:true});
  assert.equal((await C(`c.append({type:'trim',kind:'song',startShift:-4,endShift:3,duration:3600,name:'我的直播.mp4'})`)).code,'CORRECTION_INVALID');
  assert.equal((await C(`c.append('C:/录像/a.flv')`)).code,'CORRECTION_INVALID');
  report.kept=await C(`c.status()`);assert.deepEqual(report.kept,{enabled:true,count:2});
  assert.equal((await C(`c.records()`)).length,2);
  const dir=path.join(app.getPath('userData'),'corrections');
  for(const f of fs.readdirSync(dir)){const raw=fs.readFileSync(path.join(dir,f),'utf8');assert.ok(!/\.(mp4|flv)|[\\/]|[一-鿿]/.test(raw),f);}
  // the page has no other way in: no path, no file
  assert.deepEqual(await C(`Object.keys(c).sort()`),['append','clear','records','setEnabled','status']);
  // off: nothing kept, nothing used; on again; emptied
  assert.deepEqual(await C(`c.setEnabled(false)`),{ok:true,enabled:false});
  assert.equal((await C(`c.append({type:'remove',kind:'moment',duration:600})`)).code,'CORRECTIONS_OFF');
  assert.equal(await C(`c.records()`),null);
  assert.deepEqual(await C(`c.status()`),{enabled:false,count:2});
  await C(`c.setEnabled(true)`);assert.deepEqual(await C(`c.clear()`),{ok:true});
  report.cleared=await C(`c.status()`);assert.deepEqual(report.cleared,{enabled:true,count:0});
  // never in the project the page saves
  assert.ok(!/corrections|startShift|songBar/.test(await read(`JSON.stringify(projectJSON())`)));
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'CORRECTIONS_PASS':'CORRECTIONS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
