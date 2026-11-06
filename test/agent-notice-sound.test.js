'use strict';
// QQ's five on #169, 4 (Deja, 2026-11-05): the 「AI 数据说明」 v3 has a paragraph on the new numbers — what they are, and
// that they are not a recording — after 「DeepSeek 会怎么用」, which stays as it is (「可能」用于训练; never 「不会被训练」).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const V=require('../ui-preferences'),T=(l)=>(k)=>V.text[l]['officialPane_'+k];
test('the paragraph on the singing parts and loudness, word for word (待 JJ 定稿), after how DeepSeek uses what is sent',()=>{
 a.equal(T('zh-CN')('dataNoticeSoundLabel')+T('zh-CN')('dataNoticeSound'),"唱歌段和音量：只是数字——哪几段可能在唱歌（开始和结束的秒数），和音量大小（每秒或每隔几秒一个 0 到 100 的数）。它们是在这台电脑上从声音里算出来的，不是录音，也还原不出声音。它们和你写的话一样发给 DeepSeek，上面「DeepSeek 会怎么用」说的也同样适用。不想发的话，可以在「设置 › AI 助手」里关掉「附上唱歌段和音量」。");
 a.equal(T('en')('dataNoticeSoundLabel')+T('en')('dataNoticeSound'),"Singing parts and loudness: numbers only — which parts may be singing (start and end seconds) and the loudness (one number from 0 to 100 every second or every few seconds). They are worked out from the sound on this computer; they are not a recording, and the sound can't be rebuilt from them. They go to DeepSeek like what you write, and what is said above about how DeepSeek uses it applies to them too. To not send them, turn off \"Attach singing parts and loudness\" in Settings › AI assistant.");
 for(const l of ['zh-CN','en']){const s=T(l)('dataNoticeSound');a.ok(/不是录音|not a recording/.test(s),l);a.ok(/还原不出声音|can't be rebuilt/.test(s),l);}
 a.match(read('ui-preferences.js'),/the notice says what the new numbers are and are not \(not a recording\);\n\s*\/\/ 「DeepSeek 会怎么用」 above is kept as it is\. 待 JJ 定稿/);
 const pane=read('agent-ui/pane.tsx');
 a.ok(pane.indexOf('{t.dataNoticeUse}</p><p data-data-notice-sound><b>{t.dataNoticeSoundLabel}</b>{t.dataNoticeSound}</p>')>0,'right after 「DeepSeek 会怎么用」');
 a.match(read('cindy-official.js'),/data-data-notice-sound/,'the bundle was rebuilt');
});
test('「DeepSeek 会怎么用」 is kept: what is sent 「可能」 is used for training; nothing says it won\'t be',()=>{
 const zh=T('zh-CN')('dataNoticeUse'),en=T('en')('dataNoticeUse');
 a.ok(zh.includes('你发过去的内容和 AI 的回复「可能」用于训练模型和改进服务'));
 a.ok(en.includes('"may" be used to train its models'));
 for(const l of ['zh-CN','en'])for(const k of Object.keys(V.text[l]).filter(k=>/^officialPane_dataNotice/.test(k)))
  a.ok(!/不会被(拿去)?训练|不会用于训练|won't be used to train|will not be used to train|never used to train/i.test(V.text[l][k]),k);
 a.equal(require('../desktop/agent-data-notice').NOTICE_VERSION,3,'still v3');
});

test('JJ定稿 (2026-11-05): the notice never says 「每秒的音量」 / "loudness for each second" — a long video gets one every few seconds',()=>{
 for(const l of ['zh-CN','en'])for(const k of Object.keys(V.text[l]).filter(k=>/^officialPane_dataNotice/.test(k)))
  a.ok(!/每秒的音量|每秒一个|loudness for each second|for each second/i.test(V.text[l][k]),k);
 a.ok(T('zh-CN')('dataNoticeWhat').includes('音量大小（每秒或每隔几秒一个数）（一串数字）。声音本身不发。'));
 a.ok(T('en')('dataNoticeWhat').includes('the loudness (one number every second or every few seconds) (a list of numbers). The sound itself is never sent.'));
});
