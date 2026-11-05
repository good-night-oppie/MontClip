'use strict';
// JJ via Deja (2026-11-05): 「把她开口唱之前的安静部分剪掉」 — the assistant can't hear, so the facts carry two measures of the
// sound, numbers only: the parts that may be singing (the 「✨ 自动出切片」 「唱歌」 scan, songs.js) and a 0–100 loudness a
// second (signals.js). Capped in capabilities.js; over a cap the send is refused, never cut down. The review box says
// what goes, in JJ's words. Synthetic sound made by ffmpeg here: 3 s of silence, then 5 s of a sine.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const Facts=require('../agent-facts'),Cap=require('../capabilities'),F=require('../agent-format'),View=require('../ui-preferences');
const FF=require('../ffmpeg-path');

const SECRETS=['我的直播 11月5日.mp4','/media/私密/唱歌.mp4','C:\\Users\\主播\\Videos\\a.flv','天空好想下雨'];
const doc=(clips)=>({media:[{id:'m1',name:SECRETS[0],src:SECRETS[1],kind:'video',duration:600,originalSrc:SECRETS[2]}],
 clips:clips||[{id:'c_v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:10,duration:300,name:SECRETS[3],props:{volume:0}}]});
// what the server has for the file: every 0.5 s a dBFS level; songs as /api/songs gives them (with marks and confidence)
const sound=(values,songs)=>({m1:{loudness:{step:0.5,values,src:SECRETS[1],name:SECRETS[0]},songs}});
const KEYS=new Set(['clips','highlights','singing','loudness','clipId','kind','mediaDuration','from','to','start','score','step','values']);

test('singing and loudness are numbers and short clip ids only: no file name, path, sound data or song marks',()=>{
 const values=Array.from({length:1200},(_,i)=>i<200?-90:-20);
 const f=Facts.build(doc(),{sound:sound(values,[{from:100,to:250,confidence:'estimated',marks:[{at:'start',t:100,why:'limit'}],name:SECRETS[3]}])});
 const json=JSON.stringify(f);
 for(const s of SECRETS)a.ok(!json.includes(s),'leaked: '+s);
 a.ok(!/\/media\/|[\\/]|\.(mp4|flv|wav)\b|"src"|"name"|"marks"|"confidence"|"why"|"text"/i.test(json),json);
 const walk=(v,key)=>{
  if(Array.isArray(v))return v.forEach(x=>walk(x,key));
  if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){a.ok(KEYS.has(k),'key '+k);walk(x,k);}return;}
  if(key==='clipId')return a.match(v,Facts.SHORT_ID);
  if(key==='kind')return a.ok(v==='video'||v==='audio');
  a.ok(typeof v==='number'&&Number.isFinite(v),key+' '+JSON.stringify(v));
 };
 walk(f,'');
 // the song lies inside the part the clip shows (source 10–310): 100–250, as it is
 a.deepEqual(f.singing,[{clipId:'c_v1',from:100,to:250}]);
 a.equal(f.loudness.length,1);a.equal(f.loudness[0].step,1);a.equal(f.loudness[0].from,10);
 a.equal(f.loudness[0].values.length,300,'one a second over the part shown');
 a.ok(f.loudness[0].values.every(v=>Number.isInteger(v)&&v>=0&&v<=100));
 a.deepEqual(f.loudness[0].values.slice(88,92),[0,0,67,67],'quiet until 100 s of the file, then −20 dBFS');
});

test('nothing known about the sound: no singing, no loudness; a song outside the clip is not sent',()=>{
 a.deepEqual(Object.keys(Facts.build(doc())),['clips']);
 a.deepEqual(Object.keys(Facts.build(doc(),{sound:{m1:{loudness:null,songs:null}}})),['clips']);
 const f=Facts.build(doc(),{sound:{m1:{loudness:null,songs:[{from:400,to:500}]}}});
 a.equal(f.singing,undefined);
});

test('the caps live in capabilities.js; long clips get fewer values, each covering more seconds, never cut short',()=>{
 a.deepEqual({...Cap.FACTS},{singingParts:100,loudnessValues:2400,loudnessSeconds:28800});
 a.ok(Object.isFrozen(Cap.FACTS));
 // three clips of 1 h of a 3 h file: 10800 s → 5 s a value (4.5 rounds up), the whole of each clip covered
 const long={media:[{id:'m1',src:'/media/a.mp4',kind:'video',duration:10800}],clips:[0,1,2].map(i=>({id:'c'+i,kind:'video',mediaId:'m1',track:'V1',start:i*3600,in:i*3600,duration:3600,props:{}}))};
 const f=Facts.build(long,{sound:{m1:{loudness:{step:0.5,values:new Array(21600).fill(-30)},songs:null}}});
 const total=f.loudness.reduce((n,e)=>n+e.values.length,0);
 a.ok(total<=Cap.FACTS.loudnessValues,'total '+total);
 a.ok(f.loudness.every(e=>e.step===5&&e.values.length*e.step>=3600),'every clip covered to its end');
 a.ok(f.loudness.every(e=>e.values.every(v=>v===50)));
 a.ok(JSON.stringify(f).length<16000,'fits a message (16000 characters)');
 // two hours at one a second would be 7200 values: over the cap, so 3 s a value
 const two={media:[{id:'m1',src:'/media/a.mp4',kind:'video',duration:7200}],clips:[{id:'c0',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:7200,props:{}}]};
 const g=Facts.build(two,{sound:{m1:{loudness:{step:0.5,values:new Array(14400).fill(-90)},songs:null}}});
 a.equal(g.loudness[0].step,3);a.equal(g.loudness[0].values.length,2400);
});

test('over a cap the facts are refused (FACTS_LIMIT), not cut down',()=>{
 const songs=Array.from({length:Cap.FACTS.singingParts+1},(_,i)=>({from:10+i*2,to:11+i*2}));
 a.throws(()=>Facts.build(doc(),{sound:{m1:{loudness:null,songs}}}),/FACTS_LIMIT/);
 a.equal(Facts.build(doc(),{sound:{m1:{loudness:null,songs:songs.slice(1)}}}).singing.length,Cap.FACTS.singingParts,'at the cap: sent');
 a.throws(()=>Facts.check({clips:[],loudness:[{clipId:'c',from:0,step:1,values:new Array(2401).fill(0)}]}),/FACTS_LIMIT/);
 a.doesNotThrow(()=>Facts.check({clips:[],loudness:[{clipId:'c',from:0,step:1,values:new Array(2400).fill(0)}]}));
 // the review box: a refusal says so, and nothing is sent (JJ定稿, 2026-11-05, word for word)
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/catch\(error\)\{setNotice\(\(error as Error\)\.message==='FACTS_LIMIT'\?'factsLimit':'scope'\);\}/);
 a.equal(View.text['zh-CN'].officialPane_factsLimit,'要附上的数字太多，超过了能发的上限，这次没有发送。你写的话还在，选短一点的范围再发就行。');
 a.equal(View.text.en.officialPane_factsLimit,'There are too many numbers to attach, more than can be sent, so nothing was sent. What you wrote is still here. Select a shorter range and send again.');
});

// JJ's words, as written (2026-11-05)
test('the review box: the line about the sound numbers, word for word, outside the fold, only when they are sent',()=>{
 const zh=View.text['zh-CN'],en=View.text.en;
 a.equal(zh.officialPane_factsSound,'还会发送：哪几段可能在唱歌（只有开始和结束的秒数）、每秒的音量大小（一串数字）。不发声音本身。');
 a.equal(en.officialPane_factsSound,'Also sent: which parts may be singing (start and end seconds only) and the loudness for each second (a list of numbers). The sound itself is not sent.');
 const pane=read('agent-ui/pane.tsx'),at=pane.indexOf('<p data-facts-sound>');
 a.ok(at>pane.indexOf('</details>',pane.indexOf('<details data-facts-note>')),'outside the fold');
 a.match(pane,/n=W\.MontClipFacts\?\.soundSummary\(f\);return n\?<><p data-facts-sound>\{t\.factsSound\}<\/p>/);
 a.match(read('cindy-official.js'),/data-facts-sound/,'the bundle was rebuilt');
 // the numbers are fetched before the box is put together, and the page passes them in
 a.match(pane,/await options\.beforeReview\?\.\(\);try\{setReview\(conversation\.prepare\(\)\)/);
 const app=read('app.js');
 a.match(app,/ beforeReview:agentSoundFacts,/);
 a.match(app,/sound:soundFactsOn\(\)&&s&&s\.signature===JSON\.stringify\(MontClipFacts\.soundMedia\(doc\)\)\?s\.sound:null/);
 const fn=app.slice(app.indexOf('async function agentSoundFacts'),app.indexOf("const mcAgentPanel="));
 a.ok(!/method/.test(fn),'only reads: never starts a song scan');
 a.match(fn,/g\.state==="done"/,'only a file read to its end');
});

test('the format note: what singing and loudness are, and the way out the streamer can click, with the real button names',()=>{
 a.match(F.FORMAT_NOTE,/singing \(clipId, from, to/);
 a.match(F.FORMAT_NOTE,/loudness \(clipId, from, step, values/);
 a.match(F.FORMAT_NOTE,/the sound itself is never sent, so you cannot hear it/);
 a.match(F.FORMAT_NOTE,/do not guess and do not ask the user for the seconds/);
 a.ok(!/"from"\s*:\s*\d|"to"\s*:\s*\d/.test(F.FORMAT_NOTE));
 // the names as the interface shows them (ui-preferences.js), in 〔〕 / 「」 in Chinese and “ ” in English
 const T=read('ui-preferences.js'),pair=k=>JSON.parse('['+new RegExp('"'+k+'": \\[("[^"]*"), ("[^"]*")\\]').exec(T).slice(1,3).join(',')+']');
 const [openEn,openZh]=pair('as-open'),[kindEn,kindZh]=pair('as-kind-title'),[singEn,singZh]=pair('as-kind-sing'),[goEn,goZh]=pair('as-go');
 a.deepEqual([openZh,kindZh,singZh,goZh],['✨ 自动出切片','这场主要在干什么？','唱歌','开始找高光']);
 a.ok(F.FORMAT_NOTE.includes(`点〔${openZh}〕，在「${kindZh}」里选「${singZh}」，点〔${goZh}〕`));
 a.ok(F.FORMAT_NOTE.includes(`click “${openEn}”, choose “${singEn}” under “${kindEn}”, click “${goEn}”`));
});

const hasFfmpeg=FF.resolveTool('ffmpeg').ok;
const skip=!hasFfmpeg&&"MontClip's ffmpeg is not in vendor/ (node desktop/fetch-ffmpeg.cjs)";
test('synthetic sound (3 s silence + 5 s sine, made by ffmpeg): the singing part and the loudness numbers line up',{skip},async(t)=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-fs-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const file=path.join(d,'a.wav');
 const r=spawnSync(FF.path('ffmpeg'),['-v','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=mono:d=3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=5',
  '-filter_complex','[0][1]concat=n=2:v=0:a=1','-c:a','pcm_s16le',file],{encoding:'utf8'});
 a.equal(r.status,0,r.stderr);
 // the server's own readers: the loudness every 0.5 s (signals.js) and the song scan's levels (song-scan.js)
 const L=await require('../signals').createSignals({dir:path.join(d,'signals')}).loudness(file);
 const scan=await require('../song-scan').createSongScan({dir:path.join(d,'songs')}).scan(file);
 a.equal(L.values.length,16);
 // songs.js as the 「唱歌」 scan runs it, with its windows shrunk for an 8 s file (its defaults look for songs of 90 s and more)
 const songs=require('../songs').find(scan.rows.map(x=>x[0]),{complete:true,W:2,MIN_SONG:3,EDGE:1,MERGE:1});
 a.deepEqual(songs.map(s=>[s.from,s.to]),[[3,8]]);
 const media={id:'m1',src:'/media/a.wav',kind:'audio',duration:8};
 const whole=Facts.build({media:[media],clips:[{id:'c_a',kind:'audio',mediaId:'m1',track:'A1',start:0,in:0,duration:8,props:{}}]},
  {sound:{m1:{loudness:{step:L.step,values:L.values},songs}}});
 a.deepEqual(whole.singing,[{clipId:'c_a',from:3,to:8}]);
 const sine=Facts.level(L.values[8]);
 a.ok(sine>=55&&sine<=75,'the sine (about −21 dBFS) reads '+sine);
 a.deepEqual(whole.loudness,[{clipId:'c_a',from:0,step:1,values:[0,0,0,sine,sine,sine,sine,sine]}]);
 // a clip showing 2–6 s of the file: the singing from 3 s, the loudness from its own start
 const part=Facts.build({media:[media],clips:[{id:'c_b',kind:'audio',mediaId:'m1',track:'A1',start:20,in:2,duration:4,props:{}}]},
  {sound:{m1:{loudness:{step:L.step,values:L.values},songs}}});
 a.deepEqual(part.singing,[{clipId:'c_b',from:3,to:6}]);
 a.deepEqual(part.loudness,[{clipId:'c_b',from:2,step:1,values:[0,sine,sine,sine]}]);
});
