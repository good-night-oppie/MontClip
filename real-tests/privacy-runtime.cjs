'use strict';
// Test-only process boundaries. Never discover or adopt an existing service.
const fs = require('node:fs'), path = require('node:path');
const { resolveTool } = require('../ffmpeg-path');
function lifetime(child) {
  let failure;
  const listeners=new Set();
  const fail=e=>{if(failure)return;failure=e;for(const fn of listeners)fn(e);};
  child.on('error',e=>fail(e));
  child.on('exit',(code,signal)=>fail(Error(`owned child exited (${code}, ${signal})`)));
  if(child.exitCode!==null||child.signalCode)fail(Error('owned child already exited'));
  return {
    assertAlive(){if(failure)throw failure;},
    onFailure(fn){listeners.add(fn);if(failure)fn(failure);return()=>listeners.delete(fn);},
  };
}
async function serverLease(child,{token,proofPath,proof,timeoutMs=20000}) {
  const life=lifetime(child),abort=new AbortController();
  const remove=life.onFailure(()=>abort.abort());
  const timer=setTimeout(()=>abort.abort(),timeoutMs);
  try {
    const msg=await new Promise((resolve,reject)=>{
      const finish=(error,value)=>{child.off('message',message);abort.signal.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
      const cancel=()=>finish(Error('owned server stopped or handshake timed out'));
      const message=m=>finish(null,m);
      child.once('message',message);abort.signal.addEventListener('abort',cancel,{once:true});
      if(abort.signal.aborted)cancel();
    });
    life.assertAlive();
    if(msg?.type!=='montclip-ready'||!/^http:\/\/127\.0\.0\.1:[1-9]\d*$/.test(msg.origin))throw Error('invalid owned server handshake');
    const origin=msg.origin,headers={'X-MontClip-Session':token,Origin:origin};
    const r=await fetch(origin+proofPath,{headers,signal:abort.signal,redirect:'error'});
    if(!r.ok||(await r.text())!==proof)throw Error('owned server proof mismatch');
    life.assertAlive();
    return {origin,headers,...life};
  } finally {clearTimeout(timer);remove();}
}
function resolveMediaTools(env=process.env) {
  const result={};
  for(const name of ['ffmpeg','ffprobe']) {
    const explicit=env['MONTCLIP_'+name.toUpperCase()];
    if(explicit && (!path.isAbsolute(explicit)||!fs.existsSync(explicit)||!fs.statSync(explicit).isFile()))throw Error('no file: '+explicit);
    const resolved=resolveTool(name,{env});
    if(!resolved.ok)throw Error(resolved.error);
    result[name]=resolved.path;
  }
  return result;
}
// Chrome --remote-debugging-pipe: private child fd 3/4, NUL-delimited CDP.
// No TCP port, /json discovery, WebSocket URL or foreign endpoint.
function pipeClient(child,{timeoutMs=120000}={}) {
  const life=lifetime(child),pending=new Map(),events=new Set();
  let id=0,buffer='',protocolError;
  const rejectAll=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();};
  const remove=life.onFailure(rejectAll);
  for(const stream of [child.stdio[3],child.stdio[4]])stream.on('error',e=>{protocolError=e;rejectAll(e);});
  child.stdio[4].on('data',chunk=>{
    buffer+=chunk.toString('utf8');
    let n;
    while((n=buffer.indexOf('\0'))>=0) {
      const text=buffer.slice(0,n);buffer=buffer.slice(n+1);
      let msg;try{msg=JSON.parse(text);}catch{protocolError=Error('invalid private CDP pipe response');rejectAll(protocolError);continue;}
      if(msg.id) {
        const p=pending.get(msg.id);if(!p)continue;
        pending.delete(msg.id);clearTimeout(p.timer);
        if(msg.sessionId!==p.sessionId)p.reject(Error('private CDP session mismatch'));
        else if(msg.error)p.reject(Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else for(const fn of events)fn(msg);
    }
  });
  return {
    ...life,
    send(method,params={},sessionId){
      life.assertAlive();if(protocolError)throw protocolError;
      return new Promise((resolve,reject)=>{
        const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('private CDP timeout '+method));},timeoutMs);
        pending.set(key,{resolve,reject,timer,sessionId});
        child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');
      });
    },
    onEvent(fn){events.add(fn);},
    close(){remove();protocolError=Error('private CDP closed');rejectAll(protocolError);child.stdio[3].destroy();child.stdio[4].destroy();},
  };
}
function verifyBrowserArguments(args,profile) {
  if(!Array.isArray(args)||!args.includes('--remote-debugging-pipe')||
    !args.includes('--user-data-dir='+profile)||args.some(a=>a.startsWith('--remote-debugging-port')))
    throw Error('browser ownership mismatch');
}
module.exports={serverLease,resolveMediaTools,pipeClient,lifetime,verifyBrowserArguments};
