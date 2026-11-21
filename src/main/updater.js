'use strict';

const { autoUpdater } = require('electron-updater');

let emit = () => {};
let lastState = { type: 'idle' };

function initUpdater({ onEvent }) {
  emit = onEvent || (() => {});

  autoUpdater.autoDownload = false; // user decides in Settings
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => set({ type: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    set({ type: 'available', version: info && info.version, notes: info && info.releaseNotes })
  );
  autoUpdater.on('update-not-available', (info) => set({ type: 'none', version: info && info.version }));
  autoUpdater.on('download-progress', (p) =>
    set({
      type: 'progress',
      percent: Math.round(p.percent || 0),
      transferred: p.transferred,
      total: p.total,
    })
  );
  autoUpdater.on('update-downloaded', (info) => set({ type: 'downloaded', version: info && info.version }));
  autoUpdater.on('error', (e) =>
    set({ type: 'error', message: e ? e.message || String(e) : 'Update error' })
  );
}

function set(state) {
  lastState = state;
  emit(state);
}

async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdates();
    return { started: true };
  } catch (e) {
    set({ type: 'error', message: e && e.message ? e.message : String(e) });
    return { started: false, error: e && e.message ? e.message : String(e) };
  }
}

async function downloadUpdate() {
  try {
    await autoUpdater.downloadUpdate();
    return { started: true };
  } catch (e) {
    set({ type: 'error', message: e && e.message ? e.message : String(e) });
    return { started: false };
  }
}

function installUpdate() {
  // shows the standard installer wizard, then relaunches the app
  autoUpdater.quitAndInstall(false, true);
}

function getState() {
  return lastState;
}

module.exports = { initUpdater, checkForUpdates, downloadUpdate, installUpdate, getState };
