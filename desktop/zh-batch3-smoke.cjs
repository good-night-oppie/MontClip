'use strict';
// The desktop app (fresh profile, hidden offscreen window), Chinese batch 3: in zh-CN the export dialog and the
// projects dashboard show none of the translated English labels; a switch to English brings them back while
// each one is open, and a switch back gives the Chinese again.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
// The English of every translated label that must not be visible in Chinese (codec names, numbers and the
// rows JJ keeps in English are not in this list).
const EXPORT_EN=['Resolution','Frame rate','Rate control','Max rate (Mb/s)','Keyframe every (s)','Encoder speed','Pixel format','Container',
 'Bitrate (kb/s)','Sample rate','Channels','Loudness','Artist / author','Copyright','Description','Keywords','Batch outputs','+ Add these settings',
 '+ Typical set','One render, several files','No batch outputs yet','Export checked','Frame-accurate','WebCodecs (HW encode)','Full timeline','Tokens:',
 '→ exports/','Project size'];
const EXPORT_LABELS=['dlvRes','dlvFps','dlvCodec','dlvEncoder','dlvFilename','dlvMetaTitle','dlvMetaDate'];   // short words checked on their own label
const PROJECTS_EN=['+ New project','Currently open','open now','Canvas','Length','Modified','Opened','Created','Notes','Tags','Duplicate','Save as template',
 'Archive','Versions…','Download backup','just now','min ago',' clips ·',' clip ·'];
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=300)=>new Promise(r=>setTimeout(r,ms));
 // nothing here may download; if anything tries, it lands in the throwaway profile and the smoke fails
 let downloads=0;win.webContents.session.on('will-download',(e,item)=>{item.setSavePath(require('node:path').join(app.getPath('userData'),'unexpected-download'));downloads++;item.cancel();});
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  assert.equal(await read(`!!window.montclipViewSettings`),true,'the desktop preload is there');
  // visible text of an element: text nodes that are rendered, outside selects, inputs and text areas
  await read(`window.__z3Text=(el)=>{const out=[],w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const p=n.parentElement;if(!p||p.closest('select,option,textarea,input'))continue;if(!p.getClientRects().length)continue;const s=n.data.trim();if(s)out.push(s);}return out.join(' | ');};true`);
  await read(`updateMontClipView({language:'zh-CN'});true`);await wait();
  // a clip, so the export dialog opens
  await read(`document.getElementById('btnTitle').click();true`);await wait();
  assert.ok(await read(`project.clips.length`)>0,'a clip on the timeline');
  const openExport=async()=>{await read(`openExportSetup();true`);
   await read(`(async()=>{const until=Date.now()+15000;while(els.exportSetup.classList.contains('hidden')&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(els.exportSetup.classList.contains('hidden'))throw Error('EXPORT_NOT_OPEN');for(const d of els.exportSetup.querySelectorAll('details'))d.open=true;})()`);await wait();};
  const exportState=()=>read(`(()=>{const d=els.exportSetup.querySelector('.dialog');const label=id=>{const c=document.getElementById(id),l=c&&c.closest('label');return l?[...l.childNodes].filter(n=>n!==c).map(n=>n.textContent).join('').trim():null;};
   return{text:__z3Text(d),labels:Object.fromEntries(${JSON.stringify(EXPORT_LABELS)}.map(id=>[id,label(id)])),wc:!document.getElementById('engineRealtime').disabled&&document.getElementById('engineWebCodecsNote').textContent,
    fastLabel:document.querySelector('#engineFast + span b').textContent,controls:${JSON.stringify(EXPORT_LABELS)}.every(id=>!!document.getElementById(id))};})()`);
  await openExport();
  const zhExport=await exportState();
  for(const s of EXPORT_EN)assert.ok(!zhExport.text.includes(s),'zh export dialog shows no "'+s+'": '+zhExport.text);
  assert.deepEqual(zhExport.labels,{dlvRes:'分辨率',dlvFps:'帧率',dlvCodec:'视频编码',dlvEncoder:'编码器',dlvFilename:'文件名',dlvMetaTitle:'标题',dlvMetaDate:'日期'});
  assert.ok(zhExport.controls,'every labelled control is still there');
  for(const s of ['整条时间线 · ','文件名：','可用的占位符：{project}','一次导出多个版本','+ 加上这套设置','+ 常用组合','还没有要一起导出的版本','导出勾选的版本','和项目一样大 · 高画质（H.264 CRF 16 · AAC 320k）'])
   assert.ok(zhExport.text.includes(s),'zh export dialog shows '+s+': '+zhExport.text);
  await read(`updateMontClipView({language:'en'});true`);await wait();
  const enExport=await exportState();
  for(const s of ['Resolution','Frame rate','Batch outputs','+ Add these settings','+ Typical set','No batch outputs yet','Export checked','Full timeline · ','→ exports/','Tokens: {project}','Project size · H.264 CRF 16 · AAC 320k','Artist / author','Keywords'])
   assert.ok(enExport.text.includes(s),'en export dialog shows '+s+': '+enExport.text);
  assert.equal(enExport.labels.dlvCodec,'Codec');
  await read(`updateMontClipView({language:'zh-CN'});true`);await wait();
  const backExport=await exportState();
  assert.deepEqual(backExport.labels,zhExport.labels,'and back');assert.equal(backExport.text,zhExport.text,'the same Chinese dialog again');
  await read(`document.getElementById('btnCancelSetup').click();true`);await wait();
  // the projects dashboard
  const openDash=async()=>{await read(`openProjects()`);await read(`(async()=>{const until=Date.now()+15000;while(!document.querySelector('#pjSide .pj-facts')&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!document.querySelector('#pjSide .pj-facts'))throw Error('PROJECTS_NOT_OPEN');})()`);await wait();};
  const dashText=()=>read(`__z3Text(document.getElementById('projectsDialog'))`);
  await openDash();
  const zhDash=await dashText();
  for(const s of PROJECTS_EN)assert.ok(!zhDash.includes(s),'zh dashboard shows no "'+s+'": '+zhDash);
  for(const s of ['+ 新建项目','当前已打开','画面','时长','个片段','个素材','修改时间','打开时间','创建时间','备注','标签','复制一份','存成模板','归档','历史版本…','下载备份'])
   assert.ok(zhDash.includes(s),'zh dashboard shows '+s+': '+zhDash);
  assert.match(zhDash,/(刚刚|\d+ 分钟前|\d+ 小时前|昨天)(打开过|修改过|创建)?/,'relative times in Chinese');
  await read(`updateMontClipView({language:'en'});true`);await wait();
  const enDash=await dashText();
  for(const s of ['+ New project','Currently open','Canvas','Length','Modified','Opened','Created','Notes','Tags','Duplicate','Save as template','Versions…','Download backup'])
   assert.ok(enDash.includes(s),'en dashboard shows '+s+': '+enDash);
  await read(`updateMontClipView({language:'zh-CN'});true`);await wait();
  assert.equal(await dashText(),zhDash,'and back');
  await read(`closeProjects();true`);
  assert.equal(downloads,0,'nothing was downloaded');
  process.stdout.write('ZH3_COMPLETE '+JSON.stringify({webCodecsNote:zhExport.wc,fastLabel:zhExport.fastLabel,zhExport:zhExport.text.slice(0,600),zhDash:zhDash.slice(0,600),enDash:enDash.slice(0,300)})+'\n');
 }catch(e){process.stdout.write('ZH3_FAIL '+JSON.stringify({error:String(e&&e.stack||e)})+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
