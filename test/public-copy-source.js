'use strict';
// JJ's public copy for README / docs home / docs/start (test/fixtures/montclip-public-copy-v2.md,
// sha256 5766152b…: v1 of 2026-11-02, sha256 3ec69dbf…, plus the README cover and diagrams of 2026-11-07). Parsed, not retyped, so the pages and the tests
// read the same sentences. Placeholders are filled with the values Deja confirmed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FILE=path.join(__dirname,'fixtures','montclip-public-copy-v2.md');
const SHA256='db1d57866d5cf4b9e079b4dc8cc7550baa68072b9d0fbff3b4ea45cae69c5408';
const VALUES={'{repo}':'https://github.com/good-night-oppie/MontClip','{upstream}':'https://github.com/ronak-create/FableCut','{upstream-docs}':'https://github.com/ronak-create/FableCut'};
const fill=s=>s.replace(/\{repo\}|\{upstream-docs\}|\{upstream\}/g,k=>VALUES[k]);
function source(){return fs.readFileSync(FILE,'utf8').replace(/\r\n/g,'\n');}
function sha(){return crypto.createHash('sha256').update(source()).digest('hex');}
// Text between a heading line and the next heading of the same or higher level.
function section(text,heading){
 const lines=text.split('\n'),i=lines.findIndex(l=>l===heading);if(i<0)throw new Error('missing '+heading);
 const level=heading.match(/^#+/)[0].length,out=[];
 let fence=false; // headings inside a ```markdown block are page text, not this file's structure
 for(const l of lines.slice(i+1)){if(/^```/.test(l))fence=!fence;const m=!fence&&l.match(/^(#+) /);if(m&&m[1].length<=level)break;out.push(l);}
 return out.join('\n');
}
function fenced(text){const m=text.match(/```markdown\n([\s\S]*?)\n```/);if(!m)throw new Error('no markdown block');return m[1];}
// Rows in order as [position, text]; positions repeat ("Section"), so not an object.
function table(text){
 return text.split('\n').filter(l=>/^\|/.test(l)).slice(2).map(l=>l.split('|').slice(1,-1).map(c=>c.trim()));
}
const code=s=>s.replace(/`([^`]*)`/g,'$1');
function parse(){
 const text=source(),readme=section(text,'## 1. README.md（开头 + 正文）'),home=section(text,'## 2. docs/index.html 首页'),start=section(text,'## 3. docs/start 下载页');
 return {
  rules:section(text,'## 落地规则（实施必读，不进页面）'),
  readme:{zh:fill(fenced(section(readme,'### 中文版（docs/i18n/README.zh-CN.md）'))),en:fill(fenced(section(readme,'### English version (README.md)')))},
  home:{zh:table(section(home,'### 中文')),en:table(section(home,'### English'))},
  start:{zh:table(section(start,'### 中文')),en:table(section(start,'### English'))},
  fill,code
 };
}
module.exports={FILE,SHA256,VALUES,sha,parse,fill};
