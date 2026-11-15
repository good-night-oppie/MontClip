'use strict';
// One VAD segment that the speech engine cannot turn into words must not fail the whole recording (Deja, 2026-11-03,
// from Rea on #93: in a 3.8-hour stream of 1485 segments, one made sherpa-onnx throw basic_string::_S_create, and the
// whole transcription failed, twice). Each segment is tried on its own: a failing one is tried again as its two
// halves, once; a part that still fails is a gap {start, end, reason}, and the segments after it are transcribed as
// usual. A transcription is complete, partial (with gaps) or failed (nothing at all could be read); partial is never
// reported as done, and the gaps stay empty — no words, no subtitles — rather than shortened quietly.
// The engine here is a stand-in that throws on chosen segments: no real stream, no real model.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ROOT=path.join(__dirname,'..');
const {manifest}=require('../server/asr-models');
const {wav}=require('./songs-synth');
const T=require('../transcribe'),C=require('../captions');

const RATE=16000;
/** A stand-in for sherpa-onnx-node: the VAD cuts the sound into segments of the given lengths (samples); the recognizer
 *  writes 「字」 every 0.5 s of what it is given, and throws basic_string::_S_create for the lengths in `poison`. */
function fakeSherpa({lengths,poison=new Set()}){
 const calls=[];
 class Vad{
  constructor(){this.buf=[];this.at=0;this.q=[];this.k=0;}
  acceptWaveform(f){for(const x of f)this.buf.push(x);this.cut(false);}
  // after the planned lengths, what is left comes out as one segment when the sound ends
  cut(all){for(;;){const want=this.k<lengths.length?lengths[this.k]:Infinity;if(!(this.buf.length>=want||(all&&this.buf.length)))return;
   const n=Math.min(want,this.buf.length);this.q.push({start:this.at,samples:Float32Array.from(this.buf.splice(0,n))});this.at+=n;this.k++;}}
  flush(){this.cut(true);}
  isEmpty(){return !this.q.length;}
  front(){return this.q[0];}
  pop(){this.q.shift();}
 }
 const rec={createStream:()=>({acceptWaveform({samples}){this.n=samples.length;}}),
  async decodeAsync(s){calls.push(s.n);if(poison.has(s.n))throw new Error('basic_string::_S_create');
   const tokens=[],timestamps=[];for(let t=0;t+0.5<=s.n/RATE;t+=0.5){tokens.push('字');timestamps.push(t);}return{text:tokens.join(''),tokens,timestamps};}};
 return {sherpa:{Vad,OfflineRecognizer:{createAsync:async()=>rec},OfflinePunctuation:class{}},calls};
}
/** An engine folder that status() accepts (the package marker, a VAD file of the size the manifest says) and a store
 *  with a model folder; no real engine or model. */
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-asr-gaps-'));
 const pkg=path.join(dir,'engine','node_modules','sherpa-onnx-node');fs.mkdirSync(pkg,{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),'{}');
 const vad=path.join(dir,manifest.engine.vad.file);fs.writeFileSync(vad,'');fs.truncateSync(vad,manifest.engine.vad.size);
 const model=path.join(dir,'model');fs.mkdirSync(model);
 const store={dir:(k)=>(k==='asr'?model:null),status:()=>({asr:{ready:true,missing:[],bad:[]},punct:{ready:false,missing:[],bad:[]}})};
 const file=path.join(dir,'rec.wav');fs.writeFileSync(file,wav([['talk',30]]));
 return {dir,store,file,done:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
const ffmpeg=()=>require('../server/ffmpeg-path').path('ffmpeg');
const L=3*RATE,POISON=3*RATE+1601;   // ten segments of 3 s, the fifth a little longer (and odd, so its halves differ)
const plan=()=>[L,L,L,L,POISON,L,L,L,L];   // 4×3 + 3.1 + 4×3 = 27.1 s, the rest flushed as one more segment

test('one segment that throws: its halves are tried once; they read, so nothing is missing',async()=>{
 const S=setup();try{
  const {sherpa,calls}=fakeSherpa({lengths:plan(),poison:new Set([POISON])});
  const asr=require('../server/asr-local').createAsr({asrDir:S.dir,store:S.store,ffmpeg:ffmpeg(),sherpa});
  const r=await asr.transcribe(S.file,{});
  a.equal(r.status,'complete');a.deepEqual(r.gaps,[]);a.equal(r.skippedSegments,0);
  a.ok(calls.includes(Math.floor(POISON/2))&&calls.includes(POISON-Math.floor(POISON/2)),'both halves tried');
  const s5=12,e5=12+POISON/RATE;a.ok(r.words.some(w=>w[1]>=s5&&w[1]<e5),'words from the segment that threw');
 }finally{S.done();}
});

test('a segment that still fails as halves is a gap; the segments after it are transcribed as usual; the result is partial',async()=>{
 const S=setup();try{
  const half=Math.floor(POISON/2);
  const {sherpa}=fakeSherpa({lengths:plan(),poison:new Set([POISON,half])});
  const asr=require('../server/asr-local').createAsr({asrDir:S.dir,store:S.store,ffmpeg:ffmpeg(),sherpa});
  const r=await asr.transcribe(S.file,{});
  a.equal(r.status,'partial');
  a.equal(r.gaps.length,1);const [g]=r.gaps;
  a.equal(g.start,12);a.ok(Math.abs(g.end-(12+half/RATE))<0.001,'the first half: '+JSON.stringify(g));a.match(g.reason,/basic_string::_S_create/);
  a.ok(!r.words.some(w=>w[1]>=g.start&&w[1]<g.end),'no words in the gap');
  a.ok(r.words.some(w=>w[1]>=g.end&&w[1]<12+POISON/RATE),'the second half read');
  a.ok(r.words.some(w=>w[1]>=15.2),'the segments after it read');
  a.ok(r.words.some(w=>w[1]<12),'and the ones before');
  // QQ / Deja: with the gaps, a count of the segments not read whole
  a.equal(r.skippedSegments,1);
 }finally{S.done();}
});

test('nothing could be read at all: failed (ASR_FAILED), never a transcript',async()=>{
 const S=setup();try{
  const {sherpa}=fakeSherpa({lengths:[L,L],poison:new Set([L,L/2,L*10])});
  const asr=require('../server/asr-local').createAsr({asrDir:S.dir,store:S.store,ffmpeg:ffmpeg(),sherpa});
  // every segment (3 s, its halves of 1.5 s) throws; the rest of the 30 s flushes as one long segment that throws too
  sherpa.OfflineRecognizer.createAsync=async()=>({createStream:()=>({acceptWaveform(){}}),async decodeAsync(){throw new Error('basic_string::_S_create');}});
  await a.rejects(asr.transcribe(S.file,{}),(e)=>e.code==='ASR_FAILED'&&Array.isArray(e.gaps)&&e.gaps.length>0);
 }finally{S.done();}
});

test('a transcript keeps its gaps: in time order, inside the recording, a short reason; and says partial',()=>{
 const doc=T.validate({src:'/media/a.wav',duration:100,words:[['你',1,1.2]],gaps:[[50,60,'basic_string::_S_create'],[10,20,'x'.repeat(500)],[90,130,'e']]});
 a.deepEqual(doc.gaps.map(g=>[g[0],g[1]]),[[10,20],[50,60],[90,100]]);a.ok(doc.gaps[0][2].length<=200);
 a.equal(T.status(doc),'partial');a.equal(T.status(T.validate({words:[['你',1,1.2]]})),'complete');
 a.deepEqual(T.validate({words:[]}).gaps,[]);
 for(const bad of [[[1]],[['a',1,2]],[[5,4,'r']]])a.throws(()=>T.validate({words:[],gaps:bad}),/gap/);
});

test('subtitles made from a partial transcript have nothing in a gap: no cue starts there, no word of it is made up',()=>{
 const words=[];for(let t=0;t<10;t+=0.5)words.push({w:'字',s:t,e:t+0.4});for(let t=25;t<35;t+=0.5)words.push({w:'句',s:t,e:t+0.4});
 const gap={start:10.5,end:24.5};
 const cues=C.cues(words,{});
 a.ok(cues.length>=2);a.ok(!cues.some(c=>c.start>=gap.start&&c.start<gap.end),'no cue starts in the gap');
 const srt=C.toSRT(cues.map(c=>({start:c.start,end:c.end,text:c.text})));
 a.equal((srt.match(/[字句]/g)||[]).length,words.length,'every word once, none added');
});

test('the page: partial is never told as done; the gaps are listed and can be jumped to (words for JJ: placeholders)',()=>{
 const V=require('../ui-preferences');
 for(const k of ['tr-gaps-toast','tr-gaps-note','tr-gaps-more'])for(const l of ['zh-CN','en'])a.ok(V.t(l,'own.'+k,{n:2,dur:'31 秒',more:3}),k+' '+l);
 const app=fs.readFileSync(path.join(ROOT,'app/app.js'),'utf8');
 a.match(app,/data-tr-gaps/);a.match(app,/own\.tr-gaps-toast/);
 const srv=fs.readFileSync(path.join(ROOT,'server/server.js'),'utf8');a.match(srv,/gaps: r\.gaps/);a.match(srv,/skippedSegments: r\.skippedSegments/);
});

// Rea (2026-11-03): the segment that failed is at 3603.7 s and 4.74 s long, the only one of 1485 — not a long segment.
// The engine's state may be what broke, not that sound: after a failure, every later decode starts on a new stream
// (never the one that threw), and the next segment is read as usual.
test('after a segment fails, the next one is decoded on a new stream, never the one that threw, and is read',async()=>{
 const S=setup();try{
  const streams=[],log=[];
  const {sherpa}=fakeSherpa({lengths:plan()});
  sherpa.OfflineRecognizer.createAsync=async()=>({
   createStream(){const s={id:streams.length,acceptWaveform({samples}){this.n=samples.length;}};streams.push(s);return s;},
   async decodeAsync(s){log.push({id:s.id,n:s.n});
    // a stream that has thrown is broken: using it again throws too
    if(s.broken)throw new Error('stream used again after it failed');
    if(s.n===POISON||s.n===Math.floor(POISON/2)){s.broken=true;throw new Error('basic_string::_S_create');}
    const tokens=[],timestamps=[];for(let t=0;t+0.5<=s.n/RATE;t+=0.5){tokens.push('字');timestamps.push(t);}return{tokens,timestamps};}});
  const asr=require('../server/asr-local').createAsr({asrDir:S.dir,store:S.store,ffmpeg:ffmpeg(),sherpa});
  const r=await asr.transcribe(S.file,{});
  a.equal(new Set(log.map(x=>x.id)).size,log.length,'every decode on its own stream');
  // the decodes after the one that threw: none on a stream that threw before it
  const k=log.findIndex(x=>x.n===POISON),after=log.slice(k+1);
  a.ok(after.length>=5,'the halves and the segments after it were decoded');
  a.ok(after.every(x=>x.id>log[k].id),'each later decode on a stream made after the one that threw');
  a.ok(!streams.filter(s=>s.broken).some(s=>log.filter(x=>x.id===s.id).length>1),'a broken stream is never decoded twice');
  a.equal(r.status,'partial');a.equal(r.gaps.length,1);
  a.ok(r.words.some(w=>w[1]>=12+POISON/RATE&&w[1]<12+POISON/RATE+3),'the next segment is read');
 }finally{S.done();}
});

// JJ's final words (Deja, 2026-11-03); the tab they name is the right panel's own tab, read from its key (term.transcript)
test("JJ's words for a partial transcription; the tab named is the right panel's own",()=>{
 const V=require('../ui-preferences'),zh=(k,v)=>V.t('zh-CN','own.'+k,v),en=(k,v)=>V.t('en','own.'+k,v);
 const tabZh=V.t('zh-CN','term.transcript'),tabEn=V.t('en','term.transcript');
 a.equal(zh('tr-gaps-toast',{n:2,dur:'31 秒'}),`听写完了，但有 2 段没听写出来（共 31 秒），这几段没有字幕。可以在右边「${tabZh}」里点时间跳过去看，需要的话自己补上字幕。`);
 a.equal(en('tr-gaps-toast',{n:2,dur:'31 s'}),`Transcription finished, but 2 part(s) (31 s in all) couldn't be transcribed and have no subtitles. Click a time under “${tabEn}” on the right to jump there, and add subtitles yourself if you need them.`);
 a.equal(zh('tr-gaps-note',{n:2,dur:'31 秒'}),'有 2 段没听写出来（共 31 秒），这几段没有字幕。点时间可以跳过去：');
 a.equal(en('tr-gaps-note',{n:2,dur:'31 s'}),"2 part(s) (31 s in all) couldn't be transcribed and have no subtitles. Click a time to jump there:");
 // the tab really is called that on screen
 a.match(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),/data-side="transcript"[^>]*data-i18n="term\.transcript"/);
});

// VV on #95 d95ab21 (Deja, 2026-11-03): the gaps' times read like the 自动出切片 cards' (0:15–0:22, MontClipAutoSlices.hms),
// not the tab's frame timecode (00:15:00 reads as 15 minutes); each one is a button — Tab reaches it, Enter goes there
test('the gaps list: the cards\' time format, each time a button',()=>{
 const app=fs.readFileSync(path.join(ROOT,'app/app.js'),'utf8'),i=app.indexOf('function trGapsHtml('),body=app.slice(i,app.indexOf('function renderTranscript(',i));
 a.match(body,/<button type="button" class="tr-gap-go" data-t="\$\{x\.t\}">\$\{escapeHtml\(MontClipAutoSlices\.hms\(x\.t\)\)\}–\$\{escapeHtml\(MontClipAutoSlices\.hms\(x\.u\)\)\}<\/button>/);
 a.ok(!/class="tr-tc"/.test(body),'no grey span');
 a.match(app,/const gap = e\.target\.closest\("\.tr-gap-go"\);\s*if \(gap\) goToTranscriptTime\(\+gap\.dataset\.t\);/);
 a.match(fs.readFileSync(path.join(ROOT,'style.css'),'utf8'),/\.tr-gap-go \{[^}]*text-decoration: underline;[^}]*cursor: pointer;/);
 const S=require('../auto-slices');a.equal(S.hms(15)+'–'+S.hms(22),'0:15–0:22');
});
