'use strict';

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const PROVIDER_IDS = ['openai', 'aipass', 'google'];

const DEFAULT_SETTINGS = {
  provider: 'openai',
  models: {
    openai: 'gpt-image-1',
    aipass: 'gpt-image-1',
    google: 'gemini-nano-banana-2.1',
  },
  size: '1:1',
  quality: 'medium',
  imageSize: '1K',
  outputDir: '',
  autoSave: false,
  checkUpdates: true,
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.data = {
      provider: DEFAULT_SETTINGS.provider,
      apiKeys: {}, // id -> { enc: base64|null, plain: string|null }
      settings: { ...DEFAULT_SETTINGS },
    };
    this._encryptionOk = null;
    this.loaded = false;
  }

  async initEncryption() {
    try {
      this._encryptionOk =
        typeof safeStorage.isAsyncEncryptionAvailable === 'function'
          ? await safeStorage.isAsyncEncryptionAvailable()
          : safeStorage.isEncryptionAvailable();
    } catch (e) {
      this._encryptionOk = false;
    }
  }

  encryptionAvailable() {
    return this._encryptionOk === true;
  }

  async load() {
    if (this.loaded) return;
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const j = JSON.parse(raw);

      // v1 -> v2 migration: single OpenAI key under apiKeyEnc/apiKeyPlain
      if (j.apiKeys && typeof j.apiKeys === 'object') {
        this.data.apiKeys = j.apiKeys;
      } else if (j.apiKeyEnc || j.apiKeyPlain) {
        this.data.apiKeys = {
          openai: { enc: j.apiKeyEnc || null, plain: j.apiKeyEnc ? null : j.apiKeyPlain || null },
        };
      }

      const s = j.settings || {};
      this.data.provider = PROVIDER_IDS.includes(s.provider) ? s.provider : this.data.provider;
      this.data.settings = { ...DEFAULT_SETTINGS, ...s, models: { ...DEFAULT_SETTINGS.models, ...(s.models || {}) } };
    } catch (e) {
      // first run — keep defaults
    }
    this.loaded = true;
  }

  async persist() {
    const j = {
      version: 2,
      provider: this.data.provider,
      apiKeys: this.data.apiKeys,
      settings: this.data.settings,
    };
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    await fsp.writeFile(this.file, JSON.stringify(j, null, 2), 'utf8');
  }

  async setApiKey(providerId, key) {
    await this.load();
    key = String(key || '').trim();
    if (!key) {
      this.data.apiKeys[providerId] = { enc: null, plain: null };
    } else if (this.encryptionAvailable()) {
      this.data.apiKeys[providerId] = { enc: safeStorage.encryptString(key).toString('base64'), plain: null };
    } else {
      this.data.apiKeys[providerId] = { enc: null, plain: key };
    }
    await this.persist();
    return this.snapshot();
  }

  getApiKey(providerId) {
    const k = this.data.apiKeys[providerId];
    if (!k) return null;
    if (k.enc) {
      try {
        return safeStorage.decryptString(Buffer.from(k.enc, 'base64'));
      } catch (e) {
        return null;
      }
    }
    return k.plain || null;
  }

  async update(partial) {
    await this.load();
    const p = partial || {};
    if (p.provider && PROVIDER_IDS.includes(p.provider)) this.data.provider = p.provider;
    const s = this.data.settings;
    if (p.models && typeof p.models === 'object') s.models = { ...s.models, ...p.models };
    for (const k of ['size', 'quality', 'imageSize', 'outputDir', 'autoSave', 'checkUpdates']) {
      if (k in p) s[k] = p[k];
    }
    await this.persist();
    return this.snapshot();
  }

  _providerInfo(id) {
    const key = this.getApiKey(id);
    if (!key) return { hasKey: false, encrypted: false, hint: '' };
    const enc = !!(this.data.apiKeys[id] && this.data.apiKeys[id].enc);
    return { hasKey: true, encrypted: enc || this.encryptionAvailable(), hint: key.slice(0, 6) + '…' + key.slice(-4) };
  }

  snapshot() {
    const providers = {};
    for (const id of PROVIDER_IDS) providers[id] = this._providerInfo(id);
    return {
      provider: this.data.provider,
      settings: { ...this.data.settings },
      providers,
    };
  }
}

module.exports = { Store, DEFAULT_SETTINGS, PROVIDER_IDS };
