'use strict';
const assert=require('node:assert/strict');
exports.run=async win=>{
 const read=s=>win.webContents.executeJavaScript(s),reopen=process.argv.includes('--sessions-reopen');
 await read('(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error("NOT_CONNECTED");})()');
 if(!reopen)await read('(async()=>{if(!await flushSaveBeforeSwitch())throw Error("SAVE_FAILED");const r=await pjPost({action:"new",name:"Session smoke",open:true});if(!r||!await syncFromServer(true))throw Error("CREATE_FAILED");mcAgent.render();})()');
 await read('mcAgent.render();true');
 const before=await read('JSON.stringify({project,undo:runtime.undo,redo:runtime.redo})');
 const initial=await read('({id:runtime.projectId,origin:location.origin,draft:document.querySelector("[data-draft]").value})');
 assert.ok(initial.id);
 if(reopen)assert.equal(initial.draft,'合成草稿 🌱');
 else await read('(()=>{const d=document.querySelector("[data-draft]");d.value="合成草稿 🌱";d.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-action=projectRef]").click();})()');
 assert.equal(before,await read('JSON.stringify({project,undo:runtime.undo,redo:runtime.redo})'));
 process.stdout.write('MONTCLIP_SESSION_STATE '+JSON.stringify(await read('({gen:runtime.projectGen,revision:project.revision,sequenceId:SeqLib.activeId(seqRoot()),notice:document.querySelector("[data-persistence]").textContent,referenceCount:document.querySelector("[data-references]").childElementCount})'))+'\n');
 const stored=await read('window.montclipAgentSessions.get()');assert.equal(stored.ok,true);
 const scope=stored.value.scopes.find(s=>s.projectId===initial.id);assert.ok(scope);
 const selected=scope.sessions.find(s=>s.id===scope.active);assert.equal(selected.draft,'合成草稿 🌱');assert.equal(selected.references.length,1);assert.equal(selected.references[0].projectId,initial.id);assert.deepEqual(selected.messages,[]);
 process.stdout.write('MONTCLIP_SESSIONS '+JSON.stringify({reopen,projectId:initial.id,origin:initial.origin,restored:reopen,draft:true,reference:true,messages:0,projectUnchanged:true})+'\n');
};
