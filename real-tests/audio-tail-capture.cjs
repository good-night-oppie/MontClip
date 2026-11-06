/* Opt-in observer, preloaded only into the diagnostic runner's own server.
 * Copies encoder inputs before normal cleanup. Does not change argv or bytes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const dir=process.env.MONTCLIP_TAIL_CAPTURE_DIR;
if(!dir||!path.isAbsolute(dir)||!fs.existsSync(path.join(dir,'data','project.json')))throw Error('Owned diagnostic directory required');
const spawn=cp.spawn;
cp.spawn=function(binary,args,options){
  const capture=args.includes('prores_ks')&&args.includes('image2pipe')&&args.includes('-');
  if(!capture)return spawn.apply(this,arguments);
  const wav=args.find(a=>a.endsWith('audio.wav'));
  if(!wav||!path.resolve(wav).startsWith(path.resolve(dir)+path.sep))throw Error('Capture input is outside owned directory');
  fs.copyFileSync(wav,path.join(dir,'captured-mix.wav'));
  fs.writeFileSync(path.join(dir,'actual-command.local.json'),JSON.stringify({binary,args},null,2)+'\n');
  const fd=fs.openSync(path.join(dir,'captured-frames.mjpeg'),'wx');
  const child=spawn.apply(this,arguments),write=child.stdin.write;
  let bytes=0,writes=0;
  child.stdin.write=function(chunk,...rest){fs.writeSync(fd,chunk);bytes+=chunk.length;writes++;return write.call(this,chunk,...rest);};
  const stderr=[];child.stderr.on('data',b=>stderr.push(b));
  child.once('close',code=>{fs.closeSync(fd);fs.writeFileSync(path.join(dir,'encoder-stderr.txt'),Buffer.concat(stderr));
    fs.writeFileSync(path.join(dir,'capture-transport.json'),JSON.stringify({code,bytes,writes,method:'tee stdin.write bytes; original write return/backpressure preserved'},null,2)+'\n');});
  return child;
};
