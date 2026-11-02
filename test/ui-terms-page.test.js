'use strict';
// Static page labels keyed to the SPEC terms; MontClip as the product name.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const view=require('../ui-preferences'),terms=require('../ui-terms');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');

test('static page labels are keyed and every key exists in both languages',()=>{
 const keys=[...html.matchAll(/data-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"/g)].map(m=>m[1]);
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
