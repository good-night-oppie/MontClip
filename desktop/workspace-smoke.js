'use strict';
const assert=require('node:assert/strict');
exports.run=async win=>{const read=code=>win.webContents.executeJavaScript(code);await read('(async()=>{const deadline=Date.now()+15000;while(!state.connected&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error("PROJECT_NOT_LOADED");})()');const before=await read('JSON.stringify({project,undo:runtime.undo,redo:runtime.redo})');const initial=await read('({workspace:colorState.ws,mode:mcView.get().mode,origin:location.origin})');const reopen=process.argv.includes('--workspace-reopen'),baseline=process.argv.includes('--workspace-baseline');
if(reopen)assert.equal(initial.workspace,baseline?'edit':'color');
else await read('updateMontClipView({mode:"advanced"});setWorkspace("color");true');
if(reopen&&!baseline){await read('updateMontClipView({mode:"simple"});true');assert.deepEqual(await read('({ws:colorState.ws,pick:colorState.qualPick,matte:!!runtime.matte})'),{ws:'edit',pick:false,matte:false});}
const final=await read('({workspace:colorState.ws,mode:mcView.get().mode,origin:location.origin})');assert.equal(before,await read('JSON.stringify({project,undo:runtime.undo,redo:runtime.redo})'));process.stdout.write('MONTCLIP_WORKSPACE '+JSON.stringify({baseline,reopen,initial,final,projectUnchanged:true})+'\n');};
