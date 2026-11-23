/** Exposes window controls + update controls to the renderer — nothing else. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sunWindow', {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:maximize'),
  close: () => ipcRenderer.invoke('win:close'),
});

contextBridge.exposeInMainWorld('sunUpdates', {
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
  openReleases: () => ipcRenderer.invoke('update:open-releases'),
  getState: () => ipcRenderer.invoke('update:state'),
  onState: (cb) => ipcRenderer.on('update:state', (_e, state) => cb(state)),
});
