'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const valid=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===2&&v.version===1&&['edit','color'].includes(v.workspace);
function createStore(root,{io=fs}={}){const file=path.join(root,'workspace-settings-v1.json');const get=()=>{try{const raw=io.readFileSync(file,'utf8');if(raw.length>256)throw Error();const value=JSON.parse(raw);if(!valid(value))throw Error();return{ok:true,value};}catch(e){return{ok:e.code==='ENOENT',missing:e.code==='ENOENT',value:{version:1,workspace:'edit'},code:e.code==='ENOENT'?undefined:'WORKSPACE_READ_FAILED'};}};
const set=value=>{if(!valid(value))return{ok:false,code:'WORKSPACE_INVALID'};const temp=file+'.'+randomUUID()+'.tmp';let owned=false;try{io.writeFileSync(temp,JSON.stringify({version:1,workspace:value.workspace}),{flag:'wx'});owned=true;io.renameSync(temp,file);return{ok:true};}catch{return{ok:false,code:'WORKSPACE_WRITE_FAILED'};}finally{if(owned)try{io.unlinkSync(temp);}catch{}}};
return{get,set,migrate(value){const current=get();if(!current.ok||!current.missing)return current;const r=set(value);return r.ok?get():r;}};}
module.exports={createStore};
