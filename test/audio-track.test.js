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
 args.push('-c:v','mpeg4','-c:a','flac');   // mpeg4: the bundled LGPL ffmpeg has no libx264
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
test('REST: with track 1 picked in the project, loudness and songs read track 1 without being told; the audio window (the exported sound) stays on track 0 unless a track is named',{skip},async(t)=>{
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
 // the exported sound: track 0 (the game, on at 30 s); the microphone only when it is named (试听)
 const level=async(q)=>{const b=Buffer.from(await (await fetch(base+'/api/audio-window?src=/media/r.mkv&'+q)).arrayBuffer()),h=AW.wavChunks(b);
  let s=0;const n=h.data.size/4;for(let i=0;i<n;i++){const v=b.readFloatLE(h.data.offset+i*4);s+=v*v;}return 10*Math.log10(s/n+1e-12);};
 a.ok(await level('from=30&to=31')>-40,'audio window at 30 s: track 0, the game, whatever the project picks');
 a.ok(await level('from=30&to=31&track=1')<-60,'track=1 named: the microphone, quiet at 30 s');
 a.ok(await level('from=90&to=91&track=1')>-40,'and on at 90 s');
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
test('the editor: the media info lists the tracks with 试听, picking one is an undo step, analysis follows it and the exported sound does not',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 a.match(app,/if \(Array\.isArray\(m\.audioTracks\) && m\.audioTracks\.length > 1\) pop\.appendChild\(audioTrackPicker\(m\)\);/);
 const set=app.slice(app.indexOf('function setAudioTrack('),app.indexOf('function setAudioTrack(')+1400);
 a.match(set,/pushUndo\(/);a.match(set,/delete project\.songs\[m\.id\]/);a.match(set,/flushSave\(\)/);
 a.match(set,/redoTrackAnalysis\(m, track, hadSongs\)/,'songs, loudness and captions are redone without a click');
 a.doesNotMatch(set,/m\.channels =|wavePeaks/,'the stems and the waveform keep the exported sound');
 a.match(app,/&to=\$\{to\}&track=0`\)/,'the export mix asks for track 0: the exported sound never follows the pick (JJ)');
 a.match(app,/getAudioBuffer\(m, \{ analysis \}\)/,'silences listen to the picked track, auto-duck to the exported one');
 a.match(app,/const buf = await getAudioBuffer\(m, \{ analysis: true \}\);\n    await new Promise/,'beats listen to the picked track');
 a.match(app,/const buf = await getAudioBuffer\(media, \{ analysis: true \}\);/,'highlights listen to the picked track');
 a.match(app,/const have = runtime\.wavePeaks\.get\(m\.id\), src = m\.src;/,'the waveform is the exported sound');
 a.match(app,/if \(MediaLib\.audioTrackOf\(m\)\) mo\.audioTrack = m\.audioTrack;/,'the save keeps the pick (the media list is written field by field)');
 a.match(app,/JSON\.stringify\(\{ src, track: m \? MediaLib\.audioTrackOf\(m\) : 0[ ,]/,'transcription names the track (with main\'s ranges / again after it)');
 a.match(app,/"\/api\/transcript\?src=" \+ encodeURIComponent\(src\) \+ "&track=" \+ track/);
 a.match(app,/uiText\("own\.at-found", \{ name: noticed\[0\]\.name, n: noticed\[0\]\.audioTracks\.length, go: uiText\("own\.at-go"\), menu: uiText\("own\.at-menu"\) \}\)/,'the menu name is the menu item\'s own (「选音轨…」, VV on #177)');
 a.match(app,/uiText\("own\.at-captions-edited", \{ n: track \+ 1, button: uiText\("own\.at-captions-redo"\) \}\)/,'the button name is the button\'s own');
});
test('JJ定稿 wording (2026-11-05), word for word in both languages; menu and button names come from their own keys',()=>{
 const V=require('../ui-preferences'),zh=(k,v)=>V.t('zh-CN','own.'+k,v),en=(k,v)=>V.t('en','own.'+k,v);
 const menuZh=zh('mm-info'),menuEn=en('mm-info'),btnZh=zh('at-captions-redo'),btnEn=en('at-captions-redo');
 a.equal(menuZh,'素材信息…');a.equal(menuEn,'Media info…');
 a.equal(zh('at-title'),'主播的声音在哪条轨');a.equal(en('at-title'),"Which track is the streamer's voice");
 a.equal(zh('at-hint'),'找歌、音量和字幕只听这一条轨，导出的声音不受影响。OBS 录的第 1 轨通常是混好的全部声音；如果你把麦克风单独录成了一条轨，就选那一条。');
 a.equal(en('at-hint'),"Song finding, loudness and subtitles listen to this one track; the exported sound is not affected. In an OBS recording, track 1 is usually all the sound mixed together. If you recorded your mic on its own track, pick that one.");
 a.equal(zh('at-track',{n:2}),'第 2 轨');a.equal(en('at-track',{n:2}),'Track 2');
 a.equal(zh('at-channels',{n:2}),'2 声道');a.equal(en('at-channels',{n:2}),'2 ch');
 a.equal(zh('at-listen'),'试听');a.equal(en('at-listen'),'Listen');
 a.equal(zh('at-listen-failed'),'这条轨放不出来，可能是空的。');a.equal(en('at-listen-failed'),"This track can't be played. It may be empty.");
 a.equal(zh('at-changed',{n:2}),'已改成第 2 轨，正在按这条轨重新找歌、算音量。');a.equal(en('at-changed',{n:2}),'Now using track 2. Finding songs and loudness again for this track.');
 a.equal(btnZh,'按这条轨重做字幕');a.equal(btnEn,'Redo subtitles from this track');
 a.equal(zh('at-captions-edited',{n:2,button:btnZh}),'字幕你改过，所以没有自动重做。要按第 2 轨重做，点〔按这条轨重做字幕〕；原来的字幕会被替换。');
 a.equal(en('at-captions-edited',{n:2,button:btnEn}),"You've edited the subtitles, so they weren't redone automatically. To redo them from track 2, click “Redo subtitles from this track”. The current subtitles will be replaced.");
 // the bar's sentences name 〔去选〕 and 「选音轨…」 from their own keys (JJ定稿, VV's review)
 const go={zh:zh('at-go'),en:en('at-go')},am={zh:zh('at-menu'),en:en('at-menu')};
 a.equal(zh('at-found',{name:'录像',n:3,go:go.zh,menu:am.zh}),'「录像」有 3 条音轨，现在用的是第 1 轨。主播的声音如果在别的轨上，点〔去选〕换一条；以后也可以右键文件 →〔选音轨…〕。');
 a.equal(en('at-found',{name:'rec',n:3,go:go.en,menu:am.en}),"“rec” has 3 audio tracks; track 1 is in use. If the streamer's voice is on another track, click “Choose” to switch. You can also right-click the file → “Choose audio track…” later.");
 a.equal(zh('at-found-n',{n:2,go:go.zh,menu:am.zh}),'有 2 个文件有好几条音轨，现在用的都是第 1 轨。主播的声音如果在别的轨上，点〔去选〕换一条；以后也可以右键文件 →〔选音轨…〕。');
 a.equal(en('at-found-n',{n:2,go:go.en,menu:am.en}),"2 files have several audio tracks; track 1 is in use for all of them. If the streamer's voice is on another track, click “Choose” to switch. You can also right-click the file → “Choose audio track…” later.");
 a.equal(zh('at-badge',{n:3,k:2}),'3 条音轨 · 用第 2 条');a.equal(en('at-badge',{n:3,k:2}),'3 audio tracks · using track 2');
 a.equal(zh('at-badge-busy'),'正在按新轨重算…');a.equal(en('at-badge-busy'),'updating for the new track…');
 a.equal(go.zh,'去选');a.equal(go.en,'Choose');a.equal(zh('at-dismiss'),'关闭');a.equal(en('at-dismiss'),'Close');
 a.equal(am.zh,'选音轨…');a.equal(am.en,'Choose audio track…');
 a.equal(zh('at-stop'),'■ 停止');a.equal(en('at-stop'),'■ Stop');
 a.equal(zh('at-undone',{n:1}),'已改回第 1 轨。');a.equal(en('at-undone',{n:1}),'Back to track 1.');
 a.equal(require('../capabilities').get('fablecut_audio_track').summary['zh-CN'],'分轨录像里，选哪条音轨是主播的声音');
 const src=fs.readFileSync(path.join(__dirname,'..','ui-preferences.js'),'utf8');
 a.ok(!/Media info…”|〔素材信息…〕|Redo subtitles from this track”|〔按这条轨重做字幕〕|〔去选〕|〔选音轨…〕|“Choose”|“Choose audio track…”/.test(src),'menu and button names are never written into these sentences by hand');
});
test('captions say which text they were made with, so an edited one is told apart and never redone without asking',()=>{
 const C=require('../captions');
 const c=C.clip({start:1,end:2,text:'你好 世界',words:[{s:1,e:1.4},{s:1.5,e:2}]},{style:'subtitle',width:1920,height:1080});
 a.equal(c.props.captionMade,'你好 世界');a.ok(Array.isArray(c.props.wordTimes));
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 const at=app.indexOf('function captionsEdited('),body=app.slice(app.indexOf('{',at)+1,app.indexOf('\n}',at));
 const captionsEdited=new Function('list',body);
 a.equal(captionsEdited([c]),false);
 a.equal(captionsEdited([{...c,props:{...c.props,text:'你好 朋友'}}]),true,'text changed');
 const old={...c,props:{...c.props}};delete old.props.captionMade;a.equal(captionsEdited([old]),true,'no stamp (made before #177): counted as edited');
 const srt={...c,props:{...c.props}};delete srt.props.wordTimes;a.equal(captionsEdited([srt]),true,'imported (no word times): counted as edited');
});
test('MCP: silences, beats and highlights listen to the picked track; normalize and auto-duck work on the exported sound (track 0)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','mcp-server.js'),'utf8');
 a.match(src,/function streamClipAudio\(proj, c0, onStart, onChunk, \{ analysis = false \} = \{\}\)/);
 a.match(src,/const track = analysis \? MediaLib\.audioTrackOf\(media\) : 0;/);
 a.match(src,/voiceRegions\(doc, live\.flat\(\), opts\.threshold, S\.MIN_SOUND, heard, \{ analysis: true \}\)/,'silences');
 a.match(src,/streamClipAudio\(doc, clip, \(\) => true, \(chs\) => parts\.push\(Bt\.mono\(chs\)\), \{ analysis: true \}\)/,'beats');
 a.match(src,/streamClipAudio\(doc, s\.clip, \(\) => true, \(chs\) => aud\.push\(Bt\.mono\(chs\)\), \{ analysis: true \}\)/,'highlights');
 a.match(src,/await voiceRegions\(doc, voices, threshold\) : \[\]/,'auto-duck: the exported sound');
 const norm=src.slice(src.indexOf('async function measureClipGroup('),src.indexOf('async function measureClipGroup(')+400);
 a.doesNotMatch(norm,/analysis/,'normalize: the exported sound');
});
/** A three-track MP4 (or MOV) made on the spot: mpeg4 picture, AAC sound; moov at the end (no faststart yet). */
function synthMp4(file,extra=[]){
 const args=['-v','error','-y','-f','lavfi','-i','color=c=gray:s=64x36:r=5:d=4'];
 for(const f of [220,440,880])args.push('-f','lavfi','-i',`sine=frequency=${f}:sample_rate=48000:duration=4`);
 args.push('-map','0:v','-map','1:a','-map','2:a','-map','3:a','-c:v','mpeg4','-c:a','aac',...extra,file);
 const r=spawnSync(ffmpeg(),args);a.equal(r.status,0,String(r.stderr));return file;
}
const audioCount=(file)=>String(spawnSync(FF.path('ffprobe'),['-v','error','-select_streams','a','-show_entries','stream=index','-of','csv=p=0',file]).stdout).trim().split(/\s+/).filter(Boolean).length;
test('importing an MP4 keeps every audio track: upload, and the desktop import (the same upload with a ticket) — main dropped all but one (VV on #177)',{skip},async(t)=>{
 const d=tmp(t),src=synthMp4(path.join(d,'obs.mp4'));a.equal(audioCount(src),3);
 const dir=makeDataDir(t);const {port,base}=await startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1'});
 const http=require('node:http'),body=fs.readFileSync(src);
 for(const q of ['name=obs.mp4','name=obs2.mp4&ticket=t_tracks1']){
  const r=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/upload?'+q,method:'POST',headers:{'Content-Length':body.length}},
   (res)=>{const parts=[];res.on('data',(c)=>parts.push(c));res.on('end',()=>resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))));});req.on('error',reject);req.end(body);});
  const file=path.join(dir,'media',decodeURIComponent(r.src.slice(7)));
  a.equal(audioCount(file),3,q+': three audio tracks after the faststart tidy');
  const info=(await (await fetch(base+'/api/media-info?src='+encodeURIComponent(r.src))).json()).info;
  a.equal(info.audioTracks.length,3,q);
 }
});
test('the faststart tidy leaves out data streams the MP4 muxer cannot write (a MOV timecode track) and keeps the sound',{skip},async(t)=>{
 const d=tmp(t),file=synthMp4(path.join(d,'cam.mov'),['-timecode','01:00:00:00']);
 const kinds=String(spawnSync(FF.path('ffprobe'),['-v','error','-show_entries','stream=codec_type','-of','csv=p=0',file]).stdout);
 a.match(kinds,/data/,'the MOV has a timecode data stream');
 const r=await require('../import-url').maybeFaststart(file);
 a.equal(r.optimized,true,JSON.stringify(r));a.equal(audioCount(file),3);
 const src=fs.readFileSync(path.join(__dirname,'..','import-url.js'),'utf8');
 a.match(src,/"-map", "0", "-map", "-0:d", "-map", "-0:t", "-c", "copy", "-movflags", "\+faststart"/);
});
test('VV on #177: a badge, a notice that stays with 〔去选〕, 「选音轨…」 in the menu, 试听 that stops, the redo by 〔听写所选〕, undo said',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 a.match(app,/uiText\("own\.at-badge", \{ n: m\.audioTracks\.length, k: MediaLib\.audioTrackOf\(m\) \+ 1 \}\)/,'badge: 3 条音轨 · 用第 k 条');
 a.match(app,/busy \? " · " \+ escapeHtml\(uiText\("own\.at-badge-busy"\)\)/,'badge while reading again');
 a.match(app,/bar\.className = "bin-filterbar bin-tracks-bar";/,'the notice is a bar in the bin, not a toast');
 a.doesNotMatch(app,/toast\(uiText\("own\.at-found/,'never a toast (the canvas toast covered it)');
 a.match(app,/if \(Array\.isArray\(m\.audioTracks\) && m\.audioTracks\.length > 1\) item\(uiText\("own\.at-menu"\), \(\) => openTrackPicker\(m, x, y\)\);\n  item\(uiText\("own\.mm-info"\)/,'「选音轨…」 just above 素材信息…');
 a.match(app,/play\.className = "btn tiny bin-track-play";/);
 a.match(app,/btn\.textContent = uiText\("own\.at-stop"\);/);
 a.match(app,/if \(typeof stopTrackListen === "function"\) stopTrackListen\(\);/,'closing the picker (Esc too) stops it');
 a.match(app,/<div class="tr-row tr-capredo" data-tr-capredo role="status" hidden><\/div>/,'by 〔听写所选〕');
 a.match(app,/toast\(uiText\("own\.at-undone", \{ n: MediaLib\.audioTrackOf\(back\) \+ 1 \}\)\)/);
 const V=require('../ui-preferences');
 for(const k of ['at-badge','at-badge-busy','at-go','at-menu','at-stop','at-undone','at-dismiss']){const zh=V.t('zh-CN','own.'+k,{n:3,k:1});a.ok(zh&&!zh.startsWith('own.'),k);a.ok(!/我/.test(zh),k);}
 a.equal(V.t('zh-CN','own.at-badge',{n:3,k:2}),'3 条音轨 · 用第 2 条');
});
test('fablecut_audio_track {listen}: a media id with ../, an absolute path or a backslash never writes outside analysis/listen (QQ on #177)',()=>{
 const dir=path.join(os.tmpdir(),'montclip-listen-x','listen'),root=path.resolve(dir);
 for(const id of ['../../evil','..\\..\\evil','C:\\Windows\\evil','/etc/evil','a/../../b','m_ok-1','..','.\\x',path.resolve('/tmp/abs')]){
  let out=null;try{out=AW.listenPath(dir,id,1,30);}catch(e){a.equal(e.code,'BAD_MEDIA_ID',id);continue;}
  a.equal(path.dirname(out),root,id+' → '+out);
  a.match(path.basename(out),/^[A-Za-z0-9_-]+-track1-30s\.wav$/,id);
 }
 a.equal(path.basename(AW.listenPath(dir,'m_ok-1',0,0)),'m_ok-1-track0-0s.wav');
 a.throws(()=>AW.listenPath(dir,'../..',0,0),/can't name a file/);
 a.throws(()=>AW.listenPath(dir,'m_a',-1,0));
 const src=fs.readFileSync(path.join(__dirname,'..','mcp-server.js'),'utf8');
 a.match(src,/require\("\.\/audio-window"\)\.listenPath\(path\.join\(ANALYSIS_DIR, "listen"\), m\.id, i, at\)/,'the tool uses it');
 a.doesNotMatch(src,/`\$\{m\.id\}-track/,'no path built from the raw id');
 // the editor's 试听 goes through /api/audio-window, which writes to a fresh temp folder with a fixed name
 a.match(fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8'),/fs\.mkdtempSync\(path\.join\(os\.tmpdir\(\), "montclip-aw-"\)\), out = path\.join\(tmpDir, "window\.wav"\)/);
});
test('MCP fablecut_audio_track {listen} with a hostile media id writes inside analysis/listen only',{skip},async(t)=>{
 const id='..\\..\\..\\pwn';
 const proj=seedProject({media:[{id,name:'r.mkv',kind:'video',src:'/media/r.mkv',duration:LEN}],clips:[]});
 const dir=makeDataDir(t,proj);fs.mkdirSync(path.join(dir,'media'),{recursive:true});synth(path.join(dir,'media','r.mkv'));
 const mcp=startMcp(t,dir,{FABLECUT_NO_AUTOSTART:'1'});
 await mcp.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'t',version:'1'}});
 const h=await mcp.callTool('fablecut_audio_track',{mediaId:id,listen:90});
 a.equal(h.isError,false,h.text);
 const files=[...h.text.matchAll(/\d: (\S+\.wav)/g)].map(m=>m[1]);a.equal(files.length,3);
 const listen=fs.realpathSync(path.join(dir,'analysis','listen'));
 for(const f of files){a.ok(fs.existsSync(f));a.equal(path.dirname(fs.realpathSync(f)),listen,f);}
 a.ok(!fs.existsSync(path.join(dir,'..','pwn-track0-90s.wav'))&&!fs.readdirSync(dir).some(f=>/pwn/.test(f)));
});
test('merged with #165 (listening to parts only): every read of the transcript names the picked track, whole or in windows; readArgs alone stays as #149 left it',()=>{
 const {readArgs}=require('../asr-local');
 for(const r of [readArgs({file:'f',track:1}),readArgs({file:'f',from:0.4,to:2.7,track:1}),readArgs({file:'f',from:5,to:9.5,track:2})]){
  const i=r.args.indexOf('-map');a.ok(i>r.args.indexOf('-i'),'-map after -i');a.match(r.args[i+1],/^0:a:[12]$/);
  a.deepEqual(r.args.slice(-9),['-ac','1','-ar','16000','-f','s16le','-acodec','pcm_s16le','-']);}
 a.equal(readArgs({file:'f',from:5,to:9.5,track:2}).args[readArgs({file:'f',from:5,to:9.5,track:2}).args.indexOf('-map')+1],'0:a:2');
 a.ok(!readArgs({file:'f'}).args.includes('-map'),'no track named: no -map (callers other than transcribe)');
 const src=fs.readFileSync(path.join(__dirname,'..','asr-local.js'),'utf8');
 a.match(src,/track = 0 \} = \{\}\) \{/,'transcribe defaults to track 0, never ffmpeg\'s pick');
 a.match(src,/listen\(S, r, p, file, part, \{ signal, track,/,'each part is read from the picked track');
 a.match(src,/readArgs\(\{ file, from: part \? part\[0\] : null, to: part \? part\[1\] : null, track \}\)/);
 const srv=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 a.match(srv,/transcripts\.get\(src, track\) \|\| null : null/,'the refill plan reads this track\'s transcript');
 a.match(srv,/ranges: plan \? plan\.read : null, track,/);
 a.match(srv,/TR\.mergeDocs\(transcripts\.get\(src, track\) \|\| null, add\) : add, track\)/,'and saves into it');
});
