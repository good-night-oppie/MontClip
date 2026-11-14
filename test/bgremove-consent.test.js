'use strict';
// Deja (2026-11-04): MontClip may go online, but before each outbound connection the streamer is shown where it goes and
// what is sent. AI background removal (props.bgRemove) is one such connection: app.js ensureBgSeg loads MediaPipe's
// selfie segmentation (a script, then its wasm and model files through locateFile) from cdn.jsdelivr.net.
//   browser / server mode: turning it on asks first (the host, "download only"); a yes holds for this session. Opening
//     a project or drawing a frame never bypass consent. Export refuses unavailable masks and reports the reason.
//   desktop: the page never tries (desktop/main.js blocks every non-local request, and its CSP is script-src 'self'),
//     so no box that can only fail; a plain hint instead.
// app.js is a browser script, so the AI BACKGROUND REMOVAL section (and the shared consent box from FONTS) is sliced out
// and run against a small fake page that records every request it would make.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'app/app.js'),'utf8');
const slice=(from,to)=>{const i=SRC.indexOf(from),j=SRC.indexOf(to,i);a.ok(i>=0&&j>i,'markers: '+from);return SRC.slice(i,j);};
const BG=slice('/* ═════════════ AI BACKGROUND REMOVAL','/* ═══════════ PIXEL PIPELINE');
// the shared consent box (FONTS), when there is one
const fn=(name)=>{const i=SRC.indexOf('function '+name+'(');if(i<0)return '';const j=SRC.indexOf('\n}\n',i);return SRC.slice(i,j+3);};
const LOCAL='http://127.0.0.1:7777';
const MP_FILES=['selfie_segmentation_solution_simd_wasm_bin.js','selfie_segmentation_solution_simd_wasm_bin.wasm','selfie_segmentation.tflite','selfie_segmentation.binarypb'];

class El{
 constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.dataset={};this.listeners={};this._text='';this.open=false;this.parent=null;}
 set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
 append(...xs){for(const x of xs){if(x&&typeof x==='object')x.parent=this;this.children.push(x);this.onAppend?.(x);}}
 appendChild(x){this.append(x);return x;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 setAttribute(){} addEventListener(t,f){(this.listeners[t]||=[]).push(f);}
 dispatch(t){for(const f of this.listeners[t]||[])f({type:t,preventDefault(){}});}
 click(){this.onclick?.();this.dispatch('click');}
 showModal(){this.open=true;} close(){this.open=false;this.dispatch('close');}
 focus(){} getContext(){return{drawImage(){}};}
 all(){return this.children.flatMap(c=>typeof c==='string'?[]:[c,...c.all()]);}
}
function page({desktop=false,clips=[],scriptFailures=0,sendFails=false,noResult=false}={}){
 const requests=[],toasts=[],scripts=[];
 const head=new El('head'),body=new El('body');
 // a <script src> is a request; it "loads" a moment later
 head.onAppend=(x)=>{if(x.tagName==='SCRIPT'){scripts.push(x.src);setTimeout(()=>x.onload?.(),0);}};
 const document={head,body,createElement:(t)=>new El(t)};
 // what MediaPipe's script would do once loaded: fetch its wasm and model through locateFile
 class SelfieSegmentation{constructor({locateFile}){for(const f of MP_FILES)requests.push(locateFile(f));}setOptions(){}onResults(cb){this.cb=cb;}async send(){if(sendFails)throw Error('synthetic model failure');if(!noResult)this.cb({segmentationMask:{width:8,height:8}});}}
 const window=desktop?{montclipViewSettings:{}}:{};
 const assets=require('../app/bgremove-assets');
 // Asset byte verification is covered separately with real WebCrypto and synthetic fixtures.
 window.MontClipBgAssets={async load(consent){
  a.equal(consent,true);requests.push(assets.source('selfie_segmentation.js'));
  if(scriptFailures-->0)throw Error('synthetic network failure');
  for(const name of Object.keys(assets.FILES).slice(1))requests.push(assets.source(name));
  return {locateFile(name){assets.source(name);return 'blob:local/'+name;},dispose(){}};
 }};
 const runtime={mediaAux:new Map()};
 const uiText=(k,v)=>k+(v?' '+JSON.stringify(v):'');
 const stubs={window,document,runtime,uiText,SelfieSegmentation,
  toast:(m)=>toasts.push({m}),toastAction:(m,label,fn)=>toasts.push({m,label,fn}),
  mediaClips:()=>clips,clipRenders:c=>!c.disabled&&!c.hidden,clipEnd:c=>c.start+c.duration,
  activeAt:(c,t)=>t>=c.start&&t<c.start+c.duration,getClipEl:()=>null,
  evalProps:c=>({...c.props,...(c.keyframes?.bgRemove?.length?{bgRemove:c.keyframes.bgRemove[0].v}:{})}),
  exportRange:()=>({start:0,end:3}),fontDesktop:()=>!!window.montclipViewSettings,setTimeout,clearTimeout};
 const names=['ensureBgSeg','requestMask','requestBgRemove','noteBgRemove','noteExportBgRemove','prepareFrameAssets','bgSeg'];
 const code=BG+'\n'+fn('askNetConsent')+'\nasync '+fn('prepareFrameAssets')+'\nreturn {'+names.map(n=>`${n}: typeof ${n}!=="undefined"?${n}:undefined`).join(',')+'};';
 const api=new Function(...Object.keys(stubs),code)(...Object.values(stubs));
 const external=()=>requests.filter(u=>/^https?:/.test(String(u))&&!String(u).startsWith(LOCAL));
 const dialog=()=>body.all().find(e=>e.tagName==='DIALOG'&&e.open);
 const button=(which)=>dialog().all().find(e=>e.tagName==='BUTTON'&&Object.values(e.dataset).includes(which));
 return {api,requests,scripts,external,toasts,dialog,button};
}
const tick=(ms=5)=>new Promise(r=>setTimeout(r,ms));
const hostOf=(u)=>new URL(u).hostname;
const video={id:'c1',kind:'video',start:0,duration:3,props:{bgRemove:true}};
const frame={videoWidth:640,naturalWidth:0};

test('browser mode: nobody said yes — drawing a bgRemove clip and exporting it send nothing out',async()=>{
 const p=page({clips:[video]});
 p.api.ensureBgSeg();
 p.api.requestMask('c1',frame);            // a preview frame
 await a.rejects(p.api.requestMask('c1',frame,true),/BG_REMOVE_UNAVAILABLE/); // export must fail closed
 await tick();
 a.deepEqual(p.external(),[],'no request left this computer');
});

test('opening keeps the preview hint; exporting refuses unavailable masks',async()=>{
 const p=page({clips:[video]});
 a.equal(typeof p.api.noteBgRemove,'function','noteBgRemove exists');
 await p.api.noteBgRemove();
 a.ok(p.toasts.some(t=>/bgremove/.test(t.m)&&t.fn),'a hint with a button that asks');
 p.toasts.length=0;await p.api.noteBgRemove();
 a.equal(p.toasts.length,0,'told once a session');
 a.equal(typeof p.api.noteExportBgRemove,'function','noteExportBgRemove exists');
 a.throws(()=>p.api.noteExportBgRemove(),/BG_REMOVE_UNAVAILABLE/,'export refuses uncut output');
 await tick();
 a.deepEqual(p.external(),[]);
});

test('explicit retry after a failed download succeeds; drawing never retries',async()=>{
 const p=page({scriptFailures:1});
 const first=p.api.requestBgRemove();await tick();p.button('allow').click();
 a.equal(await first,false);a.equal(p.api.bgSeg.consent,true);
 await p.api.ensureBgSeg();a.equal(p.external().length,1);
 const second=p.api.requestBgRemove(),concurrent=p.api.requestBgRemove();
 a.equal(await second,true);a.equal(await concurrent,true);
 a.equal(p.external().filter(u=>u.endsWith('/selfie_segmentation.js')).length,2);
 a.equal(p.dialog(),undefined);
});

test('a recreated page has no consent or assets and asks before loading all files again',async()=>{
 const first=page(); const ready=first.api.requestBgRemove();await tick();first.button('allow').click();
 a.equal(await ready,true);a.equal(first.external().length,9);
 const reopened=page();a.equal(reopened.api.bgSeg.consent,false);a.equal(reopened.api.bgSeg.seg,null);
 await reopened.api.ensureBgSeg();a.equal(reopened.external().length,0);
 const next=reopened.api.requestBgRemove();await tick();a.ok(reopened.dialog());
 a.equal(reopened.external().length,0);reopened.button('allow').click();
 a.equal(await next,true);a.equal(reopened.external().length,9);
 a.notEqual(reopened.api.bgSeg.seg,first.api.bgSeg.seg);
});

test('export preflight ignores disabled, hidden and out-of-range clips',()=>{
 for(const c of [{...video,disabled:true},{...video,hidden:true},{...video,start:3},{...video,start:-3}]){
  const p=page({clips:[c]});a.doesNotThrow(()=>p.api.noteExportBgRemove());a.deepEqual(p.external(),[]);
 }
});

test('forced masks wait for loading and reject missing, stale or failed inference',async()=>{
 const ready=page();ready.api.bgSeg.consent=true;
 await ready.api.requestMask('c1',frame,true);a.ok(ready.api.bgSeg.masks.get('c1'));
 for(const opts of [{sendFails:true},{noResult:true}]){
  const p=page(opts);p.api.bgSeg.consent=true;await p.api.ensureBgSeg();
  p.api.bgSeg.masks.set('c1',{stale:true});
  await a.rejects(p.api.requestMask('c1',frame,true),/BG_REMOVE_UNAVAILABLE/);
  a.equal(p.api.bgSeg.masks.has('c1'),false);
  await a.rejects(p.api.requestMask('c1',frame,true),/BG_REMOVE_UNAVAILABLE/,'failure does not poison the queue');
 }
});

test('frame preparation rejects missing media; realtime refuses even a loaded model',async()=>{
 const p=page({clips:[video]});p.api.bgSeg.consent=true;await p.api.ensureBgSeg();
 a.doesNotThrow(()=>p.api.noteExportBgRemove());
 a.throws(()=>p.api.noteExportBgRemove({start:0,end:3},true),/bgremove-export-realtime/);
 await a.rejects(p.api.prepareFrameAssets(1),/BG_REMOVE_UNAVAILABLE/);
 await p.api.prepareFrameAssets(4);
});

test('a numeric bgRemove keyframe cannot bypass export mask checks',async()=>{
 const p=page({clips:[{...video,props:{bgRemove:false},keyframes:{bgRemove:[{t:0,v:1}]}}]});
 a.throws(()=>p.api.noteExportBgRemove(),/BG_REMOVE_UNAVAILABLE/);
 await a.rejects(p.api.prepareFrameAssets(1),/BG_REMOVE_UNAVAILABLE/);
 a.deepEqual(p.external(),[]);
});

test('browser mode: turning it on asks first — the box names cdn.jsdelivr.net and says download only; No sends nothing',async()=>{
 const p=page();
 a.equal(typeof p.api.requestBgRemove,'function','requestBgRemove exists');
 const r=p.api.requestBgRemove();
 await tick();
 const d=p.dialog();a.ok(d,'the confirmation box is open');
 const text=d.textContent;
 a.ok(text.includes('cdn.jsdelivr.net'),'the host');
 a.ok(/bgremove-net-sent/.test(text),'what is (not) sent');
 a.deepEqual(p.external(),[],'nothing sent while the box is open');
 p.button('deny').click();
 a.equal(await r,null,'the streamer said no');
 await tick();
 a.deepEqual(p.external(),[],'nothing sent after No');
 p.api.requestMask('c1',frame);await tick();
 a.deepEqual(p.external(),[],'and drawing still sends nothing');
 const again=p.api.requestBgRemove();await tick();
 a.ok(p.dialog(),'asked again: a No is not remembered as a yes');p.button('deny').click();await again;
});

test('browser mode: after Yes, only cdn.jsdelivr.net; not asked twice this session',async()=>{
 const p=page();
 const r=p.api.requestBgRemove();await tick();
 p.button('allow').click();
 a.equal(await r,true);
 a.ok(p.scripts.every(u=>u.startsWith('blob:local/')),'scripts execute only from verified local bytes');
 const ext=p.external();
 a.ok(ext.length>=1+MP_FILES.length,'the script and its files were requested');
 for(const u of ext){a.equal(hostOf(u),'cdn.jsdelivr.net',u);a.ok(new URL(u).pathname.startsWith('/npm/@mediapipe/selfie_segmentation'),u);}
 a.equal(await p.api.requestBgRemove(),true);a.equal(p.dialog(),undefined,'not asked twice');
 a.equal(p.external().length,ext.length,'and not fetched twice');
});

test('consented downloads never resolve the floating MediaPipe package',async()=>{
 const p=page();const r=p.api.requestBgRemove();await tick();p.button('allow').click();
 a.equal(await r,true);
 for(const url of p.external())
  a.match(url,/\/npm\/@mediapipe\/selfie_segmentation@0\.1\.1675465747\//,'every runtime resource has an exact version');
});

test('desktop: no box that can only fail, no request, a plain hint',async()=>{
 const d=page({desktop:true,clips:[video]});
 a.equal(typeof d.api.requestBgRemove,'function','requestBgRemove exists');
 a.equal(await d.api.requestBgRemove(),null);
 d.api.requestMask('c1',frame);await d.api.noteBgRemove();await tick();
 a.equal(d.dialog(),undefined,'no box on desktop');
 a.deepEqual(d.external(),[],'nothing requested');
 a.ok(d.toasts.some(t=>/bgremove-desktop/.test(t.m)),'the streamer is told');
});

test('call sites: the checkbox asks; nothing else builds the CDN address; the page code has no other outside address',()=>{
 a.equal((SRC.match(/https:\/\/cdn\.jsdelivr\.net/g)||[]).length,0,'app cannot build an unverified CDN address');
 a.match(SRC,/MontClipBgAssets\.load\(bgSeg.consent\)/,'verified assets are behind the consent gate');
 a.match(slice('function ensureBgSeg(','\n}\n'),/bgSeg\.consent/,'and ensureBgSeg only goes there after a yes');
 a.match(SRC,/k === "bgRemove"[\s\S]{0,200}requestBgRemove\(/,'the inspector checkbox asks');
 // every https:// address the editor page could reach: Google Fonts (#151) and MediaPipe, both behind a box.
 // transcribe.js runs the local server's Paraformer (#70): no Whisper, no CDN.
 const files=['app/app.js','shared/transcribe.js','app/index.html','shared/ui-preferences.js','shared/ui-terms.js'];
 for(const f of files){
  const src=fs.readFileSync(path.join(ROOT,f),'utf8');
  const hosts=[...src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m=>m[1].toLowerCase())
   .filter(h=>!['127.0.0.1','localhost','www.w3.org'].includes(h));
  const allowed=f==='app/app.js'?['fonts.googleapis.com','cdn.jsdelivr.net']:[];
  for(const h of hosts)a.ok(allowed.includes(h),`${f}: ${h} is not a known, gated host`);
 }
 const tx=fs.readFileSync(path.join(ROOT,'shared/transcribe.js'),'utf8');
 a.ok(!/import\(|importScripts|new Worker|fetch\(\s*["'`]https?:/.test(tx),'transcribe.js loads no code or model from outside');
});
