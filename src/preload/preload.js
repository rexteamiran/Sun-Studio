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
  setApiKey: (key) => unwrap(ipcRenderer.invoke('settings:setApiKey', key)),
  updateSettings: (partial) => unwrap(ipcRenderer.invoke('settings:update', partial)),
  testKey: () => unwrap(ipcRenderer.invoke('key:test')),

  generate: (params) => unwrap(ipcRenderer.invoke('gen:image', params)),
  editImage: (params) => unwrap(ipcRenderer.invoke('image:edit', params)),

  pickImage: () => unwrap(ipcRenderer.invoke('file:pickImage')),
  readImage: (p) => unwrap(ipcRenderer.invoke('file:readImage', p)),
  galleryList: () => unwrap(ipcRenderer.invoke('gallery:list')),
  galleryDelete: (id) => unwrap(ipcRenderer.invoke('gallery:delete', id)),
  gallerySaveAs: (id) => unwrap(ipcRenderer.invoke('gallery:saveAs', id)),
  galleryOpenFolder: () => unwrap(ipcRenderer.invoke('gallery:openFolder')),
  openPath: (p) => unwrap(ipcRenderer.invoke('image:open', p)),
  pickOutputDir: () => unwrap(ipcRenderer.invoke('dir:pickOutput')),
  exportPng: (dataUrl, name) => unwrap(ipcRenderer.invoke('export:png', { dataUrl, suggestedName: name })),

  onStage: (cb) => {
    const l = (_e, d) => cb(d && d.text);
    ipcRenderer.on('op:stage', l);
    return () => ipcRenderer.removeListener('op:stage', l);
  },
  onMenuNav: (cb) => {
    const l = (_e, v) => cb(v);
    ipcRenderer.on('menu:navigate', l);
    return () => ipcRenderer.removeListener('menu:navigate', l);
  },
});
