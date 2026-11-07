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
 // the plan's steps (P4, second half), the reframe reply (test/agent-reframe.test.js) and the agent's lyrics card
 // (fablecut_lyrics_apply) ask the same way: four answers, each the answer to its own ticket
 a.equal((app.match(/montclipAgentPolicy\.answer\(/g)||[]).length,4);
 a.equal((app.match(/montclipAgentPolicy\.answer\(\{ticket:d\.ticket,choice\}\)/g)||[]).length,4);
 a.match(app,/window\.montclipAgentPolicy\.decide\(\{sessionId:result\.sessionId,capability:s\.capability,target:\{kind:'project',value:runtime\.projectId\}\}\)/);
});

test('the approval card shows the plain sentence and the domain or project, never an internal name', () => {
 const Approval=require('../agent-approval'),cards=Approval.create(),result={};
 void cards.ask({ticket:'t',label:'保留几段',risk:'project',choices:['once','session','deny']},{result});
 void cards.ask({ticket:'u',label:'发给 AI',risk:'external',target:'openrouter.ai',choices:['once','deny']},{result,content:'原文'});
 const say=(k,v)=>t('zh-CN',k,v),[c1,c2]=cards.view(result,say,'今晚');
 a.equal(c1.first,'保留几段');a.deepEqual(c1.more,[],'v7.2: what changes and the buttons; the project is the open one');
 a.equal(c2.first,'发给 AI');a.ok(c2.more.includes('发往：openrouter.ai'));a.equal(c2.content,'原文');a.ok(c2.more.includes(t('zh-CN','own.ap-every-time')));
 for(const c of [c1,c2])a.ok(!/keep_|fablecut_|capability/.test(JSON.stringify(c)));
});
test('自动 / Yolo apply only after a CAS on the project, as one undo step; per_range (exports) always opens the dialog',()=>{
 const app=read('app.js'),i=app.indexOf('async function onAgentReply'),body=app.slice(i,app.indexOf('function canUndoOfficialProposal',i));
 a.match(body,/MontClipProposal\.current\(proposal,projectJSON\(\),/);
 a.match(body,/project\.revision!==result\.context\.revision/);
 a.ok(body.indexOf("outputMode==='per_range'")<body.indexOf('commitRangePlan('),'slices go to the dialog first');
 a.match(body,/if\(step\.version\)await step\.version;/,'the agent version is kept before anything is applied');
});

test('a step approved through the card never says 「没有问你」; only a direct run (auto/Yolo) may (issuecomment-6644967814)',()=>{
 const app=read('app.js'),i=app.indexOf('async function onAgentReply'),body=app.slice(i,app.indexOf('function canUndoOfficialProposal',i));
 // #134 (JJ): asked now → approved; allowed earlier for this chat → allowed; only a direct run (自动/Yolo) → 「没有问你」
 a.match(body,/const asked=d\.action==='ask';/);
 a.match(body,/toastAction\(asked\?uiText\('own\.ap-applied-approved'\):d\.byApproval\?uiText\('own\.ap-applied-allowed'\):uiText\('own\.ap-applied',/,'the applied toast picks the approved wording after the card, the direct wording only on run');
 for(const l of ['zh-CN','en']){
  const approved=t(l,'own.ap-applied-approved');
  a.ok(approved&&approved!=='own.ap-applied-approved',l+': ap-applied-approved exists');
  a.ok(!/没有问你|without asking/i.test(approved),l+': an approved step was just asked about');
 }
 // the direct-run line keeps saying it (auto/Yolo really does not ask)
 a.match(t('zh-CN','own.ap-applied'),/没有问你/);a.match(t('en','own.ap-applied'),/without asking/);
});

test('new words, both languages (for JJ)',()=>{
 const keys=['ap-title','ap-project','ap-sends-to','ap-content','ap-every-time','ap-once','ap-session','ap-deny','ap-denied','ap-listed','ap-refused','ap-refused-mode','ap-applied','ap-applied-approved','ap-stale','ap-yolo-on','ap-sum-sentences','ap-sum-ranges','ap-sum-slices','ap-undo','ap-invalid'];
 for(const k of keys){const zh=t('zh-CN','own.'+k),en=t('en','own.'+k);a.ok(zh&&zh!=='own.'+k,k);a.ok(en&&!/[一-鿿]/.test(en),k);}
 a.equal(t('zh-CN','own.ap-once'),'只批准这次');a.equal(t('zh-CN','own.ap-session'),'这个聊天中都批准');a.equal(t('zh-CN','own.ap-deny'),'不同意');
 for(const k of ['modes','modePlan','modeManual','modeAuto','modeYolo','modePlanTip','modeManualTip','modeAutoTip','modeYoloTip','yoloOn','modeDeclined','modeUnavailable'])
  for(const l of ['zh-CN','en'])a.ok(View.text[l]['officialPane_'+k],l+' '+k);
 a.deepEqual(['modePlan','modeManual','modeAuto','modeYolo'].map(k=>View.text['zh-CN']['officialPane_'+k]),['计划','手动','自动','全自动']);
 const {yoloText}=require('../desktop/agent-mode-text');
 a.deepEqual(yoloText('zh-CN').buttons,['取消','打开全自动']);a.deepEqual(yoloText('en').buttons,['Cancel','Turn on Full auto']);
 a.match(yoloText('zh-CN').detail,/重新打开 MontClip 后，会回到「手动」/);
});

test('the switch sits at the top of the assistant; the Yolo mark is in the pane and the top bar',()=>{
 const pane=read('agent-ui/pane.tsx'),html=read('index.html');
 a.ok(pane.indexOf('data-agent-modes')<pane.indexOf('cindy-thread'),'above the thread');
 a.match(pane,/options\.getMode\?\.\(\)==='yolo'&&<p className="agent-yolo-on" role="status" data-yolo-on title=\{t\.yoloOn\}>/);
 a.match(html,/<span class="mc-yolo-mark" id="mcYoloMark" role="status" hidden data-i18n="own\.ap-yolo-on">/);
 a.match(read('cindy-official.js'),/data-agent-modes/,'the bundle was rebuilt');
});

test('JJ’s final words (5d360cd7) for the changed lines; the Yolo box follows the interface language',()=>{
 const T=(l,k)=>View.text[l]['officialPane_'+k];
 a.equal(T('zh-CN','modeManualTip'),'改项目前先问你；撤不回的每次都问。默认是这个。');/* JJ's final words, frozen prototype c604fd65 (plan-copy.test.js) */
 a.equal(T('en','modeManualTip'),"Asks before changing the project; asks every time for anything that can't be undone. This is the default.");
 a.equal(t('zh-CN','own.ap-refused-mode'),'助手现在没有选模式，所以什么都没做。请在助手顶部选一种模式。');
 // shown when the main process refused the switch or the channel failed (the switch exists in the desktop app only)
 a.equal(T('zh-CN','modeUnavailable'),'这次没换成，模式还是原来那个。关掉 MontClip 再打开，再试一次。');
 a.equal(T('en','modeUnavailable'),"The mode didn't change; it's still the one it was. Close MontClip, open it again and try once more.");
 a.equal(T('zh-CN','modeYolo'),'全自动','JJ’s name for it (#212)');a.equal(T('en','modeYolo'),'Full auto');
 const {yoloText}=require('../desktop/agent-mode-text');
 a.deepEqual(yoloText('zh-CN').buttons,['取消','打开全自动']);a.deepEqual(yoloText('en').buttons,['Cancel','Turn on Full auto']);
 a.match(read('desktop/main.js'),/const t = yoloText\(languageOf\(settings\.get\(\)\)\);/,'the box takes the interface language');
});

test('no approval box over the page any more: the card is in the stream (v7.2 §2; Deja, step 3)',()=>{
 const app=read('app.js'),css=read('style.css');
 a.ok(!app.includes('data-agent-approval')&&!app.includes("className='agent-approval'"),'the old box is gone');
 a.ok(!/\.agent-approval[ :{]/.test(css));
 a.ok(read('agent-ui/pane.tsx').includes('<HostCard key={c.id} card={c}'));
});
test('Yolo (v7.2; Deja, 2026-11-04): the bar, and the mode tip in JJ final words (it adds that it asks once more)',()=>{
 const zh=View.text['zh-CN'],en=View.text.en;
 a.equal(zh.officialPane_yoloOn,'全自动开着：AI 每一步都直接做，不问你；往外发的内容照样先给你看。');
 a.equal(zh.officialPane_modeYoloTip,'每一步都直接做，不问你；往外发的内容照样先给你看。打开前会再确认一次。');
 a.equal(en.officialPane_yoloOn,'Full auto is on: the AI does every step without asking you; anything sent out is still shown to you first.');
 a.equal(en.officialPane_modeYoloTip,"Does every step without asking you; anything sent out is still shown to you first. You'll be asked once more before it turns on.");
});

test('the approval card has one main button: 〔只批准这次〕 (VV on #84 53f641d; 「这个聊天中都批准」 outlined, 〔不同意〕 plain)',()=>{
 const Approval=require('../agent-approval'),cards=Approval.create(),result={};
 void cards.ask({ticket:'t',label:'L',risk:'project',choices:['deny','session','once']},{result});
 a.deepEqual(cards.view(result,(k)=>k)[0].actions.map(x=>[x.id,x.kind]),[['once','primary'],['session','secondary'],['deny','plain']]);
 const card=read('agent-ui/HostCard.tsx');
 a.ok(card.includes("primary: { variant: 'cta' }, secondary: { variant: 'secondary' }, plain: { variant: 'secondary', tone: 'quiet' }"));
});
