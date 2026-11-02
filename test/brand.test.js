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

test('README names MontClip and credits the upstream once',()=>{
 const readme=read('README.md'),lines=readme.split('\n');
 a.match(lines.find(l=>l.startsWith('# '))||'',/MontClip/);
 a.ok(/基于 \[?ronak-create\/FableCut\]?(\([^)]*\))?（MIT）/.test(readme),'attribution line');
 // the attribution line is the only place the upstream product name may appear as a word
 const rest=lines.filter(l=>!/基于 .*ronak-create\/FableCut/.test(l)).join('\n');
 a.deepEqual(hits(rest.replace(/\[[^\]]*\]\((https?:\/\/[^)]*)\)/g,(m)=>m.replace(/https?:\/\/\S*?(?=\))/,'')),'README'),[]);
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
 for(const f of ['docs/index.html','docs/start/index.html'])if(fs.existsSync(path.join(root,f))){
  // third-party quotes about the upstream project stay as they were said
  const page=read(f).replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<blockquote>[\s\S]*?<\/blockquote>/g,'');
  a.match(page,/<title>[^<]*MontClip/,f);
  a.deepEqual(hits(page.replace(/https?:\/\/[^"'\s<>]+/g,''),f).filter(h=>!/基于|based on/i.test(h)),[]);
 }
});
