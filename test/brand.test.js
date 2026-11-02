'use strict';
// User-visible product name is MontClip. Internal identifiers keep the FableCut
// spelling on purpose (settings keys, globals, headers, MCP tool and server names,
// the `fablecut` command): renaming them would break saved settings and existing
// integrations. See docs/decisions/2026-11-02-brand-montclip.md.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
// A visible "FableCut" is the word itself, not part of an identifier such as
// FableCutCaptions, X-FableCut-Project or a link to the upstream repository.
// ~/FableCut is the data folder an npm install uses (paths.js): a path, kept as is.
const ALLOWED=[/ronak-create\/FableCut/g,/~\/FableCut/g,/X-FableCut-[\w-]+/g,/FableCut[A-Z]\w*/g];
const visible=s=>{for(const r of ALLOWED)s=s.replace(r,'');return s;};
const hits=(s,label)=>[...visible(s).matchAll(/FableCut/g)].map(m=>label+': …'+s.slice(Math.max(0,m.index-30),m.index+30).replace(/\n/g,' ')+'…');

test('README names MontClip and credits the upstream',()=>{
 for(const [f,credit,upstream] of [['README.md',/^Based on \[ronak-create\/FableCut\]\(https:\/\/github\.com\/ronak-create\/FableCut\) \(MIT\)\.$/m,'About the upstream project'],
  ['docs/i18n/README.zh-CN.md',/^基于 \[ronak-create\/FableCut\]\(https:\/\/github\.com\/ronak-create\/FableCut\)（MIT 许可）。$/m,'关于上游']]){
  const readme=read(f);
  a.match(readme.split('\n').find(l=>l.startsWith('# '))||'',/MontClip/);
  a.match(readme,credit,f+' attribution line');
  // the upstream product name appears as a word only in the credit and JJ's "about the upstream" section
  const rest=readme.split(/^(?=## )/m).filter(sec=>!sec.startsWith('## '+upstream)).join('').split('\n').filter(l=>!credit.test(l)).join('\n');
  a.deepEqual(hits(rest.replace(/\[[^\]]*\]\((https?:\/\/[^)]*)\)/g,(m)=>m.replace(/https?:\/\/\S*?(?=\))/,'')),f),[]);
 }
});

test('package and bundle metadata say MontClip',()=>{
 const pkg=JSON.parse(read('package.json')),man=JSON.parse(read('manifest.json'));
 a.equal(pkg.name,'montclip');a.ok(!/fablecut/i.test(pkg.description));a.ok(!/fablecut/i.test(pkg.homepage||''));
 a.equal(man.name,'montclip');a.equal(man.display_name,'MontClip');
 for(const k of ['description','long_description','homepage'])a.ok(!/fablecut/i.test(man[k]||''),k);
 a.equal(pkg.bin.fablecut,'cli.js','the fablecut command stays (internal identifier)');
 for(const t of man.tools)a.match(t.name,/^fablecut_/,'MCP tool names unchanged');
});

test('editor, server, CLI and MCP descriptions name MontClip where a person reads them',()=>{
 const strings=src=>[...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(m=>m[2]);
 const out=[];
 for(const f of ['app.js','server.js','cli.js','mcp-server.js','index.html'])for(const s of f.endsWith('.html')?[read(f).replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'')]:strings(read(f)))out.push(...hits(s,f));
 a.deepEqual(out,[]);
});

test('the docs site home and download entry name MontClip',()=>{
 for(const f of ['docs/index.html','docs/start/index.html','docs/en/index.html','docs/en/start/index.html']){
  // JJ's copy names the upstream in the credit, the "about the upstream" section, the footer and the FAQ; those carry data-upstream
  const page=read(f).replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(section|p|footer|details|span)\b[^>]*data-upstream[^>]*>[\s\S]*?<\/\1>/g,'');
  a.match(page,/<title>[^<]*MontClip/,f);
  a.deepEqual(hits(page.replace(/https?:\/\/[^"'\s<>]+/g,''),f),[]);
 }
});

// JJ on 2f4707d6: renaming the upstream pitch turned its claims into MontClip's own
// promises. Those go until JJ's plain-language copy replaces them.
test('no inherited promises: sponsor, free/no paid tier, zero-dependency/no-install claims, upstream feature list, testimonials',()=>{
 const readme=read('README.md'),home=read('docs/index.html'),start=read('docs/start/index.html');
 for(const [name,src] of [['README',readme],['home',home],['start',start]]){
  for(const bad of [/SDRFABLECUT|Sidrune/i,/no paid tier/i,/Is MontClip free/i,/zero npm dependencies/i,/Nothing to install/i,/runs entirely in your\s+browser/i])a.ok(!bad.test(src),name+' still has '+bad);
 }
 a.ok(!/^## Features$/m.test(readme),'README upstream feature list removed');a.ok(!/^## Sponsors$/m.test(readme));
 const ld=home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
 const doc=JSON.parse(ld);
 for(const k of ['@id','url','downloadUrl','codeRepository'])a.ok(!doc[k]||doc[k].startsWith('https://github.com/good-night-oppie/MontClip'),k+' points to MontClip');
 a.ok(!/fablecut\.space/.test(ld));a.equal(doc.isBasedOn,'https://github.com/ronak-create/FableCut','upstream credited');
 a.ok(!/discord\.gg|mailto:hello@fablecut|status\.fablecut/.test(home),'no upstream community/support channels presented as ours');
 a.ok(!/api\.github\.com\/repos\/ronak-create/.test(read('docs/main.js')),'star count is our repo, not upstream');
 a.ok(!/"featureList"/.test(ld),'no copied feature list in structured data');
 a.ok(!/id="mentions"/.test(home),'third-party testimonials removed');a.ok(!/id="sponsor"/.test(home));
 a.ok(!/<link rel="canonical" href="https:\/\/fablecut\.space/.test(home)&&!/og:url" content="https:\/\/fablecut\.space/.test(home));
 a.ok(!/~\/FableCut/.test(start),'start page does not name the old product folder');
});
