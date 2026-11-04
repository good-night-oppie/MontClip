'use strict';
// Danmaku import in the real editor: fresh profile, hidden offscreen window, synthetic sound and synthetic XML only.
// The XML goes in through the Transcript tab's button (its file input), is matched to the recording of the same
// name, saved in project.danmaku and survives a reload; P2's highlight dialog then shows the danmaku burst as a card
// with a danmaku reason. A large synthetic file (MONTCLIP_DM_LARGE danmaku, default 200000) is timed through the
// same path. Removing them from the bin's menu empties project.danmaku.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
// 120 s of an even tone (no loudness reason), 8 kHz mono
function wav(seconds=120,rate=8000){
 const n=seconds*rate,data=Buffer.alloc(n*2);
 for(let i=0;i<n;i++)data.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*i/rate)*0.1*32767),i*2);
 const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+data.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);
 h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(data.length,40);return Buffer.concat([h,data]);
}
// the shape of a 录播姬 file, made up here: one danmaku every 5 s, a burst of 40 at 60–68 s
function recorderXml(){
 const rows=[];for(let t=0;t<120;t+=5)rows.push([t+0.5,'平常的弹幕']);for(let i=0;i<40;i++)rows.push([60+i*0.2,'高能来了']);
 const start=Date.parse('2026-11-01T20:00:00+08:00');
 return '\ufeff<?xml version="1.0" encoding="utf-8"?><i><chatserver>chat.bilibili.com</chatserver><BililiveRecorder version="synthetic"/><BililiveRecorderRecordInfo roomid="1" name="合成主播" start_time="2026-11-01T20:00:00.0000000+08:00"/>'+
  '<BililiveRecorderXmlStyle><z:stylesheet xmlns:z="http://www.w3.org/1999/XSL/Transform"><z:template match="/"><d p="1,1,25,1,1">不是弹幕</d></z:template></z:stylesheet></BililiveRecorderXmlStyle>'+
  rows.map(([t,s])=>`<d p="${t.toFixed(3)},1,25,16777215,${start+Math.round(t*1000)+500},0,1,0" user="合成用户" raw="[]">${s}</d>`).join('\n')+'<gift ts="1" user="合成用户" giftname="g" giftcount="1"/></i>';
}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  const b64=wav().toString('base64');
  const src=await read(`(async()=>{const bin=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));const r=await fetch('/api/upload?name='+encodeURIComponent('合成 录播.wav'),{method:'POST',body:new Blob([bin])});if(!r.ok)throw Error('upload '+r.status);return (await r.json()).src;})()`);
  await read(`(async()=>{for(let i=0;i<200&&!runtime.projectId;i++)await new Promise(r=>setTimeout(r,50));const doc=projectJSON();
   Object.assign(doc,{media:[{id:'snd',src:${JSON.stringify(src)},kind:'audio',name:'合成 录播.wav',duration:120}],
    clips:[{id:'a',kind:'audio',mediaId:'snd',track:'A1',start:0,in:0,duration:120,props:{volume:1}},
     ...Array.from({length:12},(_,i)=>MontClipCaptions.clip({start:i*10,end:i*10+8,text:'一句普通的话'},{id:'s'+i,track:'V2',width:1280,height:720}))]});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('save');})()`);
  await read(`setSideTab('transcript');true`);await wait(300);
  // through the button's own file input, as a person would pick the file
  const pick=async(xmlExpr,name)=>read(`(async()=>{const xml=${xmlExpr};const f=new File([xml],${JSON.stringify(name)},{type:'text/xml'});const dt=new DataTransfer();dt.items.add(f);
    const inp=document.querySelector('[data-tr-danmaku-input]');inp.files=dt.files;const was=(project.danmaku||[]).map(e=>e.id).join();const now=()=>(project.danmaku||[]).map(e=>e.id).join();
    const t0=performance.now();inp.dispatchEvent(new Event('change'));
    for(let i=0;i<1200&&now()===was;i++)await new Promise(r=>setTimeout(r,20));
    const imported=performance.now()-t0;if(now()===was)throw Error('not imported');
    const s0=performance.now();scheduleSave();if(!await flushSave())throw Error('save');return{imported:Math.round(imported),saved:Math.round(performance.now()-s0),bytes:xml.length};})()`);
  assert.equal(await read(`!!document.querySelector('[data-tr-danmaku]')&&document.querySelector('[data-tr-danmaku]').textContent`),await read(`uiText('own.dm-import')`),'the button is there');
  // JJ (8 PRs): a file that is not danmaku says so, and which file to pick; nothing is imported
  const bad=await read(`(async()=>{const dt=new DataTransfer();dt.items.add(new File(['<?xml version="1.0"?><note>合成</note>'],'合成 不是弹幕.xml',{type:'text/xml'}));
    const inp=document.querySelector('[data-tr-danmaku-input]');inp.files=dt.files;const t=document.getElementById('toast');t.textContent='';inp.dispatchEvent(new Event('change'));
    const say=()=>t.querySelector('span')?.textContent||t.textContent;for(let i=0;i<250&&(!say()||say().startsWith('正在读取'));i++)await new Promise(r=>setTimeout(r,20));return{toast:t.querySelector('span')?.textContent||t.textContent,danmaku:(project.danmaku||[]).length};})()`);
  assert.deepEqual(bad,{toast:'这不是录播姬或 B 站的弹幕文件。录播姬的话，选录像旁边那个同名的 .xml 文件。',danmaku:0},JSON.stringify(bad));
  const small=await pick(JSON.stringify(recorderXml()),'合成 录播.xml');
  const saved=await read(`fetch('/api/project').then(r=>r.json())`);
  assert.equal(saved.danmaku.length,1);
  const e=saved.danmaku[0];
  assert.deepEqual([e.mediaId,e.format,e.count,e.skipped.gift],['snd','bililive-recorder',64,1],'matched by name, 64 kept, the stylesheet\'s one left out, the gift counted');
  assert.deepEqual(e.fields,['t','dur','sent','mode','color','text']);
  assert.deepEqual(e.items[0],[0.5,8,Date.parse('2026-11-01T20:00:00+08:00')+1000,1,16777215,'平常的弹幕'],'display time and length, send time apart');
  assert.ok(!JSON.stringify(saved).includes('合成用户')&&!JSON.stringify(saved).includes('合成主播'),'no user or streamer names saved');
  // a reload reads them back
  await read(`fetch('/api/project').then(r=>r.json()).then(d=>{applyProject(d);return true;})`);
  assert.equal(await read(`project.danmaku[0].count`),64,'kept across a reload');
  // P2: the burst is a card with a danmaku reason
  await read(`document.querySelector('[data-tr-highlights]').click();true`);
  const until=Date.now()+30000;let cards=0;while(Date.now()<until){await wait(300);cards=await read(`document.querySelectorAll('.highlight-dialog [data-hl-card]').length`);if(cards)break;}
  assert.ok(cards>=1,'cards appear');
  const first=await read(`(()=>{const c=document.querySelector('.highlight-dialog [data-hl-card]');return{range:c.dataset.hlRange,reasons:[...c.querySelectorAll('[data-hl-reason]')].map(r=>[r.dataset.hlReason,r.textContent])};})()`);
  assert.equal(first.range,'60-68','the burst is the first card');
  assert.ok(first.reasons.some(([k])=>k==='danmaku'),'with a danmaku reason '+JSON.stringify(first));
  if(process.env.MONTCLIP_DM_PNG)require('node:fs').writeFileSync(process.env.MONTCLIP_DM_PNG,(await win.webContents.capturePage()).toPNG());
  await read(`document.querySelector('.highlight-dialog [data-hl-close]').click();true`);await wait(200);
  // a large synthetic file through the same path (replaces the first)
  const N=+process.env.MONTCLIP_DM_LARGE||200000;
  const large=await pick(`'<?xml version="1.0" encoding="utf-8"?><i><BililiveRecorder version="synthetic"/>'+Array.from({length:${N}},(_,i)=>'<d p="'+(i*119/${N}).toFixed(3)+',1,25,16777215,'+(1761998400000+i)+',0,1,0" user="合成用户" raw="[[0,1,25,16777215,0,0,0,&quot;&quot;],&quot;x&quot;]">合成弹幕第'+i+'条</d>').join('\\n')+'</i>'`,'合成 录播.xml');
  const after=await read(`fetch('/api/project').then(async r=>{const t=await r.text();const d=JSON.parse(t);return{count:d.danmaku[0].count,entries:d.danmaku.length,projectBytes:t.length};})`);
  assert.deepEqual([after.entries,after.count],[1,N],'one entry per recording, all of them kept');
  const map=await read(`(()=>{const t0=performance.now();const n=MontClipDanmaku.toTimeline(project.danmaku,mediaClips()).length;return{n,ms:Math.round(performance.now()-t0)};})()`);
  assert.equal(map.n,N);
  // the bin's menu removes them
  await read(`removeDanmaku(getMedia('snd'));true`);
  await read(`(async()=>{if(!await flushSave())throw Error('save');})()`);
  assert.equal((await read(`fetch('/api/project').then(r=>r.json())`)).danmaku,undefined,'removed');
  const mem=app.getAppMetrics().reduce((s,m)=>s+(m.memory?m.memory.workingSetSize:0),0);
  process.stdout.write('DANMAKU_COMPLETE '+JSON.stringify({small,first,large:{...large,...after,mapMs:map.ms},appWorkingSetMB:Math.round(mem/1024)})+'\n');
 }catch(e){process.stdout.write("DANMAKU_FAIL "+(e&&e.stack)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
