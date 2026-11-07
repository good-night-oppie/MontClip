'use strict';
// The docs pages are generated from CLAUDE.md (node docs/docs/build.js). Their
// "Edit this in CLAUDE.md" link opens the section by its GitHub heading anchor,
// not by line number: a line number moved on every CLAUDE.md change, so every
// page changed and every open PR conflicted on them.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');

// a copy of what build.js reads, so the test never rewrites the repo's pages
function sandbox(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docs-edit-link-'));
 fs.mkdirSync(path.join(dir,'docs','docs'),{recursive:true});
 for(const f of ['package.json','CLAUDE.md','docs/docs/build.js','docs/docs/icons.svg','docs/docs/studio.md'])
  fs.copyFileSync(path.join(root,f),path.join(dir,f));
 return dir;
}
function pages(dir){
 const out={},base=path.join(dir,'docs','docs');
 const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
  if(e.isDirectory())walk(p);else if(e.name==='index.html')out[path.relative(base,p)]=fs.readFileSync(p,'utf8');}};
 walk(base);return out;
}
const build=dir=>execFileSync(process.execPath,[path.join(dir,'docs','docs','build.js')],{stdio:'pipe'});

test('a line added to CLAUDE.md leaves every docs page unchanged',t=>{
 const dir=sandbox();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 build(dir);const before=pages(dir);
 a.ok(Object.keys(before).length>=27,Object.keys(before).length+' pages');
 const md=path.join(dir,'CLAUDE.md'),src=fs.readFileSync(md,'utf8').split('\n');
 src.splice(2,0,'A line added near the top, outside any section a page shows.');
 fs.writeFileSync(md,src.join('\n'));
 build(dir);
 a.deepEqual(pages(dir),before);
});

test('the edit link opens the section by its GitHub anchor, never a line number',()=>{
 const html=pages(path.join(__dirname,'..'));
 const link=s=>(/href="https:\/\/github\.com\/good-night-oppie\/MontClip\/blob\/main\/CLAUDE\.md(#[^"]*)?"[^>]*>Edit this in CLAUDE\.md/.exec(s)||[])[1];
 a.equal(link(html[path.join('project-json','index.html')]),'#projectjson-schema');
 a.equal(link(html[path.join('mcp','index.html')]),'#mcp-connection-preferred--works-from-any-session-any-directory');
 a.equal(link(html[path.join('library','index.html')]),'#the-asset-library-library--default-media');
 a.equal(link(html[path.join('frames','index.html')]),'#look-at-the-footage-fablecut_frame');
 for(const [f,s] of Object.entries(html)){
  if(!s.includes('Edit this in CLAUDE.md'))continue;
  a.match(link(s)||'',/^#[\p{L}\p{N}_-]+$/u,f);
  a.doesNotMatch(s,/CLAUDE\.md#L\d/,f);
 }
});
