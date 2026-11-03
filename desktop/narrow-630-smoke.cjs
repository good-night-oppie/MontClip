'use strict';
// VV (2026-11-02, 630×452): three checks in a hidden offscreen window with a fresh profile, synthetic clips only.
//  1. simple mode, a caption lane (V3) above V1/A1 that do not all fit: no visible lane is partly behind the sticky
//     ruler. Either V3 is shown whole, or it is folded away and 「字幕轨在上方」 says so; clicking that shows V3 whole.
//  2. 「引用选中字幕」 with no caption selected says 「先在时间线上选中字幕」 instead of doing nothing.
//  3. AI service settings: the API key box and the save button are fully visible without scrolling.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!require('node:path').isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
// evidence for the PR (Deja): MONTCLIP_SHOTS_OUT=<absolute folder> saves the hidden offscreen window's own page as PNGs (capturePage of
// this window only; nothing on the desktop is captured)
const shotOf=(win)=>async(name)=>{if(!shotsDir)return;await new Promise(r=>setTimeout(r,150));require('node:fs').writeFileSync(require('node:path').join(shotsDir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms)),shot=shotOf(win);
 const results={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  // VV measures the page itself: 630×460 CSS px is the content of the smallest window (frame included). An offscreen
  // window has no frame, so the app's minimum size would leave the page larger: lift it for this window only.
  win.setMinimumSize(200,200);
  for(let i=0;i<5;i++){const [iw,ih]=await read(`[innerWidth,innerHeight]`),[cw,ch]=win.getContentSize();if(iw===630&&ih===460)break;win.setContentSize(Math.round(cw*630/iw),Math.round(ch*460/ih));await wait(400);}
  assert.deepEqual(await read(`[innerWidth,innerHeight]`),[630,460],'the page is 630×460');
  for(const language of ['zh-CN','en']){
   await read(`mcView.set({mode:'simple',language:${JSON.stringify(language)}});true`);await wait(300);
   const T=await read(`(()=>{const t=MontClipView.text[${JSON.stringify(language)}];return{above:uiText('own.tl-above-captions'),noCaption:t.officialPane_noCaptionSelected,config:t.officialPane_config,save:t.officialPane_save,caption:t.officialPane_reference};})()`);
   // 1. the caption lane and the ruler (a missing file keeps V1/A1 occupied without reading any media)
   await read(`(()=>{project.media=[{id:'m_v',name:'v.mp4',kind:'video',src:'/media/synthetic-missing.mp4',duration:10,width:320,height:180}];
    const cues=FableCutCaptions.parse('1\\n00:00:01,000 --> 00:00:03,000\\n合成句子\\n');
    project.clips=[{id:'v1',mediaId:'m_v',kind:'video',track:'V1',start:0,in:0,duration:10,props:{}},{id:'a1',mediaId:'m_v',kind:'audio',track:'A1',start:0,in:0,duration:10,props:{}},...cues.map((c,i)=>FableCutCaptions.clip(c,{id:'cap'+i,track:'V3'}))];
    syncTimelineTrackView.focusKey=null;syncTimelineTrackView.unfolded=null;setSelection([]);rebuildClips();scheduleSave();return true;})()`);
   await read(`(async()=>{if(!await flushSave())throw Error('SAVE');})()`);await wait(500);
   const lanes=`(()=>{const sc=els.timelineScroll.getBoundingClientRect(),under=sc.top+RULER_H,bottom=sc.top+els.timelineScroll.clientHeight;
     const rows=[...els.tracks.children].filter(r=>!r.hidden).map(r=>{const b=r.getBoundingClientRect();return{track:r.dataset.track,top:b.top,bottom:b.bottom};});
     const partly=rows.filter(r=>r.top<under-0.5&&r.bottom>under+0.5).map(r=>r.track);
     const whole=rows.filter(r=>r.top>=under-0.5&&r.bottom<=bottom+0.5).map(r=>r.track);
     const hint=document.getElementById('btnTracksAbove');
     return{partly,whole,hidden:[...els.tracks.children].filter(r=>r.hidden&&project.clips.some(c=>c.track===r.dataset.track)).map(r=>r.dataset.track),hint:hint&&hint.getClientRects().length?hint.textContent:null,hintCut:!!hint&&hint.getClientRects().length>0&&(()=>{const box=document.getElementById('trackHeadTools').getBoundingClientRect(),b=hint.getBoundingClientRect(),rg=document.createRange();rg.selectNodeContents(hint);const t=rg.getBoundingClientRect();/* the button inside the corner, and its text (measured with a Range: Chromium buttons over-report scrollHeight) inside the button, both ways */window.__hintRects=JSON.stringify({box:[box.left,box.top,box.right,box.bottom],b:[b.left,b.top,b.right,b.bottom],t:[t.left,t.top,t.right,t.bottom]},(k,v)=>typeof v==='number'?Math.round(v*10)/10:v);return b.left<box.left-0.5||b.right>box.right+0.5||b.top<box.top-0.5||b.bottom>box.bottom+0.5||t.left<b.left-0.5||t.right>b.right+0.5||t.top<b.top-0.5||t.bottom>b.bottom+0.5;})()};})()`;
   const before=await read(lanes);
   assert.deepEqual(before.partly,[],language+': no visible lane is partly behind the ruler '+JSON.stringify(before));
   if(!before.whole.includes('V3')){
    assert.deepEqual(before.hidden,['V3'],language+': V3 is folded away, not left behind the ruler');
    assert.equal(before.hint,T.above,language+': the hint says the caption lane is above');
    assert.equal(before.hintCut,false,language+': the hint is not cut off '+await read('window.__hintRects'));
    await read(`document.getElementById('btnTracksAbove').click();true`);await wait(300);
    const after=await read(lanes);
    assert.ok(after.whole.includes('V3'),language+': after the hint, V3 is shown whole '+JSON.stringify(after));
    assert.deepEqual(after.partly,[],language+': and nothing is partly behind the ruler');
    assert.equal(after.hint,null,language+': the hint goes away');
   }
   results[language]={lanes:before};
   // 2. reference with no caption selected
   await read(`setSideTab('assistant');mcAgent.render();true`);await wait(300);
   await read(`(()=>{const b=[...document.querySelectorAll('.cindy-port [data-reference-actions] button')].find(b=>b.textContent===${JSON.stringify(T.caption)});b.click();return true;})()`);await wait(400);
   const status=await read(`[...document.querySelectorAll('.cindy-port [role=status]')].map(e=>e.textContent).join('|')`);
   assert.ok(status.includes(T.noCaption),language+': 「引用选中字幕」 with nothing selected says so: '+status);
   // 3. settings: key box and save button visible without scrolling
   await read(`(()=>{const b=[...document.querySelectorAll('.cindy-port button')].find(b=>b.textContent===${JSON.stringify(T.config)});b.click();return true;})()`);await wait(400);
   const box=await read(`(()=>{const box=document.querySelector('.cindy-config'),r=box.getBoundingClientRect(),port=document.querySelector('.cindy-port').getBoundingClientRect();
     const inside=e=>{const b=e.getBoundingClientRect();return b.height>0&&b.top>=Math.max(r.top,port.top)-0.5&&b.bottom<=Math.min(r.bottom,port.bottom)+0.5;};
     const save=[...box.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(T.save)});
     return{height:Math.round(r.height),scrollTop:box.scrollTop,key:inside(box.querySelector('input[type=password]')),save:inside(save)};})()`);
   assert.equal(box.scrollTop,0);
   assert.equal(box.key,true,language+': the API key box is visible '+JSON.stringify(box));
   assert.equal(box.save,true,language+': the save button is visible '+JSON.stringify(box));
   results[language].config=box;
   await shot('narrow-630-settings-'+language);
   await read(`(()=>{const b=[...document.querySelectorAll('.cindy-port button')].find(b=>b.textContent===${JSON.stringify(T.config)});b.click();return true;})()`);await wait(300);
   const back=await read(`!!document.querySelector('.cindy-port .cindy-composer')&&getComputedStyle(document.querySelector('.cindy-port .cindy-composer')).display!=='none'`);
   assert.equal(back,true,language+': closing the settings brings the composer back');
  }
  process.stdout.write('NARROW630_COMPLETE '+JSON.stringify(results)+'\n');
 }catch(e){process.stdout.write('NARROW630_FAIL '+(e&&e.message)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
