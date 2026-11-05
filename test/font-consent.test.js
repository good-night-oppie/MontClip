'use strict';
// Deja (2026-11-04): MontClip may go online, but before each outbound connection the streamer is shown where it goes and
// what is sent. Google Fonts is one such connection (app.js ensureFont: a <link> to fonts.googleapis.com, whose CSS pulls
// the files from fonts.gstatic.com).
//   browser / server mode: ask first (font names, both hosts, what is sent); a font confirmed once this session isn't
//     asked again, but there is no way around the box. Opening a project, drawing a frame and exporting never go online
//     by themselves: an unconfirmed font is drawn and exported in the fallback face, and the streamer is told.
//   desktop: no Google font box or Load button; the picker lists no Google font that isn't on this computer; a missing
//     font falls back and the streamer is told. (desktop/main.js keeps blocking every non-local request.)
// app.js is a browser script, so the FONTS section is sliced out and run against a small fake page that records every
// request it would make.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const slice=(from,to)=>{const i=SRC.indexOf(from),j=SRC.indexOf(to,i);a.ok(i>=0&&j>i,'markers: '+from);return SRC.slice(i,j);};
const lift=(re)=>{const m=re.exec(SRC);a.ok(m,String(re));return new Function('return ('+m[1]+');')();};
const FONTS=slice('/* ═══════════════════════════ FONTS','/* ── Main loop ── */');
const SYSTEM_FONTS=lift(/const SYSTEM_FONTS = (\[[\s\S]*?\]);/),GOOGLE_FONTS=lift(/const GOOGLE_FONTS = (\[[\s\S]*?\]);/);
const FONT_CUT_DEFAULT=lift(/const FONT_CUT_DEFAULT = (\[[\s\S]*?\]);/);
const LOCAL='http://127.0.0.1:7777';

class El{
 constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.dataset={};this.listeners={};this.attrs={};this._text='';this.hidden=false;this.open=false;this.parent=null;}
 set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
 append(...xs){for(const x of xs){if(x&&typeof x==='object')x.parent=this;this.children.push(x);this.onAppend?.(x);}}
 appendChild(x){this.append(x);return x;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 setAttribute(k,v){this.attrs[k]=String(v);} addEventListener(t,f){(this.listeners[t]||=[]).push(f);}
 dispatch(t){for(const f of this.listeners[t]||[])f({type:t,preventDefault(){}});}
 click(){this.onclick?.();this.dispatch('click');}
 showModal(){this.open=true;} close(){this.open=false;this.dispatch('close');}
 focus(){} classList={add(){},remove(){},contains(){return false;}};
 all(){return this.children.flatMap(c=>typeof c==='string'?[]:[c,...c.all()]);}
}
function page({desktop=false,clips=[],installed=[]}={}){
 const requests=[],toasts=[];
 const head=new El('head'),body=new El('body');
 // a stylesheet <link> is a request; it "loads" a moment later (and its CSS would fetch the font files)
 head.onAppend=(x)=>{if(x.tagName==='LINK'){requests.push(x.href);setTimeout(()=>x.onload?.(),0);}};
 const canvas={getContext:()=>({font:'',measureText(){const f=this.font;return{width:installed.some(n=>f.includes('"'+n+'"'))?123:100};}})};
 const fontSet=[];fontSet.load=async()=>[];fontSet.ready=Promise.resolve();fontSet.add=()=>{};
 const document={head,body,fonts:fontSet,createElement:(t)=>t==='canvas'?canvas:new El(t)};
 const fetch=async(u)=>{const url=new URL(u,LOCAL).href;requests.push(url);
  if(url.startsWith(LOCAL+'/api/library'))return{json:async()=>[],arrayBuffer:async()=>new ArrayBuffer(0)};throw new Error('offline');};
 const window=desktop?{montclipViewSettings:{}}:{};
 const runtime={fontReq:new Map(),libraryFontReq:new Set(),customFonts:[],googleLoaded:new Set(),fontConsent:new Set(),fontHinted:new Set()};
 const uiText=(k,v)=>k+(v?' '+JSON.stringify(v):'');
 const stubs={window,document,fetch,runtime,SYSTEM_FONTS,GOOGLE_FONTS,FONT_CUT_DEFAULT,uiText,
  toast:(m)=>toasts.push({m}),toastAction:(m,label,fn)=>toasts.push({m,label,fn}),
  escapeHtml:(s)=>String(s),mediaClips:()=>clips,textFontWeight:(p)=>p.weight||(p.bold===false?400:700),FontFace:class{},setTimeout,clearTimeout};
 const names=['ensureFont','loadProjectFonts','requestFonts','fontFamilyRowsHtml'];
 const api=new Function(...Object.keys(stubs),FONTS+'\nreturn {'+names.map(n=>`${n}: typeof ${n}==="function"?${n}:undefined`).join(',')+'};')(...Object.values(stubs));
 const external=()=>requests.filter(u=>!u.startsWith(LOCAL));
 const dialog=()=>body.all().find(e=>e.tagName==='DIALOG'&&e.open);
 return {api,requests,external,toasts,body,dialog,runtime};
}
const tick=(ms=5)=>new Promise(r=>setTimeout(r,ms));
const hostOf=(u)=>new URL(u).hostname;

test('browser mode: a font nobody confirmed is never fetched from outside — not when drawn, not when a project opens',async()=>{
 const p=page();
 a.equal(await p.api.ensureFont('Lobster'),false,'drawn in the fallback face');
 a.equal(await p.api.ensureFont('Cinzel'),false);
 await tick();
 a.deepEqual(p.external(),[],'no request left this computer');
});

test('browser mode: export does not go online by itself; the fonts it will draw in the fallback face are named first',async()=>{
 const clips=[{kind:'text',props:{font:'Cinzel'}},{kind:'text',props:{font:'Lobster',textAnim:'font-cut',fontCutSet:['Lobster','Teko']}}];
 const p=page({clips});
 await p.api.loadProjectFonts();
 await tick();
 a.deepEqual(p.external(),[],'export loaded nothing from outside');
 const said=p.toasts.map(t=>t.m).join('\n');
 for(const n of ['Cinzel','Lobster','Teko'])a.ok(said.includes(n),'the export hint names '+n);
});

test('browser mode: asking first — the box names the fonts, both hosts and what is sent; No sends nothing',async()=>{
 const p=page();
 a.equal(typeof p.api.requestFonts,'function','requestFonts exists');
 const r=p.api.requestFonts(['Lobster']);
 await tick();
 const d=p.dialog();a.ok(d,'the confirmation box is open');
 const text=d.textContent;
 a.ok(text.includes('Lobster'),'the font name');
 a.ok(text.includes('fonts.googleapis.com')&&text.includes('fonts.gstatic.com'),'both hosts');
 a.deepEqual(p.external(),[],'nothing sent while the box is open');
 d.all().find(e=>e.dataset.fontConsent==='deny').click();
 a.equal(await r,null,'the streamer said no');
 await tick();
 a.deepEqual(p.external(),[],'nothing sent after No');
 // asked again next time: a No is not remembered as a yes, and the box is never skipped
 const again=p.api.requestFonts(['Lobster']);await tick();
 a.ok(p.dialog(),'asked again');p.dialog().all().find(e=>e.dataset.fontConsent==='deny').click();await again;
});

test('browser mode: after Yes, only fonts.googleapis.com / fonts.gstatic.com, and only for that font; asked once a session',async()=>{
 const p=page();
 const r=p.api.requestFonts(['Lobster']);await tick();
 p.dialog().all().find(e=>e.dataset.fontConsent==='allow').click();
 a.equal(await r,true);
 const ext=p.external();
 a.ok(ext.length>=1,'the font was requested');
 for(const u of ext){a.ok(['fonts.googleapis.com','fonts.gstatic.com'].includes(hostOf(u)),u);a.ok(/family=Lobster[:&]/.test(u),u);}
 // the same font again: no box this session; another font: the box again
 const n=p.requests.length;
 a.equal(await p.api.requestFonts(['Lobster']),true);a.equal(p.dialog(),undefined,'not asked twice for one font');
 a.equal(p.requests.filter(u=>!u.startsWith(LOCAL)).length,ext.length,'and not fetched twice');
 const other=p.api.requestFonts(['Teko']);await tick();
 a.ok(p.dialog(),'another font is asked about');
 p.dialog().all().find(e=>e.dataset.fontConsent==='deny').click();await other;
 a.ok(!p.external().some(u=>u.includes('Teko')),'Teko not fetched');
 a.ok(p.requests.length>=n);
});

test('desktop: no Google font box or Load button, no uninstalled Google font in the picker, nothing requested',async()=>{
 const d=page({desktop:true,installed:['Roboto Condensed']});
 a.equal(typeof d.api.fontFamilyRowsHtml,'function','fontFamilyRowsHtml exists');
 const row=(label,ctl)=>`<div class="insp-row"><label>${label}</label>${ctl}</div>`;
 const html=d.api.fontFamilyRowsHtml({font:'Segoe UI'},row);
 a.ok(!/data-gfont/.test(html),'no Google font box');a.ok(!/gfont-load/.test(html),'no Load button');
 a.ok(!/<option[^>]*>Lobster</.test(html),'an uninstalled Google font is not offered');
 a.ok(/<option[^>]*>Roboto Condensed</.test(html),'one installed on this computer still is');
 // a font from an old project that isn't here: the fallback face, a plain hint, and no request and no box
 a.equal(await d.api.requestFonts(['Lobster']),null);await tick();
 a.equal(d.dialog(),undefined,'no box on desktop');a.deepEqual(d.external(),[]);
 a.ok(d.toasts.some(t=>t.m.includes('Lobster')),'the streamer is told');
 // browser mode keeps the box and the button (they ask first)
 const b=page();const bh=b.api.fontFamilyRowsHtml({font:'Segoe UI'},row);
 a.ok(/data-gfont/.test(bh)&&/gfont-load/.test(bh));
});

test('every call site that reaches Google Fonts on a click goes through requestFonts; nothing else creates the link',()=>{
 a.equal((SRC.match(/https:\/\/fonts\.googleapis\.com/g)||[]).length,1,'one place builds the address');
 const gate=slice('function loadGoogleFont(','\n}\n');
 a.match(gate,/fonts\.googleapis\.com/,'and it is loadGoogleFont, which only runs for a confirmed font');
 for(const m of SRC.matchAll(/loadGoogleFont\(/g)){const ctx=SRC.slice(Math.max(0,m.index-400),m.index);a.ok(/function loadGoogleFont\($/.test(SRC.slice(m.index-23,m.index+15))||/fontConsent\.has\(name\)/.test(ctx),'gated: '+SRC.slice(m.index-60,m.index+20));}
 // the inspector's picker, the Load button and the title styles ask; drawing, opening and exporting don't
 a.match(SRC,/if \(k === "font"\) requestFonts\(\[String\(v\)\]\)/);
 a.match(SRC,/a === "gfont-load"[\s\S]{0,300}requestFonts\(\[name\]\)/);
 // the playground loads no title fonts from Google behind the streamer's back either
 const shim=fs.readFileSync(path.join(__dirname,'..','docs','demo','static-shim.js'),'utf8');
 a.ok(!/googleapis|gstatic/.test(shim),'docs/demo/static-shim.js preloads nothing from Google');
});
