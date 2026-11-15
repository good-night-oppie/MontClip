'use strict';
// Only manages the explicitly selected, initially empty recording profile. Never reads credentials.
const fsDefault=require('node:fs'),path=require('node:path');
function prepare(profile,out,{fs=fsDefault,platform=process.platform,uid=process.getuid?.()}={}){
 profile=path.resolve(profile);out=path.resolve(out);
 const canonical=p=>path.join(fs.realpathSync(path.dirname(p)),path.basename(p));
 try{profile=canonical(profile);out=canonical(out);}catch{throw Error('DIRECTORY_CHECK_FAILED');}
 const contains=(a,b)=>{const r=path.relative(a,b);return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
 if(contains(profile,out)||contains(out,profile))throw Error('OVERLAPPING_DIRECTORIES');
 let st;
 try{st=fs.lstatSync(profile);}catch(e){if(e.code!=='ENOENT')throw Error('FRESH_PROFILE_REQUIRED');}
 if(st&&(st.isSymbolicLink()||!st.isDirectory()||fs.readdirSync(profile).length))throw Error('FRESH_PROFILE_REQUIRED');
 try{fs.lstatSync(out);throw Error('FRESH_DIRECTORY_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw Error('FRESH_DIRECTORY_REQUIRED');}
 // Check ownership before chmod, including an empty directory Electron pre-created.
 if(platform!=='win32'&&(typeof uid!=='number'||(st&&st.uid!==uid)))throw Error('PROFILE_OWNER_REQUIRED');
 try{
  if(!st)fs.mkdirSync(profile,{mode:0o700});
  if(platform!=='win32')fs.chmodSync(profile,0o700);
  st=fs.lstatSync(profile);
  if(st.isSymbolicLink()||!st.isDirectory()||(platform!=='win32'&&(st.uid!==uid||(st.mode&0o777)!==0o700)))throw Error();
  fs.mkdirSync(out,{mode:0o700});
 }catch{throw Error('PRIVATE_PROFILE_REQUIRED');}
 const identity={dev:st.dev,ino:st.ino};let service;
 function check(){
  const now=fs.lstatSync(profile);
  if(now.isSymbolicLink()||!now.isDirectory()||now.dev!==identity.dev||now.ino!==identity.ino||fs.realpathSync(profile)!==profile)throw Error('PROFILE_CHANGED');
  if(platform!=='win32'&&(now.uid!==uid||(now.mode&0o777)!==0o700))throw Error('PRIVATE_PROFILE_REQUIRED');
 }
 return {profile,out,
  bind(app,agentModule){
   check();app.setPath('userData',profile);
   if(path.resolve(app.getPath('userData'))!==profile)throw Error('PROFILE_BIND_FAILED');
   const create=agentModule.createDiskService;
   agentModule.createDiskService=function(root,...args){
    check();if(path.resolve(root)!==profile||service)throw Error('PROFILE_BIND_FAILED');
    service=create.call(this,root,...args);return service;
   };
  },
  cleanup(){
   try{
    check();
    // Product deletion handles fixed credential files and reset backups. Refuse redirected backups
    // before invoking it, so even a replaced entry cannot delete anything outside the managed root.
    for(const name of fs.readdirSync(profile))if(name.startsWith('agent-connection-backup-')){
     const entry=fs.lstatSync(path.join(profile,name));if(entry.isSymbolicLink()||!entry.isDirectory())throw Error();
    }
    if(service){const r=service.deleteConnection();if(!r.ok||r.configured||r.code!=='CONNECTION_DELETED')throw Error();}
    const remaining=fs.readdirSync(profile).filter(n=>n.startsWith('agent-connection-v1.json')||n.startsWith('agent-connection-backup-')).length;
    return {ok:remaining===0,remaining};
   }catch{return {ok:false,remaining:null};}
  }
 };
}
module.exports={prepare};
