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
// Two fixed settings only. No file/path/channel/Node interface reaches the page.
contextBridge.exposeInMainWorld('montclipViewSettings',Object.freeze({
 get:()=>ipcRenderer.sendSync('montclip:view:get'),
 set:value=>ipcRenderer.sendSync('montclip:view:set',value)
}));
// The user's own FFmpeg for H.264 export (libx264). The page can only ask the main
// process to show its file dialog, read the status or forget the choice; no path is sent.
contextBridge.exposeInMainWorld('montclipExternalFfmpeg',Object.freeze({
 get:()=>ipcRenderer.invoke('montclip:ffmpeg:get'),
 choose:()=>ipcRenderer.invoke('montclip:ffmpeg:choose'),
 clear:()=>ipcRenderer.invoke('montclip:ffmpeg:clear')
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

contextBridge.exposeInMainWorld('montclipAgentSessions',Object.freeze({get:()=>ipcRenderer.sendSync('montclip:sessions:get'),set:value=>ipcRenderer.sendSync('montclip:sessions:set',value)}));
