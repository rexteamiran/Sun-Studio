'use strict';

const fs = require('fs');
const fsp = fs.promises;

const API_BASE = 'https://api.openai.com/v1';
const IMAGE_MODELS = ['gpt-image-1', 'gpt-image-1-mini'];
const SIZES = ['1024x1024', '1536x1024', '1024x1536'];
const QUALITIES = ['low', 'medium', 'high'];

class OpenAIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'OpenAIError';
    this.status = status || 0;
  }
}

function friendlyNetworkError(e) {
  if (e.name === 'AbortError' || e.name === 'TimeoutError') {
    return new OpenAIError(
      'The request timed out. High-quality images can take a while — check your internet connection and try again.',
      0
    );
  }
  const code = e.cause && e.cause.code;
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return new OpenAIError('Could not reach api.openai.com — check your internet connection.', 0);
  }
  return e;
}

class OpenAIClient {
  constructor({ getApiKey }) {
    this.getApiKey = getApiKey;
  }

  _authHeader() {
    const key = this.getApiKey();
    if (!key) {
      throw new OpenAIError('No API key configured. Add your OpenAI key in Settings first.', 0);
    }
    return `Bearer ${key}`;
  }

  async _check(res) {
    if (res.ok) return;
    let msg = `OpenAI returned HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) {
      /* keep default message */
    }
    if (res.status === 401) msg = 'Invalid or revoked API key. Check the key in Settings.';
    if (res.status === 429) msg = 'Rate limit / quota reached — ' + msg;
    throw new OpenAIError(msg, res.status);
  }

  async testKey() {
    try {
      const res = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: this._authHeader() },
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      const ids = Array.isArray(j.data) ? j.data.map((m) => m.id) : [];
      return {
        ok: true,
        models: ids.length,
        hasImageModel: ids.includes('gpt-image-1') || ids.includes('gpt-image-1-mini'),
      };
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async generate({ prompt, model, size, quality, n, background }) {
    try {
      const body = {
        model: model || 'gpt-image-1',
        prompt: String(prompt || ''),
        size: size || '1024x1024',
        quality: quality || 'medium',
        n: Math.min(4, Math.max(1, Number(n) || 1)),
      };
      if (background && background !== 'auto') body.background = background;
      const res = await fetch(`${API_BASE}/images/generations`, {
        method: 'POST',
        headers: { Authorization: this._authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      const out = (j.data || []).map((d) => d.b64_json).filter(Boolean);
      if (!out.length) throw new OpenAIError('OpenAI returned no image data.', 0);
      return out;
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async edit({ imagePaths, maskPng, prompt, model, size, quality, n, background }) {
    try {
      const fd = new FormData();
      fd.append('model', model || 'gpt-image-1');
      fd.append('prompt', String(prompt || ''));
      for (let i = 0; i < imagePaths.length; i++) {
        const buf = await fsp.readFile(imagePaths[i]);
        const isJpg = /\.jpe?g$/i.test(imagePaths[i]);
        const field = imagePaths.length > 1 ? 'image[]' : 'image';
        fd.append(field, new Blob([buf], { type: isJpg ? 'image/jpeg' : 'image/png' }), `image${i}${isJpg ? '.jpg' : '.png'}`);
      }
      if (maskPng) fd.append('mask', new Blob([maskPng], { type: 'image/png' }), 'mask.png');
      if (size) fd.append('size', size);
      if (quality) fd.append('quality', quality);
      if (background && background !== 'auto') fd.append('background', background);
      fd.append('n', String(Math.min(4, Math.max(1, Number(n) || 1))));

      const res = await fetch(`${API_BASE}/images/edits`, {
        method: 'POST',
        headers: { Authorization: this._authHeader() },
        body: fd,
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      const out = (j.data || []).map((d) => d.b64_json).filter(Boolean);
      if (!out.length) throw new OpenAIError('OpenAI returned no image data.', 0);
      return out;
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }
}

module.exports = { OpenAIClient, OpenAIError, IMAGE_MODELS, SIZES, QUALITIES };
