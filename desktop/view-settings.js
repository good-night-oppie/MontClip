'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const defaults=()=>({mode:'simple',language:'zh-CN'});
function valid(v){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===2&&['simple','advanced'].includes(v.mode)&&['zh-CN','en'].includes(v.language);}
function allowed(event,win,origin){try{return !!win&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&new URL(event.senderFrame.url).origin===origin;}catch{return false;}}
function createStore(root,{io=fs, pane=false}={}){
 const check=pane?v=>v&&Object.keys(v).length===1&&Number.isInteger(v.width)&&v.width>=280&&v.width<=480:valid;
 const initial=pane?()=>({width:340}):defaults;
 const file=path.join(root,pane?'agent-pane-settings.json':'view-settings.json');
 return {
  get(){try{const raw=io.readFileSync(file,'utf8');if(raw.length>1024)throw Error('too large');const value=JSON.parse(raw);if(!check(value))throw Error('invalid');return{ok:true,value};}catch(e){return e.code==='ENOENT'?{ok:true,value:initial()}:{ok:false,code:'VIEW_SETTINGS_READ_FAILED',value:initial()};}},
  set(value){if(!check(value))return{ok:false,code:'VIEW_SETTINGS_INVALID'};const temp=file+'.'+randomUUID()+'.tmp';try{io.writeFileSync(temp,JSON.stringify(pane?{width:value.width}:{mode:value.mode,language:value.language}),{flag:'wx'});io.renameSync(temp,file);return{ok:true};}catch{return{ok:false,code:'VIEW_SETTINGS_WRITE_FAILED'};}finally{try{io.unlinkSync(temp);}catch{}}}
 };
}
module.exports={createStore,allowed};
