'use strict';
// 「记住我的剪辑习惯」 in the 「✨ 自动出切片」 review, as the frozen v12 has it (Deja, 2026-11-03; 原型-v12.html d289ff06…,
// 交互说明-v12.md d59748f7…). Fresh profile, hidden offscreen window, synthetic sound only (test/songs-synth.js), the real
// page, server and main-process store. Checks:
//  - the line under the cards (on / off) and 设置 › 自动出切片 › 记住我的剪辑习惯;
//  - 这段不是唱歌 / 这段是唱歌 with 你改的, 不要这条, a move, 补一段 (from IN–OUT, with its kind) with 你补的 — each kept as one
//    correction, the first edit saying so once, and 〔撤销〕 taking the edit and its correction back;
//  - a habit: the next search moves the cards, says so on each (↺ … · 这次不用 · 去设置) and in the evidence; 这次不用
//    puts one back, 去设置 opens the page;
//  - the same recording searched again does not bring back a part marked 不是唱歌;
//  - the page: the switch (off: nothing kept, nothing used), the counts, 清空记录 with its confirmation.
// With MONTCLIP_SHOTS_OUT (an absolute folder) it saves pictures of its own window (capturePage).
//   electron desktop/corrections-ui-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → CORRECTIONS_UI_PASS / CORRECTIONS_UI_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shots=process.env.MONTCLIP_SHOTS_OUT||null;if(shots&&!path.isAbsolute(shots))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
const {wav}=require('../test/songs-synth');
const V=require('../ui-preferences'),zh=(k,v)=>V.t('zh-CN','own.'+k,v);
const asrEmpty=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'montclip-noasr-'));process.env.MONTCLIP_ASR_DIR=asrEmpty;
const PLAN=[['talk',60],['song',140],['talk',80],['song',150],['talk',50]];
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 const until=async(expr,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(100);}throw Error('TIMEOUT '+expr);};
 const shot=async(name)=>{if(!shots)return;await wait(300);fs.writeFileSync(path.join(shots,name),(await win.webContents.capturePage()).toPNG());};
 const search=async()=>{await read(`(()=>{autoRun();return true;})()`);await until(`autoState().step==='review'&&!autoState().run`,180000);
  await read(`(()=>{const d=document.querySelector('dialog.auto-slices');if(!d.open)document.getElementById('btnAutoSlices').click();autoRender('review');return true;})()`);await wait(200);};
 const status=()=>read(`window.montclipCorrections.status()`);
 const toastText=()=>read(`document.querySelector('[data-as-toast-msg]').textContent`);
 const undoToast=()=>read(`(async()=>{document.querySelector('[data-as-toast-undo]').click();await new Promise(r=>setTimeout(r,200));return true;})()`);
 try{
  await until(`state.connected`,15000);
  win.setContentSize(1280,800);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'记住习惯 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');updateMontClipView({language:'zh-CN'});})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=rec.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_rec',name:'11 月 2 日 合成录像',kind:'audio',src:${JSON.stringify(up.src)},duration:480});
   doc.clips.push({id:'c_rec',mediaId:'m_rec',kind:'audio',track:'A1',start:0,in:0,duration:480,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  // settings: 设置 › 自动出切片 has the page
  report.settings=await read(`(()=>{const s=document.getElementById('setSlices');return{shown:!!s&&!s.classList.contains('hidden'),title:s&&s.querySelector('h3').textContent,button:s&&s.querySelector('[data-learn-open]')&&s.querySelector('[data-learn-open]').textContent,after:!!s&&!!(document.getElementById('setAsr').compareDocumentPosition(s)&Node.DOCUMENT_POSITION_FOLLOWING)};})()`);
  assert.deepEqual(report.settings,{shown:true,title:zh('as-set-title'),button:zh('as-learn-title'),after:true});
  await read(`(()=>{document.getElementById('btnAutoSlices').click();autoState().picked=new Set(['m_rec']);return true;})()`);
  await search();
  const baseline=await read(`JSON.stringify(autoState().clips.map(c=>[c.kind,c.s,c.e]))`);
  // the line under the cards
  report.line=await read(`(()=>{const l=document.querySelector('[data-as-learn-line]');return l&&{text:l.textContent,button:l.querySelector('[data-as-act=learn]').textContent};})()`);
  assert.equal(report.line.text,zh('as-learn-on')+zh('as-learn-on-btn'));
  // 1. 这段不是唱歌 on the first song card: kind, 你改的, the switch flips; one correction with the recording's key; the first
  //    edit says it is kept, once; 〔撤销〕 takes both back
  const kind=await read(`(async()=>{const st=autoState(),c=st.clips.find(x=>x.kind==='song'),card=document.querySelector('[data-as-card="'+c.id+'"]');
    const link=card.querySelector('[data-as-act=set-kind]'),before=link.textContent;link.click();await new Promise(r=>setTimeout(r,300));
    const after=document.querySelector('[data-as-card="'+c.id+'"]');
    return{id:c.id,before,kind:autoClip(c.id).kind,line:after.querySelector('[data-as-kind-line]').textContent,link:after.querySelector('[data-as-act=set-kind]').textContent};})()`);
  report.kind=kind;
  assert.equal(kind.before,zh('as-not-song'));assert.equal(kind.kind,'moment');assert.equal(kind.link,zh('as-is-song'));
  assert.ok(kind.line.startsWith(zh('as-a-moment')+zh('as-tag-changed')),kind.line);
  assert.equal(await toastText(),zh('as-kind-to-moment',{name:await read(`autoName(autoClip(${JSON.stringify(kind.id)}))`)})+zh('as-learn-told'));
  const rec1=await read(`window.montclipCorrections.records()`);
  assert.equal(rec1.length,1);assert.deepEqual([rec1[0].type,rec1[0].from,rec1[0].to],['kind','song','moment']);assert.match(rec1[0].rec,/^[a-f0-9]{16}$/);assert.ok(rec1[0].e>rec1[0].s);
  await undoToast();
  assert.equal(await read(`autoClip(${JSON.stringify(kind.id)}).kind`),'song');assert.equal((await status()).count,0,'the correction taken back');
  // 2. 不要这条 and a move: one correction each, nothing said about keeping (said once already); 〔撤销〕 takes each back
  const moves=await read(`(async()=>{const cards=[...document.querySelectorAll('[data-as-card]')];cards[0].querySelector('[data-as-act=nudge][data-as-w=s][data-as-d="-1"]').click();await new Promise(r=>setTimeout(r,300));
    return document.querySelector('[data-as-toast-msg]').textContent;})()`);
  assert.ok(!moves.includes(zh('as-learn-told')),'said once only');assert.deepEqual((await status()).byType,{trim:1,remove:0,kind:0,add:0});
  await undoToast();assert.equal((await status()).count,0);
  await read(`(async()=>{document.querySelectorAll('[data-as-card]')[1].querySelector('[data-as-act=drop]').click();await new Promise(r=>setTimeout(r,300));return true;})()`);
  assert.deepEqual((await status()).byType,{trim:0,remove:1,kind:0,add:0});await undoToast();assert.equal((await status()).count,0);
  // 3. 补一段: grey without IN–OUT, and says how; with IN–OUT (400–430 s of the recording, on the timeline from 0) the dialog:
  //    the recording on its own line, unbroken; 唱歌、互动、聊天、整活、别的; 补上 grey until a kind is picked
  const add0=await read(`(()=>{const b=document.querySelector('[data-as-act=add]'),h=document.querySelector('[data-as-add-hint]');return{disabled:b.disabled,label:b.textContent,hint:h.textContent};})()`);
  report.addOff=add0;assert.equal(add0.disabled,true);assert.equal(add0.label,zh('as-add-btn'));assert.ok(add0.hint.startsWith(zh('as-add-hint-off')),add0.hint);
  const dlg=await read(`(async()=>{project.inPoint=400;project.outPoint=430;autoRender('review');const b=document.querySelector('[data-as-act=add]');const h=document.querySelector('[data-as-add-hint]').textContent;b.click();await new Promise(r=>setTimeout(r,200));
    const d=document.querySelector('dialog.as-add[open]');if(!d)return{hint:h,open:false};const recl=d.querySelector('[data-as-add-rec]');
    return{hint:h,open:true,title:d.querySelector('h2').textContent,rec:recl.textContent,nowrap:getComputedStyle(recl).whiteSpace,kinds:[...d.querySelectorAll('[data-as-add-kind]')].map(x=>x.textContent),ok:d.querySelector('[data-as-add-ok]').disabled,okText:d.querySelector('[data-as-add-ok]').textContent};})()`);
  report.addDialog=dlg;
  assert.ok(dlg.hint.startsWith(zh('as-add-hint-on',{from:'6:40',to:'7:10',len:'30 秒'}).slice(0,10)),dlg.hint);assert.equal(dlg.open,true);
  assert.equal(dlg.title,zh('as-add'));assert.equal(dlg.rec,zh('as-add-rec',{name:'11 月 2 日 合成录像'}));assert.equal(dlg.nowrap,'nowrap');
  assert.deepEqual(dlg.kinds,['唱歌','互动','聊天','整活','别的']);assert.equal(dlg.ok,true);assert.equal(dlg.okText,zh('as-add-pick-first'));
  await shot('corrections-add-dialog.png');
  const added=await read(`(async()=>{const d=document.querySelector('dialog.as-add[open]');[...d.querySelectorAll('[data-as-add-kind]')].find(x=>x.textContent==='整活').click();await new Promise(r=>setTimeout(r,100));
    const dd=document.querySelector('dialog.as-add[open]');dd.querySelector('[data-as-add-name]').value='被骗去跳舞';dd.querySelector('[data-as-add-ok]').click();await new Promise(r=>setTimeout(r,300));
    const c=autoState().clips.at(-1),card=document.querySelector('[data-as-card="'+c.id+'"]');
    return{open:!!document.querySelector('dialog.as-add[open]'),kind:c.kind,s:c.s,e:c.e,name:autoName(c),line:card.querySelector('[data-as-kind-line]').textContent,toast:document.querySelector('[data-as-toast-msg]').textContent};})()`);
  report.added=added;
  assert.equal(added.open,false);assert.deepEqual([added.kind,added.s,added.e,added.name],['stunt',400,430,'被骗去跳舞']);
  assert.ok(added.line.startsWith('整活'+zh('as-tag-added')),added.line);assert.equal(added.toast,zh('as-added',{name:'被骗去跳舞'}));
  assert.deepEqual((await status()).byType,{trim:0,remove:0,kind:0,add:1});
  await undoToast();assert.equal((await status()).count,0);assert.equal(await read(`autoState().clips.some(c=>c.kind==='stunt')`),false);
  await read(`(()=>{project.inPoint=null;project.outPoint=null;return true;})()`);
  // 4. a habit: five song starts moved 4 s earlier → the next search moves every song card, says so on it and in the evidence
  await read(`(async()=>{for(let i=0;i<5;i++)await window.montclipCorrections.append({type:'trim',kind:'song',startShift:-4,endShift:0,duration:480});return true;})()`);
  await search();
  const habit=await read(`(()=>{const st=autoState(),songs=st.clips.filter(c=>c.kind==='song');return{moved:songs.filter(c=>c.was).length,songs:songs.length,
    lines:[...document.querySelectorAll('[data-as-habit]')].map(x=>x.textContent),evidence:document.querySelector('.as-evidence').textContent};})()`);
  report.habit={moved:habit.moved,songs:habit.songs,line:habit.lines[0]};
  assert.ok(habit.moved>=1&&habit.moved===habit.songs,'every song card moved');assert.equal(habit.lines.length,habit.moved);
  assert.equal(habit.lines[0],'↺'+zh('as-habit-lead')+zh('as-habit-start-earlier',{d:4})+zh('as-habit-why',{n:5,unit:'首歌',of:5,unit2:'首',edge:'开头',dir:'前'})+' · '+zh('as-habit-not-now')+' · '+zh('as-habit-settings'));
  assert.ok(habit.evidence.endsWith(zh('as-evidence-habits',{n:5,k:habit.moved})),habit.evidence);
  await shot('corrections-habit.png');
  const notNow=await read(`(async()=>{const c=autoState().clips.find(x=>x.was),was=c.was;document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=not-now]').click();await new Promise(r=>setTimeout(r,200));
    const x=autoClip(c.id);return{back:x.s===was.s&&x.e===was.e,line:!!document.querySelector('[data-as-card="'+c.id+'"] [data-as-habit]')};})()`);
  assert.deepEqual(notNow,{back:true,line:false});
  // 去设置 opens the page: the switch, the counts, what is kept
  const page=await read(`(async()=>{document.querySelector('[data-as-act=learn-settings]').click();await new Promise(r=>setTimeout(r,300));const d=document.querySelector('dialog.as-learn[open]');if(!d)return null;
    return{title:d.querySelector('h2').textContent,sub:d.querySelector('[data-learn-sub]').textContent,label:d.querySelector('[data-learn-switch]').closest('label').textContent.trim(),on:d.querySelector('[data-learn-switch]').checked,
     count:d.querySelector('[data-learn-count]').textContent,bullets:[...d.querySelectorAll('[data-learn-bullets] li')].map(x=>x.textContent)};})()`);
  report.page=page;
  assert.equal(page.title,zh('as-learn-title'));assert.equal(page.sub,zh('as-learn-sub'));assert.equal(page.label,zh('as-learn-switch'));assert.equal(page.on,true);
  assert.equal(page.count,zh('as-learn-count',{n:5,trim:5,remove:0,kind:0,add:0}));assert.deepEqual(page.bullets,[zh('as-learn-b1'),zh('as-learn-b2'),zh('as-learn-b3')]);
  await shot('corrections-learn-page.png');
  // off: nothing kept, nothing used — the search is what it was with no corrections; the line says it is off
  await read(`(async()=>{const s=document.querySelector('dialog.as-learn [data-learn-switch]');s.checked=false;s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,300));document.querySelector('dialog.as-learn [data-learn-ok]').click();return true;})()`);
  assert.equal((await status()).enabled,false);
  await search();
  assert.equal(await read(`JSON.stringify(autoState().clips.map(c=>[c.kind,c.s,c.e]))`),baseline,'off: the search as with no corrections');
  assert.equal(await read(`document.querySelector('[data-as-learn-line]').textContent`),zh('as-learn-off')+zh('as-learn-off-btn'));
  await read(`(async()=>{document.querySelectorAll('[data-as-card]')[0].querySelector('[data-as-act=nudge][data-as-w=s][data-as-d="1"]').click();await new Promise(r=>setTimeout(r,200));return true;})()`);
  assert.equal((await status()).count,5,'off: the move is not kept');
  // on again, 清空记录 with its confirmation
  const cleared=await read(`(async()=>{document.querySelector('[data-as-learn-line] [data-as-act=learn]').click();await new Promise(r=>setTimeout(r,300));let d=document.querySelector('dialog.as-learn[open]');
    const s=d.querySelector('[data-learn-switch]');s.checked=true;s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,300));
    d.querySelector('[data-learn-clear]').click();await new Promise(r=>setTimeout(r,200));d=document.querySelector('dialog.as-learn[open]');const confirm=d.querySelector('[data-learn-confirm]').textContent;
    d.querySelector('[data-learn-clear-yes]').click();await new Promise(r=>setTimeout(r,300));d=document.querySelector('dialog.as-learn[open]');
    const r={confirm,count:d.querySelector('[data-learn-count]').textContent};d.querySelector('[data-learn-ok]').click();return r;})()`);
  report.cleared=cleared;
  assert.equal(cleared.confirm,zh('as-learn-clear-confirm',{n:5}));assert.equal(cleared.count,zh('as-learn-none'));assert.deepEqual([(await status()).enabled,(await status()).count],[true,0]);
  // 5. the same recording searched again: a part marked 不是唱歌 does not come back as a song
  await search();
  const marked=await read(`(async()=>{const c=autoState().clips.find(x=>x.kind==='song');const s=c.s,e=c.e;document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=set-kind]').click();await new Promise(r=>setTimeout(r,300));return{s,e};})()`);
  await search();
  const again=await read(`autoState().clips.filter(c=>c.kind==='song').map(c=>[c.s,c.e])`);
  report.again={marked,songs:again.length};
  assert.ok(!again.some(([s,e])=>Math.min(e,marked.e)-Math.max(s,marked.s)>(e-s)/2),'the marked part is not a song card again');
  assert.ok(again.length>=1,'the other song is still found');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{try{fs.rmSync(asrEmpty,{recursive:true,force:true});}catch{}out(ok?'CORRECTIONS_UI_PASS':'CORRECTIONS_UI_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
