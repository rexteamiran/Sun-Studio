'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { Store } = require('./store');
const { OpenAIClient } = require('./openai');
const { Gallery } = require('./gallery');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const store = new Store();
const gallery = new Gallery();
const openai = new OpenAIClient({ getApiKey: () => store.getApiKey() });

let win = null;

const tmpDir = () => path.join(app.getPath('userData'), 'tmp');

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 680,
    backgroundColor: '#0d0a06',
    show: false,
    title: 'Sun Studio',
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Gallery Folder',
          accelerator: 'CmdOrCtrl+G',
          click: () => shell.openPath(gallery.dir),
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (win) win.webContents.send('menu:navigate', 'settings');
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Sun Studio',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'About Sun Studio',
              message: `Sun Studio v${app.getVersion()}`,
              detail:
                'AI image studio — generate, edit and restyle images with your own OpenAI account.\n\n' +
                'Your API key is stored encrypted on this device and is only ever sent directly to api.openai.com.',
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      console.error(`[ipc:${channel}]`, e);
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
}

async function convertToPng(srcPath) {
  const st = await fsp.stat(srcPath).catch(() => null);
  if (!st) throw new Error('File not found.');
  if (st.size > 50 * 1024 * 1024) throw new Error('Image is larger than 50 MB.');
  const img = nativeImage.createFromPath(srcPath);
  if (img.isEmpty()) throw new Error('Unsupported or corrupted image file.');
  const buf = img.toPNG();
  const out = path.join(tmpDir(), 'src-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.png');
  await fsp.mkdir(tmpDir(), { recursive: true });
  await fsp.writeFile(out, buf);
  const size = img.getSize();
  return {
    path: out,
    dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
    width: size.width,
    height: size.height,
  };
}

async function autoSaveCopies(items, buffers) {
  if (!store.data.autoSave || !store.data.outputDir) return;
  try {
    await fsp.mkdir(store.data.outputDir, { recursive: true });
  } catch (e) {
    return;
  }
  for (let i = 0; i < items.length; i++) {
    try {
      const name = `SunStudio-${items[i].id}.png`;
      if (buffers) {
        await fsp.writeFile(path.join(store.data.outputDir, name), buffers[i]);
      } else {
        await fsp.copyFile(items[i].path, path.join(store.data.outputDir, name));
      }
    } catch (e) {
      /* keep going */
    }
  }
}

function registerIpc() {
  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    encryption: store.encryptionAvailable() ? 'DPAPI' : 'plain',
  }));

  handle('settings:get', () => store.snapshot());
  handle('settings:setApiKey', (key) => store.setApiKey(String(key || '')));
  handle('settings:update', (partial) => store.update(partial || {}));
  handle('key:test', () => openai.testKey());

  const stage = (text) => {
    if (win && !win.isDestroyed()) win.webContents.send('op:stage', { text });
  };

  handle('gen:image', async (p) => {
    const prompt = String((p && p.prompt) || '').trim();
    if (!prompt) throw new Error('Prompt is empty.');
    if (!store.getApiKey()) throw new Error('No API key configured. Add your OpenAI key in Settings first.');
    stage('Sending your prompt to OpenAI…');
    const b64s = await openai.generate({
      prompt,
      model: p.model || store.data.model,
      size: p.size || store.data.size,
      quality: p.quality || store.data.quality,
      n: p.n,
      background: p.background,
    });
    stage('Downloading results…');
    const saved = [];
    const bufs = [];
    for (const b64 of b64s) {
      const buf = Buffer.from(b64, 'base64');
      bufs.push(buf);
      saved.push(
        await gallery.saveBuffer(buf, {
          kind: 'generate',
          prompt,
          model: p.model || store.data.model,
          size: p.size || store.data.size,
          quality: p.quality || store.data.quality,
        })
      );
    }
    stage('');
    await autoSaveCopies(saved, bufs);
    return saved;
  });

  handle('image:edit', async (p) => {
    const prompt = String((p && p.prompt) || '').trim();
    if (!prompt) throw new Error('Prompt is empty.');
    if (!store.getApiKey()) throw new Error('No API key configured. Add your OpenAI key in Settings first.');
    const paths = Array.isArray(p.imagePaths) ? p.imagePaths.filter(Boolean) : [];
    if (!paths.length) throw new Error('No image selected.');
    let maskPng = null;
    if (p.maskDataUrl) {
      const m = /^data:image\/png;base64,(.+)$/.exec(p.maskDataUrl);
      if (m) maskPng = Buffer.from(m[1], 'base64');
    }
    stage(paths.length > 1 ? 'Uploading reference images…' : 'Uploading your image…');
    const b64s = await openai.edit({
      imagePaths: paths,
      maskPng,
      prompt,
      model: p.model || store.data.model,
      size: p.size || store.data.size,
      quality: p.quality || store.data.quality,
      n: p.n,
      background: p.background,
    });
    stage('Downloading results…');
    const saved = [];
    for (const b64 of b64s) {
      const buf = Buffer.from(b64, 'base64');
      saved.push(
        await gallery.saveBuffer(buf, {
          kind: 'edit',
          prompt,
          model: p.model || store.data.model,
          size: p.size || store.data.size,
          quality: p.quality || store.data.quality,
          source: path.basename(paths[0]),
        })
      );
    }
    stage('');
    await autoSaveCopies(saved, null);
    return saved;
  });

  handle('file:pickImage', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose an image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return convertToPng(r.filePaths[0]);
  });

  handle('file:readImage', (p) => convertToPng(String(p || '')));

  handle('gallery:list', () => gallery.list());
  handle('gallery:delete', (id) => gallery.remove(id));
  handle('gallery:openFolder', () => shell.openPath(gallery.dir));

  handle('gallery:saveAs', async (id) => {
    const p = gallery.pathOf(id);
    if (!p) throw new Error('Image not found.');
    const r = await dialog.showSaveDialog(win, {
      title: 'Save image as…',
      defaultPath: `SunStudio-${String(id).slice(-6)}.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp.copyFile(p, r.filePath);
    return r.filePath;
  });

  handle('image:open', (p) => shell.openPath(p));

  handle('dir:pickOutput', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose output folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  handle('export:png', async ({ dataUrl, suggestedName }) => {
    const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('Bad image data.');
    const r = await dialog.showSaveDialog(win, {
      title: 'Save image as…',
      defaultPath: suggestedName || 'SunStudio.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, Buffer.from(m[1], 'base64'));
    return r.filePath;
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';

  // clean temp converted images from previous sessions
  try {
    const old = await fsp.readdir(tmpDir());
    for (const f of old) await fsp.unlink(path.join(tmpDir(), f)).catch(() => {});
  } catch (e) {
    /* no tmp dir yet */
  }

  buildMenu();
  registerIpc();
  await store.initEncryption();
  await store.load();
  createWindow();

  // automated smoke-test hook (used by CI / dev verification)
  if (process.env.SUN_SMOKE === '1') {
    win.webContents.on('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 1200));
        const v = process.env.SUN_VIEW;
        if (v) {
          await win.webContents.executeJavaScript(
            `(() => { const b = document.querySelector('[data-view="${v}"]'); if (b) b.click(); return true; })();`
          );
          await new Promise((r) => setTimeout(r, 1000));
        }
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.SUN_SHOT || '/tmp/sun-shot.png', img.toPNG());
        console.log('SMOKE_OK');
      } catch (e) {
        console.error('SMOKE_FAIL', e);
      }
      app.exit(0);
    });
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
