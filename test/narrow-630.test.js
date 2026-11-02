/* VV (2026-11-02, 630×452) — three things the window checks (desktop/narrow-630-smoke.cjs) need from the code:
   the caption lane is never left partly behind the sticky ruler; 「引用选中字幕」 with nothing selected says so;
   the AI service settings show the key box and the save button without scrolling. Plus: the model is told not to
   write field names in its replies. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const view=require('../ui-preferences'),F=require('../agent-format');

test('a caption reference with no caption selected gives its own notice',()=>{
 const pane=read('agent-ui/pane.tsx');
 assert.match(pane,/const refs=options\.getReferences\(kind\);if\(!refs\.length&&kind==='captionRef'\)\{setNotice\('noCaptionSelected'\);return;\}/);
 assert.equal(view.text['zh-CN'].officialPane_noCaptionSelected,'先在时间线上选中字幕');
 assert.ok(view.text.en.officialPane_noCaptionSelected);
});

test('the format note asks for replies without field names',()=>{
 assert.match(F.FORMAT_NOTE,/never write field names/i);
 for(const name of ['clipId','sourceCaptionId'])assert.ok(F.FORMAT_NOTE.includes(name),'the note names the fields it means');
});

test('with the settings open in a short pane, the settings get the room (thread, references and composer step aside)',()=>{
 const pane=read('agent-ui/pane.tsx'),css=read('style.css');
 assert.match(pane,/<div className=\{"cindy-port"\+\(compact\?" compact":""\)\+\(configOpen\?" config-open":""\)\}/);
 assert.match(css,/\.cindy-port\.compact\.config-open > :is\(\.cindy-thread,\.cindy-ref-actions,\.cindy-references,\.cindy-composer,\.cindy-proposal-actions\) \{display:none;\}/);
 assert.match(css,/\.cindy-port\.compact\.config-open > \.cindy-config \{max-height:none;flex:1 1 auto;min-height:0;\}/);
});

test('the caption lane above is folded with a hint instead of being left behind the ruler',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.match(html,/<button type="button" class="btn tiny tracks-above" id="btnTracksAbove" hidden><\/button>/);
 assert.match(app,/syncTimelineTrackView\.folded/);
 assert.match(read('ui-preferences.js'),/"tl-above-captions": \["Captions above", "字幕轨在上方"\]/);
});

// VV (85f66ea, real window 630×460): the hint stayed on screen after a click (hidden lost to .btn's display), and the
// open settings were 108 px with the key box below the fold. The smoke now sizes the page itself to 630×460.
test('a hidden hint is off screen, and compact settings use small labels and fields',()=>{
 const css=read('style.css');
 assert.match(css,/#btnTracksAbove\[hidden\] \{display:none;\}/);
 assert.match(css,/#mcAgentContent \.cindy-port\.compact\.config-open > \.cindy-config label \{font-size:10px;line-height:12px;gap:1px;\}/);
 assert.match(css,/#mcAgentContent \.cindy-port\.compact\.config-open > \.cindy-config :is\(select,input\) \{height:24px;min-height:24px;/);
});
