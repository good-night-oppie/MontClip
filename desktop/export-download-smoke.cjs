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
  const exportNow=(name)=>read(`(async()=>{try{const c=document.createElement('canvas');c.width=160;c.height=90;const g=c.getContext('2d');g.fillStyle='#d00';g.fillRect(0,0,160,90);
    const jpg=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/jpeg',0.9))).arrayBuffer());const all=new Uint8Array(jpg.length*6);for(let i=0;i<6;i++)all.set(jpg,i*jpg.length);
    const b=await (await fetch('/api/export/begin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fps:30,name:${JSON.stringify(name)},hasAudio:false,duration:0.2,delivery:{preset:'custom',width:160,height:90},canvasW:160,canvasH:90})})).json();
    if(!b.id)throw Error('begin '+JSON.stringify(b));await fetch('/api/export/frame?id='+b.id,{method:'POST',body:all});
    const e=await (await fetch('/api/export/end?id='+b.id,{method:'POST'})).json();if(!e.src)throw Error('end '+JSON.stringify(e));return e.src;}catch(err){return 'ERR '+err.message}})()`).then((v)=>{if(String(v).startsWith('ERR '))throw Error('export: '+v);return v;});
  // one download started by `js` in the page, answered by `act` the way the Save dialog would be; then the toast
  const download=(js,act)=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('no download finished in 60 s: '+js.slice(0,80))),60000);
   const on=(event,item)=>{ses.removeListener('will-download',on);
    if(event.defaultPrevented)return reject(Error('refused by main'));
    const dialog=item.getSaveDialogOptions(),name=item.getFilename();
    item.once('done',(_e,state)=>setTimeout(()=>read(`document.getElementById('toast').textContent`).then((toast)=>{clearTimeout(timer);resolve({dialog,state,toast,copyLeft:has(name)});},reject),800));
    act(item);};
   ses.on('will-download',on);
   read(`(()=>{try{document.getElementById('toast').textContent='';${js};return document.getElementById('toast').textContent}catch(e){return 'ERR '+e.stack}})()`).then((before)=>{if(before)reject(Error('before the save: '+before));},reject);
  });
  const lang=(l)=>read(`updateMontClipView({language:${JSON.stringify(l)}});true`);
  const saveTo=(n)=>(item)=>item.setSavePath(path.join(saved,n));
  // as the dialog's Cancel: a save path so no dialog opens, then cancelled before any byte arrives
  const cancel=(item)=>{item.setSavePath(path.join(downloads,'x-'+item.getFilename()));item.cancel();};

  // 1. this session's export, saved: the title, the toast once saved, the copy removed, its queue row says it was saved
  out.step='lang';await lang('zh-CN');out.step='export1';
  const src1=await exportNow('第一次 导出');
  const name1=decodeURIComponent(src1.split('/').pop());
  out.step='queue';await read(`exportQueue.push({id:'qsmoke',label:'smoke',spec:normalizeDelivery('master').spec,name:'x',range:'entire',status:'done',progress:1,src:${JSON.stringify(src1)},file:${JSON.stringify(name1)},report:null});renderQueue();true`);
  out.step='save1';out.saved=await download(`saveDownload(${JSON.stringify(src1)},${JSON.stringify(name1)},{savedMsg:'Exported '+${JSON.stringify(name1)},exportFile:true})`,saveTo('mine.mp4'));
  assert.equal(out.saved.dialog.title,'保存导出的视频');
  assert.equal(path.dirname(out.saved.dialog.defaultPath),downloads);assert.equal(path.basename(out.saved.dialog.defaultPath),name1);
  assert.equal(out.saved.state,'completed');assert.ok(fs.statSync(path.join(saved,'mine.mp4')).size>0);
  assert.equal(out.saved.toast,'Exported '+name1,'the success message once saved');
  assert.equal(out.saved.copyLeft,false,'this export\'s copy is removed');
  // the queue in the interface language (JJ): 导出队列 · n, 保存 on each item, 已保存 once saved; no English left in them
  const queueView=()=>read(`(()=>{renderQueue();const l=document.getElementById('exportQueueList').innerHTML,b=document.getElementById('btnOpenQueue').textContent;
    return{button:b,rows:[...document.querySelectorAll('#exportQueueList [data-q]')].map(li=>({id:li.dataset.q,save:li.querySelector('[data-q-save]')?.textContent||null,saved:li.querySelector('.dlv-q-saved')?.textContent||null,links:li.querySelectorAll('a[href]').length})),english:/\b(Open|Save|Saved|Queue)\b/.test(b+' '+[...document.querySelectorAll('#exportQueueList [data-q-save], #exportQueueList .dlv-q-saved')].map(x=>x.textContent).join(' '))}})()`);
  out.step='queueRow';out.queueRow=await queueView();
  assert.deepEqual(out.queueRow.rows,[{id:'qsmoke',save:null,saved:'已保存',links:0}],'the saved row says 已保存, with no dead link');
  assert.equal(out.queueRow.button,'导出队列 · 1');assert.equal(out.queueRow.english,false);

  // 2. this session's export, cancelled: kept, and the toast says how to save it again
  out.step='export2';const src2=await exportNow('第二次 导出'),name2=decodeURIComponent(src2.split('/').pop());
  await read(`exportQueue.push({id:'q2',label:'smoke',spec:normalizeDelivery('master').spec,name:'y',range:'entire',status:'done',progress:1,src:${JSON.stringify(src2)},file:${JSON.stringify(name2)},report:null});renderQueue();true`);
  out.step='cancel2';out.cancelledZh=await download(`saveDownload(${JSON.stringify(src2)},${JSON.stringify(name2)},{savedMsg:'Exported',exportFile:true})`,cancel);
  assert.equal(out.cancelledZh.state,'cancelled');
  assert.equal(out.cancelledZh.toast,'没有保存。导出的视频还在，打开『导出队列』，在这一条后面点『保存』就能再存一次。');
  assert.equal(out.cancelledZh.copyLeft,true,'a cancel keeps the export');
  out.queueZh=await queueView();
  assert.deepEqual(out.queueZh.rows.map(r=>[r.id,r.save,r.saved]),[['qsmoke',null,'已保存'],['q2','保存',null]]);
  assert.equal(out.queueZh.button,'导出队列 · 2');assert.equal(out.queueZh.english,false,'no English in the queue\'s buttons');
  // 3. any other download of that file (a plain link), saved twice: nothing is removed
  out.step='plain';for(let i=0;i<2;i++){
   const r=await download(`const a=document.createElement('a');a.href=${JSON.stringify(src2)};a.download='';document.body.appendChild(a);a.click();a.remove()`,saveTo('again'+i+'.mp4'));
   assert.equal(r.state,'completed');assert.equal(r.copyLeft,true,'a plain download removes nothing ('+i+')');
  }
  // 4. the queue's 保存, cancelled: kept, same toast
  out.step='qsave-cancel';out.queueSaveCancel=await download(`document.querySelector('#exportQueueList [data-q-save="q2"]').click()`,cancel);
  assert.equal(out.queueSaveCancel.state,'cancelled');assert.equal(out.queueSaveCancel.copyLeft,true);
  assert.equal(out.queueSaveCancel.toast,'没有保存。导出的视频还在，打开『导出队列』，在这一条后面点『保存』就能再存一次。');
  // 5. an older file in exports/, downloaded as an export: not this session's, kept
  out.step='older';out.older=await download(`saveDownload('/exports/'+encodeURIComponent('older export.mp4'),'older export.mp4',{exportFile:true})`,saveTo('older.mp4'));
  assert.equal(out.older.state,'completed');assert.equal(out.older.copyLeft,true,'an older file is never removed');
  // 6. English: the export cancel; a captions cancel (blob: nothing kept anywhere)
  out.step='en';await lang('en');
  out.cancelledEn=await download(`saveDownload(${JSON.stringify(src2)},${JSON.stringify(name2)},{exportFile:true})`,cancel);
  assert.equal(out.cancelledEn.toast,'Not saved. The exported video is still here: open the export queue and click Save on this item to save it again.');
  assert.equal(out.cancelledEn.copyLeft,true);
  out.captionCancel=await download(`saveDownload(URL.createObjectURL(new Blob(['1'])),'录播.srt',{kind:'captions',savedMsg:'Saved 1 caption'})`,cancel);
  assert.equal(out.captionCancel.dialog.title,'Save captions');assert.equal(out.captionCancel.toast,'Captions not saved. Click export captions again to save them.');
  // a save that fails: a download the server cannot send (a file no longer there) ends 'interrupted', always with a save path set,
  // so no save window can open. An export download says the export is still there; other downloads say the general line
  // (that main keeps the export's copy when a save is interrupted is covered in test/export-downloads.test.js).
  const failing=(name,opts)=>`saveDownload('/exports/'+encodeURIComponent(${JSON.stringify('gone '+name)}),${JSON.stringify(name)},${opts})`;
  const mapping=`saveDownload(URL.createObjectURL(new Blob(['{}'])),'MontClip.mapping.json')`;
  out.failedEn=await download(failing(name2,'{exportFile:true}'),saveTo('failed-en.mp4'));
  assert.equal(out.failedEn.state,'interrupted');
  assert.equal(out.failedEn.toast,'The save did not finish. The exported video is still here: open the export queue and click Save on this item to try again. If it still fails, choose another location or check that it has enough space.');
  assert.ok(has(name2),'the export is still in exports/');
  out.mapFailedEn=await download(failing('MontClip.mapping.json','{}'),saveTo('m-en.json'));
  assert.equal(out.mapFailedEn.state,'interrupted');assert.equal(out.mapFailedEn.toast,'The save did not finish. Try another location, or check that it has enough space.');
  out.mapCancelEn=await download(mapping,cancel);
  assert.equal(out.mapCancelEn.toast,'Not saved. Click again if you need it.');
  await lang('zh-CN');
  out.failedZh=await download(failing(name2,'{exportFile:true}'),saveTo('failed-zh.mp4'));
  assert.equal(out.failedZh.toast,'没有保存成功。导出的视频还在，打开『导出队列』，在这一条后面点『保存』再试一次；还不行的话，换个位置保存，或者看看那里的空间够不够。');
  out.mapFailedZh=await download(failing('MontClip.mapping.json','{}'),saveTo('m-zh.json'));
  assert.equal(out.mapFailedZh.toast,'没有保存成功。请换个位置再试，或者看看那里的空间够不够。');
  out.mapCancelZh=await download(mapping,cancel);
  assert.equal(out.mapCancelZh.toast,'没有保存。需要的话再点一次。');
  await lang('en');
  out.queueEn=await queueView();
  assert.deepEqual(out.queueEn.rows.map(r=>[r.id,r.save,r.saved]),[['qsmoke',null,'Saved'],['q2','Save',null]]);assert.equal(out.queueEn.button,'Export queue · 2');
  // 7. the queue's Save while its save is still open (VV, 71cd650): the button is greyed, a second click opens nothing,
  //    and main refuses any other download of the same file; once the open one is saved, the copy goes and the row shows only Saved
  out.step='qsave-held';
  const held=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('the held download did not start')),30000);
   const on=(_e,item)=>{ses.removeListener('will-download',on);clearTimeout(timer);item.setSavePath(path.join(saved,'from-queue.mp4'));item.pause();resolve(item);};
   ses.on('will-download',on);
   read(`document.querySelector('#exportQueueList [data-q-save="q2"]').click();true`).catch(reject);
  });
  out.whileOpen=await read(`(()=>{const b=document.querySelector('#exportQueueList [data-q-save="q2"]');return{disabled:!!b&&b.disabled}})()`);
  assert.deepEqual(out.whileOpen,{disabled:true},'Save is greyed while its save is open');
  let extra=0;const count=(e)=>{extra++;out.secondRefused=e.defaultPrevented;};ses.on('will-download',count);
  await read(`document.querySelector('#exportQueueList [data-q-save="q2"]').click();true`);await wait(800);
  out.secondClickDownloads=extra;assert.equal(extra,0,'a click on the greyed button opens nothing');
  await read(`(()=>{const a=document.createElement('a');a.href=${JSON.stringify(src2)};a.download='';document.body.appendChild(a);a.click();a.remove();return true})()`);await wait(1500);
  ses.removeListener('will-download',count);
  assert.equal(extra,1,'the plain link reached will-download');assert.equal(out.secondRefused,true,'main refuses a second download of the same export');
  assert.equal(has(name2),true,'the copy is still there while the first save is open');
  const doneState=await new Promise((resolve)=>{held.once('done',(_e,state)=>setTimeout(()=>resolve(state),800));held.resume();});
  out.queueSave={state:doneState,copyLeft:has(name2)};
  assert.equal(doneState,'completed');assert.equal(out.queueSave.copyLeft,false,'saved from the queue: the copy goes');
  out.queueAfter=await queueView();
  assert.deepEqual(out.queueAfter.rows.map(r=>[r.id,r.save,r.saved,r.links]),[['qsmoke',null,'Saved',0],['q2',null,'Saved',0]]);
  out.statusText=await read(`[...document.querySelectorAll('#exportQueueList [data-q] .xq-status')].map(x=>x.textContent)`);
  assert.deepEqual(out.statusText,['',''],'a saved item shows no path to the removed file');

  await wait(1000);
  out.downloadsLeft=fs.readdirSync(downloads);
  assert.deepEqual(out.downloadsLeft,[],'nothing left in Downloads after the cancels');
  out.exportsLeft=fs.readdirSync(exportsDir).sort();
  assert.deepEqual(out.exportsLeft,['older export.mp4'],'only the saved exports\' copies went');
  process.stdout.write('EXPORT_DOWNLOAD_COMPLETE '+JSON.stringify(out)+'\n');
 }catch(e){process.stdout.write('EXPORT_DOWNLOAD_FAIL '+(e&&e.stack)+' '+JSON.stringify(out)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
