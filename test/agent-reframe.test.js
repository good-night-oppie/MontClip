'use strict';
// Deja (2026-11-05): the desktop assistant may reframe — {"type":"reframe","aspect"} makes a copy of the open sequence on
// that shape whose shots follow the subject, and opens it. Sensitive (it switches what is open); asked every time in
// every mode, Yolo too; only the listed shapes, nothing else in the reply; the footage is read with a progress line and
// 〔取消〕 before anything is made; one undo goes back to the original sequence. A synthetic video (a block moving left to
// right, made by ffmpeg) shows the 9:16 result keeps the whole block in the picture in every frame, the last one included
// (the clip's last frame is read too: reframe.js sampleTimes).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const P=require('../app/chat-proposal'),V=require('../app/agent-conversation'),Cap=require('../shared/capabilities'),Policy=require('../shared/agent-policy');
const Plan=require('../app/agent-plan'),F=require('../shared/agent-format'),L=require('../app/agent-limits'),View=require('../shared/ui-preferences'),R=require('../shared/reframe');
const FF=require('../server/ffmpeg-path');

const ctx={projectId:'p',sequenceId:'main',generation:0,revision:1};
const doc=(w=1920,h=1080)=>({fps:30,width:w,height:h,media:[{id:'m',kind:'video',duration:60,width:1920,height:1080}],clips:[{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:30,props:{}}]});
const prep=(r,d=doc())=>P.prepare(r,{doc:d,context:ctx});

test('the reply: only {type, aspect}, only 9:16, 1:1 or 4:5; anything else is refused',()=>{
 for(const aspect of ['9:16','1:1','4:5']){
  const p=prep({type:'reframe',aspect});
  a.equal(p.type,'reframe');a.equal(p.aspect,aspect);a.equal(p.unchanged,false);
  a.deepEqual(P.event(p,{id:'e',runId:'r',step:1,at:'x',revision:1}).args,{aspect},'the event holds the checked shape only');
  a.deepEqual(V.proposalSummary(JSON.stringify({type:'reframe',aspect}),[]),{count:1,duration:0,mode:'reframe',aspect});
 }
 const bad=[{type:'reframe'},{type:'reframe',aspect:'16:9'},{type:'reframe',aspect:'2:3'},{type:'reframe',aspect:'9:16 '},{type:'reframe',aspect:'9：16'},
  {type:'reframe',aspect:9/16},{type:'reframe',aspect:['9','16']},{type:'reframe',aspect:'9:16',name:'Reel'},{type:'reframe',aspect:'9:16',follow:false},
  {type:'reframe',aspect:'9:16',clipIds:['c']},{type:'reframe',aspect:'toString'},{type:'reframe',aspect:'__proto__'}];
 for(const r of bad){
  a.throws(()=>prep(r),/PROPOSAL_INVALID/,JSON.stringify(r));
  a.equal(V.proposalSummary(JSON.stringify(r),[]),null,'no button: '+JSON.stringify(r));
 }
 // a sequence already that shape: nothing to make
 a.throws(()=>prep({type:'reframe',aspect:'9:16'},doc(1080,1920)),/PROPOSAL_UNCHANGED/);
 a.throws(()=>prep({type:'reframe',aspect:'1:1'},doc(1080,1080)),/PROPOSAL_UNCHANGED/);
 // the table's schema says the same
 const s=Cap.get('reframe').schema;
 a.equal(s.additionalProperties,false);a.deepEqual(s.required,['type','aspect']);a.deepEqual(s.properties.aspect.enum,['9:16','1:1','4:5']);
 a.deepEqual(Object.keys(P.ASPECTS),s.properties.aspect.enum);
});

test('sensitive, with the reason written; asked every time in every mode, Yolo and 自动 too, never 「都批准」',()=>{
 a.equal(Cap.riskOf('reframe'),'sensitive');a.equal(Cap.riskOf('fablecut_reframe'),'sensitive');
 a.match(read('shared/capabilities.js'),/sensitive, not undoable \(Deja, 2026-11-05\): with an aspect it makes a new sequence and opens it — it switches what is\n\s*\/\/ open/);
 a.ok(Cap.confirmEveryTime('reframe'));a.ok(!Cap.confirmEveryTime('keep_ranges'));
 for(const mode of ['manual','auto','yolo'])for(const approved of [false,true]){
  const d=Policy.decide({mode,capability:'reframe',language:'zh-CN',approved});
  a.equal(d.action,'ask',mode+' '+approved);a.deepEqual(d.choices,['once','deny'],'no 「这个聊天中都批准」');
 }
 a.equal(Policy.decide({mode:'plan',capability:'reframe'}).action,'list');
 // the other capabilities keep their rules (Yolo still runs an undoable edit without asking)
 a.equal(Policy.decide({mode:'yolo',capability:'keep_ranges'}).action,'run');
 a.equal(Cap.label('reframe','zh-CN'),'做一份竖屏或方形的新序列，画面跟着人走，并切换过去');
 a.equal(Plan.stepDetail({capability:'reframe',args:{aspect:'9:16'}},'zh-CN'),'做一份 9:16 的新序列');
});

test('the editor: the box first, then the footage read with progress and 〔取消〕, made only at the end; one undo goes back',()=>{
 const app=read('app/app.js');
 const run=app.slice(app.indexOf('async function runAgentReframe('),app.indexOf('function agentReframeBackOf('));
 // progress with 〔取消〕, a window of its own that Yolo shows too; the copy is made only after reading, cancel and the checks
 a.match(app,/el\.innerHTML='<p data-rf-progress><\/p><div class="tr-row"><button type="button" class="btn" data-rf-cancel><\/button><\/div>';/);
 a.match(app,/addEventListener\('click',\(\)=>\{agentReframeRun\.cancel=true;/);
 const at=(s)=>{const i=run.indexOf(s);a.ok(i>0,s);return i;};
 a.ok(at('await sampleClipFrames(')<at("if(agentReframeRun.cancel){agentReframeRun.cancel=false;return {ok:false,code:'CANCELLED'};}"));
 a.ok(at("return {ok:false,code:'CANCELLED'};")<at("return {ok:false,code:'CHANGED'};"));
 a.ok(at("return {ok:false,code:'CHANGED'};")<at('SeqLib.add(doc,'),'nothing is added before the footage is read and checked');
 a.ok(at('SeqLib.add(doc,')<at('openSequence(s.id)')&&at('openSequence(s.id)')<at('pushUndo(JSON.stringify({agentReframeBack:'));
 a.match(run,/finally\{agentReframeRun\.busy=false;agentReframeDone\(\);\}/,'the progress window goes, whatever happens');
 a.match(run,/if\(!openSequence\(s\.id\)\)\{const d2=projectJSONHere\(\);try\{SeqLib\.remove\(d2,s\.id\);\}/,'not opened: the copy is taken out again');
 // undo: the step on the copy's history opens the original and deletes the copy; no redo
 a.match(app,/const rf = typeof snap === "string" && snap\.includes\('"agentReframeBack":'\) \? agentReframeBackOf\(snap\) : null;\n  if \(rf\) \{ if \(undoAgentReframe\(snap, rf\)\) \{ runtime\.redo\.length = 0; if \(id\) moveEvent\(id, "undone"\); \} return; \}/);
 const undo=app.slice(app.indexOf('function undoAgentReframe('),app.indexOf('const agentReframeFlows='));
 a.ok(undo.indexOf('openSequence(b.back)')<undo.indexOf('SeqLib.remove(doc,b.sequence)'));
 // the flow: the host decides (it asks), the host's box, the CAS, then the work — from the reply and from the button alike
 const flow=app.slice(app.indexOf('async function agentReframeFlow('));
 a.ok(flow.indexOf('montclipAgentPolicy.decide(')<flow.indexOf('askAgentApproval(')&&flow.indexOf('askAgentApproval(')<flow.indexOf('MontClipProposal.current(')&&flow.indexOf('MontClipProposal.current(')<flow.indexOf('runAgentReframe('));
 a.match(flow,/if\(d\.action!=='ask'\)\{toast\(agentRefusalText\(d\)\);return;\}/,'nothing runs without the box');
 a.match(app,/if\(response\.type==='reframe'\)\{await agentReframeFlow\(response,result\);return;\}/);
 a.match(app,/if\(response&&response\.type==='reframe'\)\{void agentReframeFlow\(response,result\);return;\}/);
 // the pane's summary of the reply
 a.match(read('agent-ui/pane.tsx'),/p\.mode==='reframe'\?t\.proposalReframe\.replace\('\{aspect\}',p\.aspect\)/);
 a.match(read('app/cindy-official.js'),/proposalReframe/);
 for(const k of ['rf-progress','rf-cancel','rf-done','rf-cancelled','rf-undone','ap-sum-reframe'])for(const l of ['zh-CN','en'])a.ok(View.text[l]['own.'+k],l+' '+k);
 a.equal(View.text['zh-CN']['own.rf-cancel'],'取消');
 for(const k of Object.keys(View.text['zh-CN']).filter(k=>/^own\.rf-|^own\.ap-sum-reframe$|proposalReframe$/.test(k)))a.ok(!/我/.test(View.text['zh-CN'][k]),'no 我: '+k);
});

test('the format note offers the reply, and a vertical picture is no longer reported as missing',()=>{
 a.ok(F.FORMAT_NOTE.includes('{"type":"reframe","aspect":"<9:16, 1:1 or 4:5>"}'));
 a.ok(F.FORMAT_NOTE.includes('No other key and no other shape; it is not a plan step.'));
 a.ok(!/You cannot change the picture's shape/.test(F.FORMAT_NOTE));
 a.ok(!F.FORMAT_NOTE.includes('改竖屏这一步我现在做不了'));
 a.deepEqual(L.unsupported('剪到 1 分钟以内，发快手和 B 站竖屏'),[]);
 a.deepEqual(L.unsupported('改成竖屏',['keep_ranges']),[],'the vertical check is gone with it (Deja, 2026-11-05)');
});

const skip=!FF.resolveTool('ffmpeg').ok&&"MontClip's ffmpeg is not in vendor/ (node desktop/fetch-ffmpeg.cjs)";
test('synthetic video (a block moving left to right): the 9:16 copy keeps the whole block in the picture in every frame, the last included',{skip},(t)=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-rf-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const file=path.join(d,'block.mp4'),W=640,H=360,D=6,B=60,left=(s)=>20+(W-B-40)*s/D;
 // the bundled ffmpeg has no H.264 encoder: MPEG-4 Part 2 in MP4
 let r=spawnSync(FF.path('ffmpeg'),['-v','error','-y','-f','lavfi','-i',`color=c=0x202020:s=${W}x${H}:d=${D}:r=30`,'-f','lavfi','-i',`color=c=0xffcc00:s=${B}x${B}:d=${D}:r=30`,
  '-filter_complex',`[0][1]overlay=x='20+(${W-B-40})*t/${D}':y=${(H-B)/2}`,'-pix_fmt','yuv420p','-c:v','mpeg4','-q:v','3',file],{encoding:'utf8'});
 a.equal(r.status,0,r.stderr);
 // frames as the editor and fablecut_reframe sample them (reframe.js sampleTimes: SAMPLE_FPS a second, then the clip's last
 // frame, read once more at duration − 1 frame — as mcp-server.js sampleFrames does, SAMPLE_W wide)
 const w=R.SAMPLE_W,h=Math.max(8,Math.round(w*H/W/2)*2),fb=w*h*3,times=R.sampleTimes(D,{frame:1/30});
 a.equal(times.length,31);a.equal(times[29],5.8);a.equal(times[30],5.966,'the last frame of the clip');
 r=spawnSync(FF.path('ffmpeg'),['-v','error','-i',file,'-an','-vf',`fps=${R.SAMPLE_FPS},scale=${w}:${h}`,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
 a.equal(r.status,0,String(r.stderr));
 const frames=[];for(let o=0;o+fb<=r.stdout.length;o+=fb)frames.push(r.stdout.subarray(o,o+fb));
 a.equal(frames.length,30);
 const q=spawnSync(FF.path('ffmpeg'),['-v','error','-ss',String(times[30]),'-i',file,'-an','-frames:v','1','-vf',`scale=${w}:${h}`,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<24});
 a.equal(q.status,0,String(q.stderr));a.ok(q.stdout.length>=fb);frames.push(q.stdout.subarray(0,fb));
 const samples=R.subjectTrack(frames,w,h,{times});
 a.deepEqual(samples.map(s=>s[0]),times,'each frame at its own time');
 const canvas=R.canvasFor('9:16',W,H);a.deepEqual(canvas,{width:360,height:640});
 const clip={id:'c',kind:'video',in:0,duration:D,props:{}};
 const plan=R.clipPlan(clip,samples,{width:W,height:H},canvas,{smooth:0.5,fps:30,follow:true});
 a.equal(plan.set.props.fit,'cover');a.equal(plan.axis,'x');
 const keys=plan.set.keyframes.x;a.ok(keys.length>=2,'it follows: '+JSON.stringify(keys));
 const x=(s)=>{if(s<=keys[0].t)return keys[0].v;for(let i=1;i<keys.length;i++)if(s<=keys[i].t){const k0=keys[i-1],k1=keys[i];return k0.v+(k1.v-k0.v)*(s-k0.t)/(k1.t-k0.t);}return keys.at(-1).v;};
 const cover=R.coverRect(W,H,canvas.width,canvas.height,1),k=cover.pw/W;   // drawn px per source px
 // every frame of the clip, the last one (5.967 s) included: the whole block is in the picture
 for(let f=0;f<D*30;f++){
  const s=f/30,from=(cover.pw/2-x(s)-canvas.width/2)/k,to=(cover.pw/2-x(s)+canvas.width/2)/k;   // the source pixels on the canvas
  a.ok(left(s)>=from-0.5&&left(s)+B<=to+0.5,`at ${s.toFixed(3)} s the block (${left(s).toFixed(0)}–${(left(s)+B).toFixed(0)}) is outside ${from.toFixed(0)}–${to.toFixed(0)}`);
 }
});

test('the editor and fablecut_reframe both read the clip\'s last frame (reframe.js sampleTimes, one fix for both)',()=>{
 a.deepEqual(R.sampleTimes(6,{frame:1/30}).slice(-2),[5.8,5.966]);
 a.deepEqual(R.sampleTimes(6.2,{frame:1/30}).slice(-2),[6,6.166],'a clip not a whole number of samples long');
 a.deepEqual(R.sampleTimes(5.8+1/30,{frame:1/30}).slice(-2),[5.6,5.8],'the last regular sample is the last frame: not read twice');
 a.deepEqual(R.sampleTimes(4,{frame:2/30}).slice(-1),[3.933],'at 2× speed one timeline frame is two source frames');
 // the tracker takes each frame's own time; without one, the next at SAMPLE_FPS as before
 const t=R.tracker(8,8),f=new Uint8Array(8*8*3);t.push(f);t.push(f);t.push(f,0.75);
 a.deepEqual(t.samples.map(s=>s[0]),[0,0.2,0.75]);
 const app=read('app/app.js'),mcp=read('server/mcp-server.js');
 a.match(app,/\(f, t\) => tr\.push\(f, t\),\n\s*\{ times: Reframe\.sampleTimes\(c\.duration \* clipSpeed\(c\), \{ frame: clipSpeed\(c\) \/ fps \}\) \}\);/,'the editor\'s Reframe');
 a.match(app,/\(f,t\)=>tr\.push\(f,t\),\{times:Reframe\.sampleTimes\(c\.duration\*clipSpeed\(c\),\{frame:clipSpeed\(c\)\/fps\}\),cancelled:/,'the assistant\'s reframe');
 a.match(app,/if \(onRgb\) onRgb\(rgb\(\), at\[i\]\); else frames\.push\(rgb\(\)\);/);
 // Highlights reads the same way as before: no times, PIC_FPS a second
 a.match(app,/await sampleClipFrames\(c, w, h, onFrame, \(f\) => pic\.push\(f\), \{ fps: Highlights\.PIC_FPS, cancelled \}\);/);
 // MCP's source-frame selection is exercised with real CFR/VFR files in reframe-source-tail.test.js.
 a.match(mcp,/samples = R\.subjectTrack\(s\.frames, w, h, s\.times \? \{ times: s\.times \} : \{\}\);/);
 a.ok(!/extrapolat/i.test(read('shared/reframe.js').replace(/Not an[\s*]+extrapolation/,'')),'read, not extrapolated');
});
