/* What the desktop assistant cannot do, said by the editor itself (JJ via Deja, 2026-11-05). 「剪到 1 分钟以内，发快手和 B 站
   竖屏」: the assistant can only keep parts of the timeline (keep_sentences, keep_ranges — the replies chat-proposal.js
   checks and the plan runs); changing the picture's shape needs fablecut_reframe, which only MCP has. A model reply that
   is an edit is JSON only and cannot say so, so the pane puts the host's own sentence first, above the reply, whenever
   the user's message asks for something in UNSUPPORTED: decided from the message's words, never by the model.
   ASSISTANT is what the assistant can do; a capability listed there is no longer reported as missing. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MontClipLimits=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ASSISTANT=Object.freeze(['keep_sentences','keep_ranges']);
// a vertical or square picture: 竖屏 / 横屏 / 方屏, 9:16 and the like (also with ： or 比), 画面比例, reframe, vertical, portrait,
// aspect ratio; 竖版 / 竖版视频 too
const UNSUPPORTED=Object.freeze([
 Object.freeze({id:'reframe',capability:'fablecut_reframe',
  match:/竖屏|竖版|横屏|方屏|画面比例|改比例|(?:9|16|4|5|1)\s*(?::|：|比)\s*(?:16|9|5|4|1)\b|\breframe|\bvertical\b|\bportrait\b|aspect[ -]ratio/i,key:'limitReframe'}),
]);
/** The things the message asks for that the assistant cannot do: [{id, capability, key}], in UNSUPPORTED's order. */
function unsupported(text,available=ASSISTANT){
 if(typeof text!=='string'||!text)return [];
 return UNSUPPORTED.filter(u=>!available.includes(u.capability)&&u.match.test(text)).map(({id,capability,key})=>({id,capability,key}));
}
/** The host's sentence for a reply to this message (strings: the pane's officialPane_ table, without the prefix), or '' when
 *  nothing is missing. names fills its {placeholders} (the drop-down's names as it shows them: app.js exportFrameNames). */
function note(text,strings,names={}){
 return unsupported(text).map(u=>{
  let key=u.key,values=names;
  if(u.id==='reframe'){
   const ratios=[...new Set([...text.matchAll(/\b(9|16|4|5|1)\s*(?::|：|比)\s*(16|9|5|4|1)\b/g)].map(m=>m[1]+':'+m[2]))];
   const aspect=ratios.length?ratios.length===1?ratios[0]:null:/横屏|\blandscape\b/i.test(text)?'16:9':/方屏|\bsquare\b/i.test(text)?'1:1':/竖屏|竖版|\bvertical\b|\bportrait\b/i.test(text)?'9:16':null;
   const option=names.options?.[aspect]||(aspect==='9:16'?names.option:null);
   key=aspect==='9:16'&&option?'limitReframe':option?'limitReframeAspect':'limitReframeAny';
   values={...names,option};
  }
  return strings&&typeof strings[key]==='string'?strings[key].replace(/\{(\w+)\}/g,(m,k)=>typeof values[k]==='string'?values[k]:m):'';
 }).filter(Boolean).join(' ');
}
/** A reply as the pane shows it: the host's sentence first (when the message asks for something missing), then the reply. */
function shown(text,reply,strings,names){const n=note(text,strings,names);return n?[n,reply]:[reply];}
return {ASSISTANT,UNSUPPORTED,unsupported,note,shown};
});
