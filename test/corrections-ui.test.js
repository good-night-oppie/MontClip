'use strict';
// 「记住我的剪辑习惯」 in the 「✨ 自动出切片」 review, as the frozen v12 has it (Deja, 2026-11-03; 原型-v12.html d289ff06…,
// 交互说明-v12.md d59748f7…). What the real window does is checked by desktop/corrections-ui-smoke.cjs; this file checks the
// words (v12's, for JJ), that the page loads the two modules, and that inside the page only the 自动出切片 code reads the
// corrections (never the assistant's context or request).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const V=require('../ui-preferences'),zh=(k,v)=>V.t('zh-CN','own.'+k,v),en=(k,v)=>V.t('en','own.'+k,v);

test("v12's words on the card, the line and 补一段",()=>{
 a.equal(zh('as-not-song'),'这段不是唱歌');a.equal(zh('as-is-song'),'这段是唱歌');a.equal(zh('as-tag-changed'),'你改的');a.equal(zh('as-tag-added'),'你补的');
 a.deepEqual(['interaction','chat','stunt','other'].map(k=>zh('as-kind-'+k)),['互动','聊天','整活','别的']);
 a.equal(zh('as-learn-told'),'（这次修改记在这台电脑上，下次找的时候参考）');
 a.equal(zh('as-learn-on'),'你在这里的修改会记在这台电脑上，下次找的时候参考，不会发出去。');a.equal(zh('as-learn-on-btn'),'查看、清空或关掉');
 a.equal(zh('as-learn-off'),'「记住我的剪辑习惯」关着：这里的修改不会记下来，下次找也不参考以前记的。');a.equal(zh('as-learn-off-btn'),'打开');
 a.equal(zh('as-habit-lead'),'按你以前的习惯，');a.equal(zh('as-habit-end-later',{d:2}),'结尾多留了 2 秒');a.equal(zh('as-habit-start-earlier',{d:3}),'开头提前了 3 秒');
 a.equal(zh('as-habit-why',{n:5,unit:'首歌',of:4,unit2:'首',edge:'结尾',dir:'后'}),'（你以前 5 首歌里有 4 首把结尾往后挪）');
 a.equal(zh('as-habit-not-now'),'这次不用');a.equal(zh('as-habit-settings'),'去设置');
 a.equal(zh('as-evidence-habits',{n:23,k:3}),' 还参考了你以前的 23 次修改：有 3 条按你的习惯调了开头或结尾，卡片上写着，不想要就点那条的「这次不用」。');
 a.equal(zh('as-add-btn'),'＋ 补一段');a.equal(zh('as-add'),'补一段');a.equal(zh('as-add-rec',{name:'11 月 2 日周六晚上'}),'在 11 月 2 日周六晚上这场');
 a.equal(zh('as-add-what'),'这段是：');a.equal(zh('as-add-ok'),'补上');a.equal(zh('as-add-pick-first'),'先选这段是什么');a.equal(zh('as-added',{name:'x'}),'已补上「x」，卡片上标了「你补的」。');
 a.equal(zh('as-add-name'),'名字（选填，就是导出的文件名，不会出现在画面里）');
 a.equal(zh('as-add-hint-interaction'),'连麦、PK、读 SC 都算互动。按热闹片段处理。');a.equal(zh('as-add-hint-none'),'选一个。下次找的时候也会参考。');
 for(const k of ['as-not-song','as-learn-on','as-habit-why','as-evidence-habits','as-add-hint-off','as-learn-count','as-learn-b2'])a.ok(en(k)&&!/[一-鿿]/.test(en(k)),k+' has its English');
});
test("v12's words on the page 「记住我的剪辑习惯」 and in 设置 › 自动出切片",()=>{
 a.equal(zh('as-learn-title'),'记住我的剪辑习惯');a.equal(zh('as-learn-sub'),'在「设置 › 自动出切片」里也能打开这一页。');
 a.equal(zh('as-learn-switch'),'记住我的修改，下次找得更准');
 a.equal(zh('as-learn-count',{n:23,trim:14,remove:6,kind:2,add:1}),'已记 23 条：挪开头结尾 14 条 · 不要这条 6 条 · 改类型 2 条 · 补一段 1 条');
 a.equal(zh('as-learn-none'),'现在一次都没记。');
 a.equal(zh('as-learn-b1'),'只存在这台电脑上，不会发出去。用 AI 助手的时候也不会发出去。');
 a.equal(zh('as-learn-b2'),'记的是你改了什么，比如结尾往后挪了几秒、哪类片段不要。不存画面和声音，只存几个声音统计数字（比如停顿多少），用它们还原不出声音。');
 a.equal(zh('as-learn-b3'),'关掉以后：不再记新的修改，下次找也不参考以前记的。以前记的还留着，可以清空。');
 a.equal(zh('as-learn-clear-confirm',{n:23}),'清空以后，下次找高光就不再参考你以前的 23 条修改。清空不能撤销。');
 a.deepEqual(['as-learn-ok','as-learn-clear','as-learn-clear-yes','as-learn-clear-no'].map(k=>zh(k)),['好','清空记录','清空','先不清']);
 a.equal(zh('as-set-title'),'自动出切片');
 // Deja: no promise that a part taken out is left unticked next time, and nothing about danmaku numbers
 const all=Object.entries(V.text['zh-CN']).filter(([k])=>/^own\.as-(learn|habit|add|not-song|is-song|tag-|kind-|evidence-habits)/.test(k)).map(([,v])=>v).join('\n');
 a.ok(!/默认不勾|不默认勾|弹幕/.test(all),'no unticking promise, no danmaku numbers');
});
test('the page loads corrections.js and segment-edits.js; settings has 自动出切片 after 听写',()=>{
 const html=read('index.html');
 a.ok(html.indexOf('<script src="corrections.js">')>0&&html.indexOf('<script src="segment-edits.js">')>0);
 a.ok(html.indexOf('id="setSlices"')>html.indexOf('id="setAsr"'),'after 听写');
});
test('inside the page only the 自动出切片 code reads the corrections — never the assistant',()=>{
 const app=read('app.js'),from=app.indexOf('/* ── 记住我的剪辑习惯'),to=app.indexOf('/* ── end 记住我的剪辑习惯 ── */');
 a.ok(from>0&&to>from,'one block');
 const outside=app.slice(0,from)+app.slice(to);
 a.deepEqual(outside.match(/.*(montclipCorrections|MontClipCorrections).*/g)||[],[],'only the block names them; the rest calls its functions');
 for(const f of ['agent-facts.js','agent-conversation.js','agent-format.js','agent-pane.js','cindy-official.js'])a.ok(!/orrections/.test(read(f)),f);
});
