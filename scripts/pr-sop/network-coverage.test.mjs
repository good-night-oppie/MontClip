import assert from "node:assert/strict";
import { it } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { networkUses, coverage, readMainSources } from "./network-scan.mjs";
import { classifyFiles } from "./rules.mjs";

it("联网扫描正控：指定五种接口都可发现", () => {
  for (const source of ["fetch('/api')", "https.request(url)", "http.request('https://example.org')", "net.connect(443)", "new WebSocket(url)"]) assert.ok(networkUses(source).length, source);
});
it("联网扫描负控：普通注释不算接口，HTTPS字符串不破坏后续扫描", () => {
  assert.equal(networkUses("// fetch(url)\n/* https.request(url) */ const x=1;").length, 0);
  assert.equal(networkUses("const url='https://example.org'; fetch(url);").length, 1);
});
it("HTTP明确回环地址排除，外部或未知目的地保守计入", () => {
  for (const arg of ["'http://127.0.0.1:8775/api'", "'http://localhost:8775'", "{hostname:'127.0.0.1',port:80}"]) assert.equal(networkUses(`http.request(${arg})`).length, 0);
  for (const arg of ["'http://example.org'", "url", "{hostname:target}"]) assert.equal(networkUses(`http.request(${arg})`).length, 1);
});
it("Node导入别名及解构调用可发现", () => {
  for (const source of ["const tls=require('node:https');tls.request(url)", "import {request as send} from 'https';send(url)", "const {connect:open}=require('net');open(443)"]) assert.ok(networkUses(source).length);
});
it("回环URL被第二组选项覆盖、动态或重复目的地不能豁免", () => {
  for (const source of ["http.request('http://127.0.0.1/a',{hostname:'example.org'})", "http.request({host:'127.0.0.1',hostname:remoteHost})", "http.request({host:'127.0.0.1',host:'example.org'})"]) assert.equal(networkUses(source).length,1);
});
it("浏览器执行字符串和模板里的接口保守计入", () => {
  assert.ok(networkUses('page.evaluate(`fetch(url)`)').length);
  assert.ok(networkUses('const script="new WebSocket(url)"').length);
});
it("新增联网文件未进分类表必须失败并报告文件名", () => {
  const r = coverage([{path:"new-network.js",source:"fetch(url)"}], {av:[],outbound:["agent*.js"]});
  assert.deepEqual(r.missing.map(x => x.path), ["new-network.js"]);
  assert.equal(coverage([{path:"agent-new.js",source:"fetch(url)"}], {av:[],outbound:["agent*.js"]}).missing.length, 0);
});
it("docs/demo原样副本不触发，重命名前的实际代码仍触发", () => {
  const profile = {outbound:["app.js"],av:["app.js"],exclude:["docs/demo/**"]};
  assert.equal(coverage([{path:"docs/demo/app.js",source:"fetch(url)"}], profile).found.length, 0);
  assert.equal(classifyFiles(["docs/demo/app.js"],profile).outbound,false);
  assert.equal(classifyFiles([{filename:"docs/demo/app.js",previous_filename:"app.js"}],profile).outbound,true);
});
it("测试驱动不计外发；扫描跳过并在结果中列出，产品文件仍从严", () => {
  const profile = {outbound:["app.js"],av:[],outboundExclude:["test/**","desktop/*-smoke.cjs","desktop/*-perf.cjs","desktop/m0-smoke.js"]};
  const files=[{path:"test/a.test.js",source:"fetch(url)"},{path:"desktop/export-smoke.cjs",source:"fetch(url)"},
    {path:"desktop/highlights-perf.cjs",source:"fetch(url)"},{path:"desktop/m0-smoke.js",source:"fetch(url)"},
    {path:"app.js",source:"fetch(remoteUrl)"}];
  const r=coverage(files,profile);
  assert.deepEqual(r.missing,[]);
  assert.deepEqual(r.skipped.sort(),["desktop/export-smoke.cjs","desktop/highlights-perf.cjs","desktop/m0-smoke.js","test/a.test.js"]);
  for(const f of files.slice(0,4)) assert.equal(classifyFiles([f.path],profile).outbound,false,f.path);
  assert.equal(classifyFiles(["app.js"],profile).outbound,true);
  assert.equal(coverage([{path:"app.js",source:"fetch(remoteUrl)"}],{outbound:[],av:[]}).missing.length,1);
});
it("main全部JS/CJS/MJS联网接口均在外发路径表中（只读，不执行源码）", t => {
  const snapshot = readMainSources(fileURLToPath(new URL("../../", import.meta.url)));
  const policy = JSON.parse(fs.readFileSync(new URL("policy.json", import.meta.url), "utf8"));
  const result = coverage(snapshot.files, policy.repositories[snapshot.repo]);
  t.diagnostic(JSON.stringify({repo:snapshot.repo,main:snapshot.head,total:snapshot.total,scanned:result.scanned,excluded:snapshot.excluded.length,skipped:result.skipped.length,skippedPaths:result.skipped,networkFiles:result.found.length,missing:result.missing.length}));
  assert.deepEqual(result.missing, [], "联网路径漏分类（文件/API/行号）："+JSON.stringify(result.missing));
});
