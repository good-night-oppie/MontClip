'use strict';
// Offline planning only. No imports from the editor/server and no media IO.
// Exact integer ticks in one declared source presentation clock, NOT packet DTS.
const MAX_UNITS = 100000;
function planSegments(input) {
  const no = reason => ({ok:false, executable:false, reason});
  if (!input || typeof input.sourceId !== 'string' || !input.sourceId || input.sourceId.length>256 ||
      !/^[a-f0-9]{64}$/i.test(input.sourceHash || '') ||
      !Number.isSafeInteger(input.ticksPerSecond) || input.ticksPerSecond<=0) return no('INVALID_SOURCE');
  function coverage(units) {
    if (!Array.isArray(units) || !units.length || units.length>MAX_UNITS) throw 'UNLOCATABLE_UNITS';
    const ids=new Set();
    const sorted=units.map(u=>{
      if (!u || typeof u.id!=='string' || !u.id || u.id.length>256 || ids.has(u.id) ||
          !Number.isSafeInteger(u.pts) || !Number.isSafeInteger(u.duration) || u.duration<=0 ||
          !Number.isSafeInteger(u.pts+u.duration)) throw 'INVALID_UNIT';
      ids.add(u.id); return {id:u.id,start:u.pts,end:u.pts+u.duration};
    }).sort((a,b)=>a.start-b.start);
    const spans=[];
    for (const u of sorted) {
      const last=spans[spans.length-1];
      if (last && u.start<last.end) throw 'OVERLAPPING_UNITS';
      if (last && u.start===last.end) {last.end=u.end;last.ids.push(u.id);}
      else spans.push({start:u.start,end:u.end,ids:[u.id]});
    }
    return spans;
  }
  try {
    const video=coverage(input.video),audio=coverage(input.audio);
    // Intersection alone would silently discard unmatched AV or cut a unit.
    // Refuse until a separate boundary-preservation proof exists.
    if (video.length!==audio.length || video.some((v,i)=>v.start!==audio[i].start || v.end!==audio[i].end))
      return no('UNMATCHED_AV_COVERAGE');
    const segments=video.map((v,i)=>({sourceStart:v.start,sourceEnd:v.end,
      localStart:0,localEnd:v.end-v.start,videoIds:v.ids,audioIds:audio[i].ids}));
    if (segments.some(s=>!Number.isSafeInteger(s.localEnd))) return no('UNSAFE_SPAN');
    const gaps=segments.slice(1).map((s,i)=>({start:segments[i].sourceEnd,end:s.sourceStart,duration:s.sourceStart-segments[i].sourceEnd}));
    if (gaps.some(g=>!Number.isSafeInteger(g.duration))) return no('UNSAFE_SPAN');
    return {ok:true,executable:false,sourceId:input.sourceId,sourceHash:input.sourceHash,
      ticksPerSecond:input.ticksPerSecond,clock:'source-presentation',segments,gaps,
      mappingStatus:'planned-local-clock-only'};
  } catch (reason) {return no(reason);}
}
module.exports={planSegments};
