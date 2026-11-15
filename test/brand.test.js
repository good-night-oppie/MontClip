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
 a.equal(pkg.bin.fablecut,'server/cli.js','the fablecut command stays (internal identifier)');
 for(const t of man.tools)a.match(t.name,/^fablecut_/,'MCP tool names unchanged');
});

// QQ's option A (Deja, 2026-11-02): nothing is published to npm or the MCP registry until the
// owner registers montclip and io.github.good-night-oppie/montclip. So the package is private,
// nothing points at the upstream's registry entries, and no page tells anyone to install it.
test('not published: private package, no registry entry, no install command anywhere a person reads',()=>{
 const REPO='https://github.com/good-night-oppie/MontClip';
 const pkg=JSON.parse(read('package.json')),man=JSON.parse(read('manifest.json')),plugin=JSON.parse(read('.claude-plugin/plugin.json'));
 a.equal(pkg.private,true,'package.json private');
 a.equal(pkg.mcpName,undefined,'no MCP registry name until the owner registers one');
 a.ok(pkg.repository.url.startsWith(REPO),'package repository is ours');
 a.ok(!fs.existsSync(path.join(root,'server.json')),'no MCP registry manifest');
 a.ok(man.repository.url.startsWith(REPO)&&man.documentation.startsWith(REPO),'bundle repository and docs are ours');
 a.ok(plugin.repository.startsWith(REPO)&&plugin.homepage.startsWith(REPO),'plugin repository and homepage are ours');
 const ci=read('.github/workflows/ci.yml');a.ok(!/npm publish/.test(ci),'CI does not rehearse a publish');a.ok(!/fablecut-\*\.tgz|node_modules\/fablecut/.test(ci),'CI packs the package by its name');
 a.ok(!/readJSON\("server\.json"\)/.test(read('.github/scripts/release-check.js')),'release-check no longer reads server.json');
 const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 const files=['README.md','DEVELOPMENT.md','CLAUDE.md','server/cli.js','server/mcp-server.js','docs/llms.txt','docs/i18n/README.zh-CN.md',...walk('docs').filter(f=>/\.html$/.test(f)&&!/^docs\/(validation|demo)\//.test(f))];
 for(const f of files){const t=read(f);
  a.ok(!/npx\s+(-y\s+)?(fablecut|montclip)|"npx"/.test(t),f+' still tells people to install with npx');
  a.ok(!/plugin marketplace add ronak-create|fablecut\.mcpb/.test(t),f+' still points at the upstream plugin or bundle');}
});

test('editor, server, CLI and MCP descriptions name MontClip where a person reads them',()=>{
 const strings=src=>[...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(m=>m[2]);
 const out=[];
 for(const f of ['app/app.js','server/server.js','server/cli.js','server/mcp-server.js','index.html'])for(const s of f.endsWith('.html')?[read(f).replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'')]:strings(read(f)))out.push(...hits(s,f));
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

test('CI validates only JSON files that exist (server.json is gone with option A)', () => {
  // The named-JSON check moved from an inline ci.yml step into .github/scripts/ci-check.js
  // (MontClip #281 prep PR); the list still must name only files that exist — server.json stays gone.
  const src = fs.readFileSync(path.join(__dirname, '..', '.github', 'scripts', 'ci-check.js'), 'utf8');
  const files = (src.match(/const JSON_FILES = \[([\s\S]*?)\];/) || [])[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  a.ok(files.length >= 3, files.join(' '));
  for (const f of files) a.ok(fs.existsSync(path.join(__dirname, '..', f)), 'CI validates a file that is not there: ' + f);
});

test('QQ (2026-11-02): generated docs pages link to our repository, not upstream; the credit stays', () => {
 const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 const build=read('docs/docs/build.js');
 a.match(build,/const REPO = "https:\/\/github\.com\/good-night-oppie\/MontClip";/);
 a.match(build,/const RAW = "https:\/\/raw\.githubusercontent\.com\/good-night-oppie\/MontClip\/main\/CLAUDE\.md";/);
 const pages=walk('docs/docs').filter(f=>f.endsWith('.html'));a.ok(pages.length>=27,pages.length+' pages');
 for(const f of pages){
  const t=read(f).replace(/Based on \[?<a [^>]*href="https:\/\/github\.com\/ronak-create\/FableCut"[^>]*>[^<]*<\/a>/g,'');
  a.ok(!/(github\.com|raw\.githubusercontent\.com)\/ronak-create/.test(t),f+' still links to the upstream repository');
 }
});

test('QQ (2026-11-02): docs/i18n is under the brand rules; no translation promotes the upstream registry or npx', () => {
 const files=fs.readdirSync(path.join(root,'docs','i18n')).map(f=>'docs/i18n/'+f);
 a.ok(files.length>=1);
 for(const f of files){const t=read(f);
  a.ok(!/MCP Registry|registry\.modelcontextprotocol|io\.github\.ronak-create|npx\s+(-y\s+)?fablecut|plugin marketplace add ronak-create/i.test(t),f+' promotes the upstream registry or install');
  a.ok(/MontClip/.test(t),f+' names MontClip');}
 a.ok(!/README\.(es|ja|pt-BR)\.md/.test(read('CONTRIBUTING.md')),'CONTRIBUTING does not point at a removed translation');
});

test('QQ (2026-11-02): no page under docs/ links to the upstream repository, except the home and start pages\' credit', () => {
 const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 const pages=walk('docs').filter(f=>f.endsWith('.html')&&!/^docs\/(validation|demo)\//.test(f));
 a.ok(pages.includes('docs/docs/index.html'));
 const CREDIT=['docs/index.html','docs/en/index.html','docs/start/index.html','docs/en/start/index.html'];
 const found=[];
 for(const f of pages){
  const links=[...read(f).matchAll(/href="([^"]*ronak-create[^"]*)"/g)].map(m=>m[1]);
  // the credit: one link to the upstream repository itself, on the home and start pages only
  const allowed=CREDIT.includes(f)?links.filter(l=>l==='https://github.com/ronak-create/FableCut').slice(0,1):[];
  for(const l of links)if(!allowed.includes(l)||links.filter(x=>x===l).length>allowed.filter(x=>x===l).length)found.push(f+' → '+l);
 }
 a.deepEqual([...new Set(found)],[]);
});

// Deja (2026-11-02), JJ's option (a): the community page was upstream's wholesale; it goes, and so does every way to it.
test('Deja (2026-11-02): no community page, and nothing links to one', () => {
 a.ok(!fs.existsSync(path.join(root,'docs','community')),'docs/community is removed');
 const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 const pages=walk('docs').filter(f=>f.endsWith('.html')&&!/^docs\/(validation|demo)\//.test(f));
 a.ok(pages.includes('docs/docs/index.html')&&pages.includes('docs/index.html'));
 for(const f of [...pages,'docs/docs/build.js','docs/sitemap.xml'])
  a.ok(!/href="[^"]*community\/?"|<loc>[^<]*\/community\/?<\/loc>/.test(read(f)),f+' links to the community page');
});

test('Deja (2026-11-02): no public page offers a fablecut.space email address or Discord', () => {
 const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 // every page we publish under docs/ (the playground included) and what the docs pages are generated from
 const files=[...walk('docs').filter(f=>/\.(html|svg)$/.test(f)&&!/^docs\/validation\//.test(f)),'docs/docs/build.js'];
 for(const f of files){const t=read(f);
  a.ok(!/[\w.+-]+@fablecut\.space/i.test(t),f+' shows a fablecut.space email address');
  a.ok(!/discord/i.test(t),f+' mentions Discord');}
});
