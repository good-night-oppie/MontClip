'use strict';
// Simple mode in the real editor (replacing #6): fresh profile, hidden offscreen window, synthetic clips only.
// Checks: B/R/Y/U are hidden in simple mode and shown in advanced; switching to simple from a trim tool goes back to V
// with the project, selection and history unchanged; the advanced shortcuts, sent as real key events, change
// nothing in simple mode; in advanced mode Shift+Delete still ripple-deletes.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{for(let i=0;i<200&&!runtime.projectId;i++)await new Promise(r=>setTimeout(r,50));const doc=projectJSON();
   Object.assign(doc,{media:[],clips:[0,1,2].map(i=>({id:'t'+i,kind:'text',mediaId:null,track:'V1',start:i*2,in:0,duration:2,props:{text:'合成 '+i}}))});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('save');setSelection(['t0']);setTime(1);})()`);
  const tools=`[...document.querySelectorAll('[data-edit-tool]')].map(b=>[b.dataset.editTool,b.getClientRects().length>0])`;
  const edit=`JSON.stringify({clips:projectJSON().clips,undo:runtime.undo.length,redo:runtime.redo.length,sel:[...state.selIds],inPoint:project.inPoint??null,outPoint:project.outPoint??null})`;
  // the real key path: a keydown on the window, as the keyboard sends it
  const press=(key,mods={})=>read(`(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();const e=new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(mods.code||'')},bubbles:true,cancelable:true,${['ctrlKey','metaKey','altKey','shiftKey'].filter(m=>mods[m]).map(m=>m+':true').join(',')}});window.dispatchEvent(e);return e.defaultPrevented;})()`);
  await read(`updateMontClipView({mode:'advanced'});true`);await wait();
  assert.deepEqual(await read(tools),[['select',true],['ripple',true],['roll',true],['slip',true],['slide',true]],'advanced: all five tools');
  await press('b');assert.equal(await read(`state.tool`),'ripple','advanced: B picks ripple');
  const before=await read(edit);
  await read(`updateMontClipView({mode:'simple'});true`);await wait();
  assert.equal(await read(`state.tool`),'select','simple mode goes back to V');
  assert.equal(await read(`document.querySelector('[data-edit-tool="select"]').getAttribute('aria-pressed')`),'true');
  assert.deepEqual(await read(tools),[['select',true],['ripple',false],['roll',false],['slip',false],['slide',false]],'simple: only V is shown');
  assert.equal(await read(edit),before,'project, selection and history unchanged by the switch');
  await read(`setEditTool('roll');true`);assert.equal(await read(`state.tool`),'select','a direct call to a trim tool is refused');
  await read(`project.inPoint=0.5;project.outPoint=3.5;true`);const withIO=await read(edit);
  const keys=[['t',{altKey:true}],['E',{shiftKey:true}],['D',{shiftKey:true}],['l',{ctrlKey:true}],['[',{}],[']',{}],['b',{}],['r',{}],['y',{}],['u',{}],['z',{altKey:true,code:'KeyZ'}],['t',{}],['T',{shiftKey:true}],['Delete',{shiftKey:true}]];
  const held=[];
  for(const [k,m] of keys){held.push(await press(k,m));await wait(40);}
  assert.ok(held.every(Boolean),'every advanced shortcut is held back '+JSON.stringify(held));
  assert.equal(await read(edit),withIO,'none of them changed the project, selection or history');
  assert.equal(await read(`state.tool`),'select');
  // everyday keys still work in simple mode: S splits at the playhead
  await press('s');assert.equal(await read(`project.clips.length`),4,'S still splits');
  await read(`undo();true`);
  // advanced mode is unchanged: Shift+Delete ripple-deletes
  await read(`project.inPoint=null;project.outPoint=null;updateMontClipView({mode:'advanced'});setSelection(['t0']);true`);await wait();
  await press('Delete',{shiftKey:true});
  assert.deepEqual(await read(`project.clips.map(c=>[c.id,c.start])`),[['t1',0],['t2',2]],'advanced: Shift+Delete ripple-deletes');
  process.stdout.write('SIMPLE_KEYS_COMPLETE '+JSON.stringify({held:held.length})+'\n');
 }catch(e){process.stdout.write('SIMPLE_KEYS_FAIL '+(e&&e.stack)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
