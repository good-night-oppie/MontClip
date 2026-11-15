"use strict";
const {test}=require('node:test'), assert=require('node:assert/strict');
const {accumulator}=require('../server/flv-readable-range');

const streams=[{codec_type:'video',avg_frame_rate:'30/1',time_base:'1/1000'},{codec_type:'audio',sample_rate:'48000',time_base:'1/1000'}];
function range(end,declared) {
  const a=accumulator(streams,declared);
  a.frame('media_type=audio|pts_time=0.046|pkt_duration_time=0.021333');
  a.frame('media_type=video|pts_time=0.067|pkt_duration_time=0.033333');
  a.frame(`media_type=video|pts_time=${end-0.033333}|pkt_duration_time=0.033333`);
  a.frame(`media_type=audio|pts_time=${end-0.021333}|pkt_duration_time=0.021333`);
  return a.finish();
}
test('decoded common-clock span tolerates endpoint quantization but warns on stale duration',()=>{
  const normal=range(60.067,60.067);assert.equal(normal.needsConsent,false);
  assert.equal(normal.start,0.046);assert.equal(normal.end,60.067);
  assert.ok(normal.tolerance<0.11 && normal.tolerance>0.10);
  const partial=range(24.466,60);assert.equal(partial.needsConsent,true);assert.ok(Math.abs(partial.duration-24.42)<1e-9);
  const stale=range(60.067,120);assert.equal(stale.needsConsent,true);
  // The two-second PTS hole is retained in the span, never added to tolerance.
  const hole=range(62.067,60.067);assert.equal(hole.needsConsent,true);assert.ok(hole.duration>62);assert.ok(hole.tolerance<0.11);
});
test('missing terminal duration is disclosed and empty/corrupt decoded input refused',()=>{
  const a=accumulator(streams,1);a.frame('media_type=video|pts_time=0');
  assert.equal(a.finish().estimatedTail,true);assert.equal(a.finish().needsConsent,true);
  const empty=accumulator(streams,60);empty.frame('media_type=video|pts_time=N/A');
  assert.throws(()=>empty.finish(),{code:'FLV_PROBE_FAILED'});
});
test('estimated duration independently requires consent even when numeric span is within tolerance',()=>{
  // Controlled inputs isolate the predicate; these are not QQ's raw probe frames.
  const streams=[{codec_type:'video',avg_frame_rate:'10000/3003',time_base:'1/1000'}];
  const explicit=accumulator(streams,0.3),estimated=accumulator(streams,0.3);
  explicit.frame('media_type=video|pts_time=0|duration_time=0.3003');
  estimated.frame('media_type=video|pts_time=0');
  const a=explicit.finish(),b=estimated.finish();
  assert.ok(Math.abs(a.duration-b.duration)<1e-12);
  assert.ok(Math.abs(b.duration-0.3)<b.tolerance);
  assert.equal(a.needsConsent,false);assert.equal(a.estimatedTail,false);
  assert.equal(b.needsConsent,true);assert.equal(b.estimatedTail,true);
});
