'use strict';
// 「✨ 自动出切片」 review cards, visual fixes from JJ's v11 visual review as the frozen v12 has them (Deja, 2026-11-03; JJ's
// file sha256 327cb1e9…; 原型-v12.html d289ff06…, 交互说明-v12.md d59748f7…; v11 is void).
// Fresh profile, hidden offscreen window, synthetic sound only (test/songs-synth.js). Through the real page:
//  1. 「点上面的名字可以改……」 is written once, on the first card; the other cards keep it in the name's tooltip;
//  2. the long note under the drag strips is on no card: a card keeps only its tag (「估的」 / 「比较可能」), and the note is
//     written once, above the cards (and in the 「估的」 tag's tooltip);
//  3. 「不要这条」 is the last button of every card, at its right edge, a grey text button; one 〔撤销〕 brings the card back;
//  4. blue is only on the primary button and on selected things (the current step is one);
//  v12: the kind line in the name's row, the ± buttons on the row of 开头 / 结尾, the note under the overview, the question
//  on one line between two thin lines, the evidence with a thin line on its left, 〔▶ 试看〕 bold; never 笑声.
// With MONTCLIP_SHOTS_OUT (an absolute folder) it saves pictures of its own window (capturePage) for the PR.
//   electron desktop/slice-cards-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → SLICE_CARDS_PASS / SLICE_CARDS_FAIL
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
 try{
  await until(`state.connected`,15000);
  win.setContentSize(1280,800);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'卡片视觉 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');updateMontClipView({language:'zh-CN'});})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=rec.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_rec',name:'11 月 2 日 合成录像',kind:'audio',src:${JSON.stringify(up.src)},duration:480});
   doc.clips.push({id:'c_rec',mediaId:'m_rec',kind:'audio',track:'A1',start:0,in:0,duration:480,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  // the start page first: blue only on the primary button and the selected choices
  await read(`document.getElementById('btnAutoSlices').click();true`);
  await until(`!!document.querySelector('dialog.auto-slices[open]')`);
  const BLUE=`(()=>{const d=document.querySelector('dialog.auto-slices'),blue=/rgba?\\((123, 108, 255|79, 140, 255)(, (0?\\.[1-9]\\d*|1))?\\)/;
    const allowed=e=>e.matches('.btn.primary,.btn.primary *,.as-seg button.on,.as-rec.on,.as-clip.focus,.as-strip.on,.as-stepper li.on,input[type=checkbox]');
    const bad=[];for(const e of d.querySelectorAll('*')){if(allowed(e)||!e.getClientRects().length)continue;const s=getComputedStyle(e);
     for(const p of ['color','backgroundColor','borderTopColor','borderLeftColor','outlineColor','fill','stroke'])if(blue.test(s[p])&&!(p==='outlineColor'&&s.outlineStyle==='none')&&!(p.startsWith('border')&&parseFloat(s[p==='borderTopColor'?'borderTopWidth':'borderLeftWidth'])===0))bad.push((e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className)+' '+e.tagName.toLowerCase()+' '+p);}
    return [...new Set(bad)];})()`;
  report.blueStart=await read(BLUE);
  await read(`document.querySelector('[data-as-act=go]').click();true`);
  await until(`autoState().step==='review'&&!autoState().run`,180000);
  await read(`(()=>{const d=document.querySelector('dialog.auto-slices');if(!d.open)document.getElementById('btnAutoSlices').click();return true;})()`);
  await until(`!!document.querySelector('dialog.auto-slices[open] [data-as-card]')`);
  const hint=zh('as-song-name-hint'),note=zh('as-guess-note');
  // 1. the name hint, once, on the first card
  const names=await read(`(()=>{const d=document.querySelector('dialog.auto-slices'),cards=[...d.querySelectorAll('[data-as-card]')],h=${JSON.stringify(hint)},f='这是文件名，不会出现在画面里';
    const count=(s)=>d.innerText.split(s).length-1;
    return{cards:cards.length,songs:autoState().clips.filter(c=>c.kind==='song').length,hint:count(h),filename:count(f),inFirst:cards[0].innerText.includes(h),
     titles:cards.map(c=>c.querySelector('[data-as-act=rename]').title)};})()`);
  report.names=names;
  assert.ok(names.cards>=2&&names.songs>=1,'more than one card, a song among them');
  assert.equal(names.hint,1,'「点上面的名字可以改」 written once');assert.equal(names.inFirst,true,'on the first card');
  assert.equal(names.filename,0,'no per-card file-name line either');
  assert.ok(names.titles.every(t=>t===zh('as-rename-tip')),'every name has the tooltip');
  // 2. the 比较可能 parts: tags only on the cards, nothing written under the strips
  const likely=await read(`(()=>{const d=document.querySelector('dialog.auto-slices');
    return{hints:d.querySelectorAll('[data-as-hint],.as-guess,.as-likely').length,tags:[...d.querySelectorAll('[data-as-card] [data-as-level]')].map(e=>[e.textContent,e.title]),
     note:d.querySelectorAll('[data-as-guess-note]').length};})()`);
  report.likely={hints:likely.hints,tags:likely.tags.length,note:likely.note};
  assert.equal(likely.hints,0,'no long note under any strip');
  assert.ok(likely.tags.length>0&&likely.tags.every(([t,title])=>t==='比较可能'&&/^(开头|结尾)比较可能在这里，还是点「▶ 听(开头|结尾)」听一下再定。$/.test(title)),JSON.stringify(likely.tags.slice(0,2)));
  assert.equal(likely.note,0,'nothing estimated: no note above the cards');
  // the estimated parts (the best 45 s of each song); the long note they used to carry ('开头是估的，可能差几秒到十几秒…') is gone: every edge tagged 「估的」, the note once, above the cards
  const est=await read(`(()=>{const st=autoState(),r=MontClipAutoSlices.build({recordings:st.recs,kind:'sing',count:5,len:'hook'});st.clips=r.clips.map((c,i)=>({...c,on:true}));autoRender('review');
    const d=document.querySelector('dialog.auto-slices'),n=d.querySelectorAll('[data-as-guess-note]'),cards=d.querySelector('[data-as-cards]'),N=${JSON.stringify(note)};
    return{cards:d.querySelectorAll('[data-as-card]').length,edges:d.querySelectorAll('[data-as-card] [data-as-edge]').length,tags:[...d.querySelectorAll('[data-as-card] [data-as-level]')].map(e=>[e.textContent,e.title]),
     notes:n.length,text:n[0]&&n[0].textContent,count:d.innerText.split(N).length-1,above:!!n[0]&&!n[0].closest('[data-as-card]')&&!!(d.querySelector('.as-ov').compareDocumentPosition(n[0])&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(n[0].compareDocumentPosition(d.querySelector('[data-as-card]'))&Node.DOCUMENT_POSITION_FOLLOWING),
     long:(d.innerText.match(/(开头|结尾)是估的，可能差几秒到十几秒/g)||[]).length,hints:d.querySelectorAll('[data-as-hint],.as-guess,.as-likely').length};})()`);
  report.estimated={cards:est.cards,edges:est.edges,notes:est.notes,count:est.count,above:est.above,long:est.long};
  assert.ok(est.cards>=2,'estimated cards');
  assert.equal(est.tags.length,est.edges,'a tag beside every start and end');
  assert.ok(est.tags.every(([t,title])=>t==='估的'&&title===note),'「估的」 stays, with the note in its tooltip');
  assert.equal(est.notes,1);assert.equal(est.text,note);assert.equal(est.count,1,'the note written once');assert.equal(est.above,true,'under the overview, above the first card, on no card');
  assert.equal(est.long,0,'the long per-card note is gone');assert.equal(est.hints,0);
  await read(`document.querySelector('.auto-slices .as-body').scrollTop=0;true`);await shot('slice-cards-1280x800-top.png');
  // 3. 不要这条: the last button of every card, at its right edge, grey text; one 〔撤销〕 brings the card back
  const drop=await read(`(()=>{const d=document.querySelector('dialog.auto-slices');
    return [...d.querySelectorAll('[data-as-card]')].map(card=>{const bs=[...card.querySelectorAll('button')],last=bs.at(-1),row=last.parentElement,s=getComputedStyle(last),dim=getComputedStyle(d.querySelector('.as-small')).color;
     const others=[...row.querySelectorAll('button')].filter(b=>b!==last);
     return{last:last.dataset.asAct,right:Math.abs(row.getBoundingClientRect().right-parseFloat(getComputedStyle(row).paddingRight)-last.getBoundingClientRect().right)<=2,
      beyond:others.every(b=>b.getBoundingClientRect().right<last.getBoundingClientRect().left),grey:s.color===dim,text:s.backgroundColor==='rgba(0, 0, 0, 0)'&&parseFloat(s.borderTopWidth)===0};});})()`);
  report.drop=drop[0];
  assert.ok(drop.every(x=>x.last==='drop'),'「不要这条」 is the last button: '+drop.map(x=>x.last).join());
  assert.ok(drop.every(x=>x.right&&x.beyond),'at the right edge, after the others');
  assert.ok(drop.every(x=>x.grey&&x.text),'a grey text button: '+JSON.stringify(drop[0]));
  const undo=await read(`(()=>{const st=autoState(),before=JSON.stringify(st.clips),cards=[...document.querySelectorAll('[data-as-card]')],id=cards[1].dataset.asCard;
    cards[1].querySelector('[data-as-act=drop]').click();const gone=!document.querySelector('[data-as-card="'+id+'"]'),t=document.querySelector('[data-as-toast]');
    const toast={shown:!t.hidden,msg:t.querySelector('[data-as-toast-msg]').textContent,undo:!t.querySelector('[data-as-toast-undo]').hidden};
    t.querySelector('[data-as-toast-undo]').click();const back=[...document.querySelectorAll('[data-as-card]')].map(c=>c.dataset.asCard);
    return{gone,toast,back:JSON.stringify(st.clips)===before,place:back[1]===id,label:t.querySelector('[data-as-toast-undo]').textContent};})()`);
  report.undo=undo;
  assert.equal(undo.gone,true);assert.ok(undo.toast.shown&&undo.toast.undo,'the toast offers 〔撤销〕');
  assert.equal(undo.back,true,'one 〔撤销〕 brings the cards back as they were');assert.equal(undo.place,true,'in its place');
  await read(`(()=>{const c=document.querySelectorAll('[data-as-card]')[1];c.scrollIntoView({block:'center'});return true;})()`);await shot('slice-cards-1280x800-card.png');
  // v12 layout at 1280×800: the kind line in the name row; the ± buttons on the row of 开头 / 结尾; 〔▶ 试看〕 bold; the lyrics
  // button in the button row; the evidence with a thin line on its left; the question on one line between two thin lines
  const v12=await read(`(async()=>{const st=autoState();st.ask=true;autoRender('review');await new Promise(r=>setTimeout(r,100));const d=document.querySelector('dialog.auto-slices'),card=d.querySelector('[data-as-card]');
    const mid=e=>{const r=e.getBoundingClientRect();return (r.top+r.bottom)/2;},same=(x,y)=>Math.abs(mid(x)-mid(y))<8;
    const title=card.querySelector('.as-clip-title'),kind=card.querySelector('[data-as-kind-line]'),lbl=card.querySelector('[data-as-edge=s] .as-lbl'),nb=card.querySelector('[data-as-edge=s] [data-as-act=nudge]');
    const ev=getComputedStyle(d.querySelector('.as-evidence')),ask=d.querySelector('[data-as-ask]'),as=getComputedStyle(ask),askBtn=ask.querySelector('button'),askTitle=ask.querySelector('b');
    const r={kindInTitle:!!kind&&title.contains(kind)&&same(kind,title.querySelector('input')),nudgesBeside:!!nb&&same(lbl,nb),
     play:Number(getComputedStyle(card.querySelector('[data-as-act=play]')).fontWeight)>=600,
     lyrics:d.querySelectorAll('[data-as-lyrics]').length===0,
     evidence:ev.borderLeftWidth==='2px'&&ev.borderLeftStyle==='solid'&&ev.color===getComputedStyle(d).color,
     ask:as.borderTopWidth==='1px'&&as.borderBottomWidth==='1px'&&as.borderLeftWidth==='0px'&&same(askTitle,askBtn),
     laugh:/笑声/.test(d.innerText)};
    st.ask=false;autoRender('review');return r;})()`);
  report.v12=v12;
  assert.deepEqual(v12,{kindInTitle:true,nudgesBeside:true,play:true,lyrics:true,evidence:true,ask:true,laugh:false});
  // VV / Deja: 〔按歌词校准字幕〕 not in the page until the card can use it (checked above); once it can (stubbed here), the
  // short words on the button and the long sentence in its tooltip, pressable
  const lyr=await read(`(()=>{const keep=autoLyricsAvailable;autoLyricsAvailable=()=>true;autoRender('review');
    const b=[...document.querySelectorAll('[data-as-card]')].filter(c=>autoClip(c.dataset.asCard).kind==='song').map(c=>c.querySelector('.as-actions [data-as-lyrics]'));
    const r={all:b.length>0&&b.every(Boolean),text:b[0]&&b[0].textContent,title:b[0]&&b[0].title,disabled:!!b[0]&&b[0].disabled};
    autoLyricsAvailable=keep;autoRender('review');r.goneAgain=document.querySelectorAll('[data-as-lyrics]').length===0;return r;})()`);
  report.lyrics=lyr;
  assert.deepEqual([lyr.all,lyr.text,lyr.title.includes(zh(require('../auto-slices').songsTrusted()?'as-lyrics':'as-lyrics-maybe')),lyr.disabled,lyr.goneAgain],[true,zh('as-lyrics'),true,false,true]);
  // every disabled button of the dialog looks disabled: greyed, no hand cursor (nothing ticked: 放到时间线上 / 直接导出)
  const dis=await read(`(()=>{const st=autoState(),keep=st.clips.map(c=>c.on);st.clips.forEach(c=>c.on=false);autoRender('review');
    const d=document.querySelector('dialog.auto-slices'),out=[...d.querySelectorAll('button:disabled')].map(b=>{const s=getComputedStyle(b);return{name:b.dataset.asAct||b.textContent.trim().slice(0,12),opacity:+s.opacity,cursor:s.cursor};});
    st.clips.forEach((c,i)=>c.on=keep[i]);autoRender('review');return out;})()`);
  report.disabled=dis;
  assert.ok(dis.length>=2&&dis.every(x=>x.opacity<=0.6&&x.cursor!=='pointer'),'disabled looks disabled: '+JSON.stringify(dis));
  // 4. blue: on the review page too
  report.blueReview=await read(BLUE);
  assert.deepEqual(report.blueStart,[],'start page: '+report.blueStart.join(' | '));
  assert.deepEqual(report.blueReview,[],'review page: '+report.blueReview.join(' | '));
  // the narrow window (630×460): the note and the cards still read; a picture for VV
  win.setContentSize(630,460);await wait(400);
  await read(`document.querySelector('.auto-slices .as-body').scrollTop=0;true`);await shot('slice-cards-630x460.png');
  report.narrow=await read(`(()=>{const d=document.querySelector('dialog.auto-slices'),n=d.querySelector('[data-as-guess-note]'),b=d.querySelector('[data-as-card] [data-as-act=drop]'),card=b.closest('[data-as-card]');
    return{note:!!n&&n.getBoundingClientRect().width>0,dropInside:b.getBoundingClientRect().right<=card.getBoundingClientRect().right+0.5,overflow:d.querySelector('.as-body').scrollWidth<=d.querySelector('.as-body').clientWidth+1};})()`);
  assert.deepEqual(report.narrow,{note:true,dropInside:true,overflow:true});
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{try{fs.rmSync(asrEmpty,{recursive:true,force:true});}catch{}out(ok?'SLICE_CARDS_PASS':'SLICE_CARDS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
