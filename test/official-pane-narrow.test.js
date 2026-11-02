'use strict';
// VV 630x452 real-window findings: references must sit beside the composer (not in
// the message scroller), notes/session list fold into “More”, and a default project
// whose id has not been assigned yet must get one through the existing project
// adoption path before references or sending, with no file dialog.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8'),pane=fs.readFileSync(require.resolve('../agent-ui/pane.tsx'),'utf8');
function fn(name){const start=app.indexOf('async function '+name+'(');a.ok(start>=0,name+' missing');return app.slice(start,app.indexOf('\n}',start)+2);}
function element(src,open){const i=src.indexOf(open);a.ok(i>=0,open+' missing');return i;}

test('a default project without an id adopts one through flushSave + pjLoad, never a dialog',async()=>{
 const calls=[],ctx={runtime:{projectId:null},flushSave:async()=>{calls.push('flush');return true;},pjLoad:async()=>{calls.push('load');ctx.runtime.projectId='p_new';}};
 vm.createContext(ctx);vm.runInContext(fn('ensureAgentProject'),ctx);
 a.equal(await ctx.ensureAgentProject(),true);a.deepEqual(calls,['flush','load']);
 calls.length=0;a.equal(await ctx.ensureAgentProject(),true);a.deepEqual(calls,[],'an existing id is used as is');
 ctx.runtime.projectId=null;ctx.flushSave=async()=>{calls.push('flush');return false;};
 a.equal(await ctx.ensureAgentProject(),false);a.deepEqual(calls,['flush'],'an unsaved edit is never replaced by a reload');
 ctx.runtime.projectId='?';ctx.flushSave=async()=>true;ctx.pjLoad=async()=>{};a.equal(await ctx.ensureAgentProject(),false,'a pending switch is not an id');
 a.ok(!/showSaveDialog|showOpenDialog|prompt\(/.test(fn('ensureAgentProject')));
 a.ok(app.includes('ensureProject:ensureAgentProject'),'pane receives the existing adoption path');
});

test('send and reference buttons ensure the project id before using it',()=>{
 a.match(pane,/const showReview=async\(\)=>\{[^]*?await options\.ensureProject\?\.\(\)[^]*?conversation\.prepare\(\)/);
 a.match(pane,/data-reference-actions[^]*?await options\.ensureProject\?\.\(\)[^]*?options\.getReferences\(kind\)/);
});

test('reference buttons leave the message scroller; notes and sessions fold into More',()=>{
 const thread=element(pane,'className="cindy-thread"'),threadEnd=pane.indexOf('</div>\n',pane.indexOf('role="log"'));
 const refs=element(pane,'data-reference-actions'),composer=element(pane,'<ComposerCard');
 a.ok(refs>threadEnd&&refs<composer,'reference actions sit after the thread, beside the composer');
 const more=element(pane,'className="cindy-more"'),moreEnd=pane.indexOf('</details>',more);
 for(const part of ['type="search"','state.list(query)','t.local','t.formatTitle'])a.ok(pane.indexOf(part)>more&&pane.indexOf(part)<moreEnd,part+' belongs in More');
 a.ok(!pane.slice(thread,threadEnd).includes('getReferences'),'no reference button inside the scroller');
 a.ok(pane.slice(more,more+300).includes('compact'),'More starts folded on short panes');
 for(const l of ['zh-CN','en'])a.ok(require('../ui-preferences').text[l].officialPane_more);
});
