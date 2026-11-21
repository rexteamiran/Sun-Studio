'use strict';

/**
 * kie.ai client — job-based (async) image generation.
 *
 * Every image model on kie.ai works the same way (docs.kie.ai):
 *   1. POST /api/v1/jobs/createTask        { model, input } -> { code, data.taskId }
 *   2. GET  /api/v1/jobs/recordInfo        ?taskId=...      -> { data: { state, resultJson } }
 *   3. download the URLs inside resultJson.resultUrls
 *
 * IMPORTANT quirks documented by kie.ai:
 *   - HTTP status is ALWAYS 200; the real result code lives in the body (`code`).
 *   - `input` field names differ per model family: nano-banana* uses `image_input`,
 *     seedream/grok use `image_urls`, gpt-image uses `input_urls`.
 *   - Local files must be uploaded first via POST /api/file-base64-upload (URLs expire in 24h,
 *     plenty for a generation run) and passed as URLs.
 *   - grok-imagine/image-to-image requires @image(n) references inside the prompt.
 *   - Model quality knobs differ: nano-banana* takes `resolution` (1K/2K/4K), seedream takes
 *     `quality` (basic/high), gpt-image takes `quality` (medium/high), grok has none.
 */

const KIE_BASE = 'https://api.kie.ai';

class KieError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'KieError';
    this.code = code || 0;
  }
}

/** Body-code -> friendly message (HTTP is always 200, so codes are read from the body). */
function friendlyBodyError(code, msg) {
  const detail = msg ? ' — ' + msg : '';
  switch (code) {
    case 401: return 'Invalid or revoked kie.ai API key. Check the key in Settings.';
    case 402: return 'Your kie.ai account has no credit left. Top up the balance on kie.ai, then try again.';
    case 404: return 'Task not found on kie.ai' + detail;
    case 408: return 'kie.ai returned no result for over 10 minutes — try again.';
    case 422: return 'kie.ai rejected the request' + (detail || ' — check the model and parameters.');
    case 429: return 'Rate limit reached (kie.ai allows 20 new tasks per 10 seconds) — wait a moment and retry.';
    case 455: return 'kie.ai is under maintenance — try again later.';
    case 501: return 'The generation failed on kie.ai' + detail;
    case 505: return 'This feature is currently disabled on kie.ai.';
    case 500: return 'kie.ai server error — try again.';
    default: return 'kie.ai error ' + code + detail;
  }
}

/** Canonical aspect -> closest aspect each model accepts (documented enums). */
const ASPECT_FALLBACK = { '16:9': '3:2', '9:16': '2:3', '4:3': '3:2', '3:4': '2:3' };

/**
 * Per-model recipe, transcribed from the docs.kie.ai pages of each endpoint:
 *   - i2i: whether the model accepts input images (and which input field carries the URLs)
 *   - imageField: 'image_input' | 'image_urls' | 'input_urls' (exact per docs)
 *   - aspects: accepted aspect_ratio enum (undefined = no aspect field at all)
 *   - resolution: model takes 1K/2K/4K directly (nano-banana family)
 *   - quality: map of Sun Studio imageSize (1K/2K/4K) -> model quality value
 *   - promptRef: prompt must reference images via @image(n) (grok-imagine i2i)
 */
const MODEL_RECIPES = {
  'nano-banana-2-1': {
    kind: 'nano', i2i: true, imageField: 'image_input', resolution: true,
    aspects: ['1:1', '2:3', '3:2', '1:4', '4:1', '3:4', '4:3', '4:5', '5:4', '1:8', '8:1', '9:16', '16:9', '21:9'],
  },
  'nano-banana-pro': {
    kind: 'nano', i2i: true, imageField: 'image_input', resolution: true,
    aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
  },
  'nano-banana': { kind: 'nano', i2i: false },
  'seedream/5-pro-text-to-image': {
    kind: 'seedream', i2i: false,
    aspects: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'],
    quality: { '1K': 'basic', '2K': 'high', '4K': 'high' },
  },
  'seedream/5-pro-image-to-image': {
    kind: 'seedream', i2i: true, imageField: 'image_urls',
    aspects: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'],
    quality: { '1K': 'basic', '2K': 'high', '4K': 'high' },
  },
  'gpt-image/1.5-text-to-image': {
    kind: 'gptimage', i2i: false, aspects: ['1:1', '2:3', '3:2'],
    quality: { '1K': 'medium', '2K': 'high', '4K': 'high' },
  },
  'gpt-image/1.5-image-to-image': {
    kind: 'gptimage', i2i: true, imageField: 'input_urls', aspects: ['1:1', '2:3', '3:2'],
    quality: { '1K': 'medium', '2K': 'high', '4K': 'high' },
  },
  'grok-imagine/text-to-image': { kind: 'grok', i2i: false, aspects: ['1:1', '2:3', '3:2', '16:9', '9:16'] },
  'grok-imagine/image-to-image': {
    kind: 'grok', i2i: true, imageField: 'image_urls', aspects: null, promptRef: true,
  },
};

function recipeFor(model) {
  return MODEL_RECIPES[String(model)] || { kind: 'nano', i2i: false };
}

async function fetchJson(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      const t = await res.text();
      if (t && t.length <= 300) msg = t.trim();
    } catch (e) { /* keep default */ }
    throw new KieError(msg, res.status);
  }
  return res.json();
}

async function fetchAsB64(url) {
  const res = await fetch(String(url), { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new KieError('Could not download the generated image (HTTP ' + res.status + ').', 0);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new KieError('kie.ai returned an empty image URL.', 0);
  return buf.toString('base64');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class KieClient {
  constructor({ providerMeta, getApiKey }) {
    this.meta = providerMeta;
    this.baseUrl = (providerMeta.baseUrl || KIE_BASE).replace(/\/+$/, '');
    this.getApiKey = getApiKey;
  }

  _authHeader() {
    const key = this.getApiKey();
    if (!key) {
      throw new KieError('No kie.ai API key configured. Add it in Settings first.', 0);
    }
    return { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  }

  /** kie.ai returns HTTP 200 even for failures — always validate the body code. */
  _checkBody(j) {
    if (j && typeof j === 'object' && j.code === 200) return;
    const code = (j && j.code) || 0;
    throw new KieError(friendlyBodyError(code, j && j.msg), code);
  }

  async testKey() {
    try {
      const j = await fetchJson(this.baseUrl + '/api/v1/chat/credit', { headers: this._authHeader() });
      this._checkBody(j);
      return { ok: true, models: null, ids: [], credits: j.data };
    } catch (e) {
      throw e instanceof KieError ? e : new KieError(e.message, 0);
    }
  }

  /** Upload one local image (raw base64) and return a public URL the jobs API accepts. */
  async uploadImage({ mime, data }) {
    const j = await fetchJson(this.baseUrl + '/api/file-base64-upload', {
      method: 'POST',
      headers: this._authHeader(),
      body: JSON.stringify({
        base64Data: 'data:' + (mime || 'image/png') + ';base64,' + data,
        uploadPath: 'sun-studio/inputs',
        fileName: 'sunstudio-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.png',
      }),
    });
    this._checkBody(j);
    const url = j.data && j.data.downloadUrl;
    if (!url) throw new KieError('kie.ai did not return an upload URL.', 0);
    return url;
  }

  async createTask(model, input) {
    const j = await fetchJson(this.baseUrl + '/api/v1/jobs/createTask', {
      method: 'POST',
      headers: this._authHeader(),
      body: JSON.stringify({ model, input }),
    });
    this._checkBody(j);
    const id = j.data && j.data.taskId;
    if (!id) throw new KieError('kie.ai did not return a task id.', 0);
    return id;
  }

  async pollTask(taskId, { timeoutMs = 480000, intervalMs = 3000, onStage } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const j = await fetchJson(
        this.baseUrl + '/api/v1/jobs/recordInfo?taskId=' + encodeURIComponent(taskId),
        { headers: this._authHeader() }
      );
      this._checkBody(j);
      const d = j.data || {};
      if (d.state === 'success') {
        let urls = [];
        try {
          const rj = typeof d.resultJson === 'string' ? JSON.parse(d.resultJson) : d.resultJson;
          urls = (rj && Array.isArray(rj.resultUrls) ? rj.resultUrls : []).filter(Boolean);
        } catch (e) { /* fall through to the empty check */ }
        if (!urls.length) throw new KieError('kie.ai finished the task but returned no image URL.', 0);
        return urls;
      }
      if (d.state === 'fail') {
        const msg = d.failMsg || d.failCode || 'unknown failure';
        throw new KieError(friendlyBodyError(501, msg), 501);
      }
      if (onStage && d.progress) onStage('Generating on kie.ai… ' + d.progress + '%');
      await sleep(intervalMs);
    }
    throw new KieError('The kie.ai task did not finish in 8 minutes. Check kie.ai/logs for its status.', 0);
  }

  /** Build the per-family `input` object (field names verified against each docs page). */
  buildInput(model, { prompt, aspect, imageSize, imageUrls }) {
    const r = recipeFor(model);
    const input = { prompt: String(prompt || '') };

    if (r.i2i) {
      input[r.imageField] = (imageUrls || []).slice(0, r.imageField === 'image_input' ? 10 : 5);
      if (r.promptRef && !/@image\(\d+\)/.test(input.prompt) && imageUrls && imageUrls.length) {
        input.prompt += ' @image(1)';
      }
    }
    if (r.aspects) {
      const pick = r.aspects.includes(aspect) ? aspect : ASPECT_FALLBACK[aspect] || '1:1';
      input.aspect_ratio = pick;
    }
    if (r.resolution && imageSize) input.resolution = imageSize;
    if (r.quality && imageSize) input.quality = r.quality[imageSize] || r.quality['1K'];
    if (r.kind === 'nano') input.output_format = 'png';
    if (r.kind === 'seedream') input.output_format = 'png';
    return input;
  }

  async _runTasks({ model, prompt, aspect, imageSize, imageUrls, n, onStage }) {
    const nTasks = Math.min(4, Math.max(1, Number(n) || 1));
    if (onStage) onStage('Submitting ' + (nTasks > 1 ? nTasks + ' tasks' : 'task') + ' to kie.ai…');
    const ids = [];
    for (let i = 0; i < nTasks; i++) {
      ids.push(await this.createTask(model, this.buildInput(model, { prompt, aspect, imageSize, imageUrls })));
    }
    if (onStage) onStage('Queued on kie.ai… waiting for the result');
    const urlLists = await Promise.all(
      ids.map((id) => this.pollTask(id, { onStage: (s) => onStage && onStage(s) }))
    );
    const b64s = [];
    for (const urls of urlLists) {
      for (const u of urls) b64s.push(await fetchAsB64(u));
    }
    if (!b64s.length) throw new KieError('kie.ai returned no image data for "' + model + '".', 0);
    return b64s;
  }

  async generate({ prompt, model, aspect, imageSize, n, onStage }) {
    try {
      return await this._runTasks({ model, prompt, aspect, imageSize, imageUrls: null, n, onStage });
    } catch (e) {
      throw e instanceof KieError ? e : new KieError(e.message, 0);
    }
  }

  async edit({ imageBuffers, prompt, model, aspect, imageSize, n, onStage }) {
    try {
      if (!Array.isArray(imageBuffers) || !imageBuffers.length) {
        throw new KieError('No image selected.', 0);
      }
      if (onStage) onStage('Uploading your image to kie.ai…');
      const urls = [];
      for (const img of imageBuffers) urls.push(await this.uploadImage(img));
      return await this._runTasks({ model, prompt, aspect, imageSize, imageUrls: urls, n, onStage });
    } catch (e) {
      throw e instanceof KieError ? e : new KieError(e.message, 0);
    }
  }
}

module.exports = { KieClient, KieError, MODEL_RECIPES };
