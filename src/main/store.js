'use strict';

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const DEFAULTS = {
  model: 'gpt-image-1',
  size: '1024x1024',
  quality: 'medium',
  background: 'auto',
  outputDir: '',
  autoSave: false,
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.data = { ...DEFAULTS };
    this._apiKeyPlain = null;
    this._apiKeyEnc = null;
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

  async load() {
    if (this.loaded) return;
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const j = JSON.parse(raw);
      this._apiKeyEnc = j.apiKeyEnc || null;
      this._apiKeyPlain = this._apiKeyEnc ? null : j.apiKeyPlain || null;
      this.data = { ...DEFAULTS, ...(j.settings || {}) };
    } catch (e) {
      // first run — keep defaults
    }
    this.loaded = true;
  }

  async persist() {
    const j = {
      apiKeyEnc: this._apiKeyEnc,
      apiKeyPlain: this._apiKeyEnc ? null : this._apiKeyPlain,
      settings: this.data,
    };
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    await fsp.writeFile(this.file, JSON.stringify(j, null, 2), 'utf8');
  }

  encryptionAvailable() {
    return this._encryptionOk === true;
  }

  async setApiKey(key) {
    await this.load();
    key = String(key || '').trim();
    if (!key) {
      this._apiKeyPlain = null;
      this._apiKeyEnc = null;
      await this.persist();
      return this.snapshot();
    }
    if (this.encryptionAvailable()) {
      this._apiKeyEnc = safeStorage.encryptString(key).toString('base64');
      this._apiKeyPlain = null;
    } else {
      this._apiKeyEnc = null;
      this._apiKeyPlain = key;
    }
    await this.persist();
    return this.snapshot();
  }

  getApiKey() {
    if (this._apiKeyEnc) {
      try {
        return safeStorage.decryptString(Buffer.from(this._apiKeyEnc, 'base64'));
      } catch (e) {
        return null;
      }
    }
    return this._apiKeyPlain;
  }

  async update(partial) {
    await this.load();
    for (const k of Object.keys(DEFAULTS)) {
      if (k in partial) this.data[k] = partial[k];
    }
    await this.persist();
    return this.snapshot();
  }

  snapshot() {
    const key = this.getApiKey();
    const info = key
      ? { hasKey: true, encrypted: !!this._apiKeyEnc || this.encryptionAvailable(), hint: key.slice(0, 6) + '…' + key.slice(-4) }
      : { hasKey: false, encrypted: this.encryptionAvailable(), hint: '' };
    return { settings: { ...this.data }, ...info };
  }
}

module.exports = { Store, DEFAULTS };
