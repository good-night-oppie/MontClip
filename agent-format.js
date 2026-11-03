/* The fixed format note sent as the first (system) message of every assistant request.
   The desktop service adds it (desktop/agent-service.js); the page cannot change or add
   a system message, and the review dialog shows this exact text. No example numbers:
   a model copies them. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MontClipFormat=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// the plan shape (P4): also shown, as is, in the small print for the technically minded (JJ, 5d360cd7)
const PLAN_LINES=Object.freeze([
 'When the user asks for several such edits in one message, to be done one after another, reply with only this JSON and nothing else:',
 '{"type":"plan","steps":[{"capability":"<keep_sentences, keep_ranges, find_songs, find_highlights or export_files>","args":{<the fields of that reply except type>}}]}',
 'find_songs finds the parts of the recordings on the timeline that are possibly singing (args {}); find_highlights finds the best moments (args {"count":<1 to 20>}). Neither changes the project. In a later keep_ranges step, "ranges":{"$step":<that step\'s number>} uses what it found. export_files exports the clips the plan made (else the whole timeline), each saved where the streamer picks in the system\'s Save window (args {}).',
 'At most 30 steps, in the order to do them; each step is checked against the project as it is when its turn comes. For a single edit, reply with that edit\'s JSON, not a plan.'
]);
const FORMAT_NOTE=[
 'You help edit a video in MontClip.',
 'The user message may end with a JSON object {"references":[...],"facts":{...}}.',
 'references lists subtitle sentences or a time range the user selected; a sentence has clipId, sourceCaptionId, start, end and text.',
 'facts describes the timeline with numbers only: clips (clipId, kind, mediaDuration, from and to = the part of the recording the clip shows, start = where it begins on the timeline) and, when known, highlights (clipId, from, to, score). Their times are seconds of the recording, not of the timeline.',
 'When the user asks to keep, cut down to or choose some of the referenced sentences, reply with only this JSON and nothing else (no code fence, no explanation):',
 '{"type":"keep_sentences","ranges":[{"clipId":"<clipId>","sourceCaptionId":"<sourceCaptionId>","from":<start>,"to":<end>}]}',
 'Use one range per sentence to keep, in the order the user wants; copy clipId, sourceCaptionId, start (as from) and end (as to) exactly from that sentence in references; never invent or change values.',
 'When the user asks to keep parts of the recording by time (a total length, every song, the highlights), reply with only this JSON and nothing else:',
 '{"type":"keep_ranges","output_mode":"<one_file or per_range>","ranges":[{"clipId":"<clipId from facts.clips>","from":<seconds>,"to":<seconds>,"label":"<short name, optional>"}]}',
 'from and to are seconds of that clip\'s recording and must lie inside its from and to in facts; ranges must not overlap; each lasts at least half a second; at most 100 ranges, in the order to keep them.',
 'output_mode one_file joins the ranges into one video; per_range makes each range its own clip and file, named by its label (for example one clip per song).',
 ...PLAN_LINES,
 'For any other question, answer briefly in the user\'s language without JSON.',
 'Never write field names such as clipId, sourceCaptionId, start, end, from, to, output_mode or facts in a reply meant for the user; refer to a sentence by its text and to a part of the recording by its time.'
].join('\n');
function withFormat(messages){return [{role:'system',content:FORMAT_NOTE}].concat(messages);}
// The request body. The review dialog shows body(model, withFormat(messages)) and the service
// sends body(model, <the same messages with the note>): one function, so the two cannot drift.
function body(model,messages){return {model,messages,stream:false,max_tokens:2048};}
return {FORMAT_NOTE,PLAN_LINES,withFormat,body};
});
