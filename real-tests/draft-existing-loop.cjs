/* Internal synthetic acceptance of existing operations. No product/schema change.
 * Own server: PORT=0 + authenticated IPC receipt. Own Chrome: private profile and
 * inherited CDP pipes, never a user browser or a pre-existing debugging port. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cp=require('node:child_process');
const {execFileSync}=cp;
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const audioTailDiagnostic=process.argv.includes('--audio-tail-diagnostic');
const OUT=path.resolve(process.argv[2]||'out/draft-existing-loop');
if(fs.existsSync(OUT))throw Error('Output must be a new directory');
fs.mkdirSync(OUT,{recursive:true});
const DATA=path.join(OUT,'data'),MEDIA=path.join(DATA,'media'),PROFILE=path.join(OUT,'chrome-profile');
fs.mkdirSync(MEDIA,{recursive:true});
const FF=require('../ffmpeg-path').path('ffmpeg');
const PROBE=require('../ffmpeg-path').path('ffprobe');
const chrome=process.env.MONTCLIP_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const json=(name,x)=>fs.writeFileSync(path.join(OUT,name),JSON.stringify(x,null,2)+'\n');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const receipt={completed:false,simulated:true,runnerSha256:sha(__filename),operations:[],checks:[],exports:[],pids:{},timing:{},
  limits:['Automated CDP input and existing functions, not human usability measurement',
    'No new missing-shot model/UI; no global export policy changes','Version restore is separate from undo persistence']};
let server,browser,cdp,session,origin;
const token=crypto.randomBytes(32).toString('hex');
const started=Date.now();
function check(name,ok){receipt.checks.push({name,ok:!!ok});assert.ok(ok,name);}
function encode(args){execFileSync(FF,['-v','error',...args],{stdio:'pipe'});}
function command(child){
  let seq=0,buf=Buffer.alloc(0);const pending=new Map();
  child.stdio[4].on('data',chunk=>{buf=Buffer.concat([buf,chunk]);let end;
    while((end=buf.indexOf(0))>=0){const raw=buf.subarray(0,end).toString();buf=buf.subarray(end+1);if(!raw)continue;
      const m=JSON.parse(raw),p=pending.get(m.id);if(!p)continue;pending.delete(m.id);clearTimeout(p.timer);
      m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('owned browser exited'));}pending.clear();});
  child.on('error',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('owned browser spawn failed'));}pending.clear();});
  return (method,params={},sid)=>new Promise((resolve,reject)=>{const id=++seq;
    if(!child.pid||child.exitCode!==null||child.signalCode){reject(Error('owned browser is not running'));return;}
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},180000);
    pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})})+'\0');});
}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;}
async function ready(){const until=Date.now()+30000;while(Date.now()<until){
  try{if(await evaluate('typeof projectJSON==="function" && state.connected && project.media.length===3'))return;}catch{}
  await wait(100);}throw Error('Editor readiness timeout');}
async function reloadOwnedPage(){
  await evaluate('window.__acceptanceBeforeReload=true');
  await cdp('Page.reload',{},session);
  const until=Date.now()+30000;let fresh=false;
  while(Date.now()<until){try{fresh=await evaluate('window.__acceptanceBeforeReload!==true');if(fresh)break;}catch{}await wait(50);}
  check('reload created a fresh page execution context',fresh);await ready();
}
async function click(selector){const pos=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing button');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();if(e.disabled||!r.width||!r.height)throw Error('button unavailable');return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,...pos,button:'left',clickCount:1},session);}
async function api(route,body){const r=await fetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-MontClip-Session':token},...(body?{body:JSON.stringify(body)}:{})});
  const v=await r.json();if(!r.ok)throw Error('API '+r.status+': '+JSON.stringify(v));return v;}
async function snapshot(name){await evaluate('(async()=>{if(!await flushSave())throw Error("save refused");pause();setMonitorMode("program");setTime(9);await seekVideosTo(9);await prepareFrameAssets(9);drawFrame(9);})()');
  await wait(200);
  const doc=await evaluate('projectJSON()');json(name+'.json',doc);
  const shot=await cdp('Page.captureScreenshot',{format:'png'},session);fs.writeFileSync(path.join(OUT,name+'-window.png'),Buffer.from(shot.data,'base64'));
  const canvas=await evaluate('els.canvas ? els.canvas.toDataURL("image/png") : document.querySelector("#preview").toDataURL("image/png")');
  fs.writeFileSync(path.join(OUT,name+'-preview.png'),Buffer.from(canvas.split(',')[1],'base64'));
  return doc;}
async function exportVideo(name){const begin=Date.now();const r=await evaluate('(async()=>{await fetchEncodeProfiles();return await fastExport({profile:"prores422",silent:true});})()');
  if(r.error)throw Error('fastExport: '+r.error);const o=r.outputs?.[0];if(!o?.src)throw Error('export no output: '+JSON.stringify(r));
  const src=path.join(DATA,decodeURIComponent(o.src).replace(/^\//,'')),dest=path.join(OUT,name+'.mov');fs.copyFileSync(src,dest);
  const frame=path.join(OUT,name+'-export.png');encode(['-i',dest,'-ss','9','-frames:v','1',frame]);
  const probe=JSON.parse(execFileSync(PROBE,['-v','error','-show_streams','-show_format','-of','json',dest],{encoding:'utf8'}));
  delete probe.format.filename;
  const row={name,sha256:sha(dest),seconds:(Date.now()-begin)/1000,result:r,probe};receipt.exports.push(row);json(name+'-export.json',row);}
async function playback(name){await evaluate('pause();setMonitorMode("program");setTime(7);setPreviewRate(1);play();');
  const samples=[];for(let n=0;n<8;n++){await wait(500);samples.push(await evaluate('({time:state.time,playing:state.playing})'));}
  await evaluate('pause()');receipt.previewPlayback=receipt.previewPlayback||[];receipt.previewPlayback.push({name,samples,method:'1x real player, 500ms sampling; no human listening claim'});
  check(name+' preview plays across both card boundaries',samples[0].time<8&&samples.at(-1).time>=10&&samples.every(s=>s.playing));}
// Reload rebuilds linkGroup IDs and drops singleton groups. Compare actual
// membership, preserving every other field; never ignore a real linked partner.
function clipsKey(d){const clips=JSON.parse(JSON.stringify(d.clips));
  const groups=new Map();for(const c of clips)if(c.linkGroup){if(!groups.has(c.linkGroup))groups.set(c.linkGroup,[]);groups.get(c.linkGroup).push(c.id);}
  for(const c of clips)if(c.linkGroup){const ids=groups.get(c.linkGroup).sort();delete c.linkGroup;if(ids.length>1)c.linkGroup=ids.join('|');}
  const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
  return JSON.stringify(stable(clips));}
const audioKey=d=>JSON.stringify(d.clips.filter(c=>c.kind==='audio'));
async function action(label,fn){const before=await evaluate('({undo:runtime.undo.length,redo:runtime.redo.length})'),at=Date.now();
  await fn();await wait(150);receipt.operations.push({n:receipt.operations.length+1,label,input:'automated',milliseconds:Date.now()-at,
    before,after:await evaluate('({undo:runtime.undo.length,redo:runtime.redo.length})')});}
async function stopOwned(child){if(!child)return true;if(!child.pid||child.exitCode!==null||child.signalCode)return true;
  child.kill();const until=Date.now()+10000;while(child.exitCode===null&&!child.signalCode&&Date.now()<until)await wait(50);
  return child.exitCode!==null||!!child.signalCode;}

(async()=>{try{
  encode(['-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=12','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-an',path.join(MEDIA,'original.mp4')]);
  encode(['-f','lavfi','-i','color=c=gold:size=640x360:rate=30:duration=2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-an',path.join(MEDIA,'replacement.mp4')]);
  encode(['-f','lavfi','-i',audioTailDiagnostic?"aevalsrc=if(gte(t\\,11.9)\\,0.5*sin(2*PI*1000*t)\\,0):s=48000:d=12":'sine=frequency=440:sample_rate=48000:duration=12','-c:a','pcm_s16le',path.join(MEDIA,'original.wav')]);
  receipt.sources=fs.readdirSync(MEDIA).map(file=>({file,sha256:sha(path.join(MEDIA,file)),origin:'program-generated',frameRate:file.endsWith('.mp4')?'CFR 30':'audio'}));
  const lines=['这里还没补画面（审片版）','要补：手部近景，完整保留落拍动作','位置：成片 00:08.000—00:10.000（2.00 秒）','声音：沿用原片声音','恢复办法还没验','simulated'];
  const comp={id:'synthetic_card',name:'simulated',width:640,height:360,duration:2,background:'#202020',clips:lines.map((text,i)=>({id:'line'+i,kind:'text',track:'V1',start:0,duration:2,
    props:{text,font:'Microsoft YaHei',fontSize:i?17:28,textShadow:0,bold:i===0,color:'#ffffff',align:'left',boxW:536,boxH:40,x:0,y:-125+i*48}}))};
  const seed={name:'simulated-internal-review',width:640,height:360,fps:30,revision:1,panSchema:1,comps:[comp],
    tracks:[{id:'V1',kind:'video'},...['A1','A2','A3','A4'].map(id=>({id,kind:'audio'}))],untargetedTracks:['A1','A2','A3','A4'],
    media:[{id:'original',kind:'video',name:'original.mp4',src:'/media/original.mp4',duration:12,width:640,height:360,fps:30,audioChannels:0},
      {id:'replacement',kind:'video',name:'replacement.mp4',src:'/media/replacement.mp4',duration:2,width:640,height:360,fps:30,audioChannels:0},
      {id:'sound',kind:'audio',name:'original.wav',src:'/media/original.wav',duration:12,audioChannels:1,sampleRate:48000}],
    clips:[{id:'original_picture',kind:'video',track:'V1',mediaId:'original',start:0,in:0,duration:12,unlinked:true,props:{fit:'contain'}},
      {id:'original_sound',kind:'audio',track:'A1',mediaId:'sound',start:0,in:0,duration:12,unlinked:true,props:{volume:1,pan:0}}]};
  fs.writeFileSync(path.join(DATA,'project.json'),JSON.stringify(seed));
  server=cp.spawn(process.execPath,[...(audioTailDiagnostic?['--require',path.join(__dirname,'audio-tail-capture.cjs')]:[]),path.join(ROOT,'server.js')],{cwd:ROOT,windowsHide:true,
    env:{...process.env,HOST:'127.0.0.1',PORT:'0',FABLECUT_DATA_DIR:DATA,MONTCLIP_DESKTOP:'1',MONTCLIP_SESSION_TOKEN:token,...(audioTailDiagnostic?{MONTCLIP_TAIL_CAPTURE_DIR:OUT}:{})},stdio:['ignore','pipe','pipe','ipc']});
  receipt.pids.server=server.pid;server.stdout.resume();server.stderr.resume();
  origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('owned server IPC timeout')),30000);
    server.once('error',()=>{clearTimeout(timer);reject(Error('owned server spawn failed'));});
    server.once('exit',()=>{clearTimeout(timer);reject(Error('owned server exited before ready'));});
    server.on('message',m=>{if(m.type==='montclip-ready'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(m.origin)){clearTimeout(timer);resolve(m.origin);}});});
  receipt.serverOwnership={ipc:'montclip-ready',host:'127.0.0.1',portRequested:0};
  browser=cp.spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-background-networking',
    '--remote-debugging-pipe','--user-data-dir='+PROFILE,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
  receipt.pids.browser=browser.pid;browser.stderr.resume();cdp=command(browser);
  receipt.browserVersion=await cdp('Browser.getVersion');
  const target=await cdp('Target.createTarget',{url:'about:blank'});
  ({sessionId:session}=await cdp('Target.attachToTarget',{targetId:target.targetId,flatten:true}));
  await cdp('Network.enable',{},session);await cdp('Network.setExtraHTTPHeaders',{headers:{'X-MontClip-Session':token}},session);
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},session);
  await cdp('Page.navigate',{url:origin},session);await ready();
  await evaluate('updateMontClipView({mode:"advanced",language:"zh-CN"}); project.untargetedTracks=TRACKS.filter(t=>t.kind==="audio").map(t=>t.id);state.untargetedTracks=new Set(project.untargetedTracks);scheduleSave();');
  const base=await snapshot('00-original');await exportVideo('00-original');
  if(audioTailDiagnostic){receipt.diagnostic='last 100ms tone; actual compositor export; no editing loop';receipt.completed=true;return;}
  const version=await api('/api/versions',{action:'save',name:'synthetic-original'});json('baseline-version.json',version);
  await evaluate('runtime.undo.length=0;runtime.redo.length=0;setTime(8);renderBin();');
  await action('insert card: existing composition + button',()=>click('[data-comp-id="synthetic_card"] .lib-add'));
  const card=await snapshot('01-card');check('card adds one clip',card.clips.length===base.clips.length+1);check('card preserves audio',audioKey(card)===audioKey(base));
  await playback('01-card');await exportVideo('01-card');
  await evaluate('setTime(8);loadSourceFromMedia(getMedia("replacement"),{in:0,out:2});');
  await action('single-place overwrite: existing Source Replace button',()=>click('#btnReplace'));
  const replaced=await snapshot('02-replaced');check('replacement preserves original audio',audioKey(replaced)===audioKey(base));
  check('replacement only [8,10)',replaced.clips.some(c=>c.mediaId==='replacement'&&c.start===8&&c.duration===2));await playback('02-replaced');await exportVideo('02-replaced');
  await action('undo replacement: existing Undo button',()=>click('#mcUndo'));
  const undoneReplace=await snapshot('03-undo-replace');check('undo replace restores card snapshot',clipsKey(undoneReplace)===clipsKey(card));
  await action('undo card insertion: existing Undo button',()=>click('#mcUndo'));
  const undoneAdd=await snapshot('04-undo-add');check('undo insert restores original snapshot',clipsKey(undoneAdd)===clipsKey(base));
  await action('redo card insertion: existing Redo button',()=>click('#mcRedo'));await snapshot('05-redo-card');
  await action('redo replacement: existing Redo button',()=>click('#mcRedo'));
  const redone=await snapshot('06-redo-replace');check('redo restores replacement snapshot',clipsKey(redone)===clipsKey(replaced));
  await action('save and reopen: flushSave and page reload',async()=>{await evaluate('flushSave()');await reloadOwnedPage();});
  const reopened=await snapshot('07-reopened');check('reopen keeps replacement and audio',clipsKey(reopened)===clipsKey(replaced));
  await evaluate('selectClip(project.clips.find(c=>c.mediaId==="replacement").id);');
  await action('delete explicitly selected replacement only: existing Delete button',()=>click('#btnDelete'));
  const deleted=await snapshot('08-deleted');check('delete keeps audio',audioKey(deleted)===audioKey(base));
  check('delete does not ripple later picture',deleted.clips.some(c=>c.kind==='video'&&c.start===10&&c.duration===2));
  check('delete leaves explicit [8,10) gap',!deleted.clips.some(c=>c.kind!=='audio'&&c.start<10&&c.start+c.duration>8));
  await evaluate('runtime.undo.length=0;runtime.redo.length=0;');
  const versionId=version.v||version.version?.v||version.version;
  await action('independent saved-version restore with empty undo stack',async()=>{await api('/api/versions',{action:'restore',version:versionId});await reloadOwnedPage();});
  const restored=await snapshot('09-version-restored');check('version restores original clips',clipsKey(restored)===clipsKey(base));
  await exportVideo('09-version-restored');
  // Separate persistence probe: do not reload between the two original undos.
  await evaluate('setTime(8);renderBin();');
  await action('card persistence setup: existing composition + button',()=>click('[data-comp-id="synthetic_card"] .lib-add'));
  const cardBeforeReload=await snapshot('10-card-before-reopen');
  await action('save card and reopen independently',async()=>{await evaluate('flushSave()');await reloadOwnedPage();});
  const cardReopened=await snapshot('11-card-reopened');
  check('card reopen keeps clip references, timing, props and audio',clipsKey(cardReopened)===clipsKey(cardBeforeReload));
  receipt.cardReopenUndoObservation=await evaluate('({undo:runtime.undo.length,redo:runtime.redo.length,undoDisabled:document.querySelector("#mcUndo").disabled})');
  await evaluate('selectClip(project.clips.find(c=>c.kind==="comp").id);');
  await action('reopened card remains editable: selected Delete button',()=>click('#btnDelete'));
  const cardDeleted=await snapshot('12-reopened-card-deleted');
  check('deleting reopened overlay reveals retained original',clipsKey(cardDeleted)===clipsKey(base));
  await action('undo new post-reopen delete: restores card, not old insertion history',()=>click('#mcUndo'));
  const cardEditUndo=await snapshot('13-reopened-card-edit-undo');
  check('post-reopen edit undo restores card',clipsKey(cardEditUndo)===clipsKey(cardReopened));
  await action('probe persisted pre-reopen insertion undo: existing Undo button',()=>click('#mcUndo'));
  const persistedUndo=await snapshot('14-persisted-insertion-undo');
  check('same-profile reload retains usable insertion undo',clipsKey(persistedUndo)===clipsKey(base));
  receipt.completed=true;receipt.timing.totalSeconds=(Date.now()-started)/1000;
}catch(e){receipt.error=String(e.message).replaceAll(ROOT,'<worktree>').replaceAll(OUT,'<output>').replaceAll(token,'<redacted>');process.exitCode=1;}
finally{if(cdp)try{await cdp('Browser.close');}catch{}
  receipt.cleanup={browserExited:await stopOwned(browser),serverExited:await stopOwned(server)};
  if(!receipt.cleanup.browserExited||!receipt.cleanup.serverExited){receipt.completed=false;receipt.error='Owned process cleanup did not finish';process.exitCode=1;}
  json('receipt.json',receipt);console.log(JSON.stringify({completed:receipt.completed,error:receipt.error,checks:receipt.checks,operations:receipt.operations.length}));}
})();
