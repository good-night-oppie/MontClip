'use strict';
// DD (PR #144 review): at 360 px the zh-CN IN / 时长 / OUT labels wrapped one character per line and the
// transport grew 86 → 104 px; .tc-io-lab now keeps one line (white-space: nowrap). This smoke measures the
// transport height at 360 / 630 / 1400 px in both languages, with IN/OUT set, and compares with main.
// Run (from the repo root of the checkout under test):
//   desktop/node_modules/electron/dist/electron desktop/tc-io-width-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 let exitCode=0;
 const out={widths:{}};setTimeout(()=>{process.stdout.write('TC_IO_WIDTH_FAIL watchdog '+JSON.stringify(out)+'\n');app.exit(1);},240000);
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  win.setMinimumSize(200,200);
  const size=async(w)=>{for(let i=0;i<10;i++){const iw=await read('innerWidth');if(Math.abs(iw-w)<=1)return;const [cw,ch]=win.getContentSize();win.setContentSize(cw+(w-iw),ch);await wait(250);}const got=await read('innerWidth');assert.ok(Math.abs(got-w)<=1,'page width '+w+', got '+got);};
  // IN/OUT set: the labels show — on the timeline, and (DD's repro) in the Source monitor, where the
  // Insert / Replace buttons join transport-end and squeeze the labels at 360 px
  await read(`(()=>{project.inPoint=1;project.outPoint=5;updateTimecode();return true})()`);
  const measure=async()=>read(`(()=>{const t=document.querySelector('#monitorPanel .transport').getBoundingClientRect();
    const labs=[...document.querySelectorAll('.tc-io-lab')].map(e=>{const r=e.getBoundingClientRect();return{text:e.textContent,h:Math.round(r.height),w:Math.round(r.width)};});
    return{transport:Math.round(t.height),labs};})()`);
  const sourceMode=async(on)=>{await read(`(()=>{
    if(${on}){let m=project.media.find(x=>x.id==='m_smoke')||(project.media.push({id:'m_smoke',name:'smoke.mp4',kind:'video',src:'/media/smoke-missing.mp4',duration:10,width:320,height:180}),project.media.at(-1));
      loadSourceFromMedia(m);state.source.in=1;state.source.out=5;}
    else clearSource();
    updateTimecode();return true;})()`);await wait(300);};
  for(const w of [360,630,1400]){
   await size(w);const r={};
   for(const language of ['zh-CN','en']){
    await read(`updateMontClipView({language:${JSON.stringify(language)}});true`);await wait(300);
    const tl=await measure();
    await sourceMode(true);const src=await measure();await sourceMode(false);
    r[language]={timeline:tl,source:src};
    for(const l of [...tl.labs,...src.labs])assert.ok(l.h<=12,`${w}px ${language}: "${l.text}" stays one line (height ${l.h})`);
   }
   out.widths[w]=r;
  }
  // DD's acceptance: same heights as main at every width, both languages
  // Measured on main 6f537e49: timeline 86/86/50, source 96/86/50; both languages.
  const expect=JSON.parse(process.env.MONTCLIP_TC_IO_EXPECT||'null')
    ||{360:{timeline:86,source:96},630:{timeline:86,source:86},1400:{timeline:50,source:50}};
  if(expect){for(const w of [360,630,1400])for(const l of ['zh-CN','en'])for(const mode of ['timeline','source'])
   assert.equal(out.widths[w][l][mode].transport,expect[w][mode],`${w}px ${l} ${mode}: transport height matches main (${expect[w][mode]})`);}
  process.stdout.write('TC_IO_WIDTH_PASS '+JSON.stringify(out)+'\n');
 }catch(e){exitCode=1;process.stdout.write('TC_IO_WIDTH_FAIL '+(e&&e.stack)+' '+JSON.stringify(out)+'\n');}
 finally{app.exit(exitCode);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
