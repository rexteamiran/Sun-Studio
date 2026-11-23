/**
 * Sun Studio — Electron host shell (v0.0.8).
 *
 * The app itself is the Next.js 16 + React 18 studio (the open-design stack).
 * Electron provides the desktop shell: it boots the Next standalone server as
 * a child process (Electron's own Node runtime), opens a window on
 * http://127.0.0.1:<port>, migrates v0.0.6 desktop data on first run, and
 * keeps the electron-updater auto-update path alive so installed builds keep
 * updating from GitHub releases (latest.yml + blockmap, NSIS over NSIS).
 *
 * CommonJS on purpose — the main process runs whatever package.json "main"
 * points to, without a build step.
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

const migrate = require('./migrate.cjs');

const PREFERRED_PORT = Number(process.env.SUN_PORT || 3570);
const serverRoot = path.join(app.getAppPath(), 'server');
const serverEntry = path.join(serverRoot, 'server.js');

// test/portable hook: keep userData configurable (default stays the OS location)
if (process.env.SUN_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.SUN_USER_DATA));
}

let serverChild = null;
let win = null;
let actualPort = null;

function findFreePort(start) {
  return new Promise((resolve) => {
    const tryPort = (p, attemptsLeft) => {
      const srv = net.createServer();
      srv.once('error', () => {
        if (attemptsLeft > 0) tryPort(p + 1, attemptsLeft - 1);
        else resolve(0);
      });
      srv.once('listening', () => srv.close(() => resolve(p)));
      srv.listen(p, '127.0.0.1');
    };
    tryPort(start, 50);
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/bootstrap', timeout: 2500 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve(true);
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error('The local Sun Studio server did not start.'));
      else setTimeout(ping, 400);
    };
    ping();
  });
}

function startServer(dataDir, port) {
  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      SUN_STUDIO_DATA: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  child.on('exit', (code) => {
    serverChild = null;
    if (code && code !== 0 && win && !win.isDestroyed()) {
      dialog.showErrorBox('Sun Studio', 'The local server exited unexpectedly (code ' + code + ').');
    }
  });
  return child;
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // image downloads (Download PNG links) → native save dialog
  win.webContents.session.on('will-download', (_e, item) => {
    const target = dialog.showSaveDialogSync(win, {
      defaultPath: item.getFilename(),
    });
    if (target) item.setSavePath(target);
    else item.cancel();
  });
  win.loadURL('http://127.0.0.1:' + port);
  win.on('closed', () => { win = null; });
}

/** Headless smoke-test hook (see AGENTS.md): boot, screenshot, report, quit. */
async function smokeTest() {
  const shotPath = process.env.SUN_SHOT || '/tmp/render/sun-electron.png';
  await new Promise((r) => setTimeout(r, 1500));
  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  fs.writeFileSync(shotPath, img.toPNG());
  console.log('SMOKE ok — url=' + win.webContents.getURL() + ' shot=' + shotPath);
  app.quit();
}

app.whenReady().then(async () => {
  try {
    const dataDir = path.join(app.getPath('userData'), 'data');
    const migration = await migrate.run({
      userData: app.getPath('userData'),
      dataDir,
      safeStorage: require('electron').safeStorage,
      fs,
      path,
    });

    actualPort = await findFreePort(PREFERRED_PORT);
    if (!actualPort) throw new Error('No free local port found.');
    serverChild = startServer(dataDir, actualPort);
    await waitForServer(actualPort);
    createWindow(actualPort);

    // keep the auto-update path alive (GitHub Releases: latest.yml + blockmap)
    if (!process.env.SUN_NO_UPDATER) {
      const { initUpdater } = require('./updater.cjs');
      initUpdater({ win: () => win });
    }

    if (process.env.SUN_SMOKE) {
      await smokeTest();
      return;
    }

    console.log(
      'SUN STUDIO ready — http://127.0.0.1:' + actualPort +
      ' · data: ' + dataDir +
      (migration && migration.migrated ? ' · migrated v' + migration.from + ' settings + ' + migration.keys + ' key(s) + ' + migration.gallery + ' image(s)' : '')
    );
  } catch (e) {
    dialog.showErrorBox('Sun Studio', (e && e.message) || String(e));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (serverChild) {
    try { serverChild.kill(); } catch (e) { /* already gone */ }
    serverChild = null;
  }
});
