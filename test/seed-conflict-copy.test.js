'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const V=require('../shared/ui-preferences'),N=require('../desktop/native-text').TEXT;
// JJ's corrected final copy, 2026-11-05; actual button names verified against the UI.
const expected={
  "zh-CN": {
    "title": "AI 先停用了",
    "body": "包里带的 AI 服务设置，和这台电脑上已经保存的不一样，所以先暂停使用 AI。剪辑照常能用。\n想改用包里的设置：在助手面板点〔AI 服务〕，再点〔删除这个连接〕，然后关掉 MontClip 再打开。\n不想替换你现在的设置：请联系给你这个包的人。",
    "status": "这里的 AI 服务设置和包里带的不一样，先暂停使用 AI。要改用包里的设置：点「删除这个连接」，再关掉 MontClip 重新打开。"
  },
  "en": {
    "title": "AI is paused for now",
    "body": "The AI service settings that came with this package don't match the ones saved on this computer, so the AI is paused for now. Editing works as usual.\nTo use the package's settings: in the assistant panel click “AI service”, then “Remove this connection”, then close MontClip and open it again.\nTo keep your current settings instead: contact the person who gave you this package.",
    "status": "These AI service settings don't match the ones in the package, so the AI is paused. To use the package's settings: click “Remove this connection”, then close MontClip and open it again."
  }
};
// JJ 定稿 (2026-11-05, via Deja): the failed-sealing dialog, word for word
const sealFailed={
  "zh-CN": "包里带的 DeepSeek 密钥第一次没存好，电脑上还留着一份不完整的 AI 服务设置，所以先暂停了 AI。剪辑照常能用，包里那份密钥也还在。\n要修好：在助手面板点〔AI 服务〕→〔删除这个连接〕，再关掉 MontClip 重新打开，会自动重新存一次。还不行，请联系给你这个包的人。",
  "en": "The DeepSeek key that came with this package wasn't saved properly the first time, and incomplete AI service settings were left on this computer, so the AI is paused for now. Editing works as usual, and the package's key is still there.\nTo fix it: in the assistant panel click “AI service” → “Remove this connection”, then close MontClip and open it again. It will save the key again automatically. If that doesn't help, contact whoever gave you this package."
};
test("the failed-sealing dialog is JJ's text word for word, with the paused title",()=>{
 for(const [lang,want] of Object.entries(sealFailed)){a.equal(N[lang].seedSealFailed,want);a.equal(N[lang].seedConflictTitle,expected[lang].title);}
});
test("both dialogs take their button names from the buttons' own text keys, so they are the names on screen",()=>{
 const own={'zh-CN':s=>'〔'+s+'〕',en:s=>'“'+s+'”'};
 for(const lang of ['zh-CN','en'])for(const key of ['config','removeConnection']){
  const name=own[lang](V.text[lang]['officialPane_'+key]);
  a.ok(N[lang].seedConflict.includes(name)&&N[lang].seedSealFailed.includes(name),lang+' '+key+': '+name);
 }
 // built from the keys, not typed again: no button name is written out in native-text.js
 const src=fs.readFileSync(path.join(__dirname,'..','desktop','native-text.js'),'utf8');
 for(const lang of ['zh-CN','en'])for(const key of ['config','removeConnection'])a.ok(!src.includes(own[lang](V.text[lang]['officialPane_'+key])),lang+' '+key+' typed out');
 a.ok(src.includes('zh.officialPane_config')&&src.includes('zh.officialPane_removeConnection')&&src.includes('en.officialPane_config')&&src.includes('en.officialPane_removeConnection'));
 // and a renamed button renames the dialogs' words with it
 const ui=require('../shared/ui-preferences').text,keep=[ui['zh-CN'].officialPane_removeConnection,ui.en.officialPane_removeConnection];
 try{ui['zh-CN'].officialPane_removeConnection='删掉它';ui.en.officialPane_removeConnection='Drop it';
  delete require.cache[require.resolve('../desktop/native-text')];const M=require('../desktop/native-text').TEXT;
  a.ok(M['zh-CN'].seedSealFailed.includes('〔删掉它〕')&&M['zh-CN'].seedConflict.includes('〔删掉它〕'));a.ok(M.en.seedSealFailed.includes('“Drop it”')&&M.en.seedConflict.includes('“Drop it”'));}
 finally{[ui['zh-CN'].officialPane_removeConnection,ui.en.officialPane_removeConnection]=keep;delete require.cache[require.resolve('../desktop/native-text')];}
});
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
});
