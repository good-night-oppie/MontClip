'use strict';
// Check one archive produced by .github/workflows/build-ffmpeg.yml before it is kept:
//   node desktop/ffmpeg-build/verify-build.cjs <archive> <linux64|win64>
// Prints a JSON record (SHA-256, configure line, problems) and exits 1 if the build links
// libopenh264 or any GPL / non-free component (rules: desktop/ffmpeg-audit.js).
// A win64 ffmpeg.exe cannot run on the Linux runner, so its embedded configure string and
// its bytes are read instead (an encoder named libopenh264 or the openh264 entry point; scanExe
// ignores the "--disable-libopenh264" flag in the embedded configure lines).
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {auditBuild,scanExe}=require('../ffmpeg-audit');
const [archive,target]=process.argv.slice(2);
if(!archive||!/^(linux64|win64)$/.test(target||''))throw Error('usage: verify-build.cjs <archive> <linux64|win64>');
const sha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ffverify-'));
cp.execFileSync(archive.endsWith('.zip')?'unzip':'tar',archive.endsWith('.zip')?['-q',archive,'-d',dir]:['-xJf',archive,'-C',dir]);
const find=(d,name)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){const r=find(p,name);if(r)return r;}else if(e.name===name)return p;}return null;};
let configuration='',encoders='',bytesHit=[];
if(target==='linux64'){
 const exe=find(dir,'ffmpeg');if(!exe)throw Error('no ffmpeg in the archive');
 configuration=(cp.execFileSync(exe,['-hide_banner','-version'],{encoding:'utf8'}).split(/\r?\n/).find(l=>l.startsWith('configuration:'))||'');
 encoders=cp.execFileSync(exe,['-hide_banner','-encoders'],{encoding:'utf8'});
}else{
 const exe=find(dir,'ffmpeg.exe');if(!exe)throw Error('no ffmpeg.exe in the archive');
 const buf=fs.readFileSync(exe),at=buf.indexOf('--prefix=');
 if(at>=0){const end=buf.indexOf(0,at);configuration='configuration: '+buf.subarray(at,end).toString('latin1');}
 bytesHit=scanExe(buf);
}
const problems=auditBuild({configuration,encoders});
if(bytesHit.length)problems.push({code:'OPENH264',detail:'ffmpeg.exe contains '+bytesHit.join(', ')});
const record={archive:path.basename(archive),target,sha256,configuration:configuration.replace(/^configuration: /,''),disablesOpenh264:/--disable-libopenh264\b/.test(configuration),problems};
process.stdout.write(JSON.stringify(record,null,1)+'\n');
fs.rmSync(dir,{recursive:true,force:true});
process.exit(problems.length||!record.disablesOpenh264?1:0);
