'use strict';
// P1 (Deja, 2026-11-03; docs/decisions/2026-11-03-unified-backend-architecture.md): one capability table for the buttons,
// the AI and MCP. Each capability has a schema, a risk level fixed in the program (the page and the AI cannot change it)
// and one plain sentence in Chinese and English. Unknown names are refused, never treated as harmless.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Cap=require('../capabilities'),TOOLS=require('../mcp-tools');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('every MCP tool and both proposal shapes are in the table, nothing else',()=>{
 const names=Cap.list().map(c=>c.name).sort();
 a.deepEqual(names,[...TOOLS.map(t=>t.name),'keep_ranges','keep_sentences'].sort());
 a.equal(TOOLS.length,24);
});
test('the MCP server serves the same tool definitions it always had (moved to mcp-tools.js, unchanged)',()=>{
 const src=read('mcp-server.js');
 a.match(src,/const TOOLS = require\("\.\/mcp-tools"\);/);
 a.ok(!/name: "fablecut_status"/.test(src),'no second copy left in mcp-server.js');
 for(const t of TOOLS){a.equal(typeof t.description,'string');a.equal(t.inputSchema.type,'object');}
});
test('each capability: a schema, one of the four risk levels, a plain sentence in both languages',()=>{
 for(const c of Cap.list()){
  a.ok(Cap.RISKS.includes(c.risk),c.name+' '+c.risk);
  a.equal(c.schema.type,'object',c.name);
  a.ok(c.summary['zh-CN']&&c.summary.en,c.name);
  a.ok(c.summary['zh-CN'].length<=60&&!/[{}<>]/.test(c.summary['zh-CN']),c.name+' one plain sentence');
 }
 a.deepEqual(Cap.RISKS,['read','undoable','sensitive','external']);
});
test('risk levels follow the draft: reading is read, edits are undoable, files written or deleted are sensitive, sending out is external',()=>{
 const r=n=>Cap.riskOf(n);
 for(const n of ['fablecut_status','fablecut_docs','fablecut_get_project','fablecut_frame','fablecut_scopes','fablecut_encode_profiles'])a.equal(r(n),'read',n);
 for(const n of ['keep_ranges','keep_sentences','fablecut_patch_project','fablecut_silence','fablecut_beats','fablecut_reframe'])a.equal(r(n),'undoable',n);
 for(const n of ['fablecut_export','fablecut_projects','fablecut_versions','fablecut_captions'])a.equal(r(n),'sensitive',n);
 a.equal(r('fablecut_import_media'),'external','it can download from a URL');
});
test('unknown names are blocked; the table cannot be changed from outside',()=>{
 a.equal(Cap.riskOf('rm_rf'),'blocked');a.equal(Cap.riskOf('__proto__'),'blocked');a.equal(Cap.riskOf(''),'blocked');
 const c=Cap.get('keep_ranges');a.ok(Object.isFrozen(c)&&Object.isFrozen(c.summary)&&Object.isFrozen(c.schema));
 a.throws(()=>{'use strict';c.risk='read';});
 a.equal(Cap.riskOf('keep_ranges'),'undoable');
 for(const b of ['delete_or_rewrite_source','send_outside_allowlist','write_outside_workspace','overwrite_existing_file'])a.ok(Cap.BLOCKED.includes(b),b);
});
test('the desktop main process holds the table and gives the page a read-only copy',()=>{
 const main=read('desktop/main.js'),pre=read('desktop/view-preload.js');
 a.match(main,/require\(["']\.\.\/capabilities["']\)/);
 a.match(main,/montclip:capabilities:get/);
 a.match(pre,/montclipCapabilities/);
 a.ok(!/montclip:capabilities:set/.test(main+pre),'no way to change it');
});
