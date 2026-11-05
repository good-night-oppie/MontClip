/* What the assistant may know about the open timeline: numbers and clip ids only (Deja, 2026-11-03).
   No file names or paths, no caption or danmaku text, no picture or sound. Sent with every request, next to the
   user's references, and shown in full in the review before anything is sent.
   clips      — each shot (a video clip, or an audio clip that is not the sound of a video): its media length and the
                part of the media it shows, in source seconds; where it starts on the timeline.
   highlights — highlight candidates already found in this session, moved to source seconds of the clip they fall in.
   singing    — the parts that may be singing (JJ via Deja, 2026-11-05): the songs the 「✨ 自动出切片」 「唱歌」 scan found
                (songs.js, /api/songs), inside the part each clip shows, as {clipId, from, to} in source seconds. Only for
                recordings already scanned; nothing else about a song (its marks, its confidence) is sent.
   loudness   — how loud each clip is, one 0–100 value a second (the server's RMS levels, signals.js, every 0.5 s, joined
                by power to whole seconds): 0 is −60 dBFS or quieter, 100 is full scale. When the clips together are longer
                than the cap (capabilities.js FACTS.loudnessValues), each value covers `step` seconds instead, the same
                step for every clip, so the total fits. {clipId, from, step, values}: value i covers from + i·step.
   Neither carries the sound itself. Over a cap (capabilities.js FACTS) build() refuses with FACTS_LIMIT. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./captions'),()=>require('./capabilities'));else root.MontClipFacts=factory(root.MontClipCaptions,()=>root.MontClipCapabilities);})(typeof globalThis!=='undefined'?globalThis:this,function(C,Caps){
'use strict';
const MAX_CLIPS=30,MAX_HIGHLIGHTS=12;
const r2=x=>Math.round(x*100)/100;
// a clip is named by its id only when that is a short id (the proposals' own rule): an id that is a path or a file name
// is not sent — the clip is left out (the review box says no file names are sent; JJ / Deja, 2026-11-03), and the box
// says how many were left out (omitted), so none vanishes silently
const SHORT_ID=/^[A-Za-z0-9_-]{1,128}$/;
const shortId=id=>typeof id==='string'&&SHORT_ID.test(id);
// the clips that would be sent, whatever their id
function candidates(doc){
 const off=new Set(doc.disabledTracks||[]),media=new Map((doc.media||[]).map(m=>[m.id,m]));
 const videoGroups=new Set(doc.clips.filter(c=>c.kind==='video'&&c.linkGroup).map(c=>c.linkGroup));
 return doc.clips.filter(c=>(c.kind==='video'||c.kind==='audio'&&!(c.linkGroup&&videoGroups.has(c.linkGroup)))&&!C.isCaption(c)&&!c.disabled&&!off.has(c.track)
  &&!c.keyframes?.speed?.length&&Number.isFinite(media.get(c.mediaId)?.duration));
}
/** How many clips were left out of the facts because their id is not a short id. Shown in the review box, never sent. */
function omitted(doc){return candidates(doc).filter(c=>!shortId(c.id)).length;}
function shots(doc){
 const media=new Map((doc.media||[]).map(m=>[m.id,m]));
 return candidates(doc).filter(c=>shortId(c.id))
  .sort((a,b)=>a.start-b.start||String(a.track).localeCompare(String(b.track)))
  .map(c=>{const speed=Number.isFinite(c.props?.speed)&&c.props.speed>0?c.props.speed:1,inPoint=c.in||0;
   return {clip:c,speed,inPoint,entry:{clipId:c.id,kind:c.kind,mediaDuration:r2(media.get(c.mediaId).duration),from:r2(inPoint),to:r2(inPoint+c.duration*speed),start:r2(c.start)}};});
}
/** A timeline span → source seconds of the shot it lies in (video first), or null when it crosses a cut. */
function toSource(list,from,to){
 const hit=list.filter(s=>from>=s.clip.start-1e-6&&to<=s.clip.start+s.clip.duration+1e-6).sort((a,b)=>(a.clip.kind==='video'?0:1)-(b.clip.kind==='video'?0:1))[0];
 if(!hit)return null;
 const m=t=>r2(hit.inPoint+(t-hit.clip.start)*hit.speed);
 return {clipId:hit.clip.id,from:m(from),to:m(to)};
}
const FLOOR_DB=-60;
/** A dBFS level → 0–100: 0 at FLOOR_DB or quieter, 100 at full scale. */
const level=db=>Math.max(0,Math.min(100,Math.round((db-FLOOR_DB)/-FLOOR_DB*100)));
/** The power mean of the 0.5 s levels (dBFS) in [from, to) seconds of the file; null when none was read there. */
function meanDb(values,step,from,to){
 let acc=0,n=0;
 for(let i=Math.max(0,Math.floor(from/step+1e-9));i<values.length&&i*step<to-1e-9;i++){const v=values[i];if(typeof v==='number'&&Number.isFinite(v)){acc+=Math.pow(10,v/10);n++;}}
 return n?10*Math.log10(acc/n):null;
}
const usable=s=>s&&Number.isFinite(s.step)&&s.step>0&&Array.isArray(s.values);
/** The loudness entries: one step for every clip, the smallest whole number of seconds whose values fit the cap. */
function loudnessOf(entries,sound,cap){
 const withSound=entries.filter(e=>usable(sound[e.mediaId]?.loudness)&&e.to>e.from);
 if(!withSound.length)return [];
 const count=step=>withSound.reduce((n,e)=>n+Math.ceil((e.to-e.from)/step-1e-9),0);
 let step=Math.max(1,Math.ceil(withSound.reduce((n,e)=>n+e.to-e.from,0)/cap));
 while(count(step)>cap)step++;
 return withSound.map(e=>{const L=sound[e.mediaId].loudness,values=[];
  for(let t=e.from;t<e.to-1e-9;t+=step){const db=meanDb(L.values,L.step,t,Math.min(e.to,t+step));if(db===null)break;values.push(level(db));}
  return {clipId:e.clipId,from:e.from,step,values};}).filter(e=>e.values.length);
}
/** The parts that may be singing, inside the part each clip shows (source seconds), in clip order. */
function singingOf(entries,sound){
 const out=[];
 for(const e of entries){const songs=sound[e.mediaId]?.songs;if(!Array.isArray(songs))continue;
  for(const s of songs){if(!s||!Number.isFinite(s.from)||!Number.isFinite(s.to))continue;const from=Math.max(e.from,s.from),to=Math.min(e.to,s.to);if(to-from>=0.5)out.push({clipId:e.clipId,from:r2(from),to:r2(to)});}}
 return out;
}
/** Throws FACTS_LIMIT when the facts carry more than capabilities.js allows (refused, never cut down). */
function check(facts,caps=Caps().FACTS){
 const values=(facts.loudness||[]).reduce((n,e)=>n+e.values.length,0);
 if((facts.singing||[]).length>caps.singingParts||values>caps.loudnessValues)throw Error('FACTS_LIMIT');
 return facts;
}
/** sound: {[mediaId]: {loudness: {step, values: dBFS[]}, songs: [{from, to}] | null}} — what the server has for each file. */
function build(doc,{highlights=[],sound=null}={}){
 const list=shots(doc),sent=list.slice(0,MAX_CLIPS),out={clips:sent.map(s=>s.entry)};
 const hl=highlights.filter(h=>Number.isFinite(h.from)&&Number.isFinite(h.to)&&h.to>h.from).slice(0,MAX_HIGHLIGHTS)
  .map(h=>{const s=toSource(list,h.from,h.to);return s&&{...s,score:Number.isFinite(h.score)?r2(h.score):null};}).filter(Boolean);
 if(hl.length)out.highlights=hl;
 if(sound&&typeof sound==='object'){
  const entries=sent.map(s=>({clipId:s.entry.clipId,mediaId:s.clip.mediaId,from:s.entry.from,to:s.entry.to})),caps=Caps().FACTS;
  const singing=singingOf(entries,sound),loudness=loudnessOf(entries,sound,caps.loudnessValues);
  if(singing.length)out.singing=singing;
  if(loudness.length)out.loudness=loudness;
 }
 return check(out);
}
/** The media whose sound numbers build() would use (the clips it sends): [{mediaId, src}]. */
function soundMedia(doc){
 const media=new Map((doc.media||[]).map(m=>[m.id,m])),seen=new Set(),out=[];
 for(const s of shots(doc).slice(0,MAX_CLIPS)){const m=media.get(s.clip.mediaId);if(m&&typeof m.src==='string'&&!seen.has(m.id)){seen.add(m.id);out.push({mediaId:m.id,src:m.src});}}
 return out;
}
return {build,check,omitted,soundMedia,level,SHORT_ID};
});
