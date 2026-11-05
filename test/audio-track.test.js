'use strict';
// 分轨录像 (#177, Deja 2026-11-05, from JJ's reading of the code): OBS can record the microphone, the game and the music
// each on its own audio track. Songs, loudness and the export window read only the first track (-map 0:a:0) and the
// transcript let ffmpeg pick (the default-flagged track, else the one with the most channels), so they could read
// different tracks (docs/validation/2026-11-05-audio-tracks). Now every reader takes the one track the media entry
// picks (audioTrack, 0 by default), and every cache is kept per track.
// Sound made on the spot with ffmpeg: track 0 「游戏声」 220 Hz all the time, track 1 「麦克风」 440 Hz from 60 to 180 s
// only, track 2 BGM 880 Hz, quiet. No recording, no voice.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {makeDataDir,seedProject,startServer,startMcp,readProject}=require('./helpers');
const {manifest}=require('../asr-models');
const FF=require('../ffmpeg-path'),MediaLib=require('../media-lib'),AW=require('../audio-window');
const skip=!FF.resolveTool('ffmpeg').ok&&"MontClip's ffmpeg is not in vendor/ (node desktop/fetch-ffmpeg.cjs)";
const ffmpeg=()=>FF.path('ffmpeg');
const LEN=240,SING=[60,180];
const tmp=(t)=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-atrack-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
/** A video with three audio tracks (or one, the microphone alone), written to `file`. */
function synth(file,{tracks=3}={}){
 const mic=`sine=frequency=440:sample_rate=16000:duration=${LEN},volume=enable='lt(t,${SING[0]})+gte(t,${SING[1]})':volume=0`;
 const ins=tracks===1?[mic]:[`sine=frequency=220:sample_rate=16000:duration=${LEN}`,mic,`sine=frequency=880:sample_rate=16000:duration=${LEN},volume=0.1`];
 const args=['-v','error','-y','-f','lavfi','-i',`color=c=gray:s=64x36:r=5:d=${LEN}`];
 for(const s of ins)args.push('-f','lavfi','-i',s);
 args.push('-map','0:v');ins.forEach((_,i)=>args.push('-map',`${i+1}:a`));
 args.push('-c:v','libx264','-preset','ultrafast','-c:a','flac');
 if(tracks>1)['Game','Mic','BGM'].forEach((n,i)=>args.push(`-metadata:s:a:${i}`,'title='+n));
 const r=spawnSync(ffmpeg(),[...args,file]);a.equal(r.status,0,String(r.stderr));
 return file;
}
/** Per 0.5 s: dB, and zero crossings (a tone of f Hz crosses f times in 0.5 s). */
function stats(x,rate){const per=rate/2,db=[],hz=[];for(let i=0;i+per<=x.length;i+=per){let s=0,z=0;for(let k=i;k<i+per;k++){s+=x[k]*x[k];if(k>i&&(x[k-1]<0)!==(x[k]<0))z++;}db.push(10*Math.log10(s/per+1e-12));hz.push(z);}return{db,hz};}
const at=(arr,t)=>arr[Math.floor(t/0.5)];
const isMic=(db)=>at(db,30)<-60&&at(db,100)>-40&&at(db,200)<-60;

test('ffprobe output → audioTracks only for two or more streams: channels, the name OBS wrote, the default flag',()=>{
 const st=(i,ch,tags,def)=>({index:i,codec_type:'audio',codec_name:'aac',channels:ch,sample_rate:'48000',tags,disposition:{default:def?1:0}});
 const three=MediaLib.parseProbe({format:{duration:'20'},streams:[{codec_type:'video',codec_name:'h264',width:320,height:180,avg_frame_rate:'30/1'},
  st(1,6,{title:'Game'},true),st(2,1,{handler_name:'Mic'}),st(3,2,{handler_name:'SoundHandler'})]});
 a.deepEqual(three.audioTracks,[{channels:6,title:'Game',default:true},{channels:1,title:'Mic'},{channels:2}]);
 a.equal(three.audioChannels,6,'audioChannels still says the first stream');
 const one=MediaLib.parseProbe({format:{duration:'20'},streams:[st(0,2,{},true)]});
 a.equal(one.audioTracks,undefined,'one stream: nothing to choose, nothing stored');
 a.ok(MediaLib.INFO_KEYS.includes('audioTracks'));
 a.ok(MediaLib.sameInfo([{channels:2}],[{channels:2}])&&!MediaLib.sameInfo([{channels:2}],[{channels:1}]),'a list compares by content (no endless rewrite)');
});
test('audioTrackOf: the picked track when the file has it, else 0 (a relinked file with fewer tracks reads its first)',()=>{
 const T=[{channels:2},{channels:2},{channels:2}];
 a.equal(MediaLib.audioTrackOf({audioTracks:T,audioTrack:1}),1);
 a.equal(MediaLib.audioTrackOf({audioTracks:T}),0);
 a.equal(MediaLib.audioTrackOf({audioTracks:T,audioTrack:3}),0);
 a.equal(MediaLib.audioTrackOf({audioTrack:1}),0,'no tracks known');
 a.equal(MediaLib.audioTrackOf({audioTracks:T,audioTrack:'1'}),0);
 a.equal(MediaLib.audioTrackOf(null),0);
});
test('track 1 picked: songs find 60–180 s, and loudness, the export window and the transcript all read track 1',{skip},async(t)=>{
 const d=tmp(t),file=synth(path.join(d,'分轨 录像.mkv'));
 // songs: track 1 is the microphone singing 60–180 s; track 0 is the game, one tone the whole time
 const scan=require('../song-scan').createSongScan({dir:path.join(d,'songs')}),Songs=require('../songs');
 const s1=Songs.find((await scan.scan(file,{track:1})).rows.map(x=>x[0]),{complete:true});
 a.equal(s1.length,1,JSON.stringify(s1));a.ok(Math.abs(s1[0].from-SING[0])<=2&&Math.abs(s1[0].to-SING[1])<=2,JSON.stringify(s1));
 const s0=Songs.find((await scan.scan(file)).rows.map(x=>x[0]),{complete:true});
 a.ok(!(s0.length===1&&Math.abs(s0[0].from-SING[0])<=2),'track 0 is not the microphone: '+JSON.stringify(s0));
 // loudness
 const sig=require('../signals').createSignals({dir:path.join(d,'signals')});
 a.ok(isMic((await sig.loudness(file,{track:1})).values),'loudness of track 1');
 a.ok(!isMic((await sig.loudness(file)).values),'track 0 by default, as before');
 // the export window
 const wav=path.join(d,'w.wav');a.equal(spawnSync(ffmpeg(),AW.windowArgs(file,0,LEN,wav,1)).status,0);
 const buf=fs.readFileSync(wav),h=AW.wavChunks(buf),n=h.data.size/4/h.fmt.channels,x=new Float32Array(n);
 for(let i=0;i<n;i++)x[i]=buf.readFloatLE(h.data.offset+i*h.fmt.channels*4);
 const w=stats(x,48000);a.ok(isMic(w.db),'export window: track 1');a.ok(Math.abs(at(w.hz,100)-440)<=6,'440 Hz: '+at(w.hz,100)+' crossings / 0.5 s');
 // the transcript's decode
 const g=await asrSamples(d,file,{track:1});a.ok(isMic(g.db),'transcript decode: track 1');a.ok(Math.abs(at(g.hz,100)-440)<=6,'440 Hz');
});
/** The samples the transcript's decode hands the engine (a stand-in engine; ffmpeg is real). */
async function asrSamples(d,file,opts){
 const got=[];
 class Vad{acceptWaveform(f){for(const v of f)got.push(v);}flush(){}isEmpty(){return true;}front(){}pop(){}}
 const dir=fs.mkdtempSync(path.join(d,'asr-')),pkg=path.join(dir,'engine','node_modules','sherpa-onnx-node');fs.mkdirSync(pkg,{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),'{}');
 const vad=path.join(dir,manifest.engine.vad.file);fs.mkdirSync(path.dirname(vad),{recursive:true});fs.writeFileSync(vad,'');fs.truncateSync(vad,manifest.engine.vad.size);
 fs.mkdirSync(path.join(dir,'model'));
 const store={dir:(k)=>(k==='asr'?path.join(dir,'model'):null),status:()=>({asr:{ready:true,missing:[],bad:[]},punct:{ready:false,missing:[],bad:[]}})};
 const asr=require('../asr-local').createAsr({asrDir:dir,store,ffmpeg:ffmpeg(),sherpa:{Vad,OfflineRecognizer:{createAsync:async()=>({})},OfflinePunctuation:class{}}});
 await asr.transcribe(file,opts).catch(()=>{});   // no words from a stand-in: only the samples matter
 return stats(Float32Array.from(got),16000);
}
test('the transcript no longer lets ffmpeg pick: with the default flag on track 1 it still reads track 0, like every other reader',{skip},async(t)=>{
 const d=tmp(t),src=synth(path.join(d,'a.mkv')),file=path.join(d,'b.mkv');
 a.equal(spawnSync(ffmpeg(),['-v','error','-y','-i',src,'-map','0','-c','copy','-disposition:a:0','0','-disposition:a:1','default',file]).status,0);
 const g0=await asrSamples(d,file,{});
 a.ok(!isMic(g0.db)&&Math.abs(at(g0.hz,100)-220)<=6,'track 0 (220 Hz), not the default-flagged track 1: '+at(g0.hz,100));
 const g1=await asrSamples(d,file,{track:1});a.ok(isMic(g1.db),'track 1 when it is picked');
});
test('caches are per track: track 0 keeps its old key (nothing read before is lost); track 1 is read on its own',{skip},async(t)=>{
 const d=tmp(t),file=synth(path.join(d,'c.mkv'));
 const S=require('../song-scan').createSongScan({dir:path.join(d,'songs')});
 const st=fs.statSync(file),old=crypto.createHash('sha256').update(path.basename(file)+'\0'+st.size+'\0'+Math.round(st.mtimeMs)).digest('hex').slice(0,32);
 a.equal(S.keyOf(file),old,'track 0: the key it always had');a.equal(S.keyOf(file,0),old);a.notEqual(S.keyOf(file,1),old);
 await S.scan(file);
 a.equal(S.cached(file).complete,true);a.deepEqual(S.cached(file,1),{done:0,complete:false,scanned:0},'track 1 not read yet');
 const seen=[];await S.scan(file,{track:1,onSegment:(i)=>seen.push(i)});a.deepEqual(seen,[0],'track 1 read from the start');
 const sig=require('../signals').createSignals({dir:path.join(d,'sig')});
 await sig.loudness(file);await sig.loudness(file,{track:1});
 a.equal(fs.readdirSync(path.join(d,'sig')).filter(f=>f.endsWith('.loudness.json')).length,2,'one loudness file per track');
});
test('transcripts are kept per track: another track has none until it is transcribed; going back finds the first one',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-atr-'));try{
 const media=path.join(d,'rec.mkv');fs.writeFileSync(media,'x');
 const T=require('../transcripts').createTranscripts({dir:path.join(d,'tr'),resolveSrc:(s)=>s==='/media/rec.mkv'?media:null});
 const doc=(w)=>({model:'base',language:'zh',duration:10,created:'2026-11-05T00:00:00Z',words:[[w,1,2]]});
 T.put('/media/rec.mkv',doc('游戏'));
 a.equal(T.get('/media/rec.mkv',1),false,'track 1: none yet');
 T.put('/media/rec.mkv',doc('你好'),1);
 a.equal(T.get('/media/rec.mkv',1).words[0][0],'你好');
 a.equal(T.get('/media/rec.mkv').words[0][0],'游戏','track 0 kept');
 a.equal(T.remove('/media/rec.mkv',1),true);a.equal(T.get('/media/rec.mkv',1),false);a.equal(T.get('/media/rec.mkv').words[0][0],'游戏');
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('setAudioTrack: one track at a time, only tracks the file has, and the songs found from the old track are dropped',()=>{
 const Ops=require('../project-ops');
 const doc=seedProject({media:[{id:'m_r',name:'r.mkv',kind:'video',src:'/media/r.mkv',duration:240,audioChannels:2,audioTracks:[{channels:2},{channels:1,title:'Mic'}]},
  {id:'m_one',name:'one.mp4',kind:'video',src:'/media/one.mp4',duration:10,audioChannels:2}]});
 Ops.applyPatch(doc,[{op:'setSongs',mediaId:'m_r',songs:{key:'k',complete:true,scanned:240,songs:[{from:0,to:240,confidence:'estimated',marks:[]}]}}]);
 Ops.applyPatch(doc,[{op:'setAudioTrack',id:'m_r',track:1}]);
 a.equal(doc.media[0].audioTrack,1);a.equal(doc.songs,undefined,'songs of track 0 dropped');
 Ops.applyPatch(doc,[{op:'setAudioTrack',id:'m_r',track:0}]);a.equal('audioTrack' in doc.media[0],false,'0 is the default: not stored');
 a.throws(()=>Ops.applyPatch(doc,[{op:'setAudioTrack',id:'m_r',track:2}]),/0…1/);
 a.throws(()=>Ops.applyPatch(doc,[{op:'setAudioTrack',id:'m_one',track:1}]),/one audio stream/);
 a.throws(()=>Ops.applyPatch(doc,[{op:'setAudioTrack',id:'m_r',track:'1'}]),/setAudioTrack/);
 a.match(Ops.compactView({...doc,media:[{...doc.media[0],audioTrack:1}]}),/audioTrack:1 of \[0:2ch, 1:1ch "Mic"\]/);
 a.doesNotMatch(Ops.compactView(doc),/audioTrack:.* m_one|one\.mp4.*audioTrack/,'one track: nothing shown');
});
test('REST: with track 1 picked in the project, loudness, songs and the audio window read track 1 without being told; an explicit track wins',{skip},async(t)=>{
 const proj=seedProject({media:[{id:'m_r',name:'r.mkv',kind:'video',src:'/media/r.mkv',duration:LEN,audioChannels:1,audioTrack:1,
  audioTracks:[{channels:1,title:'Game'},{channels:1,title:'Mic'},{channels:1,title:'BGM'}]}]});
 const dir=makeDataDir(t,proj);fs.mkdirSync(path.join(dir,'media'),{recursive:true});synth(path.join(dir,'media','r.mkv'));
 const {base}=await startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1'});
 const L=await (await fetch(base+'/api/signals/loudness?src=/media/r.mkv')).json();a.equal(L.track,1);a.ok(isMic(L.values),'loudness: the project\'s track');
 const L0=await (await fetch(base+'/api/signals/loudness?src=/media/r.mkv&track=0')).json();a.equal(L0.track,0);a.ok(!isMic(L0.values));
 a.equal((await fetch(base+'/api/signals/loudness?src=/media/r.mkv&track=x')).status,400);
 a.equal((await fetch(base+'/api/songs',{method:'POST',body:JSON.stringify({src:'/media/r.mkv'})})).status,202);
 let r;for(let i=0;i<300;i++){r=await (await fetch(base+'/api/songs?src=/media/r.mkv')).json();if(r.state==='done'||r.state==='failed')break;await new Promise(z=>setTimeout(z,100));}
 a.equal(r.state,'done',JSON.stringify(r).slice(0,300));a.equal(r.track,1);
 a.equal(r.songs.length,1);a.ok(Math.abs(r.songs[0].from-SING[0])<=2&&Math.abs(r.songs[0].to-SING[1])<=2,JSON.stringify(r.songs));
 const w=await fetch(base+'/api/audio-window?src=/media/r.mkv&from=90&to=91');a.equal(w.status,200);
 const buf=Buffer.from(await w.arrayBuffer()),h=AW.wavChunks(buf);let s=0;const n=h.data.size/4;for(let i=0;i<n;i++){const v=buf.readFloatLE(h.data.offset+i*4);s+=v*v;}
 a.ok(10*Math.log10(s/n)>-40,'audio window at 90 s: the microphone is on');
 const w0=Buffer.from(await (await fetch(base+'/api/audio-window?src=/media/r.mkv&from=30&to=31')).arrayBuffer()),h0=AW.wavChunks(w0);
 let s0=0;for(let i=0;i<h0.data.size/4;i++){const v=w0.readFloatLE(h0.data.offset+i*4);s0+=v*v;}
 a.ok(10*Math.log10(s0/(h0.data.size/4)+1e-12)<-60,'at 30 s the microphone is quiet (track 0, the game, would not be)');
});
test('MCP fablecut_audio_track: lists the tracks, cuts a few seconds of each to listen to, picks one in one revision',{skip},async(t)=>{
 const proj=seedProject({media:[{id:'m_r',name:'r.mkv',kind:'video',src:'/media/r.mkv',duration:LEN}],clips:[]});
 const dir=makeDataDir(t,proj);fs.mkdirSync(path.join(dir,'media'),{recursive:true});synth(path.join(dir,'media','r.mkv'));
 const mcp=startMcp(t,dir,{FABLECUT_NO_AUTOSTART:'1'});
 await mcp.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'t',version:'1'}});
 const l=await mcp.callTool('fablecut_audio_track',{mediaId:'m_r'});
 a.equal(l.isError,false,l.text);a.match(l.text,/3 audio tracks/);a.match(l.text,/1: 1 ch "Mic"/);a.match(l.text,/0: 1 ch "Game".*← read now/);
 const h=await mcp.callTool('fablecut_audio_track',{mediaId:'m_r',listen:90});
 a.equal(h.isError,false,h.text);const files=[...h.text.matchAll(/\d: (\S+\.wav)/g)].map(m=>m[1]);a.equal(files.length,3);a.ok(files.every(f=>fs.existsSync(f)));
 const set=await mcp.callTool('fablecut_audio_track',{mediaId:'m_r',track:1});
 a.equal(set.isError,false,set.text);
 const doc=readProject(dir);a.equal(doc.media[0].audioTrack,1);a.equal(doc.media[0].audioTracks.length,3);a.equal(doc.revision,2);
 const bad=await mcp.callTool('fablecut_audio_track',{mediaId:'m_r',track:5});a.equal(bad.isError,true);
 const Cap=require('../capabilities');a.equal(Cap.riskOf('fablecut_audio_track'),'undoable');
});
test('one audio track: nothing to choose, and every reader reads it as before',{skip},async(t)=>{
 const d=tmp(t),file=synth(path.join(d,'one.mp4'),{tracks:1});
 const info=await require('../media-probe').probeFile(file);a.equal(info.audioTracks,undefined);a.equal(info.audioChannels,1);
 const sig=require('../signals').createSignals({dir:path.join(d,'sig')});a.ok(isMic((await sig.loudness(file)).values));
 const Songs=require('../songs'),scan=require('../song-scan').createSongScan({dir:path.join(d,'songs')});
 const s=Songs.find((await scan.scan(file)).rows.map(x=>x[0]),{complete:true});a.equal(s.length,1);a.ok(Math.abs(s[0].from-SING[0])<=2);
});
test('the editor: the media info lists the tracks with 试听, picking one is an undo step, and every decode and fetch follows it',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 a.match(app,/if \(Array\.isArray\(m\.audioTracks\) && m\.audioTracks\.length > 1\) pop\.appendChild\(audioTrackPicker\(m\)\);/);
 const set=app.slice(app.indexOf('function setAudioTrack('),app.indexOf('function setAudioTrack(')+1400);
 a.match(set,/pushUndo\(/);a.match(set,/delete project\.songs\[m\.id\]/);a.match(set,/flushSave\(\)/);
 a.match(app,/&track=\$\{track\}`\)/,'the export window names the track');
 a.match(app,/JSON\.stringify\(\{ src, track: m \? MediaLib\.audioTrackOf\(m\) : 0 \}\)/,'transcription names the track');
 a.match(app,/"\/api\/transcript\?src=" \+ encodeURIComponent\(src\) \+ "&track=" \+ track/);
 const V=require('../ui-preferences');
 for(const k of ['at-title','at-hint','at-track','at-listen','at-listen-failed','at-changed','at-found','at-found-n','media-info']){
  const zh=V.t('zh-CN','own.'+k,{n:2,name:'录像'});a.ok(zh&&!zh.startsWith('own.'),k);a.ok(!/我/.test(zh),k+': no 我 on fixed text');
 }
 a.equal(V.t('zh-CN','own.at-title'),'主播的声音在哪条轨');
});
