'use strict';

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { app, nativeImage } = require('electron');

class Gallery {
  constructor() {
    this.dir = path.join(app.getPath('userData'), 'gallery');
    this.indexFile = path.join(this.dir, 'index.json');
    this.index = [];
    this.loaded = false;
  }

  async ensure() {
    await fsp.mkdir(this.dir, { recursive: true });
    if (!this.loaded) {
      try {
        const j = JSON.parse(await fsp.readFile(this.indexFile, 'utf8'));
        this.index = Array.isArray(j) ? j : [];
      } catch (e) {
        this.index = [];
      }
      this.loaded = true;
    }
  }

  async _writeIndex() {
    await fsp.writeFile(this.indexFile, JSON.stringify(this.index, null, 2), 'utf8');
  }

  async saveBuffer(buf, meta) {
    await this.ensure();
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const file = id + '.png';
    await fsp.writeFile(path.join(this.dir, file), buf);
    let thumb = '';
    try {
      thumb = nativeImage.createFromBuffer(buf).resize({ width: 420 }).toDataURL();
    } catch (e) {
      thumb = '';
    }
    const item = Object.assign({ id, file, thumb, createdAt: Date.now() }, meta);
    this.index.unshift(item);
    await this._writeIndex();
    return Object.assign({}, item, { path: path.join(this.dir, file) });
  }

  async list() {
    await this.ensure();
    return this.index.map((i) => Object.assign({}, i, { path: path.join(this.dir, i.file) }));
  }

  get(id) {
    return this.index.find((i) => i.id === id);
  }

  pathOf(id) {
    const it = this.get(id);
    return it ? path.join(this.dir, it.file) : null;
  }

  async remove(id) {
    await this.ensure();
    const it = this.get(id);
    if (!it) return;
    try {
      await fsp.unlink(path.join(this.dir, it.file));
    } catch (e) {
      /* already gone */
    }
    this.index = this.index.filter((i) => i.id !== id);
    await this._writeIndex();
  }
}

module.exports = { Gallery };
