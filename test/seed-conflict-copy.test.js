'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const V=require('../ui-preferences'),N=require('../desktop/native-text').TEXT;
// JJ's corrected final copy, 2026-11-05; actual button names verified against the UI.
const expected={
  "zh-CN": {
    "title": "AI 先停用了",
    "body": "包里带的 AI 服务设置，和这台电脑上已经保存的不一样，所以先暂停使用 AI。剪辑照常能用。\n想改用包里的设置：在助手面板点「AI 服务」，再点「删除这个连接」，然后关掉 MontClip 再打开。\n不想替换你现在的设置：请联系给你这个包的人。",
    "status": "这里的 AI 服务设置和包里带的不一样，先暂停使用 AI。要改用包里的设置：点「删除这个连接」，再关掉 MontClip 重新打开。"
  },
  "en": {
    "title": "AI is paused for now",
    "body": "The AI service settings that came with this package don't match the ones saved on this computer, so the AI is paused for now. Editing works as usual.\nTo use the package's settings: in the assistant panel click “AI service”, then “Remove this connection”, then close MontClip and open it again.\nTo keep your current settings instead: contact the person who gave you this package.",
    "status": "These AI service settings don't match the ones in the package, so the AI is paused. To use the package's settings: click “Remove this connection”, then close MontClip and open it again."
  }
};
test('seed conflict recovery instructions match JJ exactly and name the real controls',()=>{
 for(const [lang,want] of Object.entries(expected)){
  const t=V.text[lang];a.equal(N[lang].seedOk,lang==='en'?'OK':'好');a.equal(N[lang].seedConflictTitle,want.title);a.equal(N[lang].seedConflict,want.body);a.equal(t.officialPane_seedConflict,want.status);
  for(const key of ['config','removeConnection'])a.ok(want.body.includes(t['officialPane_'+key]),lang+' '+key);
  a.ok(want.status.includes(t.officialPane_removeConnection));
 }
});
test('conflicts keep removal available, disable save, and show recovery status instead of configured',()=>{
 const pane=fs.readFileSync(path.join(__dirname,'..','agent-ui','pane.tsx'),'utf8');
 a.ok(pane.includes("cfg?.code==='SEED_CONFLICT')&&<button data-remove-connection"));
 a.ok(pane.includes("cfg?.code==='SEED_CONFLICT'?t.seedConflict:cfg?.configured?t.configured:t.unconfigured"));
 a.ok(pane.includes("conversation.busy()||cfg?.code==='CONFIG_READ_FAILED'||cfg?.code==='SEED_CONFLICT'"));
 const main=fs.readFileSync(path.join(__dirname,'..','desktop','main.js'),'utf8');
 a.ok(main.includes("VERIFY_FAILED_NOT_UNDONE: 'seedSealFailed', SEAL_FAILED_LEFTOVER: 'seedSealFailed', SEED_CONFLICT: 'seedConflict'"));
 a.ok(main.includes("buttons: [t.seedOk]"));
 a.ok(main.includes("title: say === 'seedConflict' || say === 'seedSealFailed' ? t.seedConflictTitle : t.seedTitle"));
 a.ok(N['zh-CN'].seedSealFailed.includes(V.text['zh-CN'].officialPane_removeConnection)&&N.en.seedSealFailed.includes(V.text.en.officialPane_removeConnection),'the leftover dialog names the real control');
});
