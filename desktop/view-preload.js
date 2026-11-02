'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('montclipAgentService',Object.freeze({
 reset:()=>ipcRenderer.invoke('montclip:agent:reset'),
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

contextBridge.exposeInMainWorld('montclipPaneSettings',Object.freeze({
 get:()=>ipcRenderer.sendSync('montclip:pane:get'),
 set:value=>ipcRenderer.sendSync('montclip:pane:set',value)
}));

contextBridge.exposeInMainWorld('montclipWorkspaceSettings',Object.freeze({
 get:()=>ipcRenderer.sendSync('montclip:workspace:get'),
 set:value=>ipcRenderer.sendSync('montclip:workspace:set',value),
 migrate:value=>ipcRenderer.sendSync('montclip:workspace:migrate',value)
}));

contextBridge.exposeInMainWorld('montclipAgentSessions',Object.freeze({get:()=>ipcRenderer.sendSync('montclip:sessions:get'),set:value=>ipcRenderer.sendSync('montclip:sessions:set',value)}));
