/** electron-updater wrapper — GitHub Releases feed (latest.yml + blockmap).
 * v0.0.10: the update state is exposed to the renderer (sidebar pill + Settings
 * → Updates section) through IPC, so the app always shows a visible updater.
 * v0.0.12: fix release — (1) the main process passes a `win` getter, not a
 * window; normalize both shapes or the first update event crashes with a
 * TypeError before any state reaches the UI. (2) installers built before
 * v0.0.12 carry no baked-in app-update.yml (no publish config back then), so
 * checkForUpdates() died with "Unable to find app-update.yml" — set the GitHub
 * feed explicitly when the file is missing so every already-installed copy
 * can self-update to v0.0.12+. (3) the background auto-check now runs only in
 * packaged builds; dev logs no updater noise. (4) update:open-releases IPC —
 * a manual escape hatch the UI offers whenever a check errors out. */
const { autoUpdater } = require('electron-updater');
const { app, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const RELEASES_URL = 'https://github.com/rexteamiran/Sun-Studio/releases/latest';
/** Same feed the v0.0.12+ installers bake into resources/app-update.yml. */
const FALLBACK_FEED = { provider: 'github', owner: 'rexteamiran', repo: 'Sun-Studio' };

function initUpdater({ win }) {
  // main.cjs hands over a getter (win is reassigned on close) — accept both.
  const getWin = typeof win === 'function' ? win : () => win;

  const state = {
    status: 'idle', // idle | checking | downloading | ready | uptodate | error
    version: null,
    progress: null, // {percent, transferred, total, bytesPerSecond}
    error: null,
  };

  const push = () => {
    const w = getWin();
    if (!w || w.isDestroyed()) return;
    try {
      w.webContents.send('update:state', JSON.parse(JSON.stringify(state)));
    } catch (e) { /* window gone */ }
  };

  const setStatus = (patch) => {
    Object.assign(state, patch);
    push();
  };

  autoUpdater.autoDownload = true; // silent in background…
  autoUpdater.autoInstallOnAppQuit = true; // …applies on quit
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  // Feed: v0.0.12+ installers bake resources/app-update.yml. Older installs
  // (v0.0.10/v0.0.11) have none — give the updater the GitHub feed at runtime
  // so the very first self-update works everywhere.
  try {
    const baked = path.join(path.dirname(app.getAppPath()), 'app-update.yml');
    if (!fs.existsSync(baked)) autoUpdater.setFeedURL(FALLBACK_FEED);
  } catch (e) {
    try { autoUpdater.setFeedURL(FALLBACK_FEED); } catch (e2) { /* stay on baked config */ }
  }

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
  ipcMain.handle('update:open-releases', () => { shell.openExternal(RELEASES_URL); });

  // don't block startup on the network — and skip in dev entirely
  if (app.isPackaged) {
    const delay = Number(process.env.SUN_UPDATE_CHECK_DELAY || 8000);
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => console.log('[updater] check failed:', e.message));
    }, delay);
  }

  return { push, state, RELEASES_URL };
}

module.exports = { initUpdater, FALLBACK_FEED, RELEASES_URL };
