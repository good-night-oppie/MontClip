"use strict";
const {spawn}=require("node:child_process");
const fs=require("node:fs");
const FF=require("./ffmpeg-path"); // the bundled ffprobe, never PATH (#28)
const readline=require("node:readline");
const ratio=value=>{const [a,b=1]=String(value||0).split('/').map(Number);return b && Number.isFinite(a/b)?a/b:0;};
// A break in the recording: more than clock quantization between one packet's end and the next one's start.
const GAP=0.005;
/* Reads packet lines (codec_type, pts/dts, duration) — or decoded frame lines (media_type), as before. Packets come in
   decode order: with B-frames pts jumps around, so breaks are measured on the decode clock (dts). A break counts on the
   audio when there is audio: a video packet that is late with the sound running on is a dropped or longer frame, which
   an MP4 keeps as it is. Without audio the video decides. */
function accumulator(streams, declaredDuration) {
  const tick=Math.max(...streams.map(s=>ratio(s.time_base)),0);
  const lead=streams.some(s=>s.codec_type==='audio')?'audio':'video';
  let start=Infinity,end=-Infinity,count=0,uncertain=false;
  const tails=new Map(),clocks=new Map(),tracks={},breaks=[];
  let maxGap=0;
  return {
    frame(line) {
      const f=Object.fromEntries(line.split('|').map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
      const type=f.media_type ?? f.codec_type;
      if(!['video','audio'].includes(type)) return;
      const pts=Number(f.best_effort_timestamp_time ?? f.pts_time);
      if(!Number.isFinite(pts)) return;
      const s=streams.find(s=>s.codec_type===type);
      let duration=Number(f.duration_time ?? f.pkt_duration_time);
      if(!(duration>0)) {
        // an AAC packet is 1024 samples, MP3 1152
        duration=type==='audio'?Number(f.nb_samples || (s?.codec_name==='mp3'?1152:1024))/Number(s?.sample_rate):1/ratio(s?.avg_frame_rate||s?.r_frame_rate);
        uncertain=true;
      }
      if(!(duration>0 && Number.isFinite(duration))) return;
      const dts=Number(f.dts_time),clock=Number.isFinite(dts)?dts:pts;
      if(clocks.has(type)) {
        const gap=clock-clocks.get(type);
        if(type===lead) { maxGap=Math.max(maxGap,gap); if(gap>GAP) breaks.push({at:clocks.get(type),length:gap}); }
      }
      clocks.set(type,Math.max(clocks.get(type) ?? -Infinity,clock+duration));
      start=Math.min(start,pts);end=Math.max(end,pts+duration);count++;
      const t=tracks[type] ||= {start:Infinity,end:-Infinity,packets:0};
      t.start=Math.min(t.start,pts);t.end=Math.max(t.end,pts+duration);t.packets++;
      if(!tails.has(type) || pts+duration>=tails.get(type).end) tails.set(type,{end:pts+duration,duration});
    },
    finish() {
      if(!count || !(end>start)) throw Object.assign(Error('No readable frames'),{code:'FLV_PROBE_FAILED'});
      const duration=end-start,declared=Number(declaredDuration);
      // Header clocks may start at zero; allow start offset, terminal blocks and
      // endpoint quantization, never the size of a PTS hole or a percentage cutoff.
      const tolerance=Math.max(0,start)+[...tails.values()].reduce((sum,t)=>sum+t.duration,0)+2*tick;
      // where each break is in the file as a player shows it (from its first picture or sound), and how long
      const gaps=breaks.map(b=>({at:Math.max(0,b.at-start),length:b.length}));
      return {start,end,duration,frames:count,tolerance,maxGap,gaps,tracks,estimatedTail:uncertain,
        declaredDuration:Number.isFinite(declared)&&declared>0?declared:null,
        needsConsent:uncertain || Number.isFinite(declared)&&declared>0&&Math.abs(declared-duration)>tolerance};
    },
  };
}
/* Packet headers only (`-show_entries packet=…`): nothing is decoded, so a 2-hour recording takes seconds, not the
   13 minutes decoding every frame took (VV, 2026-11-04). `onProgress(fraction)` follows the packets' byte position. */
async function scanReadableRange(file,streams,declaredDuration,{signal,onProgress}={}) {
  const acc=accumulator(streams,declaredDuration);
  let size=0;try{size=fs.statSync(file).size;}catch{/* ffprobe reports a missing file */}
  return new Promise((resolve,reject)=>{
    const child=spawn(FF.path('ffprobe'),['-v','error','-show_entries','packet=codec_type,pts_time,dts_time,duration_time,pos','-of','compact=p=0',file],{windowsHide:true,signal,stdio:['ignore','pipe','pipe']});
    let errors=false,spawnError,seen=0;
    child.stderr.on('data',()=>{errors=true;});
    const lines=readline.createInterface({input:child.stdout});
    lines.on('line',line=>{
      acc.frame(line);
      if(onProgress && size && ++seen%500===0) { const pos=Number((/(?:^|\|)pos=(\d+)/.exec(line)||[])[1]); if(pos>0) onProgress(Math.min(1,pos/size)); }
    });
    const timer=setTimeout(()=>{child.kill();},15*60*1000);timer.unref();
    child.on('error',e=>{spawnError=e;});
    child.on('close',code=>{
      clearTimeout(timer);lines.close();
      if(signal?.aborted || spawnError || code!==0) return reject(Object.assign(Error('Readable range scan failed'),{code:spawnError?.code==='ENOENT'?'FLV_COMPONENT_MISSING':'FLV_PROBE_FAILED'}));
      try {const result=acc.finish();result.decodeWarnings=errors;result.needsConsent ||= errors;onProgress && onProgress(1);resolve(result);}catch(e){reject(e);}
    });
  });
}
module.exports={accumulator,scanReadableRange,GAP};
