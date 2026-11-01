'use strict';
// Explicit development benchmark; never part of application startup or npm test.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const SOURCE='19377acd3dea9e0ff7df49cde62f020869c10580',RESERVE=10*1024**3,LIMIT=256*1024**2;
const hash=p=>new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=fs.createReadStream(p);s.on('error',reject);s.on('data',b=>h.update(b));s.on('end',()=>resolve(h.digest('hex')));});
const free=p=>{const s=fs.statfsSync(p);return s.bavail*s.bsize;};
async function main(){
 if(free(os.tmpdir())<RESERVE+LIMIT)throw Error('SPACE_RESERVE');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'MontClip-long-flv-'));
 const report={source:SOURCE,platform:process.platform,node:process.version,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),fixture:{duration:7200,width:1920,height:1080,fps:30,content:'10-second static blue H264 loop plus continuous synthesized silent AAC; structural test only',maxBytes:LIMIT},commands:[],modules:{},freeBefore:free(dir),peakOwnedBytes:0,minFreeBytes:free(dir)};
 const scrub=s=>String(s).split(dir).join('<fixture>').split(process.cwd()).join('<repo>').split(os.homedir()).join('<user>');
 const size=()=>fs.readdirSync(dir).reduce((n,f)=>n+fs.statSync(path.join(dir,f)).size,0);
 const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
 const timer=setInterval(()=>{report.peakOwnedBytes=Math.max(report.peakOwnedBytes,size());report.minFreeBytes=Math.min(report.minFreeBytes,free(dir));},250);timer.unref();
 async function run(tool,args,timeout){const start=performance.now();return await new Promise((resolve,reject)=>{const child=cp.spawn(tool,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let err='',out='';child.stdout.on('data',b=>{out=(out+b).slice(-16384);});child.stderr.on('data',b=>{err=(err+b).slice(-16384);});const kill=setTimeout(()=>child.kill(),timeout);child.on('error',reject);child.on('close',(code,signal)=>{clearTimeout(kill);report.commands.push({tool,args:args.map(scrub),elapsedMs:performance.now()-start,code,signal,stderr:scrub(err)});save();code===0?resolve(out):reject(Error('COMMAND_FAILED'));});});}
 try{
 for(const tool of ['ffmpeg','ffprobe']){const resolved=cp.execFileSync('where.exe',[tool],{encoding:'utf8'}).trim().split(/\r?\n/)[0];report[tool]={version:cp.execFileSync(tool,['-version'],{encoding:'utf8'}).split(/\r?\n/)[0],sha256:await hash(resolved)};}
 for(const name of ['prepare-media.js','flv-readable-range.js']){const bytes=cp.execFileSync('git',['show',SOURCE+':'+name]);fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx'});report.modules[name]=crypto.createHash('sha256').update(bytes).digest('hex');}
 const seed=path.join(dir,'seed.mp4'),input=path.join(dir,'two-hours.flv');
 await run('ffmpeg',['-v','error','-nostdin','-n','-f','lavfi','-i','color=c=blue:s=1920x1080:r=30','-t','10','-c:v','libx264','-preset','ultrafast','-crf','35','-bf','2','-g','60','-pix_fmt','yuv420p','-an',seed],180000);
 await run('ffmpeg',['-v','error','-nostdin','-n','-stream_loop','-1','-i',seed,'-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','7200','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','32k','-fs',String(LIMIT),'-f','flv',input],180000);
 report.input={sha256:await hash(input),bytes:fs.statSync(input).size};
 const meta=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',input],30000));report.input.duration=Number(meta.format.duration);report.input.streams=meta.streams.map(s=>({type:s.codec_type,codec:s.codec_name,start:s.start_time,rate:s.avg_frame_rate,hasBFrames:s.has_b_frames}));
 if(report.input.duration<7199||report.input.bytes>=LIMIT)throw Error('FIXTURE_INCOMPLETE');
 // Observe real production process completion without substituting process results.
 const origSpawn=cp.spawn,origExec=cp.execFile;
 cp.spawn=function(tool,args,opts){const start=performance.now(),child=origSpawn(tool,args,opts);child.on('close',(code,signal)=>{report.commands.push({phase:'production-scan',tool,args:args.map(scrub),elapsedMs:performance.now()-start,code,signal});});return child;};
 cp.execFile=function(tool,args,opts,cb){const start=performance.now();return origExec(tool,args,opts,(err,out,stderr)=>{report.commands.push({phase:'production-probe',tool,args:args.map(scrub),elapsedMs:performance.now()-start,code:err?.code||0});cb(err,out,stderr);});};
 const start=performance.now();try{report.inspect={result:await require(path.join(dir,'prepare-media.js')).inspectFlv(input,{readableRange:true}),elapsedMs:performance.now()-start};}catch(e){report.inspect={error:e.code||e.name,elapsedMs:performance.now()-start};throw e;}finally{cp.spawn=origSpawn;cp.execFile=origExec;}
 report.input.hashAfter=await hash(input);report.completed=true;
 }catch(e){report.error=e.code||e.message;process.exitCode=1;}finally{clearInterval(timer);report.peakOwnedBytes=Math.max(report.peakOwnedBytes,size());report.freeAfter=free(dir);save();console.log(JSON.stringify({directory:dir,report}));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
