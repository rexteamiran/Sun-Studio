'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { Store } = require('./store');
const { OpenAICompatibleClient } = require('./openai');
const { GoogleClient } = require('./google');
const { KieClient } = require('./kie');
const { providerMeta, customToMeta } = require('./providers');
const { Gallery } = require('./gallery');
const updater = require('./updater');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const store = new Store();
const gallery = new Gallery();

let win = null;

const tmpDir = () => path.join(app.getPath('userData'), 'tmp');

// ---------- provider clients ----------
const clients = {};

/** Registry metadata for a provider id — built-ins plus the user's custom endpoints. */
function metaFor(providerId) {
  const meta = providerMeta(providerId, store.data.customProviders);
  if (!meta) throw new Error('Unknown provider: ' + providerId);
  return meta;
}

function getClient(providerId) {
  if (clients[providerId]) return clients[providerId];
  const meta = metaFor(providerId);
  if (meta.type === 'google') {
    clients[providerId] = new GoogleClient({ getApiKey: () => store.getApiKey(providerId) });
  } else if (meta.type === 'kie') {
    clients[providerId] = new KieClient({ providerMeta: meta, getApiKey: () => store.getApiKey(providerId) });
  } else {
    clients[providerId] = new OpenAICompatibleClient({ providerMeta: meta, getApiKey: () => store.getApiKey(providerId) });
  }
  return clients[providerId];
}

function requireKey(providerId) {
  if (!store.getApiKey(providerId)) {
    const meta = metaFor(providerId);
    throw new Error(`No ${meta ? meta.label : providerId} API key configured. Add it in Settings first.`);
  }
}

function sendWinState() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('win:state', { maximized: win.isMaximized() || win.isFullScreen() });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    frame: false, // custom title bar (see renderer .titlebar) — no native Windows chrome
    backgroundColor: '#0b0906',
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
  win.on('maximize', sendWinState);
  win.on('unmaximize', sendWinState);
  win.on('enter-full-screen', sendWinState);
  win.on('leave-full-screen', sendWinState);
  win.on('closed', () => {
    win = null;
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

/**
 * No native application menu — the UI is fully custom. Keep the two developer
 * conveniences (DevTools, reload) as keyboard shortcuts instead.
 */
function setupShortcuts() {
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    } else if (input.control && input.key.toLowerCase() === 'r') {
      win.webContents.reload();
      e.preventDefault();
    }
  });
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

function toPngBuffer(b64) {
  const buf = Buffer.from(String(b64), 'base64');
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) throw new Error('Received invalid image data from the provider.');
  return img.toPNG();
}

async function saveResults(b64s, meta) {
  const saved = [];
  for (const b64 of b64s) {
    const png = toPngBuffer(b64);
    saved.push(await gallery.saveBuffer(png, meta));
  }
  if (store.data.settings.autoSave && store.data.settings.outputDir) {
    try {
      await fsp.mkdir(store.data.settings.outputDir, { recursive: true });
      for (const it of saved) {
        await fsp.copyFile(it.path, path.join(store.data.settings.outputDir, `SunStudio-${it.id}.png`));
      }
    } catch (e) {
      /* best effort */
    }
  }
  return saved;
}

function registerIpc() {
  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    encryption: store.encryptionAvailable() ? 'DPAPI' : 'plain',
    packaged: app.isPackaged,
  }));

  // ---------- custom window chrome ----------
  handle('win:min', () => win && win.minimize());
  handle('win:max', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  handle('win:close', () => win && win.close());
  handle('win:state', () => ({ maximized: win ? win.isMaximized() : false }));

  handle('shell:openExternal', (url) => {
    const u = String(url || '');
    if (!/^https?:\/\//i.test(u)) throw new Error('Only http(s) links can be opened.');
    return shell.openExternal(u);
  });

  // ---------- settings & providers ----------
  handle('settings:get', () => store.snapshot());
  handle('settings:setApiKey', ({ provider, key }) => store.setApiKey(provider || store.data.provider, String(key || '')));
  handle('settings:update', (partial) => store.update(partial || {}));
  handle('custom:save', (p) => {
    const snap = store.saveCustomProvider(p || {});
    for (const id of Object.keys(clients)) delete clients[id]; // baseUrl may have changed
    return snap;
  });
  handle('custom:delete', (id) => {
    const snap = store.deleteCustomProvider(String(id || ''));
    delete clients[id];
    return snap;
  });
  handle('key:test', (providerId) => {
    requireKey(providerId || store.data.provider);
    return getClient(providerId || store.data.provider).testKey();
  });
  handle('provider:models', (providerId) => {
    const meta = metaFor(providerId);
    if (!meta) throw new Error('Unknown provider.');
    if (meta.dynamicModels) return getClient(providerId).listModels();
    return meta.models.map((m) => m.id);
  });

  const stage = (text) => {
    if (win && !win.isDestroyed()) win.webContents.send('op:stage', { text });
  };

  handle('gen:image', async (p) => {
    const prompt = String((p && p.prompt) || '').trim();
    if (!prompt) throw new Error('Prompt is empty.');
    const providerId = store.data.provider;
    requireKey(providerId);
    const meta = metaFor(providerId);
    const model = (p.model || store.data.settings.models[providerId] || meta.defaultModel).trim();

    stage(`Contacting ${meta.label}…`);
    let b64s;
    if (meta.type === 'google') {
      b64s = await getClient(providerId).generate({
        prompt,
        model,
        aspect: p.aspect,
        imageSize: p.imageSize,
        n: p.n,
      });
    } else if (meta.type === 'kie') {
      b64s = await getClient(providerId).generate({
        prompt,
        model,
        aspect: p.aspect,
        imageSize: p.imageSize,
        n: p.n,
        onStage: (s) => stage(s),
      });
    } else {
      b64s = await getClient(providerId).generate({
        prompt,
        model,
        aspect: p.aspect,
        quality: p.quality,
        n: p.n,
        background: p.background,
      });
    }
    stage('Saving results…');
    return saveResults(b64s, {
      kind: 'generate',
      provider: providerId,
      prompt,
      model,
      aspect: p.aspect,
      quality: meta.type === 'google' || meta.type === 'kie' ? p.imageSize : p.quality,
    });
  });

  handle('image:edit', async (p) => {
    const prompt = String((p && p.prompt) || '').trim();
    if (!prompt) throw new Error('Prompt is empty.');
    const paths = Array.isArray(p.imagePaths) ? p.imagePaths.filter(Boolean) : [];
    if (!paths.length) throw new Error('No image selected.');
    const providerId = store.data.provider;
    requireKey(providerId);
    const meta = metaFor(providerId);
    const model = (p.model || store.data.settings.models[providerId] || meta.defaultModel).trim();

    stage(paths.length > 1 ? 'Uploading reference images…' : 'Uploading your image…');
    const metaOut = {
      kind: 'edit',
      provider: providerId,
      prompt,
      model,
      aspect: p.aspect,
      quality: meta.type === 'google' || meta.type === 'kie' ? p.imageSize : p.quality,
      source: path.basename(paths[0]),
    };

    if (meta.type === 'google') {
      const imageBuffers = [];
      for (const pth of paths) {
        const buf = await fsp.readFile(pth);
        imageBuffers.push({ mime: 'image/png', data: buf.toString('base64') });
      }
      // mask compositing for Google happens in the renderer (magenta cover) —
      // only the resulting image + prompt are sent here.
      const count = Math.min(4, Math.max(1, Number(p.n) || 1));
      const b64s = [];
      for (let i = 0; i < count; i++) {
        const one = await getClient(providerId).edit({
          imageBuffers,
          prompt,
          model,
          aspect: p.aspect,
          imageSize: p.imageSize,
        });
        b64s.push(...one);
      }
      stage('Saving results…');
      return saveResults(b64s, metaOut);
    }

    if (meta.type === 'kie') {
      // kie.ai accepts image URLs only — upload local files first, then run job tasks.
      const imageBuffers = [];
      for (const pth of paths) {
        const buf = await fsp.readFile(pth);
        imageBuffers.push({ mime: 'image/png', data: buf.toString('base64') });
      }
      const b64s = await getClient(providerId).edit({
        imageBuffers,
        prompt,
        model,
        aspect: p.aspect,
        imageSize: p.imageSize,
        n: Math.min(4, Math.max(1, Number(p.n) || 1)),
        onStage: (s) => stage(s),
      });
      stage('Saving results…');
      return saveResults(b64s, metaOut);
    }

    let maskPng = null;
    if (p.maskDataUrl) {
      const m = /^data:image\/png;base64,(.+)$/.exec(p.maskDataUrl);
      if (m) maskPng = Buffer.from(m[1], 'base64');
    }
    const b64s = await getClient(providerId).edit({
      imagePaths: paths,
      maskPng,
      prompt,
      model,
      aspect: p.aspect,
      quality: p.quality,
      n: p.n,
      background: p.background,
    });
    stage('Saving results…');
    return saveResults(b64s, metaOut);
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

  handle('file:writeTempPng', async ({ dataUrl }) => {
    const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('Bad image data.');
    const out = path.join(tmpDir(), 'cover-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.png');
    await fsp.mkdir(tmpDir(), { recursive: true });
    await fsp.writeFile(out, Buffer.from(m[1], 'base64'));
    return out;
  });

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

  // ---------- updater ----------
  handle('update:state', () => updater.getState());
  handle('update:check', () => (app.isPackaged ? updater.checkForUpdates() : { started: false, error: 'dev' }));
  handle('update:download', () => (app.isPackaged ? updater.downloadUpdate() : { started: false, error: 'dev' }));
  handle('update:install', () => {
    if (app.isPackaged) updater.installUpdate();
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

  registerIpc();
  await store.initEncryption();
  await store.load();
  createWindow();
  setupShortcuts();

  if (app.isPackaged) {
    updater.initUpdater({
      onEvent: (ev) => {
        if (win && !win.isDestroyed()) win.webContents.send('update:event', ev);
      },
    });
    if (store.data.settings.checkUpdates) {
      setTimeout(() => updater.checkForUpdates(), 6000);
    }
  }

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
        const click = process.env.SUN_CLICK;
        if (click) {
          await win.webContents.executeJavaScript(
            `(() => { const b = document.querySelector(${JSON.stringify(click)}); if (b) b.click(); return !!b; })();`
          );
          await new Promise((r) => setTimeout(r, 800));
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
