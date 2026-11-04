'use strict';
const esbuild=require('esbuild'),path=require('node:path'),fs=require('node:fs');
const parts=require('./cindy-resolve.cjs');
// The first Cindy components (upstream/, makecindy/cindy @ 0219236) keep their MontClip host adapters; only their own
// imports go to them. The parts taken at 43001ea (cindy-43001ea/, see cindy-resolve.cjs) resolve as in Cindy.
const UP=path.join(__dirname,'upstream'),HOST={'@/components/ui/input':'upstream/input.tsx','@/lib/utils':'host.tsx','react-i18next':'host.tsx','@/lib/composerListTextarea':'upstream/composerListTextarea.ts','@cindy/maker-shared/thinking-text':'upstream/thinkingText.ts'};
const firstPort={name:'first-port',setup(build){build.onResolve({filter:/.*/},args=>{const from=args.importer;if(!from)return undefined;
 if(args.path==='./tooltip'&&from===path.join(UP,'input.tsx'))return{path:path.join(__dirname,'tooltip-host.tsx')};
 const own=from.startsWith(UP+path.sep)||['pane.tsx','host.tsx','tooltip-host.tsx'].includes(path.relative(__dirname,from));
 return own&&HOST[args.path]?{path:path.join(__dirname,HOST[args.path])}:undefined;});}};
esbuild.build({plugins:[firstPort,parts.plugin({root:path.join(__dirname,'cindy-43001ea')})],entryPoints:[path.join(__dirname,'pane.tsx')],bundle:true,metafile:true,loader:{'.css':'empty'},banner:{js:'/* MontClip generated adaptation, 2026-11-04: combines unmodified Cindy components (makecindy/cindy @ 021923684f54129effbba6b72a8218526418fa45 and @ 43001eaaa31ef322de9ae148c4051087277d6198, Apache-2.0, Copyright 2026 XD Inc.) with MontClip host adapters and stand-ins. Bundling/minification and host imports differ from the upstream application. See LICENSES.md and agent-ui/SOURCES.json; upstream LICENSE and NOTICE are retained. */'},format:'iife',platform:'browser',jsx:'automatic',minify:process.env.MONTCLIP_NO_MINIFY!=="1",/* MONTCLIP_NO_MINIFY=1: readable stack traces while debugging; never commit that build */legalComments:'eof',outfile:path.join(__dirname,'../cindy-official.js'),define:{'process.env.NODE_ENV':'"production"','import.meta.env.PROD':'true','import.meta.env.DEV':'false'}}).then(r=>{
 // the npm packages that went into the bundle, for the license check (test/cindy-source.test.js)
 const pkgs=new Set();for(const f of Object.keys(r.metafile.inputs)){const m=/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(f);if(m)pkgs.add(m[1].replace(/\\/g,'/'));}
 fs.writeFileSync(path.join(__dirname,'BUNDLED-PACKAGES.json'),JSON.stringify([...pkgs].sort(),null,1)+'\n');
});
