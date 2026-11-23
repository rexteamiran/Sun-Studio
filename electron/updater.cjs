/** electron-updater wrapper — GitHub Releases feed (latest.yml + blockmap).
 * v0.0.10: the update state is exposed to the renderer (sidebar pill + Settings
 * → Updates section) through IPC, so the app always shows a visible updater. */
const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

function initUpdater({ win }) {
  autoUpdater.autoDownload = true; // silent in background…
  autoUpdater.autoInstallOnAppQuit = true; // …applies on quit
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  const state = {
    status: 'idle', // idle | checking | downloading | ready | uptodate | error
    version: null,
    progress: null, // {percent, transferred, total, bytesPerSecond}
    error: null,
  };

  const push = () => {
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send('update:state', JSON.parse(JSON.stringify(state)));
    } catch (e) { /* window gone */ }
  };

  const setStatus = (patch) => {
    Object.assign(state, patch);
    push();
  };

  autoUpdater.on('checking-for-update', () =>
    setStatus({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (i) =>
    setStatus({ status: 'downloading', version: i && i.version ? i.version : null, error: null }));
  autoUpdater.on('download-progress', (p) =>
    setStatus({ progress: { percent: Math.round(p.percent), transferred: p.transferred, total: p.total, bytesPerSecond: p.BPS || p.bytesPerSecond } }));
  autoUpdater.on('update-not-available', () =>
    setStatus({ status: 'uptodate', version: null, progress: null }));
  autoUpdater.on('update-downloaded', (i) =>
    setStatus({ status: 'ready', version: i && i.version ? i.version : null, progress: null }));
  autoUpdater.on('error', (e) =>
    setStatus({ status: 'error', error: e ? e.message || String(e) : 'update error' }));

  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates().catch((e) => ({ message: e.message })));
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
  ipcMain.handle('update:state', () => state);

  // don't block startup on the network
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.log('[updater] check failed:', e.message));
  }, 8000);

  return { push };
}

module.exports = { initUpdater };
