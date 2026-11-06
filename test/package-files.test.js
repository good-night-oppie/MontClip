'use strict';
// VV / Deja (2026-11-03): the Windows package built from main e8d0c16 failed at start with ENOENT …resources\app\desktop\
// asr-manifest.json. asr-models.js reads that file with fs.readFileSync, and package-win.cjs's desktopFiles() only took the
// files that are require()d. Every file the shipped code reads from its own folders (path.join(__dirname | ROOT | APP_DIR,
// "literal", …)) must be in the package; this test lists them and checks each one, so a new one can't be missed again.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..');
const P=require('../desktop/package-win.cjs');
const tracked=execFileSync('git',['ls-files'],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');
const files=P.packagedFiles(ROOT,tracked);
const inPackage=(rel)=>files.some((f)=>rel===f||(f.endsWith('/')&&rel.startsWith(f)));

test('the shipped app and generated tester notes make no unsupported AI naming claims',()=>{
 const forbidden=['AI 起的名字','写的说明'];
 const check=(name,content)=>{
  // esbuild may encode Chinese as Unicode escapes in the shipped bundle.
  const decoded=content.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  for(const phrase of forbidden)a.ok(!decoded.includes(phrase),name+': unsupported claim '+phrase);
 };
 const scan=(rel)=>{
  const full=path.join(ROOT,rel);
  if(fs.statSync(full).isDirectory())for(const entry of fs.readdirSync(full))scan(path.join(rel,entry));
  else check(rel,fs.readFileSync(full,'utf8'));
 };
 for(const rel of new Set(files))scan(rel);
 const R=require('../desktop/package-readme/render.js');
 for(const lang of ['zh-CN','en'])for(const urlHidden of [false,true])for(const copyGone of [false,true])
  check('generated README '+lang,R.render(R.read(lang),{lang,buildId:'test-build',urlHidden,copyGone}).text);
});

test('the package list is what package-win.cjs takes, and the program starts from it',()=>{
 for(const f of ['desktop/main.js','desktop/view-preload.js','server.js','app.js','index.html','asr-models.js'])a.ok(inPackage(f),f);
 a.ok(!files.some((f)=>f.startsWith('test/')),'no tests');
});

test('desktop/asr-manifest.json is in the package (the e8d0c16 start failure)',()=>{
 a.ok(inPackage('desktop/asr-manifest.json'));
});

test('every repository file the shipped code reads is in the package',()=>{
 // smoke modules run only in development (main.js loads them with --montclip-smoke); their fixtures are not shipped
 const reads=P.repoReads(ROOT,files.filter((f)=>/\.(c?js)$/.test(f)&&!/-smoke\.c?js$/.test(f)&&tracked.includes(f)),tracked);
 a.ok(reads.some((r)=>r.target==='desktop/asr-manifest.json'&&r.from==='asr-models.js'),'the scan sees asr-models.js reading the manifest');
 const missing=reads.filter((r)=>!inPackage(r.target)).map((r)=>r.from+' → '+r.target);
 a.deepEqual(missing,[]);
});

test('the scan finds the shapes it is for',()=>{
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'pkg-reads-'));
 try{
  fs.mkdirSync(path.join(dir,'desktop'));fs.writeFileSync(path.join(dir,'desktop','x.json'),'{}');fs.writeFileSync(path.join(dir,'y.txt'),'');
  fs.writeFileSync(path.join(dir,'a.js'),`const fs=require("fs"),path=require("path");JSON.parse(fs.readFileSync(path.join(__dirname, "desktop", "x.json"), "utf8"));`);
  fs.writeFileSync(path.join(dir,'desktop','b.js'),`fs.readFileSync(path.join(__dirname,'..','y.txt'));fs.existsSync(path.join(__dirname, 'nothere.json'));`);
  const r=P.repoReads(dir,['a.js','desktop/b.js'],['a.js','desktop/b.js','desktop/x.json','y.txt']).map((x)=>x.from+' → '+x.target).sort();
  a.deepEqual(r,['a.js → desktop/x.json','desktop/b.js → y.txt']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
