'use strict';
// The desktop app (fresh profile, hidden offscreen window). VV on package fccc225: an export's Save dialog gets a plain
// title in the interface language and the file name. Deja / QQ on 0a2c13b: the copy in workspace/exports is removed
// only when it is this session's new export, the page's own export download asked for it, and the save completed; a
// cancel keeps it and the toast says so; Open in the export queue, an older file in exports/ or a failed save remove
// nothing; a removed export's queue row says it was saved. Nothing (*.tmp, *.crdownload) is left in Downloads after a
// cancel. The native dialog itself is never shown here: this smoke picks the destination with setSavePath, or cancels,
// the way the dialog would. Pressing Cancel in the real dialog is VV's check.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length);
const downloads=path.join(profile,'Downloads'),saved=path.join(profile,'Saved');
fs.mkdirSync(downloads,{recursive:true});fs.mkdirSync(saved,{recursive:true});
app.setPath('downloads',downloads);
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const out={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  const exportsDir=path.join(app.getPath('userData'),'workspace','exports');fs.mkdirSync(exportsDir,{recursive:true});
  fs.writeFileSync(path.join(exportsDir,'older export.mp4'),'keep');
  const ses=win.webContents.session,has=(n)=>fs.existsSync(path.join(exportsDir,n));
  // a real export of this session, made through the export API from the page (6 red frames, 160×90)
  const exportNow=(name)=>read(`(async()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const g=c.getContext('2d');g.fillStyle='#d00';g.fillRect(0,0,160,90);
    const jpg=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/jpeg',0.9))).arrayBuffer());const all=new Uint8Array(jpg.length*6);for(let i=0;i<6;i++)all.set(jpg,i*jpg.length);
    const b=await (await fetch('/api/export/begin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fps:30,name:${JSON.stringify(name)},hasAudio:false,duration:0.2,delivery:{preset:'custom',width:160,height:90},canvasW:160,canvasH:90})})).json();
    if(!b.id)throw Error('begin '+JSON.stringify(b));await fetch('/api/export/frame?id='+b.id,{method:'POST',body:all});
    const e=await (await fetch('/api/export/end?id='+b.id,{method:'POST'})).json();if(!e.src)throw Error('end '+JSON.stringify(e));return e.src;})()`);
  // one download started by `js` in the page, answered by `act` the way the Save dialog would be; then the toast
  const download=(js,act)=>new Promise((resolve,reject)=>{
   const on=(event,item)=>{ses.removeListener('will-download',on);
    if(event.defaultPrevented)return reject(Error('refused by main'));
    const dialog=item.getSaveDialogOptions(),name=item.getFilename();act(item);
    item.once('done',(_e,state)=>setTimeout(()=>read(`document.getElementById('toast').textContent`).then((toast)=>resolve({dialog,state,toast,copyLeft:has(name)}),reject),800));};
   ses.on('will-download',on);
   read(`(()=>{try{document.getElementById('toast').textContent='';${js};return document.getElementById('toast').textContent}catch(e){return 'ERR '+e.stack}})()`).then((before)=>{if(before)reject(Error('before the save: '+before));},reject);
  });
  const lang=(l)=>read(`updateMontClipView({language:${JSON.stringify(l)}});true`);
  const saveTo=(n)=>(item)=>item.setSavePath(path.join(saved,n));
  const cancel=(item)=>item.cancel();

  // 1. this session's export, saved: the title, the toast once saved, the copy removed, its queue row says it was saved
  await lang('zh-CN');
  const src1=await exportNow('第一次 导出');
  const name1=decodeURIComponent(src1.split('/').pop());
  await read(`exportQueue.push({id:'qsmoke',label:'smoke',spec:{},name:'x',range:'entire',status:'done',progress:1,src:${JSON.stringify(src1)},file:${JSON.stringify(name1)},report:null});renderQueue();true`);
  out.saved=await download(`saveDownload(${JSON.stringify(src1)},${JSON.stringify(name1)},{savedMsg:'Exported '+${JSON.stringify(name1)},exportFile:true})`,saveTo('mine.mp4'));
  assert.equal(out.saved.dialog.title,'保存导出的视频');
  assert.equal(path.dirname(out.saved.dialog.defaultPath),downloads);assert.equal(path.basename(out.saved.dialog.defaultPath),name1);
  assert.equal(out.saved.state,'completed');assert.ok(fs.statSync(path.join(saved,'mine.mp4')).size>0);
  assert.equal(out.saved.toast,'Exported '+name1,'the success message once saved');
  assert.equal(out.saved.copyLeft,false,'this export\'s copy is removed');
  out.queueRow=await read(`(()=>{renderQueue();const t=document.body.innerHTML;return{saved:t.includes('已保存到你选的位置'),openToRemoved:t.includes('href="'+${JSON.stringify(src1)}+'"')}})()`);
  assert.deepEqual(out.queueRow,{saved:true,openToRemoved:false},'the queue row says saved, no dead Open link');

  // 2. this session's export, cancelled: kept, and the toast says where it still is
  const src2=await exportNow('第二次 导出'),name2=decodeURIComponent(src2.split('/').pop());
  out.cancelledZh=await download(`saveDownload(${JSON.stringify(src2)},${JSON.stringify(name2)},{savedMsg:'Exported',exportFile:true})`,cancel);
  assert.equal(out.cancelledZh.state,'cancelled');
  assert.equal(out.cancelledZh.toast,'没有保存。导出的视频还在，可以在导出列表里点「Open」再存一次。');
  assert.equal(out.cancelledZh.copyLeft,true,'a cancel keeps the export');
  // 3. Open in the export queue (a plain link), saved twice: nothing is removed
  for(let i=0;i<2;i++){
   const r=await download(`const a=document.createElement('a');a.href=${JSON.stringify(src2)};a.download='';document.body.appendChild(a);a.click();a.remove()`,saveTo('again'+i+'.mp4'));
   assert.equal(r.state,'completed');assert.equal(r.copyLeft,true,'Open removes nothing ('+i+')');
  }
  out.openTwice='kept';
  // 4. an older file in exports/, downloaded as an export: not this session's, kept
  out.older=await download(`saveDownload('/exports/'+encodeURIComponent('older export.mp4'),'older export.mp4',{exportFile:true})`,saveTo('older.mp4'));
  assert.equal(out.older.state,'completed');assert.equal(out.older.copyLeft,true,'an older file is never removed');
  // 5. English: the export cancel; a caption (blob) cancel says nothing was saved
  await lang('en');
  out.cancelledEn=await download(`saveDownload(${JSON.stringify(src2)},${JSON.stringify(name2)},{exportFile:true})`,cancel);
  assert.equal(out.cancelledEn.toast,'Not saved. The exported video is still here; click Open in the export list to save it again.');
  assert.equal(out.cancelledEn.copyLeft,true);
  out.captionCancel=await download(`saveDownload(URL.createObjectURL(new Blob(['1'])),'录播.srt',{savedMsg:'Saved 1 caption'})`,cancel);
  assert.equal(out.captionCancel.dialog.title,'Save captions');assert.equal(out.captionCancel.toast,'Save canceled. No file was saved.');

  await wait(1000);
  out.downloadsLeft=fs.readdirSync(downloads);
  assert.deepEqual(out.downloadsLeft,[],'nothing left in Downloads after the cancels');
  out.exportsLeft=fs.readdirSync(exportsDir).sort();
  assert.deepEqual(out.exportsLeft,[name2,'older export.mp4'].sort(),'only the saved export\'s copy went');
  process.stdout.write('EXPORT_DOWNLOAD_COMPLETE '+JSON.stringify(out)+'\n');
 }catch(e){process.stdout.write('EXPORT_DOWNLOAD_FAIL '+(e&&e.stack)+' '+JSON.stringify(out)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
