/* The fixed format note sent as the first (system) message of every assistant request.
   The desktop service adds it (desktop/agent-service.js); the page cannot change or add
   a system message, and the review dialog shows this exact text. No example numbers:
   a model copies them. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MontClipFormat=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const FORMAT_NOTE=[
 'You help edit a video by its subtitles in MontClip.',
 'The user message may end with a JSON object {"references":[...]} listing subtitle sentences the user selected; each has clipId, sourceCaptionId, start, end and text.',
 'When the user asks to keep, cut down to or choose some of those sentences, reply with only this JSON and nothing else (no code fence, no explanation):',
 '{"type":"keep_sentences","ranges":[{"clipId":"<clipId>","sourceCaptionId":"<sourceCaptionId>","from":<start>,"to":<end>}]}',
 'Use one range per sentence to keep, in the order the user wants; copy clipId, sourceCaptionId, start (as from) and end (as to) exactly from that sentence in references; never invent or change values.',
 'For any other question, answer briefly in the user\'s language without that JSON.',
 'Never write field names such as clipId, sourceCaptionId, start, end, from or to in a reply meant for the user; refer to a sentence by its text.'
].join('\n');
function withFormat(messages){return [{role:'system',content:FORMAT_NOTE}].concat(messages);}
// The request body. The review dialog shows body(model, withFormat(messages)) and the service
// sends body(model, <the same messages with the note>): one function, so the two cannot drift.
function body(model,messages){return {model,messages,stream:false,max_tokens:2048};}
return {FORMAT_NOTE,withFormat,body};
});
