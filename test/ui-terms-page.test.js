'use strict';
// Static page labels keyed to the SPEC terms; MontClip as the product name.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const view=require('../ui-preferences'),terms=require('../ui-terms');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');

test('static page labels are keyed and every key exists in both languages',()=>{
 const keys=[...html.matchAll(/data-i18n(?:-title|-placeholder|-aria-label|-tail)?="([^"]+)"/g)].map(m=>m[1]);
 a.ok(keys.length>=60,'at least 60 keyed static labels, got '+keys.length);
 for(const k of keys){a.ok(view.t('zh-CN',k)&&view.t('zh-CN',k)!==k,k);a.ok(view.t('en',k),k);}
 a.ok(app.includes('MontClipView.applyI18n(document'),'renderMontClipView applies the keys');
});

test('the product is called MontClip everywhere the user can read it',()=>{
 const visible=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'');
 a.ok(!/FableCut/.test(visible),'index.html');
 for(const m of app.matchAll(/(?:toast|item|fail)\(\s*(["'`])((?:(?!\1).)*)\1/g))a.ok(!/FableCut/.test(m[2]),m[0]);
 for(const [k,[en,zh]] of Object.entries(terms.rows))a.ok(!/FableCut/.test(en+zh),k);
 a.ok(!/Needs the FableCut server/.test(app),'menu notes name MontClip');
});

test('menus built in app.js take SPEC terms by key',()=>{
 for(const k of ['precompose','open-composition','reveal-in-project','replace-file','duplicate','save-as-template','delete','new-folder'])a.ok(app.includes('uiText("term.'+k+'")'),k);
 a.ok(!/item\("(Precompose|Open composition|Reveal in project|Duplicate|Delete)"/.test(app));
 a.equal(view.t('zh-CN','term.open-composition'),'打开复合片段');
});

test('JJ review of 1305bf9: 调色 vs 调节层, lift/extract say what happens to the gap, 合拢空隙, wired bin hint',()=>{
 const z=k=>view.t('zh-CN',k);
 a.equal(z('term.color'),'调色');a.equal(z('term.color-workspace'),'调色工作区');a.equal(z('own.add-adjust'),'+ 调节层');
 a.equal(z('term.lift'),'提起（留空隙）');a.equal(z('term.extract'),'提取（补上空隙）');
 for(const [id,k] of [['btnLift','own.lift-title'],['btnExtract','own.extract-title']]){a.ok(new RegExp('id="'+id+'"[^>]*data-i18n-title="'+k+'"').test(html),id);}
 a.match(z('own.lift-title'),/留下空隙/);a.match(z('own.extract-title'),/补上空隙/);
 a.equal(z('term.close-gap'),'合拢空隙');a.equal(z('term.close-gap-at-playhead-g'),'合拢播放头处的空隙（⇧G）');
 const bin=html.slice(html.indexOf('id="binEmpty"'),html.indexOf('</div>',html.indexOf('class="hint"')));
 for(const k of ['term.drop-video-audio-or-images-here','own.or-click','own.add-import','own.add-url'])a.ok(bin.includes('data-i18n="'+k+'"'),k);
 a.equal(z('term.shapes-and-transforms'),'形状与画面');a.equal(z('term.preferences-are-stored-in-this-browser-only'),'这些偏好只保存在这台电脑上。');
 a.equal(z('term.large-tracks'),'较高轨道');a.equal(z('term.main'),'主序列');
 a.ok(!/词/.test(z('term.click-a-word')),'no word-level promise for Chinese');a.ok(html.includes('<td data-i18n="term.click-a-word">'));
 a.ok(!z('term.scrub-source-drag-to-seek').includes('·'),'no repeated half');
});
