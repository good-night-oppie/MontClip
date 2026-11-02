'use strict';
// Development-only dependency resolution. Never downloads or invokes packaging.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const expected=require('./package.json').devDependencies['@electron/packager'];
function nodeSupported(version){const [major,minor]=version.replace(/^v/,'').split('.').map(Number);return major>22 || major===22&&minor>=12;}
function dependency({resolve=require.resolve,io=fs,version=process.versions.node,load=url=>import(url)}={}){
 if(!nodeSupported(version))throw Error('PACKAGER_NODE_VERSION_REQUIRED');
 let entry;try{entry=resolve('@electron/packager');}catch{throw Error('PACKAGER_DEPENDENCY_MISSING');}
 // The pinned official package exports dist/index.js but not package.json.
 const root=path.dirname(path.dirname(entry));let meta;
 try{meta=JSON.parse(io.readFileSync(path.join(root,'package.json'),'utf8'));}catch{throw Error('PACKAGER_METADATA_INVALID');}
 if(meta.name!=='@electron/packager'||meta.version!==expected||meta.type!=='module'||meta.license!=='BSD-2-Clause')throw Error('PACKAGER_METADATA_MISMATCH');
 if(!io.readFileSync(path.join(root,'LICENSE'),'utf8').trim())throw Error('PACKAGER_LICENSE_MISSING');
 return {version:meta.version,license:meta.license,async load(){const mod=await load(pathToFileURL(entry).href);if(typeof mod.packager!=='function')throw Error('PACKAGER_INTERFACE_MISSING');return mod.packager;}};
}
if(require.main===module){Promise.resolve().then(async()=>{const d=dependency();await d.load();console.log(JSON.stringify({version:d.version,license:d.license,interfaceLoaded:true,packagingExecuted:false,releaseApproved:false}));}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={dependency,nodeSupported};
