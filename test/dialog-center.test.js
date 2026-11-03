'use strict';
// Deja (2026-11-03): every modal dialog sits in the middle of the window over a darkened page. The reset at the top of
// style.css (`* { margin: 0 }`) takes away the browser's own `margin: auto` for a modal <dialog>, which pinned some of them
// to the top-left corner (the approval box on #83 showed it). One rule puts it back for all of them; these checks keep any
// dialog's own rule from taking it away again. desktop/dialogs-smoke.cjs measures and captures each one in a real window.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const css=read('style.css').replace(/\/\*[\s\S]*?\*\//g,'');
// top-level rules only (no @media bodies): [selector, body]
const rules=[];{let depth=0,start=0,sel='';for(let i=0;i<css.length;i++){const c=css[i];
 if(c==='{'){if(depth===0){sel=css.slice(start,i).trim();start=i+1;}depth++;}
 else if(c==='}'){depth--;if(depth===0){rules.push([sel,css.slice(start,i)]);start=i+1;}else if(depth<0)depth=0;}}}
const at=(sel)=>rules.findIndex(([s])=>s.split(',').map(x=>x.trim()).includes(sel));
// every <dialog> the page makes, by its class
const app=read('app.js');
const made=[...app.matchAll(/(\w+)\s*=\s*document\.createElement\("dialog"\)[\s\S]{0,400}?\1\.className\s*=\s*"([\w-]+)"/g)].map(m=>m[2]);
const classes=[...new Set([...made,'cindy-confirm'])];

test('the page’s dialogs are all found',()=>{
 for(const c of ['flv-import-dialog','cq-dialog','asr-setup','highlight-dialog','auto-slices','as-preview','sentence-dialog'])a.ok(classes.includes(c),c);
 a.match(read('agent-ui/pane.tsx'),/<dialog ref=\{dialog\} className="cindy-confirm"/);
});
// Deja (#88): a box never taller than the window; where the content is taller, the title and the actions stay and the
// middle scrolls (desktop/dialogs-smoke.cjs checks every box at 630×460)
test('no box is taller than the window; the tall ones scroll their middle, not their title and actions',()=>{
 // at no weight (:where), so a dialog's own max-height (the transcription setup's 86vh, …) still wins
 const modal=rules[at(':where(dialog:modal)')][1],box=rules[at('.dialog')][1];
 for(const b of [modal,box])a.match(b,/max-height:\s*calc\(100vh - 24px\)/);
 a.ok(!/max-height/.test(rules[at('dialog:modal')][1]),'not on the weighty dialog:modal rule');
 for(const sel of ['.dialog.settings','.asr-setup[open]'])
  a.ok(rules.some(([s,b])=>s.split(',').map(x=>x.trim()).includes(sel)&&/display:\s*flex/.test(b)&&/flex-direction:\s*column/.test(b)),sel+' is a column');
 const body=rules.find(([s])=>/\.dialog-body/.test(s));a.ok(body);a.match(body[1],/overflow:\s*auto/);a.match(body[1],/min-height:\s*0/);
 a.match(read('index.html'),/<h2 id="settingsTitle"[^>]*>[^<]*<\/h2>\s*<div class="dialog-body">[\s\S]*?<\/div>\s*<div class="dialog-actions"><button class="btn primary" id="btnCloseSettings"/);
 const app=read('app.js');
 a.match(app,/function wrapDialogBody\(dialog\)/);a.match(app,/asrSetup\.dialog\.innerHTML = html;\s*wrapDialogBody\(asrSetup\.dialog\);/);
});
test('one rule after the reset centres every modal dialog and darkens the page behind it',()=>{
 const reset=at('*'),modal=at('dialog:modal'),backdrop=at('dialog::backdrop');
 a.ok(reset>=0&&/margin:\s*0/.test(rules[reset][1]),'the reset');
 a.ok(modal>reset,'dialog:modal after the reset');a.match(rules[modal][1],/margin:\s*auto/);
 a.ok(backdrop>=0);a.match(rules[backdrop][1],/background:\s*rgba\(0,\s*0,\s*0,\s*0?\.[3-9]\d*\)|background:\s*#000[89a-f]\b/);
});
test('no dialog’s own rule takes the centring away',()=>{
 for(const c of classes)for(const [sel,body] of rules){
  const own=sel.split(',').map(x=>x.trim()).some(s=>new RegExp('^(dialog)?\\.'+c+'(\\[open\\]|:modal)?$').test(s));
  if(!own)continue;
  const m=/(?:^|;|\s)margin\s*:\s*([^;]+)/.exec(body);
  a.ok(!m||/^auto\s*$/.test(m[1].trim()),`.${c} sets margin: ${m&&m[1]}`);
  a.ok(!/(?:^|;|\s)(inset|top|left|right|bottom)\s*:/.test(body)||/margin\s*:\s*auto/.test(body),`.${c} moves itself`);
 }
});
test('a darkened backdrop for every dialog: its own, or the shared one',()=>{
 for(const c of classes){const own=rules.find(([s])=>s.split(',').map(x=>x.trim()).includes('.'+c+'::backdrop'));
  if(own)a.match(own[1],/background:\s*(rgba\(0,\s*0,\s*0,\s*0?\.[3-9]\d*\)|#000[89a-f]\b)/,c);}
});
// found by the captures: the FLV import box had no colours of its own (the browser's white box, no padding)
test('every dialog wears the editor’s colours: its own text colour, panel background and border',()=>{
 for(const c of classes){
  const own=rules.filter(([s])=>s.split(',').map(x=>x.trim()).some(x=>x==='.'+c||x==='dialog.'+c)).map(([,b])=>b).join(';');
  for(const p of ['color','background','border','padding'])a.match(own,new RegExp('(?:^|[;\\s{])'+p+'\\s*:'),`.${c} ${p}`);
 }
});
