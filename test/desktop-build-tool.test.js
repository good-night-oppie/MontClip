'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {dependency,nodeSupported}=require('../desktop/build-tool');
const meta={name:'@electron/packager',version:'20.3.0',type:'module',license:'BSD-2-Clause'};
function fixture(over={}){return{resolve:()=>path.resolve('tools/dist/index.js'),io:{readFileSync:p=>p.endsWith('LICENSE')?'official license fixture':JSON.stringify(meta)},version:'22.15.1',load:async()=>({packager(){throw Error('must never execute');}}),...over};}
test('ESM packager loader uses exported entry, validates pinned metadata, never packages',async()=>{const d=dependency(fixture());assert.equal(d.version,'20.3.0');assert.equal(typeof await d.load(),'function');});
test('build tool fails explicitly for old Node, missing dependency and mismatched metadata',()=>{assert.equal(nodeSupported('22.11.0'),false);assert.equal(nodeSupported('22.12.0'),true);assert.throws(()=>dependency(fixture({version:'20.0.0'})),/PACKAGER_NODE_VERSION_REQUIRED/);assert.throws(()=>dependency(fixture({resolve(){throw Error('missing');}})),/PACKAGER_DEPENDENCY_MISSING/);assert.throws(()=>dependency(fixture({io:{readFileSync:()=>JSON.stringify({...meta,version:'other'})}})),/PACKAGER_METADATA_MISMATCH/);});
test('invalid loaded API fails without fallback or executing a tool',async()=>{await assert.rejects(dependency(fixture({load:async()=>({})})).load(),/PACKAGER_INTERFACE_MISSING/);});
