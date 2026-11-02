'use strict';
// Chinese interface from Rea's SPEC-i18n-terms v1, wired into the existing
// MontClipView text system: zh-CN default, en switchable, keyed lookups only.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const view=require('../ui-preferences'),terms=require('../ui-terms');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');

test('every term has both languages and the keyed lookup falls back to English, never to a key',()=>{
 for(const [k,[en,zh]] of Object.entries(terms.rows)){a.ok(en&&zh,k);a.equal(view.t('zh-CN','term.'+k),zh);a.equal(view.t('en','term.'+k),en);}
 a.equal(view.t('zh-CN','term.export'),'导出');a.equal(view.t('en','term.export'),'Export');
 a.equal(view.t('zh-CN','term.effects'),'特效','section A core term wins over section B wording');
 a.equal(view.t('zh-CN','term.transform'),'画面');
 a.equal(view.t('zh-CN','own.needs-server'),'需要 MontClip 服务');a.equal(view.t('zh-CN','own.missing-key-x'),'');
 a.equal(view.t('zh-CN','own.exporting-pct',{pct:42}),'正在导出… 42%');a.equal(view.t('en','own.exporting-pct',{pct:42}),'Exporting… 42%');
});

test('default stays zh-CN and the language is still the one existing preference',()=>{
 const store=new Map(),s={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const v=view.create(s);a.equal(v.get().language,'zh-CN');v.set({language:'en'});a.equal(view.create(s).get().language,'en');
 a.deepEqual([...store.keys()],[view.KEY],'no second language key');
 a.equal((html.match(/id="mcLanguage"/g)||[]).length,1,'one language switch');
 const added=fs.readFileSync(path.join(root,'ui-terms.js'),'utf8')+view.applyI18n.toString()+view.t.toString();
 a.ok(!/localStorage/.test(added),'terms and lookup never touch localStorage');
});

test('only elements marked with data-i18n attributes are rewritten; user content is never translated',()=>{
 const el=(attrs,text='')=>({dataset:{...attrs},textContent:text,attrs:{},setAttribute(k,v){this.attrs[k]=v;}});
 const marked=el({i18n:'term.export'},'Export'),titled=el({i18nTitle:'term.settings',i18nAriaLabel:'term.settings'}),search=el({i18nPlaceholder:'term.bin-search'});
 const project=el({},'Export'),caption=el({},'Delete'),media=el({},'Projects');
 const all=[marked,titled,search,project,caption,media];
 const rootEl={querySelectorAll:sel=>all.filter(e=>{const key={'[data-i18n]':'i18n','[data-i18n-title]':'i18nTitle','[data-i18n-placeholder]':'i18nPlaceholder','[data-i18n-aria-label]':'i18nAriaLabel'}[sel];return key&&e.dataset[key];})};
 view.applyI18n(rootEl,'zh-CN');
 a.equal(marked.textContent,'导出');a.equal(titled.attrs.title,'设置');a.equal(titled.attrs['aria-label'],'设置');a.equal(search.attrs.placeholder,'搜索素材库');
 a.equal(project.textContent,'Export');a.equal(caption.textContent,'Delete');a.equal(media.textContent,'Projects');
 view.applyI18n(rootEl,'en');a.equal(marked.textContent,'Export');
 // the elements that hold user content carry no i18n marker in the page
 for(const id of ['projectName','monitorClipName','binList','tracks'])a.ok(!new RegExp('id="'+id+'"[^>]*data-i18n').test(html)&&!new RegExp('data-i18n[^>]*id="'+id+'"').test(html),id);
 a.ok(/project\.name/.test(app.match(/els\.projectName\.textContent = [^;]*/)[0]),'project name shown as written');
});

test('an icon button keeps its icon; only its trailing label text is rewritten',()=>{
 const icon={nodeType:1},label={nodeType:3,data:' Close gap'},btn={dataset:{i18nTail:'term.close-gap'},childNodes:[icon,label],setAttribute(){}};
 const rootEl={querySelectorAll:sel=>sel==='[data-i18n-tail]'?[btn]:[]};
 view.applyI18n(rootEl,'zh-CN');a.equal(label.data,' 关闭空隙');a.equal(btn.childNodes[0],icon);
 view.applyI18n(rootEl,'en');a.equal(label.data,' Close gap');
});
