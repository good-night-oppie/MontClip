'use strict';
// Explicit development entry (run-drop-reveal.cjs). Visible window, caller-owned synthetic
// MP4 and profile; pointer input is webContents.sendInputEvent at real window
// coordinates (no OS-level input, no clipboard). Screenshots: capturePage + an OS
// screenshot of the window's client area.
const electron=require('electron'),{app,BrowserWindow}=electron;
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
assert.ok(process.argv.includes('--montclip-smoke'));
const input=fs.readFileSync(process.env.MONTCLIP_TIMELINE_INPUT),out=process.env.MONTCLIP_REVEAL_OUT;assert.ok(out);
const log=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);
 const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 try{
 win.show();win.setAlwaysOnTop(true);win.focus();
 await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');const bytes=Uint8Array.from(atob(${JSON.stringify(input.toString('base64'))}),c=>c.charCodeAt(0));const [m]=await importFiles([new File([bytes],'synthetic-timeline.mp4',{type:'video/mp4'})]);if(!m)throw Error('IMPORT_FAILED');updateMontClipView({mode:'advanced'});addClipFromMedia(m,'V1',0);const cue=FableCutCaptions.parse('1\\n00:00:00,000 --> 00:00:02,000\\nSynthetic subtitle\\n')[0];project.clips.push(FableCutCaptions.clip(cue,{id:'three-caption',track:'V3'}));rebuildClips();if(!await flushSave())throw Error('SAVE_FAILED');setTime(3);})()`);
 const shoot=async name=>{fs.writeFileSync(path.join(out,name+'.page.png'),(await win.webContents.capturePage()).toPNG());const b=electron.screen.dipToScreenRect(win,win.getContentBounds());
  cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Drawing;Add-Type -Namespace W -Name D -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();';[void][W.D]::SetProcessDPIAware();$b=New-Object System.Drawing.Bitmap ${b.width},${b.height};$g=[System.Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(${b.x},${b.y},0,0,$b.Size);$b.Save('${path.join(out,name+'.screen.png').replace(/'/g,"''")}');`],{windowsHide:true});};
 // visible share of a row / of a clip element inside the scroller (below the ruler)
 const seen=sel=>read(`(()=>{const e=${sel};if(!e)return null;const r=e.getBoundingClientRect(),s=els.timelineScroll.getBoundingClientRect(),v=Math.max(0,Math.min(r.bottom,s.top+els.timelineScroll.clientHeight)-Math.max(r.top,s.top+RULER_H));return +(v/r.height).toFixed(3);})()`);
 const audioClip=`els.tracks.querySelector('.clip[data-id="'+project.clips.find(c=>c.kind==='audio').id+'"]')`;
 const centre=sel=>read(`(()=>{const e=${sel},r=e.getBoundingClientRect(),x=r.x+Math.min(30,r.width/2),y=r.y+r.height/2,n=document.elementFromPoint(x,y);return{x:Math.round(x),y:Math.round(y),hit:e===n||e.contains(n)};})()`);
 const mouse=(type,x,y)=>win.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1,...(type==='mouseUp'?{}:{modifiers:['leftButtonDown']})});
 const row=id=>`els.tracks.querySelector('[data-track="${id}"]')`;
 for(const [w,h] of [[804,535],[630,452]]){
  win.setContentSize(w,h);await wait(500);
  await read(`updateMontClipView({mode:'advanced'});setSideTab('inspector');syncTimelineTrackView.focusKey=null;rebuildClips();true`);await wait(300);
  // the user scrolls so the empty A2 lane is in view, as VV did before dragging
  await read(`(()=>{const s=els.timelineScroll,r=${row('A2')}.getBoundingClientRect(),v=s.getBoundingClientRect().top+s.clientHeight;if(r.bottom>v)s.scrollTop+=r.bottom-v;})();true`);await wait(200);
  const before={scrollTop:await read('els.timelineScroll.scrollTop'),a2:await seen(row('A2'))};
  const from=await centre(audioClip),to=await read(`(()=>{const r=${row('A2')}.getBoundingClientRect();return{y:Math.round(r.y+r.height/2)};})()`);
  assert.ok(from.hit,'audio clip covered at its own point');
  mouse('mouseDown',from.x,from.y);for(let i=1;i<=6;i++){mouse('mouseMove',from.x+i*2,Math.round(from.y+(to.y-from.y)*i/6));await wait(40);}
  mouse('mouseUp',from.x+12,to.y);await wait(600);
  const after={track:await read(`project.clips.find(c=>c.kind==='audio').track`),scrollTop:await read('els.timelineScroll.scrollTop'),dropped:await seen(audioClip),undo:await read('runtime.undo.length')};
  log('REVEAL_DROP',{size:[w,h],before,after});await shoot(`drop-${w}x${h}`);
  assert.equal(after.track,'A2','audio clip dropped on A2');assert.ok(after.dropped>=0.99,'dropped clip fully visible: '+after.dropped);
  await read('undo();rebuildClips();true');await wait(300);
 }
 // window narrowed in simple mode: content re-focused once; never during a drag
 win.setContentSize(1270,800);await wait(500);await read(`updateMontClipView({mode:'simple'});syncTimelineTrackView.focusKey=null;rebuildClips();true`);await wait(400);
 for(const [w,h] of [[804,535],[630,452]]){
  win.setContentSize(w,h);await wait(700);
  const r={size:[w,h],V1:await seen(row('V1')),A1:await seen(row('A1')),scrollTop:await read('els.timelineScroll.scrollTop')};
  log('REVEAL_RESIZE',r);await shoot(`resize-simple-${w}x${h}`);
  assert.ok(r.V1>=0.99&&r.A1>=0.99,'V1 and A1 fully visible after narrowing');
  win.setContentSize(1270,800);await wait(700);
 }
 {const video=`els.tracks.querySelector('.clip[data-id="'+project.clips.find(c=>c.kind==='video').id+'"]')`;
  await read('els.timelineScroll.scrollTop=Math.max(0,els.timelineScroll.scrollTop-10);true');await wait(100);const manual=await read('els.timelineScroll.scrollTop');
  const p=await centre(video);assert.ok(p.hit,'video clip covered at its own point');
  mouse('mouseDown',p.x,p.y);await wait(80);mouse('mouseMove',p.x+4,p.y);await wait(80);const gesture=await read('state.gesture');
  win.setContentSize(804,535);await wait(700);const during=await read('els.timelineScroll.scrollTop');mouse('mouseUp',p.x+4,p.y);await wait(500);
  log('REVEAL_RESIZE_DURING_DRAG',{manual,gesture,during,afterUp:await read('els.timelineScroll.scrollTop')});await shoot('resize-during-drag-804x535');
  assert.equal(gesture,true,'drag started');assert.equal(during,manual,'no re-focus during the drag');}
 log('REVEAL_COMPLETE',{saved:await read('flushSave()'),visible:win.isVisible()});
 }catch(e){process.stdout.write('REVEAL_FAIL '+(e&&e.message)+'\n');}
 finally{win.setAlwaysOnTop(false);setTimeout(()=>app.exit(0),300);}
};
require('./main');
