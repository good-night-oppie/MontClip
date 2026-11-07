"use strict";
const {spawn}=require("node:child_process");
const fs=require("node:fs");
const FF=require("./ffmpeg-path"); // the bundled ffprobe, never PATH (#28)
const readline=require("node:readline");
const ratio=value=>{const [a,b=1]=String(value||0).split('/').map(Number);return b && Number.isFinite(a/b)?a/b:0;};
// What is listed (and marked faintly) as a break at all: more than clock quantization between one packet's end and
// the next one's start. It decides nothing about importing: only BIG_GAP and MAX_DRIFT below do.
const MARK=0.005;
/* Deja, 2026-11-04 (VV measured five real recordings: up to 29 picture drops of ~100 ms, sound holes of 58–65 ms — all
   to be imported without a question): a recording is imported unless a break is longer than BIG_GAP in either stream;
   then it is converted after 〔帮我转〕 (prepare-media.js: the picture copied, the sound filled on its own timestamps).
   Picture and sound moving more than MAX_DRIFT apart during the recording (DRIFT, below) is reported (drifting) and
   logged, not converted: no conversion can know which of the two clocks is right (Deja on QQ's #130 review, point 3).
   Lengths are compared in whole
   milliseconds (FLV's clock unit), so a 0.500 s break is never "over 0.5 s" (Rea's G-gap0.500s). How many small drops
   there are, or how long they add up to, does not matter: players keep picture and sound together by their timestamps,
   and a dropped frame moves nothing. Small drops are only marked faintly on the timeline and logged. */
const BIG_GAP=0.5, MAX_DRIFT=0.04;
const ms=(s)=>Math.round(s*1000);
/* Reads packet lines (codec_type, pts/dts, duration) — or decoded frame lines (media_type), as before. Packets come in
   decode order: with B-frames pts jumps around, so breaks are measured on the decode clock (dts), per stream.
   DRIFT, how far picture and sound move apart by their packet times during the recording, is the largest of:
   - at the same moment: a break in one stream alone is content lost while the clock ran on (a dropped frame, a hole in
     the sound) and leaves both on the same clock; where both break at once (their breaks overlap in time) the clock
     jumped, by the same amount in both if they are to stay together. The running sum of what they did not (picture
     minus sound), largest absolute value in file order;
   - at the end: how far apart the last picture and the last sound end, less the longer of the two last packets (each
     stream can end up to one packet short of the other: a frame is 33 ms, an AAC packet 21–23 ms).
   Where they start is not drift (Deja, 2026-11-05): live recordings often start their picture 0.06–0.09 s after their
   sound, on the same clock and ending together. */
function accumulator(streams, declaredDuration) {
  const tick=Math.max(...streams.map(s=>ratio(s.time_base)),0);
  let start=Infinity,end=-Infinity,count=0,uncertain=false;
  const tails=new Map(),clocks=new Map(),tracks={},breaks=[],totals={video:0,audio:0};
  // Rea on #130 @076ee672: a decode clock that runs back (DTS to 8 s, then 0.5 s again) is not a break; read as it is,
  // picture and sound come out up to seconds apart. Deja, 2026-11-07: such a recording is refused, never imported.
  const lastClock=new Map(),rewinds=[];
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
      // only a decode clock (or decoded frames, in display order) must not run back: without dts, pts jumps with B-frames
      if((Number.isFinite(dts)||f.media_type) && lastClock.has(type) && clock<lastClock.get(type)-MARK) rewinds.push({stream:type,at:lastClock.get(type),back:lastClock.get(type)-clock});
      lastClock.set(type,clock);
      if(clocks.has(type)) {
        const gap=clock-clocks.get(type);
        maxGap=Math.max(maxGap,gap);
        if(gap>MARK) { breaks.push({at:clocks.get(type),len:gap,stream:type}); totals[type]+=gap; }
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
      // each break where a player shows it (from the file's first picture or sound), how long, in which stream, and
      // whether it is big (> 0.5 s: converted, labelled on the timeline) or a small drop (a faint mark)
      breaks.sort((a,b)=>a.at-b.at||(a.stream<b.stream?-1:1));
      const gaps=breaks.map(b=>({stream:b.stream,at:Math.max(0,b.at-start),len:b.len,big:ms(b.len)>ms(BIG_GAP)}));
      // the clock jumps both streams share: each video break with the audio breaks that overlap it
      const audio=breaks.filter(b=>b.stream==='audio');
      let run=0,drift=0;
      for(const v of breaks.filter(b=>b.stream==='video')) {
        const paired=audio.filter(a=>a.at<=v.at+v.len && v.at<=a.at+a.len);
        if(!paired.length) continue;
        run+=v.len-paired.reduce((s,a)=>s+a.len,0); drift=Math.max(drift,Math.abs(run));
      }
      const tv=tracks.video,ta=tracks.audio;
      if(tv && ta) drift=Math.max(drift,Math.abs(tv.end-ta.end)-Math.max(tails.get('video').duration,tails.get('audio').duration));
      // why it has to be converted (empty: imported without a question)
      const fix=[];
      if(gaps.some(g=>g.big)) fix.push('break');
      const drifting=ms(drift)>ms(MAX_DRIFT);
      return {start,end,duration,frames:count,tolerance,maxGap,gaps,totals,drift,drifting,fix,tracks,estimatedTail:uncertain,
        rewinds:rewinds.map(r=>({stream:r.stream,at:Math.max(0,r.at-start),back:r.back})),
        declaredDuration:Number.isFinite(declared)&&declared>0?declared:null,
        needsConsent:uncertain || Number.isFinite(declared)&&declared>0&&Math.abs(declared-duration)>tolerance};
    },
  };
}
/* Packet headers only (`-show_entries packet=…`): nothing is decoded, so a 2-hour recording takes seconds, not the
   13 minutes decoding every frame took (VV, 2026-11-04). `onProgress(fraction)` follows the packets' byte position.
   Packets whose bytes are damaged but whose timestamps are fine are not seen here: a conversion decodes the whole
   recording and fails on them (prepare-media.js), and an export stops on them (app.js ExportFrameSource). */
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
module.exports={accumulator,scanReadableRange,MARK,BIG_GAP,MAX_DRIFT};
