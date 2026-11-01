'use strict';
// Explicit test entry. Clipboard bytes are kept only in memory, never logged.
const {app,BrowserWindow,clipboard,ClipboardItem}=require('electron'),assert=require('node:assert/strict');
assert.ok(process.argv.includes('--montclip-smoke'));
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 await read('(async()=>{while(!state.connected)await new Promise(r=>setTimeout(r,25));await pjLoad();setSideTab("assistant");mcAgent.render();})()');
 async function paste(value){
  const before=await clipboard.readText();
  assert.ok(before===''||before==='x'.repeat(16001),'test requires an empty or known synthetic clipboard');
  const items=await clipboard.read(),saved=[];
  for(const item of items){const data={};for(const type of item.types)data[type]=await item.getType(type);saved.push(new ClipboardItem(data));}
  // Prove the restoration API accepts the snapshot before substituting any test text.
  if(saved.length)await clipboard.write(saved);
  try{await clipboard.writeText(value);win.webContents.paste();await new Promise(r=>setTimeout(r,80));}
  finally{if(await clipboard.readText()===value){if(saved.length)await clipboard.write(saved);else clipboard.clear();}}
 }
 // Native maxlength baseline reproduces truncation; no product handler is disabled.
 await read('(()=>{const e=document.createElement("textarea");e.id="paste-baseline";e.maxLength=16000;document.body.append(e);e.focus();})()');
 await paste('x'.repeat(16001));assert.equal(await read('document.getElementById("paste-baseline").value.length'),16000);
 await read('document.getElementById("paste-baseline").remove();true');
 let cases=0;
 for(const language of ['zh-CN','en']){
  await read('updateMontClipView({language:'+JSON.stringify(language)+'});mcAgent.render();window.__pasteEvents=[];document.querySelector("[data-draft]").addEventListener("paste",e=>window.__pasteEvents.push({trusted:e.isTrusted,length:e.clipboardData.getData("text/plain").length}));true');
  await read('(()=>{const d=document.querySelector("[data-draft]");d.value="keep";d.dispatchEvent(new Event("input"));d.focus();d.setSelectionRange(4,4);})()');
  await paste('x'.repeat(15997));
  const rejected=await read('({draft:document.querySelector("[data-draft]").value,status:document.querySelector("[data-status]").textContent,events:window.__pasteEvents})');
  assert.equal(rejected.draft,'keep');assert.ok(rejected.events.some(e=>e.trusted&&e.length===15997));
  assert.equal(rejected.status,await read('MontClipView.text['+JSON.stringify(language)+'].panePasteTooLong'));
  await read('document.querySelector("[data-draft]").setSelectionRange(0,4);true');await paste('x'.repeat(16000));
  assert.equal(await read('document.querySelector("[data-draft]").value.length'),16000);
  assert.notEqual(await read('document.querySelector("[data-status]").textContent'),rejected.status);
  await paste('z');assert.equal(await read('document.querySelector("[data-draft]").value.length'),16000);
  assert.equal(await read('document.querySelector("[data-status]").textContent'),rejected.status);
  process.stdout.write('MONTCLIP_PASTE_CASE '+JSON.stringify({language,trustedPaste:true,rejectedWhole:true,exactLimitAccepted:true,overflowAtLimitRejected:true})+'\n');cases++;
 }
 process.stdout.write('MONTCLIP_PASTE_COMPLETE '+JSON.stringify({cases,baselineTruncated:true})+'\n');
};
require('./main');
