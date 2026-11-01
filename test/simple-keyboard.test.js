"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict"), vm=require("node:vm");
const {SRC}=require("./timeline-sandbox");
const View=require("../ui-preferences");
const start=SRC.indexOf('window.addEventListener("keydown", (e) => {\n  const k = e.key;');
const end=SRC.indexOf('window.addEventListener("resize",',start);
assert.ok(start>=0 && end>start);
const cases=[
  ["t",{altKey:true},"addTransitionAtPlayhead"], ["T",{altKey:true,shiftKey:true},"addTransitionAtPlayhead"],
  ["E",{shiftKey:true},"toggleClipsDisabled"], ["D",{shiftKey:true},"crossfadeSelected"],
  ["l",{ctrlKey:true},"toggleLinkSelected"], ["L",{metaKey:true},"toggleLinkSelected"],
  ["[",{},"trimToPlayhead"], ["]",{altKey:true},"trimToPlayhead"],
  ...["b","r","y","u"].map(k=>[k,{},"setEditTool"]),
  ["z",{code:"KeyZ",altKey:true},"zoomToWorkArea"],
];
function world(mode="simple",typing=false,dialog=false) {
  const calls=[]; let handler;
  const names=[...cases.map(c=>c[2]),"shuttle","undo","redo","zoomToSelection","zoomToFit","goToKeyframe","deleteSelected","toggleTransportPlay","transportStop","setPreviewRate","setTime","gotoTransportHome","gotoTransportEnd","goToEditPoint","splitAtPlayhead","setZoom","setSelection","selectClip","saveVersionNow","openProjects","beginTcEntry"];
  const env={MontClipView:View,mcView:{get:()=>({mode})},runtime:{},state:{time:2,pps:20},project:{clips:[]},
    document:{activeElement:{},querySelector:()=>dialog},isTypingTarget:()=>typing,
    window:{addEventListener:(_name,fn)=>{handler=fn;}},clearFocusedTransition:()=>false,
    $:id=>({classList:{contains:()=>id!=="btnProjectsDash"}}),els:{},projectFps:()=>30,isSourceMode:()=>false,
    EDIT_TOOLS:{select:{key:"V"},ripple:{key:"B"},roll:{key:"R"},slip:{key:"Y"},slide:{key:"U"}}};
  for(const name of names) env[name]=(...args)=>calls.push([name,...args]);
  vm.runInNewContext(SRC.slice(start,end),env);
  return {calls,key(key,extra={}){const e={key,preventDefault(){this.defaultPrevented=true;},...extra};handler(e);return e;}};
}
test("production keyboard dispatch blocks advanced combinations only in simple mode",()=>{
  for(const [key,mods,action] of cases) {
    const simple=world();simple.key(key,mods);assert.deepEqual(simple.calls,[],JSON.stringify([key,mods]));
    const advanced=world("advanced");advanced.key(key,mods);assert.equal(advanced.calls[0]?.[0],action,JSON.stringify([key,mods]));
    for(const [typing,dialog,extra] of [[true,false,{}],[false,true,{}],[false,false,{isComposing:true}],[false,false,{keyCode:229}]]) {
      const w=world("simple",typing,dialog);assert.equal(w.key(key,{...mods,...extra}).defaultPrevented,undefined);assert.deepEqual(w.calls,[]);
    }
  }
});
test("production simple dispatch preserves neighboring transport undo zoom and navigation",()=>{
  for(const [key,mods,action] of [
    ["l",{},"shuttle"],["L",{shiftKey:true},"shuttle"], ["z",{ctrlKey:true},"undo"],
    ["j",{},"shuttle"],["k",{},"transportStop"], ["s",{ctrlKey:true},"saveVersionNow"],["o",{ctrlKey:true},"openProjects"],
    ["Z",{ctrlKey:true,shiftKey:true},"redo"],["y",{ctrlKey:true},"redo"],
    ["z",{code:"KeyZ"},"zoomToSelection"],["Z",{code:"KeyZ",shiftKey:true},"zoomToFit"],
    ["ArrowLeft",{ctrlKey:true},"goToKeyframe"],["ArrowRight",{ctrlKey:true},"goToKeyframe"],
    ["Delete",{},"deleteSelected"],[" ",{},"toggleTransportPlay"],["s",{},"splitAtPlayhead"],
    ["Home",{},"gotoTransportHome"],["End",{},"gotoTransportEnd"],["ArrowUp",{},"goToEditPoint"],
    ["ArrowDown",{},"goToEditPoint"],["ArrowLeft",{},"setTime"],["ArrowRight",{shiftKey:true},"setTime"],
    ["+",{},"setZoom"],["-",{},"setZoom"],["0",{},"beginTcEntry"],["a",{ctrlKey:true},"setSelection"],["Escape",{},"selectClip"],
  ]) {const w=world();w.key(key,mods);assert.equal(w.calls[0]?.[0],action,JSON.stringify([key,mods]));}
});
test("actual mode update returns every advanced tool to selection without editing data",()=>{
  const toolStart=SRC.indexOf("const EDIT_TOOLS = {");
  const toolEnd=SRC.indexOf('document.querySelectorAll("[data-edit-tool]").forEach',toolStart);
  const updateStart=SRC.indexOf("function updateMontClipView(patch)");
  const updateEnd=SRC.indexOf('document.getElementById("mcMode").addEventListener',updateStart);
  assert.ok(toolStart>=0 && toolEnd>toolStart && updateStart>=0 && updateEnd>updateStart);
  const pref=View.create({getItem:()=>null,setItem(){}}), state={tool:"select",selIds:new Set(["one"])},project={clips:[{id:"one",linkGroup:"unchanged"}]},history=["keep"];
  const nodes=["select","ripple","roll","slip","slide"].map(name=>({dataset:{editTool:name},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}}));
  const env={mcView:pref,state,project,history,renderMontClipView(){},toast(){},document:{querySelectorAll:()=>nodes},els:{tracksContent:{dataset:{}}}};
  vm.createContext(env);vm.runInContext(SRC.slice(toolStart,toolEnd)+SRC.slice(updateStart,updateEnd),env);
  const snapshot=()=>JSON.stringify({project,history,selection:[...state.selIds]});
  for(const tool of ["ripple","roll","slip","slide"]) {
    pref.set({mode:"advanced"});env.setEditTool(tool);assert.equal(state.tool,tool);
    const before=snapshot();env.updateMontClipView({mode:"simple"});env.setEditTool(tool);
    assert.equal(state.tool,"select");assert.equal(env.els.tracksContent.dataset.tool,"select");assert.equal(nodes[0]["aria-pressed"],"true");assert.equal(snapshot(),before);
    env.updateMontClipView({mode:"advanced"});assert.equal(state.tool,"select");
  }
});
