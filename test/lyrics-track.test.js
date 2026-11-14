'use strict';
// Lyrics onto a new caption track, for the agent (JJ, 2026-11-05; docs/decisions/2026-11-05-lyrics-align-agent-tool.md).
// The words stand in for what the local engine hears when a TTS voice reads the lyrics over an accompaniment
// (test/lyrics-synth.js). Covered: all lines match, some match (made-up lines mixed in), another song (under the threshold),
// no singing, no lyrics; the proposal changes nothing; applied, one new caption track, the old captions as they were, one
// undo step; the agent's result {text, start, end, matched, confidence} with n and k; JJ's copy word for word.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('../lyrics-track'),L=require('../lyrics-align'),C=require('../captions'),View=require('../ui-preferences');
const Cap=require('../capabilities'),TOOLS=require('../server/mcp-tools');
const {SONGS,sing,text}=require('./lyrics-synth');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const FAKE=['这一句根本没有唱过','风筝飞过了十二座山','橙色的列车开往北极'];

test('all lines match: every line has its own time, n = k, code OK',()=>{
 const p=T.propose(sing(SONGS.harbour,{err:0.15,seed:3}),text(SONGS.harbour));
 a.equal(p.ok,true);a.equal(p.code,'OK');a.equal(p.n,10);a.equal(p.k,10);a.equal(p.m,0);
 for(let i=1;i<p.lines.length;i++)a.ok(p.lines[i].start>=p.lines[i-1].end-1e-9,'in order, not overlapping');
 a.equal(p.lines[0].start,10);
});

test('the agent reads each line as {text, start, end, matched, confidence}, with n and k',()=>{
 const lyrics=[...SONGS.train];lyrics.splice(3,0,FAKE[0]);
 const r=T.forAgent(T.propose(sing(SONGS.train,{err:0.1,seed:5}),text(lyrics)));
 a.deepEqual(Object.keys(r).sort(),['code','k','lines','m','n','ok']);
 a.equal(r.n,11);a.equal(r.k,10);a.equal(r.m,1);
 for(const l of r.lines){
  a.deepEqual(Object.keys(l).sort(),['confidence','end','matched','start','text']);
  a.ok(l.confidence>=0&&l.confidence<=1);
  if(l.matched)a.ok(l.end>l.start);else{a.equal(l.start,null);a.equal(l.end,null);}
 }
 a.equal(r.lines[3].text,FAKE[0]);a.equal(r.lines[3].matched,false);
});

test('some match: made-up lines are not forced in — grey, beside their neighbours, never over a matched line',()=>{
 const lyrics=[...SONGS.rooftop];lyrics.splice(2,0,FAKE[0]);lyrics.splice(6,0,FAKE[1]);lyrics.push(FAKE[2]);
 const p=T.propose(sing(SONGS.rooftop,{err:0.1,seed:9}),text(lyrics));
 a.equal(p.code,'OK');a.equal(p.n,13);a.equal(p.k,10);
 const at=T.place(p);
 a.equal(at.length,13,'every line has a place: matched at its time, grey for her to drag');
 for(let i=1;i<at.length;i++)a.ok(at[i].start>=at[i-1].end-1e-9,'no two overlap');
 const grey=at.filter(q=>!q.matched).map(q=>q.text).sort();
 a.deepEqual(grey,[...FAKE].sort());
 for(const q of at.filter(q=>q.matched)){const l=p.lines[q.line];a.equal(q.start,l.start,'a matched line keeps its own start');}
 // with no room between neighbours the grey lines go after the song
 const tight=T.propose(sing(['一二三四五六','七八九十'],{breath:0}),'一二三四五六\n不存在的一句话\n七八九十');
 const pl=T.place(tight);a.equal(pl.length,3);
 const g=pl.find(q=>!q.matched);a.ok(g.start>=tight.to,'after the song');
});

test('another song: under the threshold, nothing will be placed (TOO_FEW)',()=>{
 for(const [heard,pasted] of [['harbour','garden'],['train','rooftop'],['garden','harbour']]){
  const p=T.propose(sing(SONGS[heard],{err:0.2,seed:2}),text(SONGS[pasted]));
  a.equal(p.ok,true);a.equal(p.code,'TOO_FEW',heard+' / '+pasted);
  a.ok(p.k/p.n<T.THRESHOLD);
  a.deepEqual(T.place(p),[]);a.deepEqual(T.clips(p,{track:'V4'}),[]);
 }
 a.equal(T.THRESHOLD,0.2,'measured: scripts/lyrics-threshold.cjs and the ADR');
});

test('the threshold separates the measured cases (scripts/lyrics-threshold.cjs)',()=>{
 const {spawnSync}=require('node:child_process');
 const r=spawnSync(process.execPath,[path.join(ROOT,'scripts','lyrics-threshold.cjs')],{encoding:'utf8'});
 a.equal(r.status,0,r.stdout+r.stderr);
 a.match(r.stdout,/highest wrong 0\.00/);
});

test('no singing in the part: NO_VOCALS; no lyrics: NO_LYRICS (said first, the paste is what she can fix)',()=>{
 a.equal(T.propose([],text(SONGS.train)).code,'NO_VOCALS');
 a.equal(T.propose([{w:'，',s:1,e:1.2},{w:'…',s:2,e:2.1}],text(SONGS.train)).code,'NO_VOCALS','only punctuation heard');
 a.equal(T.propose(sing(SONGS.train),'').code,'NO_LYRICS');
 a.equal(T.propose(sing(SONGS.train),'\n  \n。。。\n').code,'NO_LYRICS');
 a.equal(T.propose([],'').code,'NO_LYRICS');
 a.equal(T.forAgent(T.propose([],'x')).ok,false);
});

test('one aligner: the proposal is lyrics-align.js align, not a second implementation',()=>{
 const src=read('lyrics-track.js');
 a.match(src,/L\.align\(heard, lyrics\)/);a.match(src,/L\.lines\(lyrics\)/);
 a.ok(!/edit distance\s*,?\s*with the path/i.test(src)&&!/new Uint32Array/.test(src),'no edit distance of its own');
 const words=sing(SONGS.harbour,{err:0.2,seed:4}),p=T.propose(words,text(SONGS.harbour)),r=L.align(words,text(SONGS.harbour));
 p.lines.forEach((l,i)=>{a.equal(l.matched,r.lines[i].sure);a.equal(l.confidence,r.lines[i].score);});
});

test('the clips: one new track, matched lines as captions timed word by word, the others disabled and grey',()=>{
 const lyrics=[...SONGS.garden];lyrics.splice(4,0,FAKE[1]);
 const p=T.propose(sing(SONGS.garden,{err:0.1,seed:1}),text(lyrics));
 let n=0;const cs=T.clips(p,{track:'V4',width:1920,height:1080,id:()=>'c_'+(n++)});
 a.equal(cs.length,11);
 a.ok(cs.every(c=>c.track==='V4'&&C.isCaption(c)&&c.kind==='text'&&c.mediaId===null));
 a.equal(new Set(cs.map(c=>c.id)).size,11);
 const grey=cs.filter(c=>c.disabled);a.equal(grey.length,1);a.equal(grey[0].props.lyricsUnmatched,true);a.equal(grey[0].props.text,FAKE[1]);
 a.ok(cs.filter(c=>!c.disabled).every(c=>!c.props.lyricsUnmatched&&c.props.text));
 // nothing that names a song
 a.ok(!/"song|歌名|songTitle|songName/i.test(JSON.stringify(cs)));
});

test('a new track id on top, and none past 16 video tracks',()=>{
 a.equal(T.newTrack({tracks:C.DEFAULT_TRACKS,clips:[]}),'V4');
 a.equal(T.newTrack({tracks:[{id:'V1',kind:'video'},{id:'A1',kind:'audio'}],clips:[{track:'V7'}]}),'V8');
 a.equal(T.newTrack({tracks:Array.from({length:16},(_,i)=>({id:'V'+(i+1),kind:'video'})),clips:[]}),null);
});

test('scopeSig: moving or trimming a singing clip changes it; other clips and captions do not',()=>{
 const doc={fps:30,clips:[{id:'a',track:'A1',start:0,in:0,duration:60,mediaId:'m'},{id:'cap',track:'V3',start:1,duration:2,kind:'text'}]};
 const s=T.scopeSig(doc,['a']);
 a.equal(T.scopeSig({...doc,clips:[doc.clips[0],{...doc.clips[1],start:5}]},['a']),s);
 a.notEqual(T.scopeSig({...doc,clips:[{...doc.clips[0],start:1}]},['a']),s);
 a.notEqual(T.scopeSig({...doc,clips:[{...doc.clips[0],duration:30}]},['a']),s);
});

/* The page's apply (app.js runLyricsJob), run against a small world: the card answered, the undo history real. */
function page({answer='place',policy=null}={}){
 const SRC=read('app.js');
 const cut=(x,y)=>{const i=SRC.indexOf(x),j=SRC.indexOf(y,i);a.ok(i>=0&&j>i,x);return SRC.slice(i,j);};
 const code=cut('function undoSnapshot()','function redo()')+'\n'+cut('async function runLyricsJob(','async function runTrackJob(');
 const world={
  project:{name:'P',width:1920,height:1080,fps:30,revision:4,tracks:[...C.DEFAULT_TRACKS],markers:[],comps:[],media:[],clips:[]},
  runtime:{undo:[],redo:[],projectId:'p1'},state:{selIds:new Set()},reports:[],toasts:[],cards:0,
 };
 const fn=new Function('world','MontClipLyricsTrack','MontClipCaptions','answer','policy',`
  let {project,runtime,state}=world;let renderCancelled=false;const MAX_TRACKS_PER_KIND=16;
  const window={montclipAgentPolicy:policy};
  const projectJSON=()=>JSON.parse(JSON.stringify(project));
  const uiText=(k,v)=>k+(v?JSON.stringify(v):'');const toast=(m)=>world.toasts.push(m);const toastAction=(m)=>world.toasts.push(m);
  const agentRefusalText=()=>'refused';const uid=(()=>{let n=0;return()=>'x'+(n++);})();
  const reportExportJob=async(id,body)=>{world.reports.push(body);};
  const lyricsCard=async()=>{world.cards++;return answer;};
  const addTimelineTrack=(kind)=>{const id='V'+(Math.max(...project.tracks.filter(t=>t.kind==='video').map(t=>+t.id.slice(1)))+1);project.tracks=[{id,kind},...project.tracks];return {id,kind};};
  const scheduleSave=()=>{},renderTranscript=()=>{},renderInspector=()=>{},drawFrame=()=>{},pruneSelection=()=>{};
  const flushSave=async()=>{project.revision++;return true;};
  const MontClipEvents=undefined,SeqLib=null,seqRoot=()=>null,reloadMediaSource=()=>{},renderBin=()=>{},scheduleOfflineCheck=()=>{};
  ${code}
  return {runLyricsJob,undo,get project(){return project;}};`);
 const api=fn(world,T,C,answer,policy);
 return {world,api};
}
function proposalOn(doc){
 const lyrics=[...SONGS.harbour];lyrics.splice(5,0,FAKE[2]);
 const words=sing(SONGS.harbour,{err:0.1,seed:6}).map(w=>({...w,clip:'a1'}));
 const p=T.propose(words,text(lyrics));
 return {...p,id:'ly_test01',clipIds:['a1'],sig:T.scopeSig(doc,['a1'])};
}
const singing={id:'a1',kind:'audio',track:'A1',mediaId:'m1',start:0,in:0,duration:120};
const oldCap={id:'cap1',kind:'text',mediaId:null,track:'V3',start:12,duration:2,props:{text:'原来的字幕',caption:true,captionStyle:'subtitle'}};

test('applied: one new caption track, the old captions exactly as they were, one Ctrl+Z takes it all back',async()=>{
 const {world,api}=page();
 world.project.clips.push(JSON.parse(JSON.stringify(singing)),JSON.parse(JSON.stringify(oldCap)));
 const before=JSON.stringify(world.project.clips),p=proposalOn(world.project);
 await api.runLyricsJob({id:'x_1',lyrics:p},(e)=>{throw new Error(e);});
 const done=world.reports.at(-1);
 a.equal(done.status,'done');a.equal(done.result.applied,true);a.equal(done.result.track,'V4');
 a.equal(done.result.placed,10);a.equal(done.result.grey,1);
 const added=api.project.clips.filter(c=>c.track==='V4');
 a.equal(added.length,11);a.ok(added.every(C.isCaption));
 a.deepEqual(api.project.clips.find(c=>c.id==='cap1'),oldCap,'the old caption not changed by a single character');
 a.ok(world.toasts.includes('own.lt-done'));
 a.equal(world.project.runtime,undefined);
 api.undo();
 a.equal(JSON.stringify(api.project.clips),before,'one undo step');
});

test('先不用: nothing changes; the agent hears applied:false',async()=>{
 const {world,api}=page({answer:'not-now'});
 world.project.clips.push({...singing});
 const before=JSON.stringify(world.project),p=proposalOn(world.project);
 await api.runLyricsJob({id:'x_2',lyrics:p},(e)=>{throw new Error(e);});
 a.equal(world.cards,1);
 a.deepEqual(world.reports.at(-1),{status:'done',result:{applied:false,reason:'DECLINED'}});
 a.equal(JSON.stringify(api.project),before);
});

test('the card is shown in every mode that may act (even 自动 / Yolo, where the host says run); plan mode only lists',async()=>{
 for(const action of ['run','ask']){
  const pol={decide:async()=>({ok:true,action,label:'把对好的歌词放到一条新的字幕轨上',ticket:action==='ask'?'t1':null}),answer:async()=>({ok:true})};
  const {world,api}=page({answer:'not-now',policy:pol});
  world.project.clips.push({...singing});
  await api.runLyricsJob({id:'x_3',lyrics:proposalOn(world.project)},(e)=>{throw new Error(e);});
  a.equal(world.cards,1,action);
 }
 const pol={decide:async()=>({ok:true,action:'list'}),answer:async()=>({ok:true})};
 const {world,api}=page({policy:pol});
 world.project.clips.push({...singing});
 const before=JSON.stringify(world.project);
 await api.runLyricsJob({id:'x_4',lyrics:proposalOn(world.project)},(e)=>{throw new Error(e);});
 a.equal(world.cards,0);a.equal(world.reports.at(-1).result.reason,'LISTED');a.equal(JSON.stringify(api.project),before);
});

test('a singing clip moved since the proposal: refused, nothing placed',async()=>{
 const {world,api}=page();
 world.project.clips.push({...singing});
 const p=proposalOn(world.project);
 world.project.clips[0].start=3;
 const before=JSON.stringify(world.project);let err=null;
 await api.runLyricsJob({id:'x_5',lyrics:p},(e)=>{err=e;});
 a.match(err,/changed/);a.equal(world.cards,0);a.equal(JSON.stringify(api.project),before);
});

test('JJ’s copy, word for word, in both languages; the P8 sentence holds its key',()=>{
 const zh=(k,v)=>View.t('zh-CN','own.'+k,v),en=(k,v)=>View.t('en','own.'+k,v);
 a.equal(zh('lt-preview',{k:7,n:10,m:3}),'歌词对上了 7/10 行。没对上的 3 行是灰色的，可以自己拖到位置上。');
 a.equal(en('lt-preview',{k:7,n:10,m:3}),"7 of 10 lyric lines lined up. The 3 grey lines didn't match. You can drag them into place.");
 a.equal(zh('lt-done'),'歌词放到了一条新的字幕轨上，原来的字幕没动。按 ⟨Ctrl⟩+⟨Z⟩ 可以撤销。');
 a.equal(en('lt-done'),"The lyrics are on a new caption track. Your existing captions weren't changed. Press Ctrl+Z to undo.");
 a.equal(zh('lt-too-few',{k:1,n:10}),'只对上了 1/10 行，可能不是这首歌，或者唱的版本不一样，所以没有放到时间线上。');
 a.equal(en('lt-too-few',{k:1,n:10}),'Only 1 of 10 lines matched. It may be a different song or a different version, so nothing was added to the timeline.');
 a.equal(zh('lt-no-vocals'),'这段里没听出有人在唱，歌词对不上。换一段试试。');
 a.equal(en('lt-no-vocals'),"No singing was heard in this part, so the lyrics can't be lined up. Try another part.");
 a.equal(zh('lt-no-lyrics'),'还没有歌词。把歌词粘贴进来，一行一句。');
 a.equal(en('lt-no-lyrics'),'No lyrics yet. Paste them in, one line per line of the song.');
 a.equal(zh('lt-place'),'放到时间线上');a.equal(zh('lt-not-now'),'先不用');
 // JJ final, word for word (#164 issuecomment-6691316743)
 a.equal(zh('lt-asr-unavailable'),'现在没法听写，歌词对不上。可能是编辑器没打开，或听写还没装好。');
 a.equal(en('lt-asr-unavailable'),"Transcription can't run right now, so the lyrics can't be lined up. The editor may not be open, or transcription may not be installed yet.");
 a.equal(en('lt-place'),'Add to the timeline');a.equal(en('lt-not-now'),'Not now');
 a.equal(zh('lt-not-placed'),'没有放到时间线上，什么都没改。');a.equal(en('lt-not-placed'),'Not added. Nothing changed.');
 a.ok(!/DRAFT for JJ[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*"lt-/.test(read('ui-preferences.js')),'no lt- key left as DRAFT');
 a.ok(!/TODO\(P8\)/.test(read('ui-preferences.js')),'no TODO(P8) placeholder left');
 const keys={OK:'lt-preview',TOO_FEW:'lt-too-few',NO_VOCALS:'lt-no-vocals',NO_LYRICS:'lt-no-lyrics',ASR_UNAVAILABLE:'lt-asr-unavailable'};
 for(const [code,key] of Object.entries(keys))a.equal(T.messageKey({ok:code==='OK',code}),key);
});

test('nothing here recognises a song: no song names in the copy, the tools or the results',()=>{
 const copy=['lt-preview','lt-done','lt-too-few','lt-no-vocals','lt-no-lyrics','lt-asr-unavailable','lt-place','lt-not-now','lt-not-placed'].flatMap(k=>[View.t('zh-CN','own.'+k),View.t('en','own.'+k)]);
 for(const s of copy)a.ok(!/识别|歌名|identif|recogni|song title|song name/i.test(s),s);
 const tool=TOOLS.find(t=>t.name==='fablecut_lyrics');
 a.match(tool.description,/never names or recognises a song/);
 a.ok(!/song_lookup|lookup/.test(read('lyrics-track.js')));
});

test('capabilities: the proposal only reads; applying is undoable (one Ctrl+Z), and the card asks whatever the mode',()=>{
 a.equal(Cap.riskOf('fablecut_lyrics'),'read');
 a.equal(Cap.riskOf('fablecut_lyrics_apply'),'undoable');
 for(const n of ['fablecut_lyrics','fablecut_lyrics_apply'])a.ok(TOOLS.some(t=>t.name===n),n);
 const apply=TOOLS.find(t=>t.name==='fablecut_lyrics_apply');
 a.deepEqual(apply.inputSchema.required,['proposalId']);
});

test('the page loads the module before app.js, and the server queues the card for an open tab only',()=>{
 const html=read('index.html');
 a.ok(html.indexOf('lyrics-track.js')>html.indexOf('lyrics-align.js')&&html.indexOf('lyrics-track.js')<html.indexOf('"app.js"'));
 const Jobs=require('../server/export-jobs');
 const jobs=Jobs.createExportJobs({editors:()=>0,broadcast:()=>{},url:()=>''});
 a.throws(()=>jobs.request({kind:'lyrics',where:'auto',lyrics:{}}),/needs one/);
 a.throws(()=>jobs.request({kind:'lyrics',where:'headless',lyrics:{}}),/someone has to answer/);
 const open=Jobs.createExportJobs({editors:()=>1,broadcast:()=>{},url:()=>''});
 const j=open.request({kind:'lyrics',where:'tab',lyrics:{id:'ly_x'}});
 a.equal(j.via,'tab');a.deepEqual(open.ticket(j.id).lyrics,{id:'ly_x'});
 open.cancel?.(j.id);
});
/* Deja, 2026-11-07, merging main (#120): the lyrics card stays its own box (a step from MCP has no reply for #120's card to
   sit under, it asks in every mode, and its buttons and grey lines are JJ's), but never under the old approval box's class. */
test('the lyrics card is its own lt-card, never the old approval box, and keeps JJ\'s buttons',()=>{
 const app=read('app.js'),css=read('style.css');
 for(const f of ['app.js','index.html','docs/demo/app.js','docs/demo/index.html']){
  const s=read(f);
  a.ok(!/class(Name)?\s*=\s*(["'])agent-approval\2/.test(s),f+': the old box (class "agent-approval") is gone');
 }
 const card=app.slice(app.indexOf('function lyricsCard('),app.indexOf('async function runLyricsJob('));
 a.ok(card.length>0&&!card.includes('agent-approval'),'the lyrics card uses nothing of the old approval box');
 a.match(card,/dialog\.className = "lt-card"/);a.match(card,/showModal\(\)/);
 a.match(card,/data-lt-choice="place">\$\{say\("lt-place"\)\}/);a.match(card,/data-lt-choice="not-now">\$\{say\("lt-not-now"\)\}/);
 a.equal(View.t('zh-CN','own.lt-place'),'放到时间线上');a.equal(View.t('zh-CN','own.lt-not-now'),'先不用');
 a.match(css,/dialog\.lt-card \{/);a.ok(!/^\.agent-approval[ ,{.]/m.test(css),'the old box\'s rules stay deleted');
});

test('the grey (unmatched) lyric lines are not faded further: no opacity on .lt-grey (VV on #164: 2.76 with it, 5.57 without)', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'style.css'), 'utf8');
  const rule = /\.lt-lines \.lt-grey\s*\{([^}]*)\}/.exec(css);
  require('node:assert/strict').ok(rule, '.lt-lines .lt-grey rule exists');
  require('node:assert/strict').doesNotMatch(rule[1], /opacity/);
  require('node:assert/strict').match(rule[1], /color:\s*var\(--dim\)/);
});
