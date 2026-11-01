"use strict";
const {contextBridge, ipcRenderer, webUtils} = require("electron");
contextBridge.exposeInMainWorld("montclipFlv", {
  canUse: file => !!webUtils.getPathForFile(file),
  inspect: (file, id, language) => ipcRenderer.invoke("montclip:flv", "inspect", {path:webUtils.getPathForFile(file), id, language}),
  prepare: (id, consent) => ipcRenderer.invoke("montclip:flv", "prepare", id, consent === true),
  finish: id => ipcRenderer.invoke("montclip:flv", "finish", id),
  cancel: id => ipcRenderer.invoke("montclip:flv", "cancel", id),
});
