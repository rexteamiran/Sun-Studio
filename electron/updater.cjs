/** electron-updater wrapper — GitHub Releases feed (same as v0.0.6). */
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

function initUpdater({ win }) {
  autoUpdater.autoDownload = true; // silent in background…
  autoUpdater.autoInstallOnAppQuit = true; // …applies on quit
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on('update-downloaded', async (info) => {
    try {
      const w = win();
      if (!w || w.isDestroyed()) return;
      const r = await dialog.showMessageBox(w, {
        type: 'info',
        title: 'Update ready',
        message: 'Sun Studio ' + (info && info.version ? info.version : '') + ' is ready to install.',
        detail: 'It will be installed automatically when you close the app — or restart now.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (r.response === 0) autoUpdater.quitAndInstall();
    } catch (e) {
      /* dialog failed — install-on-quit still applies */
    }
  });

  autoUpdater.on('error', (e) => {
    console.log('[updater]', e ? e.message || String(e) : 'update error');
  });

  // don't block startup on the network
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.log('[updater] check failed:', e.message));
  }, 8000);
}

module.exports = { initUpdater };
