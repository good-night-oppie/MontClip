'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Two fixed settings only. No file/path/channel/Node interface reaches the page.
contextBridge.exposeInMainWorld('montclipViewSettings',Object.freeze({
 get:()=>ipcRenderer.sendSync('montclip:view:get'),
 set:value=>ipcRenderer.sendSync('montclip:view:set',value)
}));
// Feature switches the main process decides (desktop/features.js), read once; the page cannot set them.
contextBridge.exposeInMainWorld('montclipFeatures',Object.freeze({transcribe:!!(ipcRenderer.sendSync('montclip:features:get')||{}).transcribe}));
