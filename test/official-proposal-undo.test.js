'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function fn(name){const start=source.indexOf('function '+name+'(');a.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);}
test('card undo identifies only its own top shared history record, including redo',()=>{
 const result={},applications=new WeakMap(),ctx={project:{clips:[],markers:[],comps:[]},runtime:{undo:[],redo:[]},officialProposalApplications:applications,agentProjectContext:()=>({projectId:'p',sequenceId:'s',gen:1}),pruneSelection(){},scheduleSave(){},renderInspector(){},toast(){},isOutsideStep:()=>false};
 vm.createContext(ctx);vm.runInContext(['undoSnapshot','counterSnapshot','undo','redo','canUndoOfficialProposal'].map(fn).join('\n')+'\nfunction restoreSnapshot(s){project.clips=JSON.parse(s).clips;}',ctx);
 a.equal(ctx.canUndoOfficialProposal(result),false);
 applications.set(result,{token:'apply-1',projectId:'p',sequenceId:'s',gen:1});ctx.runtime.undo.push(JSON.stringify({clips:[],markers:[],comps:[],rangeState:{},agentApplyId:'apply-1'}));ctx.project.clips=[{id:'applied'}];a.equal(ctx.canUndoOfficialProposal(result),true);
 ctx.runtime.undo.push(JSON.stringify({clips:ctx.project.clips}));a.equal(ctx.canUndoOfficialProposal(result),false);ctx.runtime.undo.pop();ctx.undo();a.equal(ctx.canUndoOfficialProposal(result),false);ctx.redo();a.equal(ctx.canUndoOfficialProposal(result),true);a.equal(ctx.project.clips[0].id,'applied');ctx.agentProjectContext=()=>({projectId:'other',sequenceId:'s',gen:1});a.equal(ctx.canUndoOfficialProposal(result),false);
});
