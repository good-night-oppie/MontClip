/* One privacy boundary for errors exposed to tool callers or stored for replay. */
'use strict';
const path=require('node:path');
const {hidePaths}=require('./asr-status');
const PATH_FIELDS=/^(saved|path|file|filename|directory|dir)$/i;
function toolError(value,{dataDir,legacy=false,result=false}={}) {
  const relative=p=>{
    if(typeof p!=='string') return p;
    if(/^file:/i.test(p)) {
      try {
        const url=new URL(p), name=decodeURIComponent(url.pathname);
        p=url.hostname ? '//'+url.hostname+name : name.replace(/^\/([a-z]:\/)/i,'$1');
      } catch { return null; }
    }
    const win=/^(?:[a-z]:[\\/]|[\\/]{2})/i.test(p);
    const api=win?path.win32:path.posix;
    if(api.isAbsolute(p)){
      if(!dataDir) return null;
      const rel=api.relative(dataDir,p);
      if(api.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+api.sep)) return null;
      return rel.split(api.sep).join('/');
    }
    if(/^(?:[a-z]+:|~)/i.test(p)) return null;
    const rel=path.posix.normalize(p.replace(/\\/g,'/'));
    return rel==='..'||rel.startsWith('../')?null:rel;
  };
  const text=(s,key)=>{
    if(legacy && dataDir) {
      const root=String(dataDir).replace(/[\\/]+$/,'').split(/[\\/]/)
        .map(part=>part.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&')).join('[\\\\/]+');
      s=s.replace(new RegExp(root+'(?=[\\\\/]|$)(?:[\\\\/]+)?',/^[a-z]:/i.test(dataDir)?'gi':'g'),'');
    }
    if(legacy && /^\s*[\[{]/.test(s)) {
      try { return JSON.stringify(visit(JSON.parse(s))); } catch { /* A text message, not structured JSON. */ }
    }
    // Legacy successful strings may contain a source route as well as an error. Routes aren't filesystem paths.
    const routes=[];
    if(legacy && !/error|message|warning|why|detail/i.test(key||'')) s=s.replace(/(?<![\w:/\\])\/(?:media|library|exports|analysis|proxies)\/[^\s"'`,;()<>\[\]{}]+/g,
      route=>{routes.push(route);return '\uE000'+(routes.length-1)+'\uE001';});
    s=hidePaths(s);
    return legacy?s.replace(/\uE000(\d+)\uE001/g,(_,i)=>routes[+i]):s;
  };
  const visit=(v,key)=>{
    if(result) {
      if(/^(error|errors|warning|warnings|why|detail|probeError)$/i.test(key||''))
        return toolError(v,{dataDir});
      if(typeof v==='string') {
        if(/^\s*[\[{]/.test(v)) {
          try {
            const parsed=JSON.parse(v), clean=visit(parsed);
            return JSON.stringify(parsed)===JSON.stringify(clean)?v:JSON.stringify(clean);
          } catch { /* Unstructured success text has its diagnostic leaves sanitized by its producer. */ }
        }
        return v;
      }
    }
    if(PATH_FIELDS.test(key||'')){
      if(Array.isArray(v))return v.map(relative).filter(p=>p!==null);
      if(typeof v==='string')return relative(v);
    }
    if(typeof v==='string') return text(v,key);
    if(v instanceof Error){
      const out=new Error(text(String(v.message||v)));
      for(const k of Object.keys(v)) if(k!=='stack'&&k!=='message') out[k]=visit(v[k],k);
      return out;
    }
    if(Array.isArray(v))return v.map(x=>visit(x));
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='stack').map(([k,x])=>[k,visit(x,k)]));
    return v;
  };
  return visit(value);
}
module.exports={toolError};

