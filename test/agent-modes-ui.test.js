'use strict';
// P4: how the page and the main process are wired for the permission modes. The behaviour itself is in
// test/agent-policy*.test.js and desktop/agent-modes-smoke.cjs (a mock model in the real page).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const View=require('../ui-preferences');
const t=(l,k,v)=>View.t(l,k,v);

test('the main process keeps the mode in memory: nothing is read from or written to disk, so a restart is 手动',()=>{
 const main=read('desktop/main.js'),host=read('desktop/agent-policy-host.js');
 a.match(main,/require\('\.\/agent-policy-host'\)\.createPolicyHost\(/);
 a.ok(!/fs\.|readFile|writeFile|require\('node:fs'\)/.test(host),'the policy host touches no file');
 a.match(host,/let mode = Policy\.DEFAULT_MODE/);
});

test('four fixed channels, each behind the sender / frame / origin guard; Yolo asks in the main process’s own box',()=>{
 const main=read('desktop/main.js'),preload=read('desktop/view-preload.js');
 for(const op of ['get','setMode','decide','answer']){
  a.match(main,new RegExp("ipcMain\\.handle\\('montclip:policy:"+op+"', \\(event(, \\w+)?\\) => settingsAllowed\\(event, win, origin\\) \\?"));
  a.match(preload,new RegExp("montclip:policy:"+op));
 }
 a.match(main,/dialog\.showMessageBox\(win, \{ type: 'warning', title: t\.title, message: t\.message, detail: t\.detail, buttons: t\.buttons, defaultId: 0, cancelId: 0, noLink: true \}\)/);
 // no channel lets the page set a risk, a list or the network switch
 a.ok(!/montclip:policy:(setRisk|whitelist|blacklist|network)/.test(main+preload));
});

test('the page asks only with the capability and the project: the reply’s words are never passed to decide',()=>{
 const app=read('app.js');
 a.match(app,/window\.montclipAgentPolicy\.decide\(\{sessionId:result\.sessionId,capability:response\.type,target:\{kind:'project',value:runtime\.projectId\}\}\)/);
 // an approval is the host box's answer through its ticket, nothing else
 a.match(app,/window\.montclipAgentPolicy\.answer\(\{ticket:d\.ticket,choice\}\)/);
 a.equal((app.match(/montclipAgentPolicy\.answer\(/g)||[]).length,1);
});

test('the approval box shows the plain sentence and the domain or project, never an internal name',()=>{
 const app=read('app.js');
 a.match(app,/dialog\.querySelector\('\[data-ap-label\]'\)\.textContent=d\.label;/);
 a.ok(!/data-ap-label[^\n]*capability/.test(app));
 a.match(app,/d\.risk==='external'\?uiText\('own\.ap-sends-to',\{domain:d\.target\}\)/);
});

test('自动 / Yolo apply only after a CAS on the project, as one undo step; per_range (exports) always opens the dialog',()=>{
 const app=read('app.js'),i=app.indexOf('async function onAgentReply'),body=app.slice(i,app.indexOf('function canUndoOfficialProposal',i));
 a.match(body,/MontClipProposal\.current\(proposal,projectJSON\(\),/);
 a.match(body,/project\.revision!==result\.context\.revision/);
 a.ok(body.indexOf("outputMode==='per_range'")<body.indexOf('commitRangePlan('),'slices go to the dialog first');
 a.match(body,/if\(step\.version\)await step\.version;/,'the agent version is kept before anything is applied');
});

test('new words, both languages (for JJ)',()=>{
 const keys=['ap-title','ap-project','ap-sends-to','ap-content','ap-every-time','ap-once','ap-session','ap-deny','ap-denied','ap-listed','ap-refused','ap-refused-mode','ap-applied','ap-stale','ap-yolo-on','ap-sum-sentences','ap-sum-ranges','ap-sum-slices','ap-undo','ap-invalid'];
 for(const k of keys){const zh=t('zh-CN','own.'+k),en=t('en','own.'+k);a.ok(zh&&zh!=='own.'+k,k);a.ok(en&&!/[一-鿿]/.test(en),k);}
 a.equal(t('zh-CN','own.ap-once'),'只批准这次');a.equal(t('zh-CN','own.ap-session'),'这个聊天中都批准');a.equal(t('zh-CN','own.ap-deny'),'不同意');
 for(const k of ['modes','modePlan','modeManual','modeAuto','modeYolo','modePlanTip','modeManualTip','modeAutoTip','modeYoloTip','yoloOn','modeDeclined','modeUnavailable'])
  for(const l of ['zh-CN','en'])a.ok(View.text[l]['officialPane_'+k],l+' '+k);
 a.deepEqual(['modePlan','modeManual','modeAuto','modeYolo'].map(k=>View.text['zh-CN']['officialPane_'+k]),['计划','手动','自动','Yolo']);
 const {yoloText}=require('../desktop/agent-mode-text');
 a.deepEqual(yoloText('zh-CN').buttons,['取消','打开 Yolo']);a.deepEqual(yoloText('en').buttons,['Cancel','Turn on Yolo']);
 a.match(yoloText('zh-CN').detail,/重新打开 MontClip 后，会回到「手动」/);
});

test('the switch sits at the top of the assistant; the Yolo mark is in the pane and the top bar',()=>{
 const pane=read('agent-ui/pane.tsx'),html=read('index.html');
 a.ok(pane.indexOf('data-agent-modes')<pane.indexOf('cindy-thread'),'above the thread');
 a.match(pane,/options\.getMode\?\.\(\)==='yolo'&&<p className="agent-yolo-on" role="status" data-yolo-on>/);
 a.match(html,/<span class="mc-yolo-mark" id="mcYoloMark" role="status" hidden data-i18n="own\.ap-yolo-on">/);
 a.match(read('cindy-official.js'),/data-agent-modes/,'the bundle was rebuilt');
});
