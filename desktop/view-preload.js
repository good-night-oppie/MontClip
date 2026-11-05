'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('montclipAgentService',Object.freeze({
 reset:()=>ipcRenderer.invoke('montclip:agent:reset'),
 deleteConnection:()=>ipcRenderer.invoke('montclip:agent:deleteConnection'),
 get:()=>ipcRenderer.invoke('montclip:agent:get'),
 configure:value=>ipcRenderer.invoke('montclip:agent:configure',value),
 send:value=>ipcRenderer.invoke('montclip:agent:send',value),
 cancel:id=>ipcRenderer.invoke('montclip:agent:cancel',id)
}));
// The AI's permission mode and the host's approval box (P4): the main process decides; the page answers a ticket only.
contextBridge.exposeInMainWorld('montclipAgentPolicy',Object.freeze({
 get:()=>ipcRenderer.invoke('montclip:policy:get'),
 setMode:mode=>ipcRenderer.invoke('montclip:policy:setMode',String(mode)),
 decide:value=>ipcRenderer.invoke('montclip:policy:decide',value),
 answer:value=>ipcRenderer.invoke('montclip:policy:answer',value)
}));
// Two fixed settings only. No file/path/channel/Node interface reaches the page.
// The streamer's corrections, kept by the main process on this computer: six fixed operations, no path, nothing sent.
contextBridge.exposeInMainWorld('montclipCorrections',Object.freeze({
 status:()=>ipcRenderer.sendSync('montclip:corrections:status'),
 records:()=>ipcRenderer.sendSync('montclip:corrections:records'),
 append:record=>ipcRenderer.sendSync('montclip:corrections:append',record),
 undo:id=>ipcRenderer.sendSync('montclip:corrections:undo',id),
 setEnabled:on=>ipcRenderer.sendSync('montclip:corrections:setEnabled',on===true),
 clear:()=>ipcRenderer.sendSync('montclip:corrections:clear')
}));
contextBridge.exposeInMainWorld('montclipCapabilities',Object.freeze({get:()=>ipcRenderer.sendSync('montclip:capabilities:get')}));
contextBridge.exposeInMainWorld('montclipViewSettings',Object.freeze({
 get:()=>ipcRenderer.sendSync('montclip:view:get'),
 set:value=>ipcRenderer.sendSync('montclip:view:set',value)
}));
// Feature switches the main process decides (desktop/features.js), read once; the page cannot set them.
contextBridge.exposeInMainWorld('montclipFeatures',Object.freeze({transcribe:!!(ipcRenderer.sendSync('montclip:features:get')||{}).transcribe}));
contextBridge.exposeInMainWorld('montclipNotify',Object.freeze({found:(found)=>ipcRenderer.send("montclip:notify:found", Number(found))}));
// The user's own FFmpeg for H.264 export (libx264). The page can only ask the main
// process to show its file dialog, read the status or forget the choice; no path is sent.
contextBridge.exposeInMainWorld('montclipExternalFfmpeg',Object.freeze({
 get:()=>ipcRenderer.invoke('montclip:ffmpeg:get'),
 choose:()=>ipcRenderer.invoke('montclip:ffmpeg:choose'),
 clear:()=>ipcRenderer.invoke('montclip:ffmpeg:clear')
}));
// The speech model (#70): the main process asks the streamer, then downloads it from its listed sites, or imports it from
// a folder the streamer picks. The page says only which model ('asr' | 'punct'); no path, no address.
contextBridge.exposeInMainWorld('montclipAsr',Object.freeze({
 download:which=>ipcRenderer.invoke('montclip:asr:download',which==='punct'?'punct':'asr'),
 import:()=>ipcRenderer.invoke('montclip:asr:import'),
 cancel:()=>ipcRenderer.invoke('montclip:asr:cancel'),
 choice:()=>ipcRenderer.invoke('montclip:asr:choice'),
 setChoice:v=>ipcRenderer.invoke('montclip:asr:choice',v==='later'?'later':'local'),
 onProgress:fn=>{const h=(_,p)=>{try{fn({which:p&&p.which==='punct'?'punct':'asr',loaded:Number(p&&p.loaded)||0,total:Number(p&&p.total)||0});}catch{}};ipcRenderer.on('montclip:asr:progress',h);return()=>ipcRenderer.removeListener('montclip:asr:progress',h);}
}));

contextBridge.exposeInMainWorld('montclipPaneSettings',Object.freeze({
 get:()=>ipcRenderer.sendSync('montclip:pane:get'),
 set:value=>ipcRenderer.sendSync('montclip:pane:set',value)
}));

contextBridge.exposeInMainWorld('montclipWorkspaceSettings',Object.freeze({
 get:()=>ipcRenderer.sendSync('montclip:workspace:get'),
 set:value=>ipcRenderer.sendSync('montclip:workspace:set',value),
 migrate:value=>ipcRenderer.sendSync('montclip:workspace:migrate',value)
}));

// Desktop FLV import: the page passes the File the user picked; only its path goes to the main process (read here),
// and no path comes back to the page.
contextBridge.exposeInMainWorld('montclipFlv',Object.freeze({
 inspect:file=>{let p='';try{p=webUtils.getPathForFile(file);}catch{}return ipcRenderer.invoke('montclip:flv:inspect',p);},
 prepare:value=>ipcRenderer.invoke('montclip:flv:prepare',value),
 status:id=>ipcRenderer.invoke('montclip:flv:status',{id}),
 cancel:id=>ipcRenderer.invoke('montclip:flv:cancel',{id}),
 finish:id=>ipcRenderer.invoke('montclip:flv:finish',{id})
}));

// how each of the editor's downloads ended (completed / cancelled / interrupted), its file name and whether its export
// copy was removed; and, before its own export's download, which file that is
contextBridge.exposeInMainWorld('montclipDownloads',Object.freeze({onDone:cb=>{ipcRenderer.on('montclip:download:done',(_e,v)=>cb({state:String(v&&v.state),name:String(v&&v.name),removed:v&&v.removed===true}));},expect:name=>ipcRenderer.send('montclip:downloads:expect',String(name))}));
contextBridge.exposeInMainWorld('montclipAgentSessions',Object.freeze({get:()=>ipcRenderer.sendSync('montclip:sessions:get'),set:value=>ipcRenderer.sendSync('montclip:sessions:set',value)}));
// The desktop shell's own "show in folder": only a workspace name (/exports/…, /media/…, /library/…), resolved in main.
contextBridge.exposeInMainWorld('montclipReveal',Object.freeze({show:src=>ipcRenderer.invoke('montclip:reveal',String(src))}));
