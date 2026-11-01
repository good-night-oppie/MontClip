'use strict';
const assert = require('node:assert/strict');
exports.run = async function(win) {
 const evaluate = code => win.webContents.executeJavaScript(code);
 await evaluate(`(async()=>{const end=Date.now()+15000;while(!project?.clips&&Date.now()<end)await new Promise(r=>setTimeout(r,50));})()`);
 const before = await evaluate(`JSON.stringify({project,undo:runtime.undo,redo:runtime.redo,time:state.time,selection:state.selId})`);
 const initial = await evaluate(`mcView.get()`);
 const reopen = process.argv.includes('--view-reopen');
 assert.deepEqual(initial,reopen?{mode:'advanced',language:'en'}:{mode:'simple',language:'zh-CN'});
 await evaluate(`document.querySelector('[data-mc-mode="advanced"]').click();document.getElementById('mcLanguage').value='en';document.getElementById('mcLanguage').dispatchEvent(new Event('change'));true`);
 assert.equal(await evaluate(`JSON.stringify({project,undo:runtime.undo,redo:runtime.redo,time:state.time,selection:state.selId})`),before);
 const layouts=[];
 // Test content widths, including 630 without changing the product minimum size.
 win.setMinimumSize(0,0);
 for(const width of [804,630,1100]) {
  win.setContentSize(width,700);
  await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  for(let attempt=0;attempt<4;attempt++){const actual=await evaluate('innerWidth');if(actual===width)break;const [cw,ch]=win.getContentSize();win.setContentSize(cw+width-actual,ch);await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);}
  const result=await evaluate(`(()=>({width:innerWidth,buttons:['btnExport','mcUndo','mcRedo'].map(id=>{const e=document.getElementById(id),b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,h=document.elementFromPoint(x,y);return{id,x,y,hit:!!h&&(h===e||e.contains(h)),hitId:h?.id||h?.className};})}))()`);
  layouts.push(result);assert.equal(result.width,width);assert.ok(result.buttons.every(b=>b.hit),JSON.stringify(result));
 }
 process.stdout.write('MONTCLIP_VIEW '+JSON.stringify({reopen,initial,final:await evaluate('mcView.get()'),origin:await evaluate('location.origin'),unchanged:true,layouts})+'\n');
};
