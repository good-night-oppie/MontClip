'use strict';
// The review before anything goes out is right from its first frame (Deja, 2026-11-04; seen in the Meta hackathon
// recording: the box opened a microtask after setReview, before React had put the review in it, and its first frame read
// "0 quoted subtitles, 0 earlier messages" with no messages listed). The box now opens in a layout effect once the review
// is committed. In the real window: desktop/review-count-smoke.cjs (REVIEW_COUNT_PASS reads the box at the moment it opens).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const V=require('../shared/ui-preferences');

test('the review box opens only after its review is rendered, never a microtask after setReview',()=>{
 const pane=read('agent-ui/pane.tsx');
 a.ok(!/queueMicrotask\(\(\)=>dialog\.current\?\.showModal\(\)\)/.test(pane),'no early open');
 a.match(pane,/useLayoutEffect\(\(\)=>\{if\(review&&dialog\.current&&!dialog\.current\.open\)dialog\.current\.showModal\(\);\},\[review\]\);/);
 // The data-notice dialog may open in a microtask; verify the review's committed-state effect specifically.
 a.match(read('app/cindy-official.js'),/useLayoutEffect\)\(\(\)=>\{([\w$]+)&&([\w$]+)\.current&&!\2\.current\.open&&\2\.current\.showModal\(\)\},\[\1\]\)/,'the bundle opens the review after render');
 a.match(read('desktop/SMOKES.md'),/`review-count-smoke\.cjs` \| `REVIEW_COUNT_PASS`/);
});

test('two quoted subtitles read as 2: "2 quoted subtitles" in English, 「引用的 2 条字幕」 in Chinese',()=>{
 const P=require('../app/agent-pane'),ref=(id,text,start,end)=>({type:'caption',projectId:'p',sequenceId:'main',revision:1,gen:1,clipId:id,sourceCaptionId:id,text,start,end});
 const content='Keep only these two sentences\n\n'+JSON.stringify({references:[ref('c0','Hi, here are three quick editing tips.',0,3),ref('c2','Tip one: cut the pauses.',5,10)],facts:{clips:[]}});
 const n=P.displayMessage(content).references.filter(r=>r.type==='caption').length;a.equal(n,2);
 const say=(l)=>V.text[l].officialPane_reviewSummary.replace('{captions}',String(n)).replace('{history}','0');
 a.match(say('en'),/your message, 2 quoted subtitles, and 0 earlier messages/);
 a.match(say('zh-CN'),/引用的 2 条字幕/);
});
