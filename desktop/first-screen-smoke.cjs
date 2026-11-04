'use strict';
// 「✨ 自动出切片」 v12, what is left (Deja, 2026-11-03; 交互说明-v12.md: 第一屏, 手机底栏只留一行; JJ's words). Fresh profile,
// hidden offscreen window, synthetic sound only. Through the real page, at 1280×800, 630×460 and 390×844:
//  1. the first screen shows the first card: at 1280×800 down to its 「为什么选」 line, at 630×460 its name — the
//     「够好的只有 2 条」 box is one short line at 630 wide and below;
//  2. the dialog's title is one line at every width;
//  3. a narrow window's footer is one line: 「放到时间线上（2）」, 「导出 2 条」, no 「2 条 · 共…」 (the title says how many);
//  4. the footer of the three empty states (JJ's words): every card taken out 「0 条 · 先从「拿掉的」里放回要用的」, none
//     ticked 「0 条 · 先勾上要用的」 — the buttons keep their words with 0, grey and faded; nothing found as before.
// With MONTCLIP_SHOTS_OUT (an absolute folder) it saves pictures of its own window (capturePage).
//   electron desktop/first-screen-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → FIRST_SCREEN_PASS / FIRST_SCREEN_FAIL
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
 const size=async(w,h)=>{win.setContentSize(w,h);await wait(400);await read(`(()=>{autoRender('review');document.querySelector('dialog.auto-slices [data-as-body]').scrollTop=0;return true;})()`);await wait(200);};
 // where things are, in the window's pixels
 const measure=()=>read(`(()=>{const d=document.querySelector('dialog.auto-slices'),r=(e)=>e&&e.getBoundingClientRect(),f=d.querySelector('[data-as-footer]'),card=d.querySelector('[data-as-card]');
   const title=d.querySelector('.as-head b'),few=[...d.querySelectorAll('.as-card-box')].find(x=>/够好的只有/.test(x.textContent));
   const lines=(e)=>{const rg=document.createRange();rg.selectNodeContents(e);return new Set([...rg.getClientRects()].map(x=>Math.round(x.top))).size;};
   const vis=(e)=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
   return{footerTop:r(f).top,footerH:r(f).height,footerLines:new Set([...f.children].filter(vis).map(x=>Math.round(r(x).top))).size,
    cardTop:r(card).top,nameBottom:r(card.querySelector('.as-clip-title')).bottom,whyBottom:r(card.querySelector('.as-why')||card.querySelector('.as-clip-title')).bottom,
    titleLines:lines(title),titleWrap:getComputedStyle(title).whiteSpace,fewH:few?r(few).height:0,
    place:(()=>{const b=f.querySelector('[data-as-act=place]');return [...b.querySelectorAll('span')].filter(vis).map(x=>x.textContent).join('')||b.textContent;})(),
    exp:(()=>{const b=f.querySelector('[data-as-act=export]');return [...b.querySelectorAll('span')].filter(vis).map(x=>x.textContent).join('')||b.textContent;})(),
    sum:vis(f.querySelector('.as-sum'))?f.querySelector('.as-sum').textContent.trim():''};})()`);
 try{
  await until(`state.connected`,15000);
  win.setContentSize(1280,800);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'第一屏 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');updateMontClipView({language:'zh-CN'});})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=rec.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_rec',name:'11 月 2 日 合成录像',kind:'audio',src:${JSON.stringify(up.src)},duration:480});
   doc.clips.push({id:'c_rec',mediaId:'m_rec',kind:'audio',track:'A1',start:0,in:0,duration:480,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  await read(`document.getElementById('btnAutoSlices').click();true`);
  await until(`!!document.querySelector('dialog.auto-slices[open]')`);
  await read(`document.querySelector('[data-as-act=go]').click();true`);
  await until(`autoState().step==='review'&&!autoState().run`,180000);
  await read(`(()=>{const d=document.querySelector('dialog.auto-slices');if(!d.open)document.getElementById('btnAutoSlices').click();return true;})()`);
  await until(`!!document.querySelector('dialog.auto-slices[open] [data-as-card]')`);
  report.few=await read(`autoState().few`);
  assert.ok(report.few,'the fixture has the 「够好的只有」 box');
  const n=await read(`autoState().clips.filter(c=>c.on).length`);
  // 1280×800: the first card down to its 为什么选 line; the title one line
  await size(1280,800);report.desk=await measure();await shot('first-screen-1280x800.png');
  assert.ok(report.desk.whyBottom<=report.desk.footerTop,'1280: the first card\'s 为什么选 on the first screen '+JSON.stringify(report.desk));
  assert.equal(report.desk.titleLines,1);
  // 630×460: the first card's name on the first screen; the 够好的只有 box one short line; the title one line
  await size(630,460);report.narrow=await measure();await shot('first-screen-630x460.png');
  assert.ok(report.narrow.nameBottom<=report.narrow.footerTop,'630: the first card\'s name on the first screen '+JSON.stringify(report.narrow));
  assert.ok(report.narrow.fewH>0&&report.narrow.fewH<=40,'630: the 够好的只有 box is one short line: '+report.narrow.fewH);
  assert.equal(report.narrow.titleLines,1);assert.equal(report.narrow.titleWrap,'nowrap');
  // a phone-wide window (390×844): the footer one line, the short words, no summary; the title one line
  await size(390,844);report.phone=await measure();await shot('first-screen-390x844.png');
  assert.equal(report.phone.footerLines,1,'one line '+JSON.stringify(report.phone));
  assert.equal(report.phone.place,zh('as-place-short',{n}));assert.equal(report.phone.exp,zh('as-export-short',{n}));
  assert.equal(report.phone.sum,'','no 「N 条 · 共…」 on a phone: the title says how many');
  assert.equal(report.phone.titleLines,1);
  assert.ok(report.phone.nameBottom<=report.phone.footerTop,'390: the first card\'s name on the first screen');
  // back to the desktop: the long words, the summary
  await size(1280,800);const back=await measure();
  assert.equal(back.place,zh('as-place',{n}));assert.ok(back.sum.startsWith(zh('as-sum-n',{n})));
  // the empty states' footer (JJ): the buttons keep their words with 0, grey and faded; the reason on the left
  const foot=await read(`(()=>{const st=autoState(),keep={clips:st.clips,dropped:st.dropped};const d=document.querySelector('dialog.auto-slices'),f=()=>d.querySelector('[data-as-footer]');
    const look=()=>{const p=f().querySelector('[data-as-act=place]'),e=f().querySelector('[data-as-act=export]'),s=(b)=>getComputedStyle(b);
     return{sum:f().querySelector('.as-sum').textContent.trim(),place:p.textContent.trim(),exp:e.textContent.trim(),disabled:p.disabled&&e.disabled,faded:+s(p).opacity<=0.5&&+s(e).opacity<=0.5};};
    const out={};
    st.clips=keep.clips.map(c=>({...c,on:false}));autoRender('review');out.noneTicked=look();
    st.dropped=keep.clips.map(c=>({...c,on:false}));st.clips=[];autoRender('review');out.allOut=look();
    st.clips=[];st.dropped=[];autoRender('review');out.noneFound=look();
    st.clips=keep.clips;st.dropped=keep.dropped;autoRender('review');return out;})()`);
  report.foot=foot;
  const place0=zh('as-place',{n:0}),exp0=zh('as-export',{n:0});
  assert.deepEqual(foot.allOut,{sum:zh('as-foot-all-out'),place:place0,exp:exp0,disabled:true,faded:true});
  assert.deepEqual(foot.noneTicked,{sum:zh('as-foot-none-ticked'),place:place0,exp:exp0,disabled:true,faded:true});
  assert.deepEqual(foot.noneFound,{sum:(zh('as-sum-n',{n:0})+' '+zh('as-sum-none')).trim(),place:place0,exp:exp0,disabled:true,faded:true});
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{try{fs.rmSync(asrEmpty,{recursive:true,force:true});}catch{}out(ok?'FIRST_SCREEN_PASS':'FIRST_SCREEN_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
