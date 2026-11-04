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
 a.equal(zh('as-habit-why',{n:5,kind:'唱歌',of:4,edge:'结尾',dir:'后'}),'（你以前挪了 5 次唱歌片段的结尾，4 次往后挪）');
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
 const all=Object.entries(V.text['zh-CN']).filter(([k])=>/^own\.as-(learn|habit|add|not-song|is-song|tag-(changed|added)|kind-(song|interaction|chat|stunt|other|to-)|evidence-habits|unit)/.test(k)).map(([,v])=>v).join('\n');
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

// JJ's final copy for 12f4f21 (Deja, 2026-11-03), as written
test("JJ's final words: 改成唱歌, 补一段's 唱歌 hint, and the way back to 补一段",()=>{
 a.equal(zh('as-kind-to-song',{name:'第一首'}),'「第一首」改成唱歌了。开头结尾没动，用下面的拖动条挪到唱歌开始和结束的地方。');
 a.equal(en('as-kind-to-song',{name:'Song 1'}),'“Song 1” is now marked as singing. Its start and end stay where they were; use the strips below to move them to where the singing starts and stops.');
 a.equal(zh('as-add-hint-song'),'按唱歌处理，开头结尾就用你设好的。');
 a.equal(en('as-add-hint-song'),'Treated as singing; the start and end you set are kept.');
 // the toast names the buttons as the English interface labels them, read from their own keys
 a.equal(en('as-add-goto-toast'),`Once the start (I) and end (O) are set, click “${en('as-open')}” at the top, then “${en('as-add')}”.`);
 a.equal(zh('as-add-goto-toast'),'设好开头（I）和结尾（O）以后，点上面的「✨ 自动出切片」，再点「补一段」。');
});
// the habit's reason, one whole sentence in each language for each of the six kinds; a card that may be singing is 唱歌 too;
// no 首 anywhere in it, and no unit spliced in
test("the habit's reason: JJ's whole sentence for every kind, in Chinese and English; never 首",()=>{
 const ZH={song:'唱歌',moment:'热闹',interaction:'互动',chat:'聊天',stunt:'整活',other:'其他'};
 const EN={song:'singing',moment:'lively',interaction:'interaction',chat:'chat',stunt:'stunt',other:'other'};
 for(const k of Object.keys(ZH)){
  a.equal(zh('as-habit-kind-'+k),ZH[k],k);a.equal(en('as-habit-kind-'+k),EN[k],k);
  const z=zh('as-habit-why',{n:5,kind:zh('as-habit-kind-'+k),of:4,edge:zh('as-habit-edge-end'),dir:zh('as-habit-dir-later')});
  a.equal(z,`（你以前挪了 5 次${ZH[k]}片段的结尾，4 次往后挪）`);a.ok(!/首/.test(z),z);
  // the leading space joins it to the phrase before it, as before
  a.equal(en('as-habit-why',{n:5,kind:en('as-habit-kind-'+k),of:4,edge:en('as-habit-edge-end'),dir:en('as-habit-dir-later')}),` (you moved the end of ${EN[k]} parts 5 times, 4 of them later)`);
  a.equal(zh('as-habit-why',{n:3,kind:ZH[k],of:3,edge:zh('as-habit-edge-start'),dir:zh('as-habit-dir-earlier')}),`（你以前挪了 3 次${ZH[k]}片段的开头，3 次往前挪）`);
  a.equal(en('as-habit-why',{n:3,kind:EN[k],of:3,edge:en('as-habit-edge-start'),dir:en('as-habit-dir-earlier')}),` (you moved the start of ${EN[k]} parts 3 times, 3 of them earlier)`);
 }
 a.ok(!/\{unit/.test(zh('as-habit-why'))&&!/\{unit/.test(en('as-habit-why')),'no unit spliced in');
 for(const k of ['as-unit2-song','as-unit2-part','as-unit-song','as-unit-song-maybe','as-unit-moment','as-unit-interaction','as-unit-chat','as-unit-stunt','as-unit-other'])
  a.equal(V.text['zh-CN']['own.'+k],undefined,k+' is gone');
 const app=read('app.js');a.ok(!/as-unit/.test(app),'app.js uses no as-unit key');
 // the card a possible song is on says 唱歌: the kind word comes from the card's kind, never gated
 a.match(app,/"own\.as-habit-kind-" \+ c\.kind/);
});
// JJ's rule from #89 covers this interface's strings too: English quotes with “ ”, says "in the video"
test("this interface's English follows #89's rule: “ ”, never 「」, never \"in the picture\"",()=>{
 const mine=['as-learn-off','as-habit-reverted','as-evidence-habits','as-add-hint-off','as-added','as-add-goto-toast','as-kind-to-song','as-add-name'];
 for(const k of mine){const e=V.text.en['own.'+k];a.ok(e,k);a.ok(!/[「」]/.test(e)&&!/in the picture/i.test(e),k+': '+e);}
 for(const k of mine.slice(0,7))a.ok(/“[^”]+”/.test(V.text.en['own.'+k]),k+' quotes with “ ”');
 a.match(V.text.en['own.as-add-name'],/doesn't appear in the video/);
});

// VV on 12f4f21 / Deja: a disabled button looks disabled — one rule at the root for every .btn (.btn:disabled and
// .btn[disabled]): faded (opacity ≤ 0.5), no hand cursor; no rule for one button at a time
test('one root rule: every disabled .btn is faded, with no hand cursor; no per-button rules',()=>{
 const css=read('style.css').replace(/\/\*[\s\S]*?\*\//g,'');
 const rules=[...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m=>({sel:m[1].split(',').map(x=>x.trim()),body:m[2]}));
 const root=rules.find(r=>r.sel.includes('.btn:disabled')&&r.sel.includes('.btn[disabled]'));
 a.ok(root,'a rule for .btn:disabled and .btn[disabled]');
 const op=/opacity:\s*([\d.]+)/.exec(root.body);a.ok(op&&+op[1]<=0.5,'opacity ≤ 0.5: '+root.body);
 a.match(root.body,/cursor:\s*default/);
 a.ok(!/\[data-as-add-ok\]:disabled|\[data-learn-clear\]:disabled/.test(css),'no rule for one button');
});

// JJ chose (b) (Deja, 2026-11-03): 〔打开〕 on the line under the cards turns the switch on at once, with a toast that can
// undo it — the line and the toast in JJ's words, whole sentences, both languages
test("the line when it is off, its 〔打开〕 and the toast after it, in JJ's words",()=>{
 a.equal(zh('as-learn-off'),'「记住我的剪辑习惯」关着：这里的修改不会记下来，下次找也不参考以前记的。');a.equal(zh('as-learn-off-btn'),'打开');
 // the space after the English sentence parts it from its button
 a.equal(en('as-learn-off'),"“Remember my editing habits” is off: changes here are not kept, and the next search doesn't use what was kept. ");a.equal(en('as-learn-off-btn'),'Turn on');
 a.equal(zh('as-learn-on-here'),'已打开「记住我的剪辑习惯」。从现在起，你在这里的修改会记在这台电脑上，不会发出去。');
 a.equal(en('as-learn-on-here'),'“Remember my editing habits” is on. From now on, changes you make here are kept on this computer and never sent.');
 // the same switch as the page: one store call, and the undo step turns it off again
 const app=read('app.js');
 a.match(app,/data-as-act="\$\{on \? "learn" : "learn-on"\}"/);
 a.match(app,/act === "learn-on"/);
});

// JJ's final words (Deja, 2026-11-03) for the reason on a part marked 不是唱歌 that comes back
test("JJ's words for the reason on a part marked 不是唱歌 that comes back",()=>{
 a.equal(zh('as-marked-why'),'上次你把这段改成了不是唱歌，这次照你改的来，开头结尾也和上次一样。');
 a.equal(en('as-marked-why'),"Last time you marked this part as not singing, so it's shown the way you changed it, with the same start and end.");
});

// VV on b76bbe3: a card made another kind than 唱歌 shows no reason that only holds for singing (一直在唱，几乎没有停顿);
// the sound and danmaku reasons stay; made a song again, it comes back (auto-slices.js cardReasons)
test('a card that is no longer a song shows no singing-only reason; a song again, it shows it',()=>{
 const S=require('../auto-slices'),r=[{signal:'singing',window:[0,1]},{signal:'loudness',value:5,window:[0,1]},{signal:'danmaku',value:3,count:40,window:[0,1]}];
 a.deepEqual(S.cardReasons({kind:'song',reasons:r}).map(x=>x.signal),['singing','loudness','danmaku']);
 for(const k of ['moment','interaction','chat','stunt','other'])a.deepEqual(S.cardReasons({kind:k,reasons:r}).map(x=>x.signal),['loudness','danmaku'],k);
 a.deepEqual(S.cardReasons({kind:'moment'}),[]);
 a.match(read('app.js'),/MontClipAutoSlices\.cardReasons\(c\)/);
});
