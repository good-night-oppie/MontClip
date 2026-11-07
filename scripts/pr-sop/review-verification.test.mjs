import assert from 'node:assert/strict';
import {it} from 'node:test';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkPR,exceptionVerified,verifiedExceptionItems,classifyFiles} from './rules.mjs';
import {workflowText} from './make-workflow.mjs';
const head='a'.repeat(40),old='b'.repeat(40),repo='good-night-oppie/MontClip';
const policy=JSON.parse(fs.readFileSync(new URL('policy.json',import.meta.url))),teammates=JSON.parse(fs.readFileSync(new URL('teammates.json',import.meta.url)));
const body='QQ 请审\n负责人：BB\n改动：规则\n复现：node --test\n测试：1/1\n依赖：无';
const review=(more={})=>({author:{login:'GoodNightOppie'},commit:{oid:head},state:'COMMENTED',body:'SOP 例外已核验：测试',...more});
const pr=(reviews=[])=>({body,headRefOid:head,reviewRequests:[{login:'GoodNightOppie'}],reviews});
const items=[{item:'tests',label:'测试'}];
const run=(text=body,more={},files=[])=>checkPR({pr:{...pr(),body:text,...more},files,repo,policy,teammates});
it('APPROVED/COMMENTED当前head的精确review行有效',()=>{
 for(const state of ['APPROVED','COMMENTED'])assert.equal(exceptionVerified(pr([review({state})]),items),true);
});
it('旧head标记在新head上失效',()=>assert.equal(exceptionVerified(pr([review({commit:{oid:old}})]),items),false));
it('其他人、DISMISSED/PENDING/CHANGES_REQUESTED不算核验',()=>{
 assert.equal(exceptionVerified(pr([review({author:{login:'BB'}})]),items),false);
 for(const state of ['DISMISSED','PENDING','CHANGES_REQUESTED',undefined])assert.equal(exceptionVerified(pr([review({state})]),items),false);
});
it('项目逐项对齐，可由多个当前有效review覆盖，不齐不放行',()=>{
 const required=[...items,{item:'dependencies',label:'依赖'}];
 assert.equal(exceptionVerified(pr([review()]),required),false);
 assert.equal(exceptionVerified(pr([review(),review({body:'SOP 例外已核验：依赖',state:'APPROVED'})]),required),true);
});
it('只能精确整行，项目不对、引用、代码块、空格、半角冒号不算',()=>{
 for(const text of ['SOP 例外已核验：外发',' SOP 例外已核验：测试','SOP 例外已核验：测试 ','SOP 例外已核验:测试','> SOP 例外已核验：测试','说明：SOP 例外已核验：测试','```text\nSOP 例外已核验：测试\n```','SOP 例外已核验：<项目>'])assert.equal(exceptionVerified(pr([review({body:text})]),items),false,text);
});
it('完整head不可缺失；REST review字段也能绑定；CRLF正常',()=>{
 assert.equal(exceptionVerified({...pr([review()]),headRefOid:'aaaa'},items),false);
 assert.equal(exceptionVerified(pr([{user:{login:'GoodNightOppie'},commit_id:head,state:'COMMENTED',body:'核验\r\nSOP 例外已核验：测试\r\n'}]),items),true);
});
it('标签及timeline不能再替代review',()=>{
 assert.equal(exceptionVerified({...pr(),labels:[{name:'sop-exception-verified'}]},items),false);
 assert.equal(run(body+'\nSOP 例外：测试 — 人工核读 — 证据：c1c25e38').status,'needs_qq');
});
it('正文不做SHA绑定，但其他缺项仍失败',()=>{
 const text=body+'\nSOP 例外：测试 — 新增一个错字 — 证据：c1c25e38';
 assert.equal(run(text,{reviews:[review()]}).status,'passed');
 assert.equal(run(text.replace('改动：规则','改动：'),{reviews:[review()]}).status,'failed');
});
it('QQ不在实现名册，连负责人例外也不能把QQ当负责人',()=>{
 assert.equal(teammates.includes('QQ'),false);
 const text=body.replace('负责人：BB','负责人：QQ');assert.equal(run(text).status,'failed');
 assert.equal(run(text+'\nSOP 例外：负责人 — 人工安排 — 证据：c1c25e38',{reviews:[review({body:'SOP 例外已核验：负责人'})]}).status,'failed');
});
it('server.js同时要求音画同步和外发，缺任一都失败',()=>{
 const files=['server.js'],av='\n音画同步：没跑：未修改实际媒体路径',out='\n外发：内容：API元数据；接收方：api.github.com；能否关闭：能';
 assert.deepEqual(classifyFiles(files,policy.repositories[repo]),{av:true,outbound:true});
 assert.equal(run(body+av,{},files).status,'failed');assert.equal(run(body+out,{},files).status,'failed');
 assert.equal(run(body+av+out,{},files).status,'passed');
});
it('review正文不会进入对外摘要或其他输出字段',()=>{
 const r=run(body+'\nSOP 例外：测试 — 核读 — 证据：c1c25e38',{reviews:[review({body:'DO_NOT_PRINT_REVIEW_TEXT\nSOP 例外已核验：测试'})]});
 assert.equal(JSON.stringify(r).includes('DO_NOT_PRINT_REVIEW_TEXT'),false);assert.deepEqual([...verifiedExceptionItems(pr([review()]))],['tests']);
});
it('可信基线夹具：PR修改workflow及规则为exit0，仍运行固定检查器阻断缺负责人',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sop-trusted-workflow-')),attacker=path.join(dir,'attacker'),sentinel=path.join(dir,'executed-pr-code');
 fs.mkdirSync(path.join(attacker,'.github/workflows'),{recursive:true});fs.mkdirSync(path.join(attacker,'scripts/pr-sop'),{recursive:true});
 fs.writeFileSync(path.join(attacker,'.github/workflows/pr-sop.yml'),'name: sop-pr-lint\non: pull_request_review\njobs:\n  metadata:\n    steps:\n      - run: exit 0\n');
 fs.writeFileSync(path.join(attacker,'scripts/pr-sop/rules.mjs'),`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(sentinel)},'executed');process.exit(0);`);
 const event=path.join(dir,'event.json'),script=path.join(dir,'trusted.mjs');
 fs.writeFileSync(event,JSON.stringify({pull_request:{number:1,head:{sha:head},body:body.replace('负责人：BB','')+'\n外发：内容：API元数据；接收方：api.github.com；能否关闭：能\n## note\nATTACK_BODY_SENTINEL $(whoami)',title:'$(whoami)',user:{login:'EdwardTang'},changed_files:2}}));
 const code=workflowText().split("          node --input-type=module <<'PR_SOP_NODE'\n")[1].split('          PR_SOP_NODE')[0].split('\n').map(l=>l.slice(10)).join('\n');
 const mock=`const pr=JSON.parse((await import('node:fs')).readFileSync(process.env.GITHUB_EVENT_PATH)).pull_request;globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/files?')?[{filename:'.github/workflows/pr-sop.yml'},{filename:'scripts/pr-sop/rules.mjs'}]:String(url).includes('/reviews?')?[]:String(url).endsWith('/requested_reviewers')?{users:[{login:'GoodNightOppie'}]}:pr});\n`;
 fs.writeFileSync(script,mock+code);
 const r=spawnSync(process.execPath,[script],{cwd:attacker,windowsHide:true,encoding:'utf8',env:{...process.env,GITHUB_EVENT_PATH:event,GITHUB_EVENT_NAME:'pull_request_target',GITHUB_REPOSITORY:repo,GITHUB_TOKEN:''}});
 assert.equal(r.status,1,r.stderr);assert.match(r.stdout,/负责人/);assert.doesNotMatch(r.stdout,/ATTACK_BODY_SENTINEL/);assert.equal(fs.existsSync(sentinel),false);
});
