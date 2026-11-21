'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const unwrap = async (promise) => {
  const r = await promise;
  if (!r || r.ok !== true) throw new Error((r && r.error) || 'Something went wrong.');
  return r.data;
};

contextBridge.exposeInMainWorld('sun', {
  getInfo: () => unwrap(ipcRenderer.invoke('app:info')),
  getSettings: () => unwrap(ipcRenderer.invoke('settings:get')),
  setApiKey: (provider, key) => unwrap(ipcRenderer.invoke('settings:setApiKey', { provider, key })),
  updateSettings: (partial) => unwrap(ipcRenderer.invoke('settings:update', partial)),
  customSave: (p) => unwrap(ipcRenderer.invoke('custom:save', p)),
  customDelete: (id) => unwrap(ipcRenderer.invoke('custom:delete', id)),
  testKey: (provider) => unwrap(ipcRenderer.invoke('key:test', provider)),
  providerModels: (provider) => unwrap(ipcRenderer.invoke('provider:models', provider)),

  generate: (params) => unwrap(ipcRenderer.invoke('gen:image', params)),
  editImage: (params) => unwrap(ipcRenderer.invoke('image:edit', params)),

  pickImage: () => unwrap(ipcRenderer.invoke('file:pickImage')),
  readImage: (p) => unwrap(ipcRenderer.invoke('file:readImage', p)),
  writeTempPng: (dataUrl) => unwrap(ipcRenderer.invoke('file:writeTempPng', { dataUrl })),
  galleryList: () => unwrap(ipcRenderer.invoke('gallery:list')),
  galleryDelete: (id) => unwrap(ipcRenderer.invoke('gallery:delete', id)),
  gallerySaveAs: (id) => unwrap(ipcRenderer.invoke('gallery:saveAs', id)),
  galleryOpenFolder: () => unwrap(ipcRenderer.invoke('gallery:openFolder')),
  openPath: (p) => unwrap(ipcRenderer.invoke('image:open', p)),
  pickOutputDir: () => unwrap(ipcRenderer.invoke('dir:pickOutput')),
  exportPng: (dataUrl, name) => unwrap(ipcRenderer.invoke('export:png', { dataUrl, suggestedName: name })),
  openExternal: (url) => unwrap(ipcRenderer.invoke('shell:openExternal', url)),

  winMin: () => unwrap(ipcRenderer.invoke('win:min')),
  winMax: () => unwrap(ipcRenderer.invoke('win:max')),
  winClose: () => unwrap(ipcRenderer.invoke('win:close')),
  winState: () => unwrap(ipcRenderer.invoke('win:state')),
  onWinState: (cb) => {
    const l = (_e, d) => cb(d);
    ipcRenderer.on('win:state', l);
    return () => ipcRenderer.removeListener('win:state', l);
  },

  updateCheck: () => unwrap(ipcRenderer.invoke('update:check')),
  updateDownload: () => unwrap(ipcRenderer.invoke('update:download')),
  updateInstall: () => unwrap(ipcRenderer.invoke('update:install')),
  updateState: () => unwrap(ipcRenderer.invoke('update:state')),

  onStage: (cb) => {
    const l = (_e, d) => cb(d && d.text);
    ipcRenderer.on('op:stage', l);
    return () => ipcRenderer.removeListener('op:stage', l);
  },
  onUpdateEvent: (cb) => {
    const l = (_e, d) => cb(d);
    ipcRenderer.on('update:event', l);
    return () => ipcRenderer.removeListener('update:event', l);
  },
});
