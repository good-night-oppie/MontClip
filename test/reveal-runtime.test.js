'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const main=fs.readFileSync(path.join(__dirname,'../desktop/main.js'),'utf8');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'reveal-'));const links=[];
 t.after(()=>{for(const link of links)fs.unlinkSync(link);fs.rmSync(root,{recursive:true,force:true});});
 const data=path.join(root,'data'),outside=path.join(root,'outside');fs.mkdirSync(data);fs.mkdirSync(outside);
 for(const dir of ['media','exports','library'])fs.mkdirSync(path.join(data,dir));
 const handlers={},shown=[];const context={fs,path,env:{FABLECUT_DATA_DIR:data},ipcMain:{handle:(k,v)=>handlers[k]=v},settingsAllowed:e=>e.allowed,win:{},origin:'http://127.0.0.1:1',shell:{showItemInFolder:f=>shown.push(f)}};
 const start=main.indexOf('  const workspaceFile =');const end=main.indexOf('  ses.webRequest.onBeforeRequest',start);
 vm.runInNewContext(main.slice(start,end)+';globalThis.remember=rememberSavedExport;',context);
 return {root,data,outside,shown,links,remember:context.remember,reveal:src=>handlers['montclip:reveal']({allowed:true},src),handlers};
}
test('regular nested workspace file can be revealed, traversal and foreign sender cannot',t=>{
 const x=fixture(t);fs.mkdirSync(path.join(x.data,'media','archive'));const file=path.join(x.data,'media','archive','a.mp4');fs.writeFileSync(file,'synthetic');
 a.equal(x.reveal('/media/archive/a.mp4').ok,true);a.equal(x.shown[0],file);
 for(const src of ['/media/../../outside/a.mp4','/media/%2e%2e/%2e%2e/outside/a.mp4','/other/a.mp4',file])a.equal(x.reveal(src).ok,false);
 a.equal(x.handlers['montclip:reveal']({allowed:false},'/media/archive/a.mp4').code,'REVEAL_FORBIDDEN');
});
test('save receipt reveals the final chosen file after the workspace copy was removed',t=>{
 const x=fixture(t),copy=path.join(x.data,'exports','a.mp4'),saved=path.join(x.outside,'chosen.mp4');
 fs.writeFileSync(copy,'synthetic');fs.writeFileSync(saved,'synthetic');x.remember(copy,saved);fs.unlinkSync(copy);
 a.equal(x.reveal('/exports/a.mp4').ok,true);a.equal(x.shown[0],saved);
 a.equal(x.reveal(saved).ok,false,'arbitrary absolute paths are not accepted from the page');
 fs.unlinkSync(saved);a.equal(x.reveal('/exports/a.mp4').code,'REVEAL_NOT_FOUND');
});
for(const where of ['nested','root'])test('junction or symlink '+where+' cannot escape the workspace',t=>{
 const x=fixture(t);fs.writeFileSync(path.join(x.outside,'a.mp4'),'outside');
 const link=path.join(x.data,'media',...(where==='nested'?['linked']:[]));if(where==='root')fs.rmdirSync(link);
 fs.symlinkSync(x.outside,link,'junction');x.links.push(link);
 a.equal(x.reveal('/media/'+(where==='nested'?'linked/':'')+'a.mp4').ok,false);a.equal(x.shown.length,0);
});
