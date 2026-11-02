'use strict';
// VV 630x452 real-window findings: references must sit beside the composer (not in
// the message scroller), notes/session list fold into “More”, and a default project
// whose id has not been assigned yet must get one through the existing project
// adoption path before references or sending, with no file dialog.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8'),pane=fs.readFileSync(require.resolve('../agent-ui/pane.tsx'),'utf8');
function fn(name){const start=app.indexOf('async function '+name+'(');a.ok(start>=0,name+' missing');return app.slice(start,app.indexOf('\n}',start)+2);}
function element(src,open){const i=src.indexOf(open);a.ok(i>=0,open+' missing');return i;}

// QQ on a432149: the assistant path must only adopt an id. pjLoad could set "?" and
// force syncFromServer(true), reloading over an edit made while the id was read back.
function world(){
 const calls=[],ctx={calls,runtime:{projectId:null,projectGen:3},project:{name:'p',revision:4,clips:[{id:'c1'}],media:[]},
  SeqLib:{activeId:()=>'main'},seqRoot:()=>({}),projectJSON:()=>JSON.parse(JSON.stringify(ctx.project)),
  flushSave:async()=>{calls.push('flush');return true;},
  pjLoad:async()=>{calls.push('pjLoad');},syncFromServer:()=>{calls.push('reload');},
  mcAgent:{identify:v=>calls.push('identify:'+v.projectId)},disk:null,onList:()=>{},onRead:()=>{}};
 ctx.disk=()=>JSON.parse(JSON.stringify(ctx.project));
 ctx.fetch=async url=>{calls.push('GET '+url.split('?')[0]);
  if(url.startsWith('/api/projects')){ctx.onList();return{ok:true,json:async()=>({active:'p_new'})};}
  const doc=ctx.disk();ctx.onRead();return{ok:true,headers:{get:k=>k==='X-FableCut-Project'?'p_new':null},json:async()=>doc};};
 vm.createContext(ctx);vm.runInContext(fn('ensureAgentProject'),ctx);return ctx;
}
test('a default project without an id adopts the id only, with no dialog and no reload',async()=>{
 const w=world();a.equal(await w.ensureAgentProject(),true);a.equal(w.runtime.projectId,'p_new');
 a.ok(w.calls.includes('identify:p_new'));a.ok(!w.calls.includes('reload')&&!w.calls.includes('pjLoad'),w.calls.join());
 w.calls.length=0;a.equal(await w.ensureAgentProject(),true);a.deepEqual(w.calls,[],'an existing id is used as is');
 a.ok(!/showSaveDialog|showOpenDialog|prompt\(|syncFromServer|pjLoad/.test(fn('ensureAgentProject')));
 a.ok(app.includes('ensureProject:ensureAgentProject'),'pane receives the adoption path');
});
test('an edit made while the id is read back is kept: no adoption, no reload',async()=>{
 const w=world();let disk=null;w.disk=()=>disk||JSON.parse(JSON.stringify(w.project));
 w.onList=()=>{disk=JSON.parse(JSON.stringify(w.project));w.project.clips.push({id:'new-edit'});w.project.revision++;};
 a.equal(await w.ensureAgentProject(),false);a.equal(w.runtime.projectId,null);
 a.ok(w.project.clips.some(c=>c.id==='new-edit'),'the edit is still there');a.ok(!w.calls.includes('reload'),w.calls.join());
});
test('an external write between save and read-back is not loaded over the view',async()=>{
 const w=world();w.disk=()=>({...JSON.parse(JSON.stringify(w.project)),revision:9,clips:[{id:'from-outside'}]});
 a.equal(await w.ensureAgentProject(),false);a.equal(w.runtime.projectId,null);
 a.deepEqual(w.project.clips,[{id:'c1'}]);a.ok(!w.calls.includes('reload'),w.calls.join());
});
test('a pending switch ("?") is never reloaded from the assistant',async()=>{
 const w=world();w.runtime.projectId='?';a.equal(await w.ensureAgentProject(),false);
 a.equal(w.runtime.projectId,'?');a.deepEqual(w.calls,[],'nothing fetched, saved or reloaded');
});
test('when the id cannot be adopted the user is told nothing was lost',()=>{
 const v=require('../ui-preferences').text;a.match(v['zh-CN'].officialPane_projectNotReady,/你的剪辑都还在/);a.match(v.en.officialPane_projectNotReady,/Your edits are still here/);
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

test('VV 630x452: More cannot push the composer out, Esc folds More before hiding, reopen starts folded',()=>{
 const css=fs.readFileSync(require.resolve('../style.css'),'utf8');
 const rule=sel=>css.split(/\r?\n/).filter(l=>l.startsWith(sel+' {')).join(' ');
 a.match(rule('.cindy-more'),/flex:0 1 auto/);a.match(rule('.cindy-more'),/min-height:0/);
 a.match(rule('.cindy-references'),/flex:0 1 auto/);a.match(rule('.cindy-thread'),/min-height:0/);
 a.match(pane,/e\.key==='Escape'[^]*?configOpen\)\{[^]*?\}else if\(more\)\{setMoreOpen\(false\)[^]*?\}else options\.onHide\(\)/);
 a.match(pane,/clientHeight===0\)setMoreOpen\(false\)/,'hidden pane folds More so it reopens folded');
});
