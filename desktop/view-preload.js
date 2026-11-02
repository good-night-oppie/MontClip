'use strict';
const {contextBridge,ipcRenderer}=require('electron');
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
