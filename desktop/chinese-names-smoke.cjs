'use strict';
// The desktop app (fresh profile, hidden offscreen window), the project named 「未命名项目」: an export made through the
// export API comes out as 未命名项目.mp4; its download and the captions' download carry the Chinese name, and the
// files land in Downloads under that name. The save window itself is never shown: each download gets a save path in
// Downloads under the name Chromium proposes (item.getFilename()), the way the dialog's default would be.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length),downloads=path.join(profile,'下载 Downloads');
fs.mkdirSync(downloads,{recursive:true});app.setPath('downloads',downloads);
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 const out={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{const doc=projectJSON();doc.name='未命名项目';doc.clips=[{id:'c',kind:'text',mediaId:null,track:'V1',start:0,in:0,duration:1,props:{text:'x',caption:true}}];applyProject(doc);scheduleSave();await flushSave();return true})()`);
  const ses=win.webContents.session;
  const download=(js)=>new Promise((resolve,reject)=>{
   const t=setTimeout(()=>reject(Error('no download')),60000);
   const on=(_e,item)=>{ses.removeListener('will-download',on);const name=item.getFilename();item.setSavePath(path.join(downloads,name));
    item.once('done',(_x,state)=>{clearTimeout(t);resolve({name,state});});};
   ses.on('will-download',on);read(js).catch(reject);
  });
  // an export through the API, named as the page names it
  out.src=await read(`(async()=>{const c=document.createElement('canvas');c.width=160;c.height=90;c.getContext('2d').fillRect(0,0,160,90);
    const jpg=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/jpeg',0.9))).arrayBuffer());const all=new Uint8Array(jpg.length*6);for(let i=0;i<6;i++)all.set(jpg,i*jpg.length);
    const b=await (await fetch('/api/export/begin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fps:30,name:exportBaseName('export'),hasAudio:false,duration:0.2,delivery:{preset:'custom',width:160,height:90},canvasW:160,canvasH:90})})).json();
    await fetch('/api/export/frame?id='+b.id,{method:'POST',body:all});return (await (await fetch('/api/export/end?id='+b.id,{method:'POST'})).json()).src})()`);
  assert.equal(out.src,'/exports/'+encodeURIComponent('未命名项目.mp4'));
  out.video=await download(`(()=>{const a=document.createElement('a');a.href=${JSON.stringify(out.src)};a.download=decodeURIComponent(${JSON.stringify(out.src)}.split('/').pop());document.body.appendChild(a);a.click();a.remove();return true})()`);
  assert.deepEqual(out.video,{name:'未命名项目.mp4',state:'completed'});
  // the page's own name for the export (the delivery template) and the captions
  out.deliveryName=await read(`deliveryFileName(normalizeDelivery('master').spec,30)`);
  assert.match(out.deliveryName,/^未命名项目_master_/);
  out.captions=await download(`downloadCaptions('srt');true`);
  assert.deepEqual(out.captions,{name:'未命名项目.srt',state:'completed'});
  out.inDownloads=fs.readdirSync(downloads).sort();
  assert.deepEqual(out.inDownloads,['未命名项目.mp4','未命名项目.srt']);
  process.stdout.write('CN_NAMES_COMPLETE '+JSON.stringify(out)+'\n');
 }catch(e){process.stdout.write('CN_NAMES_FAIL '+(e&&e.stack)+' '+JSON.stringify(out)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
