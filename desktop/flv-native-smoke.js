"use strict";
const fs = require("node:fs"), path = require("node:path");
const {execFileSync} = require("node:child_process");
exports.run = async (win, dataDir) => {
  const source = path.join(dataDir,"原片 smoke.flv"), media = path.join(dataDir,"media");
  execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","testsrc2=size=64x64:rate=30","-t","0.5","-c:v","flv",source]);
  const before = fs.readdirSync(media).sort();
  await win.webContents.executeJavaScript(`(() => { const input=document.createElement('input'); input.type='file'; input.id='nativeFlvSmoke'; document.body.append(input); })()`);
  win.webContents.debugger.attach("1.3");
  try {
    const {result} = await win.webContents.debugger.sendCommand("Runtime.evaluate",{expression:"document.getElementById('nativeFlvSmoke')"});
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles",{objectId:result.objectId,files:[source]});
  } finally {win.webContents.debugger.detach();}
  const canceled = await win.webContents.executeJavaScript(`(async () => {
    const file=document.getElementById('nativeFlvSmoke').files[0];
    if (!montclipFlv.canUse(file)) throw Error('No native file capability');
    const initial=JSON.stringify(projectJSON());
    for (const language of ['zh-CN','en']) {
      updateMontClipView({language});
      const pending=importFiles([file]);
      const until=Date.now()+10000;
      while (!document.querySelector('.mc-flv-explanation') && Date.now()<until) await new Promise(r=>setTimeout(r,20));
      const dialog=document.querySelector('.mc-flv-explanation')?.closest('dialog');
      if (!dialog) throw Error('No native confirmation');
      const bounds=dialog.getBoundingClientRect();
      if (bounds.x<8 || bounds.y<8 || bounds.right>innerWidth || bounds.bottom>innerHeight || document.activeElement!==dialog.querySelector('button')) throw Error('Modal layout/focus failed');
      if(language==='zh-CN') dialog.querySelector('button').click();
      else dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
      if((await pending).length) throw Error('Canceled import registered media');
    }
    return initial===JSON.stringify(projectJSON());
  })()`);
  const zeroResidual = JSON.stringify(before) === JSON.stringify(fs.readdirSync(media).sort());
  const accepted = await win.webContents.executeJavaScript(`(async () => {
    const pending=importFiles([document.getElementById('nativeFlvSmoke').files[0]]);
    const until=Date.now()+10000;
    while (!document.querySelector('.mc-flv-explanation') && Date.now()<until) await new Promise(r=>setTimeout(r,20));
    const d=document.querySelector('.mc-flv-explanation')?.closest('dialog');
    if(!d) throw Error('No native confirmation');
    d.querySelectorAll('button')[1].click();
    await new Promise(r=>setTimeout(r,0));
    const busy=!!document.querySelector('dialog[open] [role=status]');
    const added=await pending;
    const settleUntil=Date.now()+10000;
    while(mediaInfoBusy && Date.now()<settleUntil) await new Promise(r=>setTimeout(r,20));
    if(mediaInfoBusy || !await flushSave()) throw Error('Native import did not settle/save');
    const disk=await (await fetch('/api/project')).json();
    return busy && added.length===1 && added[0].preparation==='transcode' && disk.media.some(m=>m.id===added[0].id && m.originalSrc===added[0].originalSrc && m.src===added[0].src);
  })()`);
  const staleSaveProtected = await win.webContents.executeJavaScript(`(async () => {
    await syncFromServer(true);
    if(!project.media.length || project.revision<1) throw Error('No saved media for stale-response test');
    const before=JSON.stringify(projectJSON()), realFetch=window.fetch;
    const stale={...projectJSON(),revision:Math.max(0,project.revision-1),media:[]};
    let intercepted=false;
    window.fetch=(url,opts)=> {
      if(!intercepted && url==='/api/project' && !opts?.method) {intercepted=true; return Promise.resolve(new Response(JSON.stringify(stale),{status:200,headers:{'Content-Type':'application/json'}}));}
      return realFetch(url,opts);
    };
    try { await syncFromServer(); return intercepted && JSON.stringify(projectJSON())===before; }
    finally {window.fetch=realFetch;}
  })()`);
  if(!staleSaveProtected) throw Error('Stale project response replaced the imported media');
  const registered = fs.readdirSync(media).sort();
  const canceledConversion = await win.webContents.executeJavaScript(`(async () => {
    const pending=importFiles([document.getElementById('nativeFlvSmoke').files[0]]);
    const until=Date.now()+10000;
    while (!document.querySelector('.mc-flv-explanation') && Date.now()<until) await new Promise(r=>setTimeout(r,20));
    const d=document.querySelector('.mc-flv-explanation')?.closest('dialog');
    if(!d || !d.textContent.includes('already imported')) throw Error('No duplicate-content confirmation');
    d.querySelectorAll('button')[1].click();
    await new Promise(r=>setTimeout(r,0));
    const busy=document.querySelector('dialog[open] [role=status]')?.closest('dialog');
    if(!busy) throw Error('No cancellable busy state');
    busy.querySelector('button').click();
    return (await pending).length===0;
  })()`);
  const cancelPreservesRegistered = JSON.stringify(registered)===JSON.stringify(fs.readdirSync(media).sort());
  const result={canceled,zeroResidual,accepted,staleSaveProtected,canceledConversion,cancelPreservesRegistered};
  process.stdout.write("MONTCLIP_NATIVE_FLV "+JSON.stringify(result)+"\n");
  if(!Object.values(result).every(Boolean)) throw Error("Native FLV smoke failed");
};
