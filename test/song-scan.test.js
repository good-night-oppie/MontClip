'use strict';
// P2 「找出每首歌」 on real sound (Deja, 2026-11-03): ffmpeg's own astats + aspectralstats read the file every 0.5 s, in
// segments; each finished segment is kept (analysis/songs/, per file version), so a stopped scan carries on from where it
// stopped. The songs found go into the project (project.songs, one entry per file), through the MCP tool or the patch op.
// Synthetic sound only (test/songs-synth.js): a held tone is singing, tone bursts with pauses are talk.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {makeDataDir,seedProject,startServer,startMcp,readProject}=require('./helpers');
const {wav}=require('./songs-synth');
const FF=require('../ffmpeg-path');
const hasFfmpeg=()=>FF.resolveTool('ffmpeg').ok;
const skip=!hasFfmpeg()&&"MontClip's ffmpeg is not in vendor/ (node desktop/fetch-ffmpeg.cjs)";
// 8 minutes: two songs between talk; two segments of 300 s
const PLAN=[['talk',60],['song',140],['talk',80],['song',150],['talk',50]],SONGS=[[60,200],[280,430]];
const tmp=(t)=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-songs-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const near=(got,want)=>{a.equal(got.length,want.length,JSON.stringify(got));got.forEach((g,i)=>{a.ok(Math.abs(g.from-want[i][0])<=2,`start ${g.from} vs ${want[i][0]}`);a.ok(Math.abs(g.to-want[i][1])<=2,`end ${g.to} vs ${want[i][1]}`);});};

test('ffmpeg reads one set of features every 0.5 s (astats + aspectralstats); each song found within ±2 s',{skip},async(t)=>{
 const d=tmp(t),file=path.join(d,'合成 演唱.wav');fs.writeFileSync(file,wav(PLAN));
 const scan=require('../song-scan').createSongScan({dir:path.join(d,'cache')});
 const seen=[];const r=await scan.scan(file,{onSegment:(i)=>seen.push(i)});
 a.deepEqual(seen,[0,1]);a.equal(r.complete,true);a.equal(r.step,0.5);
 a.ok(Math.abs(r.rows.length-960)<=1,'rows: '+r.rows.length);
 a.deepEqual(r.keys,['rms','flat','cent','ent','zcr']);
 a.ok(r.rows.every(x=>x.length===5),'five numbers a row');
 a.ok(Math.abs(r.rows[200][0]-(-18))<=2.5,'the sung level reads as it was made: '+r.rows[200][0]);
 a.ok(r.rows[3][0]<-60,'a talk pause reads quiet: '+r.rows[3][0]);
 near(require('../songs').find(r.rows.map(x=>x[0]),{complete:true}),SONGS);
});
test('stopped after the first segment, the next scan carries on from the second, and ends where one whole scan ends',{skip},async(t)=>{
 const d=tmp(t),file=path.join(d,'a.wav');fs.writeFileSync(file,wav(PLAN));
 const S=require('../song-scan'),scan=S.createSongScan({dir:path.join(d,'cache')});
 const stop=new AbortController();
 await a.rejects(scan.scan(file,{signal:stop.signal,onSegment:(i)=>{if(i===0)stop.abort();}}),(e)=>e.code==='SONGS_STOPPED');
 a.deepEqual(scan.cached(file),{done:1,complete:false,scanned:300});
 const seen=[];const r=await scan.scan(file,{onSegment:(i)=>seen.push(i)});
 a.deepEqual(seen,[1],'only the segment not read yet');
 const whole=await S.createSongScan({dir:path.join(d,'cache2')}).scan(file);
 a.equal(r.rows.length,whole.rows.length);
 a.ok(r.rows.every((x,i)=>Math.abs(x[0]-whole.rows[i][0])<=0.5),'the same loudness, row for row');
 a.deepEqual(scan.cached(file),{done:2,complete:true,scanned:r.rows.length*0.5});
 const again=[];await scan.scan(file,{onSegment:(i)=>again.push(i)});a.deepEqual(again,[],'nothing read twice');
});
test('the cache belongs to the file version: a replaced file is read again',{skip},async(t)=>{
 const d=tmp(t),file=path.join(d,'a.wav');fs.writeFileSync(file,wav([['talk',30]]));
 const scan=require('../song-scan').createSongScan({dir:path.join(d,'cache')});
 await scan.scan(file);fs.writeFileSync(file,wav([['talk',40]]));
 a.deepEqual(scan.cached(file),{done:0,complete:false,scanned:0});
 const r=await scan.scan(file);a.ok(Math.abs(r.rows.length-80)<=1);
});
test('REST: POST /api/songs starts or resumes the scan, GET answers the songs; files outside media/ are refused',{skip},async(t)=>{
 const dir=makeDataDir(t);fs.mkdirSync(path.join(dir,'media'),{recursive:true});fs.writeFileSync(path.join(dir,'media','直播 合成.wav'),wav(PLAN));
 const {base}=await startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1'});
 const src='/media/直播 合成.wav';
 const post=await fetch(base+'/api/songs',{method:'POST',body:JSON.stringify({src})});a.equal(post.status,202);
 let r;for(let i=0;i<600;i++){r=await (await fetch(base+'/api/songs?src='+encodeURIComponent(src))).json();if(r.state==='done'||r.state==='failed')break;await new Promise(z=>setTimeout(z,100));}
 a.equal(r.state,'done',JSON.stringify(r).slice(0,300));a.equal(r.complete,true);a.equal(r.done,r.total);
 near(r.songs,SONGS);a.ok(r.key&&r.key.length>=16);
 a.equal((await fetch(base+'/api/songs?src=/media/none.wav')).status,404);
 a.equal((await fetch(base+'/api/songs',{method:'POST',body:JSON.stringify({src:'/etc/passwd'})})).status,404);
 a.equal((await fetch(base+'/api/songs',{method:'POST',body:'{'})).status,400);
});
test('MCP fablecut_songs: scans the recordings on the timeline and keeps the songs in the project, one revision',{skip},async(t)=>{
 const proj=seedProject({media:[{id:'m_r',name:'录像.wav',kind:'audio',src:'/media/rec.wav',duration:480}],clips:[{id:'c_r',mediaId:'m_r',kind:'audio',track:'A1',start:0,in:0,duration:480}]});
 const dir=makeDataDir(t,proj);fs.mkdirSync(path.join(dir,'media'),{recursive:true});fs.writeFileSync(path.join(dir,'media','rec.wav'),wav(PLAN));
 const mcp=startMcp(t,dir,{FABLECUT_NO_AUTOSTART:'1'});
 await mcp.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'t',version:'1'}});
 const r=await mcp.callTool('fablecut_songs',{});
 a.equal(r.isError,false,r.text);a.match(r.text,/2 songs/);
 const doc=readProject(dir);a.equal(doc.revision,2);
 const e=doc.songs.m_r;a.equal(e.v,1);a.equal(e.complete,true);near(e.songs,SONGS);
 a.ok(e.songs.every(s=>s.confidence==='likely'||s.confidence==='estimated'));
});
test('the patch op setSongs keeps one checked entry per file; null removes it; unknown files and bad songs are refused',()=>{
 const Ops=require('../project-ops');
 const doc=seedProject();const entry={key:'k1',complete:true,scanned:10,songs:[{from:1,to:9,confidence:'likely',marks:[]}]};
 Ops.applyPatch(doc,[{op:'setSongs',mediaId:'m_a',songs:entry}]);
 a.equal(doc.songs.m_a.v,1);a.equal(doc.songs.m_a.songs.length,1);
 a.throws(()=>Ops.applyPatch(seedProject(),[{op:'setSongs',mediaId:'m_none',songs:entry}]),/m_none/);
 a.throws(()=>Ops.applyPatch(seedProject(),[{op:'setSongs',mediaId:'m_a',songs:{...entry,songs:[{from:9,to:1,confidence:'likely',marks:[]}]}}]),/SONGS_INVALID/);
 Ops.applyPatch(doc,[{op:'setSongs',mediaId:'m_a',songs:null}]);a.equal(doc.songs,undefined);
});
test('the editor keeps project.songs when it loads a project and when it saves (real window: desktop/songs-smoke.cjs), and loads songs.js before app.js',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 a.match(read('app.js'),/MontClipSongs\.clean\(project\.songs, out\.media\)/);
 const load=read('app.js').match(/function applyProject\([\s\S]*?\n  \}\);/);
 a.ok(load&&/\n    songs: /.test(load[0]),'applyProject keeps songs (it copies only the fields it knows)');
 const html=read('index.html');a.ok(html.indexOf('songs.js')>0&&html.indexOf('songs.js')<html.indexOf('app.js'));
});
test('the capability table has fablecut_songs: it changes the project and can be undone',()=>{
 const Cap=require('../capabilities');a.equal(Cap.riskOf('fablecut_songs'),'undoable');
 a.ok(Cap.get('fablecut_songs').summary['zh-CN'].includes('歌'));
});
test('the golden-set evaluation prints numbers only: no titles, no labels, no file names',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-golden-'));
 try{
  const {track}=require('./songs-synth');const {rms}=track(PLAN);
  const c=path.join(d,'cases','CASE-秘密');fs.mkdirSync(c,{recursive:true});
  fs.writeFileSync(path.join(c,'audio-features.json'),JSON.stringify({v:1,step:0.5,keys:['t','rms','flat','cent','ent','zcr'],rows:rms.map((v,i)=>[i*0.5,v,0,0,0,0])}));
  fs.writeFileSync(path.join(c,'labels.json'),JSON.stringify({labels:SONGS.map(([s])=>({start_sec:s,end_sec:null,label:'《秘密歌名》secret-title',category:'演唱'}))}));
  const r=spawnSync(process.execPath,[path.join(__dirname,'..','dev/real-tests','songs-golden.cjs'),d],{encoding:'utf8'});
  a.equal(r.status,0,r.stderr);
  a.match(r.stdout,/recall@10 1\.00/);
  a.ok(!/秘密|secret|CASE|演唱|labels|\.json/.test(r.stdout+r.stderr),r.stdout);
  a.ok(/^[\x20-\x7e\n]*$/.test(r.stdout),'plain ASCII numbers and their names only');
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
