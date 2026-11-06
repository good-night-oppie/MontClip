'use strict';
// Acceptance for a privacy recipe: changing only the synthetic secret must not
// change ANY output pixel, in ANY frame, in preview or the decoded real export.
// Usage: node real-tests/privacy-cover-check.cjs results.json blur|cover
const fs=require('node:fs'),assert=require('node:assert/strict');
const result=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),mode=process.argv[3];
assert.equal(result.completed,true,'runner must finish all scenarios');
assert.ok(['blur','cover'].includes(mode),'choose blur or cover');
const cases=result.cases.filter(c=>c.mode===mode);
assert.equal(cases.length,5,'all five scenarios required');
assert.deepEqual(cases.map(c=>c.scenario).sort(),['crop','edge','feather','move','static']);
let failures=0,frames=0;
for(const c of cases)for(const route of ['preview','export']) {
  assert.equal(c[route].length,12,'all twelve frames required');
  assert.deepEqual(c[route].map(f=>f.frame),Array.from({length:12},(_,i)=>i),'no missing or duplicate frame indices');
  const failed=c[route].filter(f=>f.changed!==0).length;failures+=failed;frames+=c[route].length;
  console.log(`${c.scenario} ${route}: ${failed}/${c[route].length} frames disclose a pixel difference`);
}
console.log(`${mode}: ${frames-failures}/${frames} frames independent of the synthetic secret`);
process.exitCode=failures?1:0;
