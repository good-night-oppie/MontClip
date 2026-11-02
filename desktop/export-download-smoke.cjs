'use strict';
// The desktop app (fresh profile, hidden offscreen window), VV on package fccc225: an export's Save dialog gets a plain
// title in the interface language and the file name; once the file is saved, or the save is cancelled, the copy in
// workspace/exports goes (only that one); nothing (*.tmp, *.crdownload) is left in Downloads after a cancel.
// The native dialog itself is never shown here: this smoke picks the destination with setSavePath, or cancels, the way
// the dialog would. Pressing Cancel in the real dialog is VV's check.
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
  // one download, answered by `act` the way the Save dialog would be
  const download=(name,language,act)=>new Promise((resolve,reject)=>{
   fs.writeFileSync(path.join(exportsDir,name),Buffer.alloc(48*1024*1024,1));
   const ses=win.webContents.session;
   const on=(event,item)=>{ses.removeListener('will-download',on);
    if(event.defaultPrevented)return reject(Error('refused by main'));
    const dialog=item.getSaveDialogOptions();act(item);
    item.once('done',(_e,state)=>setTimeout(()=>resolve({dialog,state,copyLeft:fs.existsSync(path.join(exportsDir,name))}),300));};
   ses.on('will-download',on);
   read(`(()=>{try{updateMontClipView({language:${JSON.stringify(language)}});const a=document.createElement('a');a.href='/exports/'+encodeURIComponent(${JSON.stringify(name)});a.download=${JSON.stringify(name)};a.click();return true}catch(e){return String(e.stack)}})()`).then(v=>{if(v!==true)reject(Error(v))},reject);
  });
  const savedTo=path.join(saved,'mine.mp4');
  out.saved=await download('Untitled Project_master_720p.mp4','zh-CN',(item)=>item.setSavePath(savedTo));
  assert.equal(out.saved.dialog.title,'保存导出的视频');
  assert.equal(path.basename(out.saved.dialog.defaultPath),'Untitled Project_master_720p.mp4');
  assert.equal(path.dirname(out.saved.dialog.defaultPath),downloads);
  assert.equal(out.saved.state,'completed');assert.equal(fs.statSync(savedTo).size,48*1024*1024,'the saved file is whole');
  assert.equal(out.saved.copyLeft,false,'the workspace copy is gone after the save');
  out.cancelled=await download('cancel me.mp4','en',(item)=>{item.setSavePath(path.join(downloads,'cancel me.mp4'));item.once('updated',()=>item.cancel());});
  assert.equal(out.cancelled.dialog.title,'Save the exported video');
  assert.equal(out.cancelled.state,'cancelled');
  assert.equal(out.cancelled.copyLeft,false,'the workspace copy is gone after a cancel');
  await wait(1000);
  out.downloadsLeft=fs.readdirSync(downloads);
  assert.deepEqual(out.downloadsLeft,[],'nothing left in Downloads after the cancel');
  {const t0=Date.now();while(fs.readdirSync(exportsDir).length>1&&Date.now()-t0<15000)await wait(250);out.exportsGoneAfterMs=Date.now()-t0;}
  out.exportsLeft=fs.readdirSync(exportsDir);
  assert.deepEqual(out.exportsLeft,['older export.mp4'],'only this export\'s file was removed: '+JSON.stringify(out.exportsLeft));
  // captions: a blob download, titled 保存字幕, nothing removed
  const ses=win.webContents.session;
  out.captions=await new Promise((resolve)=>{const on=(_e,item)=>{ses.removeListener('will-download',on);const dialog=item.getSaveDialogOptions();item.setSavePath(path.join(saved,'c.srt'));item.once('done',(_x,state)=>resolve({dialog,state}));};ses.on('will-download',on);
   read(`(()=>{updateMontClipView({language:'zh-CN'});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['1\\n00:00:00,000 --> 00:00:01,000\\nx\\n']));a.download='录播.srt';a.click();return true})()`);});
  assert.equal(out.captions.dialog.title,'保存字幕');assert.equal(out.captions.state,'completed');
  assert.deepEqual(fs.readdirSync(exportsDir),['older export.mp4']);
  // the toast follows the save (VV, 012ba18): the page's own saveDownload, as the export uses it
  const toastAfter=(name,language,act)=>new Promise((resolve,reject)=>{
   fs.writeFileSync(path.join(exportsDir,name),Buffer.alloc(48*1024*1024,1));
   const on=(_e,item)=>{ses.removeListener('will-download',on);act(item);item.once('done',()=>setTimeout(()=>read(`document.getElementById('toast').textContent`).then(resolve,reject),600));};
   ses.on('will-download',on);
   read(`(()=>{updateMontClipView({language:${JSON.stringify(language)}});document.getElementById('toast').textContent='';saveDownload('/exports/'+encodeURIComponent(${JSON.stringify(name)}),${JSON.stringify(name)},'Exported '+${JSON.stringify(name)});return document.getElementById('toast').textContent})()`)
    .then((before)=>{if(before)reject(Error('a toast before the save: '+before));},reject);
  });
  out.toastSaved=await toastAfter('t1.mp4','zh-CN',(item)=>item.setSavePath(path.join(saved,'t1.mp4')));
  assert.equal(out.toastSaved,'Exported t1.mp4','the success message once saved');
  out.toastCanceledZh=await toastAfter('t2.mp4','zh-CN',(item)=>{item.setSavePath(path.join(downloads,'t2.mp4'));item.once('updated',()=>item.cancel());});
  assert.equal(out.toastCanceledZh,'已取消保存，没有保存文件。');
  out.toastCanceledEn=await toastAfter('t3.mp4','en',(item)=>{item.setSavePath(path.join(downloads,'t3.mp4'));item.once('updated',()=>item.cancel());});
  assert.equal(out.toastCanceledEn,'Save canceled. No file was saved.');
  await wait(1000);
  assert.deepEqual(fs.readdirSync(exportsDir),['older export.mp4'],'the copies went');
  assert.deepEqual(fs.readdirSync(downloads),[],'nothing left in Downloads');
  process.stdout.write('EXPORT_DOWNLOAD_COMPLETE '+JSON.stringify(out)+'\n');
 }catch(e){process.stdout.write('EXPORT_DOWNLOAD_FAIL '+(e&&e.stack)+' '+JSON.stringify(out)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
