'use strict';

const { OpenAIError, friendlyNetworkError } = require('./openai');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Interactions API revision documented for the current Gemini image models
const API_REVISION = '2026-05-20';

/**
 * Deep-search a provider response for base64 image payloads. Resilient to both
 * the new Interactions API shape (output_image / steps blocks with mime_type)
 * and the legacy generateContent shape (inlineData / inline_data parts).
 */
function collectImageBlocks(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectImageBlocks(n, out);
    return;
  }
  const mime = node.mime_type || node.mimeType || '';
  const data = node.data;
  const looksImage =
    typeof data === 'string' &&
    data.length > 1024 &&
    (mime.startsWith('image/') ||
      node.type === 'image' ||
      node.kind === 'image' ||
      !!node.inlineData ||
      !!node.inline_data ||
      !!node.output_image);
  if (looksImage) out.push({ mime: mime || 'image/png', data });
  for (const k of Object.keys(node)) {
    if (k === 'text' || k === 'prompt') continue;
    collectImageBlocks(node[k], out);
  }
}

/** First human-readable text block in a response (model refusals, notes). */
function firstText(node) {
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) {
    for (const n of node) {
      const t = firstText(n);
      if (t) return t;
    }
    return '';
  }
  const t = typeof node.text === 'string' ? node.text : '';
  if (t.trim()) return t.trim();
  for (const k of Object.keys(node)) {
    if (k === 'data' || k === 'prompt') continue;
    const r = firstText(node[k]);
    if (r) return r;
  }
  return '';
}

function noImageError(model, j) {
  const t = firstText(j || {});
  const said = t ? ` The model replied: "${t.slice(0, 180)}"` : '';
  return new OpenAIError(
    `Google returned no image data for "${model}".` +
      (said || ' Try a different image model in Settings → Default model.'),
    0
  );
}

/**
 * Google Gemini image models via the Gemini API:
 *  - new:  POST /v1beta/interactions  (Api-Revision: 2026-05-20)
 *  - old:  POST /v1beta/models/{model}:generateContent  (responseModalities + imageConfig)
 * The new endpoint is tried first; if the account/endpoint does not exist we
 * transparently fall back to the legacy call.
 */
class GoogleClient {
  constructor({ getApiKey }) {
    this.getApiKey = getApiKey;
  }

  _headers(extra) {
    const key = this.getApiKey();
    if (!key) {
      throw new OpenAIError('No Google Gemini API key configured. Add it in Settings first.', 0);
    }
    return { 'x-goog-api-key': key, ...(extra || {}) };
  }

  async _check(res) {
    if (res.ok) return;
    let msg = `HTTP ${res.status}`;
    let status = res.status;
    try {
      const j = await res.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) {
      /* keep default */
    }
    if (res.status === 400 && /API key not valid/i.test(msg)) {
      msg = 'Invalid Google API key. Check the key in Settings.';
    }
    if (res.status === 402) {
      msg = 'Your Google account has no credit left. Check billing → https://ai.google.dev/pricing';
    }
    if (res.status === 403) msg = 'Access denied — ' + msg;
    if (res.status === 429) msg = 'Rate limit / quota reached — ' + msg;
    throw new OpenAIError(msg, status);
  }

  async testKey() {
    try {
      const res = await fetch(`${API_BASE}/models`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      const ids = Array.isArray(j.models) ? j.models.map((m) => (m.name || '').replace('models/', '')) : [];
      return { ok: true, models: ids.length, ids };
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async generate({ prompt, model, aspect, imageSize, n }) {
    const count = Math.min(4, Math.max(1, Number(n) || 1));
    const out = [];
    for (let i = 0; i < count; i++) {
      // Google produces one image per call; sequential keeps ordering predictable
      const one = await this._imageOnce({ prompt, model, aspect, imageSize, images: [] });
      out.push(...one);
    }
    return out;
  }

  async edit({ imageBuffers, prompt, model, aspect, imageSize }) {
    return this._imageOnce({ prompt, model, aspect, imageSize, images: imageBuffers || [] });
  }

  async _imageOnce({ prompt, model, aspect, imageSize, images }) {
    try {
      return await this._interactions({ prompt, model, aspect, imageSize, images });
    } catch (e) {
      const retriableLegacy =
        e.status === 404 ||
        e.status === 501 ||
        (e.status === 400 && /unsupported|unknown name|not found|not supported|unimplemented/i.test(e.message || ''));
      if (!retriableLegacy) throw e;
      return this._generateContentLegacy({ prompt, model, aspect, imageSize, images });
    }
  }

  async _interactions({ prompt, model, aspect, imageSize, images }) {
    try {
      const body = { model, input: [] };
      for (const img of images) {
        body.input.push({ type: 'image', mime_type: img.mime || 'image/png', data: img.data });
      }
      body.input.push({ type: 'text', text: String(prompt || '') });
      const rf = { type: 'image' };
      if (aspect) rf.aspect_ratio = aspect;
      if (imageSize) rf.image_size = imageSize;
      body.response_format = rf;

      const res = await fetch(`${API_BASE}/interactions`, {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json', 'Api-Revision': API_REVISION }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      const blocks = [];
      collectImageBlocks(j, blocks);
      if (!blocks.length) throw noImageError(model, j);
      return blocks.slice(0, 1).map((b) => b.data);
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async _generateContentLegacy({ prompt, model, aspect, imageSize, images }) {
    try {
      const parts = images.map((im) => ({ inline_data: { mime_type: im.mime || 'image/png', data: im.data } }));
      parts.push({ text: String(prompt || '') });
      const genCfg = { responseModalities: ['IMAGE'] };
      const imgCfg = {};
      if (aspect) imgCfg.aspectRatio = aspect;
      if (imageSize) imgCfg.imageSize = imageSize;
      if (Object.keys(imgCfg).length) genCfg.imageConfig = imgCfg;

      const res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ contents: [{ parts }], generationConfig: genCfg }),
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      const blocks = [];
      collectImageBlocks(j, blocks);
      if (!blocks.length) throw noImageError(model, j);
      return blocks.map((b) => b.data);
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }
}

module.exports = { GoogleClient, collectImageBlocks };
