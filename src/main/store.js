'use strict';

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const BUILTIN_IDS = ['openai', 'aipass', 'kie', 'google'];

const DEFAULT_SETTINGS = {
  provider: 'aipass', // AI Pass is the recommended default (new accounts get $1 free credit)
  models: {
    openai: 'gpt-image-1',
    aipass: 'gpt-image-1',
    kie: 'nano-banana-2-1',
    google: 'gemini-nano-banana-2.1',
  },
  size: '1:1',
  quality: 'medium',
  imageSize: '1K',
  theme: 'sunset', // UI theme id — see renderer THEMES + styles.css [data-theme]
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
      customProviders: [], // [{ id, label, baseUrl, models: [id], defaultModel }]
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

  _validCustom(c) {
    return (
      c &&
      typeof c === 'object' &&
      typeof c.id === 'string' &&
      typeof c.label === 'string' &&
      typeof c.baseUrl === 'string' &&
      /^https?:\/\//i.test(c.baseUrl) &&
      Array.isArray(c.models)
    );
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

      // v2 -> v3: custom providers list
      if (Array.isArray(j.customProviders)) {
        this.data.customProviders = j.customProviders.filter((c) => this._validCustom(c));
      }

      const s = j.settings || {};
      const knownIds = [...BUILTIN_IDS, ...this.data.customProviders.map((c) => c.id)];
      if (s.provider && knownIds.includes(s.provider)) this.data.provider = s.provider;
      this.data.settings = { ...DEFAULT_SETTINGS, ...s, models: { ...DEFAULT_SETTINGS.models, ...(s.models || {}) } };
    } catch (e) {
      // first run — keep defaults
    }
    this.loaded = true;
  }

  async persist() {
    const j = {
      version: 3,
      provider: this.data.provider,
      apiKeys: this.data.apiKeys,
      customProviders: this.data.customProviders,
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

  // ---------- custom (BYO endpoint) providers ----------
  /**
   * Create or update a custom OpenAI-compatible provider.
   * p = { id?, label, baseUrl, key?, models: [string] }
   */
  async saveCustomProvider(p) {
    await this.load();
    const label = String(p.label || '').trim();
    const baseUrl = String(p.baseUrl || '').trim().replace(/\/+$/, '');
    if (!label) throw new Error('Provider name is required.');
    if (!/^https?:\/\/.+/i.test(baseUrl)) throw new Error('Base URL must start with http:// or https://');
    const models = (Array.isArray(p.models) ? p.models : [])
      .map((m) => String(m || '').trim())
      .filter(Boolean)
      .slice(0, 200);

    let id = p.id ? String(p.id) : null;
    let entry = id ? this.data.customProviders.find((c) => c.id === id) : null;
    if (id && !entry) throw new Error('Custom provider not found.');
    if (!entry) {
      id = 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      entry = { id, label, baseUrl, models };
      this.data.customProviders.push(entry);
    } else {
      entry.label = label;
      entry.baseUrl = baseUrl;
      entry.models = models;
    }
    if (!this.data.settings.models[id]) {
      this.data.settings.models[id] = models[0] || 'gpt-image-1';
    }
    if (p.key && String(p.key).trim()) {
      await this.setApiKey(id, String(p.key).trim());
    }
    await this.persist();
    return this.snapshot();
  }

  async deleteCustomProvider(id) {
    await this.load();
    const before = this.data.customProviders.length;
    this.data.customProviders = this.data.customProviders.filter((c) => c.id !== id);
    if (this.data.customProviders.length === before) throw new Error('Custom provider not found.');
    delete this.data.apiKeys[id];
    delete this.data.settings.models[id];
    if (this.data.provider === id) this.data.provider = 'aipass';
    await this.persist();
    return this.snapshot();
  }

  async update(partial) {
    await this.load();
    const p = partial || {};
    const knownIds = [...BUILTIN_IDS, ...this.data.customProviders.map((c) => c.id)];
    if (p.provider && knownIds.includes(p.provider)) this.data.provider = p.provider;
    const s = this.data.settings;
    if (p.models && typeof p.models === 'object') s.models = { ...s.models, ...p.models };
    for (const k of ['size', 'quality', 'imageSize', 'theme', 'outputDir', 'autoSave', 'checkUpdates']) {
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
    for (const id of [...BUILTIN_IDS, ...this.data.customProviders.map((c) => c.id)]) {
      providers[id] = this._providerInfo(id);
    }
    return {
      provider: this.data.provider,
      settings: { ...this.data.settings },
      providers,
      customProviders: this.data.customProviders.map((c) => ({ ...c })),
    };
  }
}

module.exports = { Store, DEFAULT_SETTINGS, BUILTIN_IDS };
