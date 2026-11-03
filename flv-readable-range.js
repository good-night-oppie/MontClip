"use strict";
const {spawn}=require("node:child_process");
const FF=require("./ffmpeg-path"); // the bundled ffprobe, never PATH (#28)
const readline=require("node:readline");
const ratio=value=>{const [a,b=1]=String(value||0).split('/').map(Number);return b && Number.isFinite(a/b)?a/b:0;};
function accumulator(streams, declaredDuration) {
  const tick=Math.max(...streams.map(s=>ratio(s.time_base)),0);
  let start=Infinity,end=-Infinity,count=0,uncertain=false;
  const tails=new Map();
  let maxGap=0;
  return {
    frame(line) {
      const f=Object.fromEntries(line.split('|').map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
      if(!['video','audio'].includes(f.media_type)) return;
      const pts=Number(f.best_effort_timestamp_time ?? f.pts_time);
      if(!Number.isFinite(pts)) return;
      let duration=Number(f.duration_time ?? f.pkt_duration_time);
      if(!(duration>0)) {
        const s=streams.find(s=>s.codec_type===f.media_type);
        duration=f.media_type==='audio'?Number(f.nb_samples)/Number(s?.sample_rate):1/ratio(s?.avg_frame_rate||s?.r_frame_rate);
        uncertain=true;
      }
      if(!(duration>0 && Number.isFinite(duration))) return;
      if(tails.has(f.media_type)) maxGap=Math.max(maxGap,pts-tails.get(f.media_type).end);
      start=Math.min(start,pts);end=Math.max(end,pts+duration);count++;
      if(!tails.has(f.media_type) || pts+duration>=tails.get(f.media_type).end) tails.set(f.media_type,{end:pts+duration,duration});
    },
    finish() {
      if(!count || !(end>start)) throw Object.assign(Error('No readable frames'),{code:'FLV_PROBE_FAILED'});
      const duration=end-start,declared=Number(declaredDuration);
      // Header clocks may start at zero; allow start offset, terminal blocks and
      // endpoint quantization, never the size of a PTS hole or a percentage cutoff.
      const tolerance=Math.max(0,start)+[...tails.values()].reduce((sum,t)=>sum+t.duration,0)+2*tick;
      return {start,end,duration,frames:count,tolerance,maxGap,estimatedTail:uncertain,
        declaredDuration:Number.isFinite(declared)&&declared>0?declared:null,
        needsConsent:uncertain || Number.isFinite(declared)&&declared>0&&Math.abs(declared-duration)>tolerance};
    },
  };
}
async function scanReadableRange(file,streams,declaredDuration,{signal}={}) {
  const acc=accumulator(streams,declaredDuration);
  return new Promise((resolve,reject)=>{
    const child=spawn(FF.path('ffprobe'),['-v','error','-show_frames','-show_entries','frame=media_type,best_effort_timestamp_time,pts_time,duration_time,pkt_duration_time,nb_samples','-of','compact=p=0',file],{windowsHide:true,signal,stdio:['ignore','pipe','pipe']});
    let errors=false,spawnError;
    child.stderr.on('data',()=>{errors=true;});
    const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>acc.frame(line));
    const timer=setTimeout(()=>{child.kill();},15*60*1000);timer.unref();
    child.on('error',e=>{spawnError=e;});
    child.on('close',code=>{
      clearTimeout(timer);lines.close();
      if(signal?.aborted || spawnError || code!==0) return reject(Object.assign(Error('Readable range scan failed'),{code:spawnError?.code==='ENOENT'?'FLV_COMPONENT_MISSING':'FLV_PROBE_FAILED'}));
      try {const result=acc.finish();result.decodeWarnings=errors;result.needsConsent ||= errors;resolve(result);}catch(e){reject(e);}
    });
  });
}
module.exports={accumulator,scanReadableRange};
