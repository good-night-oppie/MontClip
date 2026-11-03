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
 // the plan's steps (P4, second half) ask the same way: two answers, each the box's answer to its ticket
 a.equal((app.match(/montclipAgentPolicy\.answer\(/g)||[]).length,2);
 a.equal((app.match(/montclipAgentPolicy\.answer\(\{ticket:d\.ticket,choice\}\)/g)||[]).length,2);
 // a plan step also passes its args: the main process reads them only for a risk that depends on them (Capabilities.riskOf,
 // e.g. a web address for fablecut_import_media is blocked) — never for an approval (plan-steps, Deja 2026-11-03)
 a.match(app,/window\.montclipAgentPolicy\.decide\(\{sessionId:result\.sessionId,capability:s\.capability,args:s\.args,target:\{kind:'project',value:runtime\.projectId\}\}\)/);
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

test('JJ’s final words (5d360cd7) for the changed lines; the Yolo box follows the interface language',()=>{
 const T=(l,k)=>View.text[l]['officialPane_'+k];
 a.equal(T('zh-CN','modeManualTip'),'改项目前先问你；撤不回的每次都问');
 a.equal(T('en','modeManualTip'),"Asks before changing the project; asks every time for anything that can't be undone");
 a.equal(t('zh-CN','own.ap-refused-mode'),'助手现在没有选模式，所以什么都没做。请在助手顶部选一种模式。');
 // shown when the main process refused the switch or the channel failed (the switch exists in the desktop app only)
 a.equal(T('zh-CN','modeUnavailable'),'这次没换成，模式还是原来那个。关掉 MontClip 再打开，再试一次。');
 a.equal(T('en','modeUnavailable'),"The mode didn't change; it's still the one it was. Close MontClip, open it again and try once more.");
 a.equal(T('zh-CN','modeYolo'),'Yolo','the owner’s own name for it');
 const {yoloText}=require('../desktop/agent-mode-text');
 a.deepEqual(yoloText('zh-CN').buttons,['取消','打开 Yolo']);a.deepEqual(yoloText('en').buttons,['Cancel','Turn on Yolo']);
 a.match(read('desktop/main.js'),/const t = yoloText\(languageOf\(settings\.get\(\)\)\);/,'the box takes the interface language');
});

test('the approval box is centred over a dimmed page (the page resets every margin to 0)',()=>{
 const css=read('style.css');
 a.match(css,/^\* \{[^}]*margin: 0;/m);
 a.match(css,/\.agent-approval \{ margin: auto; \}/);a.match(css,/\.agent-approval::backdrop \{ background: #0009; \}/);
});
