/* What the desktop assistant cannot do, said by the editor itself (JJ via Deja, 2026-11-05). A model reply that is an edit is
   JSON only and cannot say so, so the pane puts the host's own sentence first, above the reply, whenever the user's message
   asks for something in UNSUPPORTED: decided from the message's words, never by the model.
   ASSISTANT is what the assistant can do; a capability listed there is no longer reported as missing.
   Since #175 the assistant makes a 9:16, 1:1 or 4:5 copy of the sequence itself (chat-proposal.js ASPECTS). Another shape
   (16:9, 5:4, 横屏 / landscape) it cannot make, so a message that asks only for one of those still gets the manual way first
   (Deja, 2026-11-06). A message that also names a shape it can make (「把 16:9 改成 9:16」, 「横屏转竖屏」) does not. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MontClipLimits=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// reframe: the assistant's own (chat-proposal.js, Deja 2026-11-05), for the shapes in MADE only
const ASSISTANT=Object.freeze(['keep_sentences','keep_ranges','reframe']);
const MADE=Object.freeze(['9:16','1:1','4:5']);     // chat-proposal.js ASPECTS
// An aspect ratio is one of 9:16 16:9 1:1 4:5 5:4 (with :, ： or 比), never part of a longer number or time: 「把 4:16 到 5:30
// 剪掉」, 「从 05:16 开始」, 「删掉 11:16 那句」, 19:16, 9:160 and 1:1:1 are not (QQ, review of #172 at 663bdf8e). Group 1 is the
// ratio. No lookbehind (older Safari): the character before is matched instead.
const SEP='\\s*(?::|：|比)\\s*';
const RATIO_SRC='(?:^|[^\\d.:：比])((?:9'+SEP+'16|16'+SEP+'9|1'+SEP+'1|4'+SEP+'5|5'+SEP+'4))(?!\\d|\\.\\d|'+SEP+'\\d)';
const LANDSCAPE=/横屏|横版|\blandscape\b/i, MADE_WORDS=/竖屏|竖版|方屏|\bvertical\b|\bportrait\b|\bsquare\b/i;
/** The shapes the message names: ratios as 'w:h', plus '16:9' for 横屏 / landscape. */
function shapes(text){
 const r=[...text.matchAll(new RegExp(RATIO_SRC,'g'))].map(m=>m[1].match(/\d+/g).join(':'));
 if(LANDSCAPE.test(text))r.push('16:9');
 return [...new Set(r)];
}
/** The shapes it asks for that the assistant can't make — none when it also names one the assistant can make. */
function unmade(text){
 const s=shapes(text);
 if(s.some(a=>MADE.includes(a))||MADE_WORDS.test(text))return [];
 return s.filter(a=>!MADE.includes(a));
}
// {id, capability, test, key}: what a message asks for that the assistant can't do, and the pane string that says so
const UNSUPPORTED=Object.freeze([
 Object.freeze({id:'reframe-aspect',capability:'reframe-other-aspect',test:t=>unmade(t).length>0,key:'limitReframeAspect'}),
]);
/** The things the message asks for that the assistant cannot do: [{id, capability, key}], in UNSUPPORTED's order. */
function unsupported(text,available=ASSISTANT){
 if(typeof text!=='string'||!text)return [];
 return UNSUPPORTED.filter(u=>!available.includes(u.capability)&&u.test(text)).map(({id,capability,key})=>({id,capability,key}));
}
/** The host's sentence for a reply to this message (strings: the pane's officialPane_ table, without the prefix), or '' when
 *  nothing is missing. names fills its {placeholders} (the drop-down's names as it shows them: app.js exportFrameNames). */
function note(text,strings,names={}){
 return unsupported(text).map(u=>{
  let key=u.key,values=names;
  if(u.id==='reframe-aspect'){
   const s=unmade(text),option=s.length===1?names.options?.[s[0]]||null:null;   // 5:4 is not in the drop-down
   key=option?'limitReframeAspect':'limitReframeAny';
   values={...names,option};
  }
  return strings&&typeof strings[key]==='string'?strings[key].replace(/\{(\w+)\}/g,(m,k)=>typeof values[k]==='string'?values[k]:m):'';
 }).filter(Boolean).join(' ');
}
/** A reply as the pane shows it: the host's sentence first (when the message asks for something missing), then the reply. */
function shown(text,reply,strings,names){const n=note(text,strings,names);return n?[n,reply]:[reply];}
return {ASSISTANT,MADE,UNSUPPORTED,unsupported,note,shown,shapes};
});
