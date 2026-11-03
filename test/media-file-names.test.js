'use strict';
// Deja 2026-11-03: a recording uploaded or imported with a Chinese name ended up as 「_ _.wav」 — the upload, the URL
// import and the MCP import each replaced every character outside [\w.- ()[]] with "_". Every media file name now goes
// through the one rule exported files already follow (Delivery.fileSafeName): Chinese and other characters kept, only
// what Windows refuses changed, the extension kept whole.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {makeDataDir,seedProject,startServer,startMcp,readProject}=require('./helpers');
const Delivery=require('../delivery');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('mediaFileName: Chinese kept, Windows-refused characters made full-width, the extension kept whole',()=>{
 const m=Delivery.mediaFileName;
 a.equal(m('11月2日 周六晚上 直播.flv'),'11月2日 周六晚上 直播.flv');
 a.equal(m('合成 演唱.wav'),'合成 演唱.wav');
 a.equal(m('周五杂谈：唱歌?.mp4'),'周五杂谈：唱歌？.mp4');
 a.equal(m('a/b\\c.mp4'),'a-b-c.mp4','no folders');
 a.equal(m('con.mp4'),'con-.mp4','a reserved name');
 a.equal(m('...hidden.mp4'),'hidden.mp4');
 const long=m('直'.repeat(300)+'.mp4');a.ok(long.endsWith('.mp4')&&Array.from(long).length<=120,long.length);
 a.equal(m(''),'file');a.equal(m('.mp4'),'file.mp4');a.equal(m(null),'file');
 a.equal(m('‮gpj.mp4'),'gpj.mp4','a direction control cannot disguise the extension');
});
test('no media path keeps its own ASCII-only rule: upload, URL import and the MCP import all use mediaFileName',()=>{
 const server=read('server.js'),up=server.slice(server.indexOf('p === "/api/upload"'),server.indexOf('p === "/api/upload"')+600);
 a.match(up,/Delivery\.mediaFileName\(/);a.ok(!/safeName\(url\.searchParams/.test(up));
 const iu=read('import-url.js');a.match(iu,/function safeName\(name\) \{\n  return Delivery\.mediaFileName\(/);
 const mcp=read('mcp-server.js'),imp=mcp.slice(mcp.indexOf('case "fablecut_import_media"'),mcp.indexOf('case "fablecut_import_media"')+1500);
 a.match(imp,/Delivery\.mediaFileName\(path\.basename\(src\)\)/);a.ok(!/\[\^\\w\.\\- \(\)\\\[\\\]\]\+\/g, "_"/.test(imp));
});
test('a URL download keeps the Chinese name it was given',()=>{
 const {filenameFrom}=require('../import-url');
 const u=new URL('https://example.com/x');
 a.equal(filenameFrom(u,{'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('直播 录像.mp4')}),'直播 录像.mp4');
 a.equal(filenameFrom(new URL('https://example.com/'+encodeURIComponent('第二场 回放.mp4')),{}),'第二场 回放.mp4');
});
test('POST /api/upload keeps the Chinese name; a second one with the same name gets _1',async(t)=>{
 const dir=makeDataDir(t);fs.mkdirSync(path.join(dir,'media'),{recursive:true});
 const {base}=await startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1'});
 const up=async()=>(await fetch(base+'/api/upload?name='+encodeURIComponent('合成 演唱.wav'),{method:'POST',body:Buffer.from('RIFF0000WAVE')})).json();
 const r=await up();a.equal(decodeURIComponent(r.src),'/media/合成 演唱.wav');a.ok(fs.existsSync(path.join(dir,'media','合成 演唱.wav')));
 const r2=await up();a.equal(decodeURIComponent(r2.src),'/media/合成 演唱_1.wav');
});
test('MCP fablecut_import_media copies a local file under its Chinese name',async(t)=>{
 const dir=makeDataDir(t,seedProject({media:[],clips:[]}));fs.mkdirSync(path.join(dir,'media'),{recursive:true});
 const src=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'montclip-names-')),'直播 录像.svg');
 t.after(()=>fs.rmSync(path.dirname(src),{recursive:true,force:true}));
 fs.writeFileSync(src,'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
 const mcp=startMcp(t,dir,{FABLECUT_NO_AUTOSTART:'1'});
 await mcp.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'t',version:'1'}});
 const r=await mcp.callTool('fablecut_import_media',{path:src});a.equal(r.isError,false,r.text);
 a.ok(fs.existsSync(path.join(dir,'media','直播 录像.svg')),fs.readdirSync(path.join(dir,'media')).join(','));
 const m=readProject(dir).media.at(-1);a.equal(decodeURIComponent(m.src),'/media/直播 录像.svg');
});
