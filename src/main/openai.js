'use strict';

const fs = require('fs');
const fsp = fs.promises;

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
    return new OpenAIError('Could not reach the provider — check your internet connection.', 0);
  }
  return e;
}

function openAiSizeFor(aspect) {
  return {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
  }[aspect] || '1024x1024';
}

/**
 * Some OpenAI-compatible providers (proxies, dall-e-3 defaults) return image
 * URLs instead of inline base64 — download and convert so the app can show it.
 */
async function fetchAsB64(url) {
  const res = await fetch(String(url), { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new OpenAIError(`Could not download the generated image (HTTP ${res.status}).`, 0);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new OpenAIError('The provider returned an empty image URL.', 0);
  return buf.toString('base64');
}

/** Pull base64 out of one response item, whether it is inline or a URL. */
async function itemToB64(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.b64_json) return d.b64_json;
  if (d.image && typeof d.image === 'string' && d.image.length > 512) return d.image; // some proxies: raw base64
  const url = d.url || d.image_url || (d.image_url && d.image_url.url) || d.output_url;
  if (url) return fetchAsB64(url);
  return null;
}

function dallE3SizeFor(aspect) {
  return { '1:1': '1024x1024', '3:2': '1792x1024', '2:3': '1024x1792' }[aspect] || '1024x1024';
}

/**
 * Client for OpenAI and every OpenAI-compatible endpoint (AI Pass proxy).
 * Both expose POST /images/generations and POST /images/edits with Bearer auth.
 */
class OpenAICompatibleClient {
  constructor({ providerMeta, getApiKey }) {
    this.meta = providerMeta;
    this.baseUrl = providerMeta.baseUrl.replace(/\/+$/, '');
    this.getApiKey = getApiKey;
  }

  _authHeader() {
    const key = this.getApiKey();
    if (!key) {
      throw new OpenAIError(`No ${this.meta.label} API key configured. Add it in Settings first.`, 0);
    }
    return `Bearer ${key}`;
  }

  async _check(res) {
    if (res.ok) return;
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) {
      /* keep default */
    }
    if (res.status === 401) msg = 'Invalid or revoked API key. Check the key in Settings.';
    if (res.status === 402) msg = 'Out of funds — ' + msg;
    if (res.status === 403) msg = 'Access denied (key invalid or endpoint not allowed) — ' + msg;
    if (res.status === 429) msg = 'Rate limit / quota reached — ' + msg;
    throw new OpenAIError(msg, res.status);
  }

  async testKey() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: this._authHeader() },
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      const ids = Array.isArray(j.data) ? j.data.map((m) => m.id) : [];
      return { ok: true, models: ids.length, ids };
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async listModels() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: this._authHeader() },
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      return (Array.isArray(j.data) ? j.data.map((m) => m.id) : []).sort();
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async generate({ prompt, model, aspect, quality, n, background }) {
    try {
      const isDallE3 = String(model).startsWith('dall-e-3');
      const body = {
        model,
        prompt: String(prompt || ''),
        n: Math.min(4, Math.max(1, Number(n) || 1)),
      };
      if (isDallE3) {
        body.size = dallE3SizeFor(aspect);
        body.quality = quality === 'high' ? 'hd' : 'standard';
        body.response_format = 'b64_json';
      } else {
        body.size = openAiSizeFor(aspect);
        body.quality = quality || 'medium';
        if (background && background !== 'auto') body.background = background;
      }

      const res = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: { Authorization: this._authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      if (j && j.error && j.error.message) throw new OpenAIError(j.error.message, 0);
      const items = Array.isArray(j.data) ? j.data : Array.isArray(j.images) ? j.images : [];
      const out = [];
      for (const d of items) {
        const b = await itemToB64(d);
        if (b) out.push(b);
      }
      if (!out.length) {
        throw new OpenAIError(
          `The provider returned no image data for "${model}". If this model does not generate images, pick an image model in Settings → Default model.`,
          0
        );
      }
      return out;
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async edit({ imagePaths, maskPng, prompt, model, aspect, quality, n, background }) {
    try {
      const isDallE3 = String(model).startsWith('dall-e-3');
      const fd = new FormData();
      fd.append('model', model);
      fd.append('prompt', String(prompt || ''));
      for (let i = 0; i < imagePaths.length; i++) {
        const buf = await fsp.readFile(imagePaths[i]);
        const isJpg = /\.jpe?g$/i.test(imagePaths[i]);
        const field = imagePaths.length > 1 ? 'image[]' : 'image';
        fd.append(field, new Blob([buf], { type: isJpg ? 'image/jpeg' : 'image/png' }), `image${i}${isJpg ? '.jpg' : '.png'}`);
      }
      if (isDallE3) {
        // dall-e-3 has no edits endpoint; request is rejected by the server with a clear message
        fd.append('size', dallE3SizeFor(aspect));
        fd.append('response_format', 'b64_json');
        fd.append('n', '1');
      } else {
        fd.append('size', openAiSizeFor(aspect));
        if (maskPng) fd.append('mask', new Blob([maskPng], { type: 'image/png' }), 'mask.png');
        if (quality) fd.append('quality', quality);
        if (background && background !== 'auto') fd.append('background', background);
        fd.append('n', String(Math.min(4, Math.max(1, Number(n) || 1))));
      }

      const res = await fetch(`${this.baseUrl}/images/edits`, {
        method: 'POST',
        headers: { Authorization: this._authHeader() },
        body: fd,
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      if (j && j.error && j.error.message) throw new OpenAIError(j.error.message, 0);
      const items = Array.isArray(j.data) ? j.data : Array.isArray(j.images) ? j.images : [];
      const out = [];
      for (const d of items) {
        const b = await itemToB64(d);
        if (b) out.push(b);
      }
      if (!out.length) {
        throw new OpenAIError(
          `The provider returned no image data for "${model}". The model may not support image edits — try an image model that supports the edits endpoint.`,
          0
        );
      }
      return out;
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }
}

module.exports = { OpenAICompatibleClient, OpenAIError, friendlyNetworkError };
