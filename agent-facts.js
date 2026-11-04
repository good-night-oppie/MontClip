/* What the assistant may know about the open timeline: numbers and clip ids only (Deja, 2026-11-03).
   No file names or paths, no caption or danmaku text, no picture or sound. Sent with every request, next to the
   user's references, and shown in full in the review before anything is sent.
   clips      — each shot (a video clip, or an audio clip that is not the sound of a video): its media length and the
                part of the media it shows, in source seconds; where it starts on the timeline.
   highlights — highlight candidates already found in this session, moved to source seconds of the clip they fall in.
   Song sections are not sent: projects have no song data yet (finding songs is a later capability). */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./captions'));else root.MontClipFacts=factory(root.MontClipCaptions);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
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
function build(doc,{highlights=[]}={}){
 const list=shots(doc),out={clips:list.slice(0,MAX_CLIPS).map(s=>s.entry)};
 const hl=highlights.filter(h=>Number.isFinite(h.from)&&Number.isFinite(h.to)&&h.to>h.from).slice(0,MAX_HIGHLIGHTS)
  .map(h=>{const s=toSource(list,h.from,h.to);return s&&{...s,score:Number.isFinite(h.score)?r2(h.score):null};}).filter(Boolean);
 if(hl.length)out.highlights=hl;
 return out;
}
return {build,omitted,SHORT_ID};
});
