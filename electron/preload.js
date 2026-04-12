// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveKeys:     (keys) => ipcRenderer.send("save-keys", keys),
  openSettings: ()     => ipcRenderer.send("open-settings"),
});
