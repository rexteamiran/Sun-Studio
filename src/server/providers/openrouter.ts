import {
  ProviderError,
  friendlyNetworkError,
  type ImageClient,
  type EditParams,
  type GenerateParams,
  type ImageInput,
  type TestResult,
} from "./types";

/**
 * OpenRouter Image API client (docs: openrouter.ai/docs).
 *
 *   POST /api/v1/images            { model, prompt, aspect_ratio, resolution, n, ... }
 *   GET  /api/v1/images/models     → image-capable model catalog
 *
 * Response items carry b64_json inline (default) — or `url` when
 * response_format:"url". Reference images go in `input_references`
 * (base64 data URLs) for image-to-image.
 */

/** Canonical app aspect → OpenRouter aspect_ratio (they accept many natively). */
const ASPECTS: Record<string, string> = {
  "1:1": "1:1",
  "3:2": "3:2",
  "2:3": "2:3",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "5:4": "5:4",
  "4:5": "4:5",
  "21:9": "21:9",
};

export class OpenRouterClient implements ImageClient {
  baseUrl: string;
  getApiKey: () => string | null;

  constructor({ baseUrl, getApiKey }: { baseUrl?: string; getApiKey: () => string | null }) {
    this.baseUrl = (baseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    this.getApiKey = getApiKey;
  }

  _authHeader(): string {
    const key = this.getApiKey();
    if (!key) throw new ProviderError("No OpenRouter API key configured. Add it in Settings first.", 0);
    return `Bearer ${key}`;
  }

  async _check(res: Response): Promise<void> {
    if (res.ok) return;
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error && (j.error.message || j.error.code)) {
        msg = String(j.error.message || j.error.code);
      }
    } catch {
      /* keep default */
    }
    if (res.status === 401) msg = "Invalid or revoked OpenRouter key. Check the key in Settings.";
    if (res.status === 402) msg = "Your OpenRouter account is out of credits — top up at openrouter.ai/credits.";
    if (res.status === 429) msg = "Rate limit reached — " + msg;
    throw new ProviderError(msg, res.status);
  }

  async testKey(): Promise<TestResult> {
    try {
      // cheap authenticated call: list image models
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: this._authHeader() },
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      const ids = Array.isArray(j.data) ? j.data.map((m: { id?: string }) => String(m.id || "")) : [];
      return { ok: true, models: ids.length, ids: ids.slice(0, 400) };
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/images/models`, {
        headers: { Authorization: this._authHeader() },
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
      return arr
        .map((m: { id?: string }) => String(m.id || ""))
        .filter(Boolean)
        .sort();
    } catch (e) {
      // some keys/accounts: fall back to the general catalog
      try {
        const res = await fetch(`${this.baseUrl}/models`, {
          headers: { Authorization: this._authHeader() },
          signal: AbortSignal.timeout(20000),
        });
        await this._check(res);
        const j = await res.json();
        return (Array.isArray(j.data) ? j.data.map((m: { id?: string }) => String(m.id || "")) : []).sort();
      } catch {
        throw friendlyNetworkError(e);
      }
    }
  }

  async _images(body: Record<string, unknown>): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/images`, {
      method: "POST",
      headers: { Authorization: this._authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });
    await this._check(res);
    const j = await res.json();
    const items = Array.isArray(j.data) ? j.data : [];
    const out: string[] = [];
    for (const d of items) {
      const it = d as { b64_json?: string; url?: string };
      if (it.b64_json) out.push(it.b64_json);
      else if (it.url) {
        const r = await fetch(it.url, { signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new ProviderError("Could not download the generated image (HTTP " + r.status + ").", 0);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length) out.push(buf.toString("base64"));
      }
    }
    if (!out.length) throw new ProviderError('OpenRouter returned no image data for "' + body.model + '".', 0);
    return out;
  }

  async generate({ prompt, model, aspect, imageSize, n }: GenerateParams): Promise<string[]> {
    try {
      const body: Record<string, unknown> = {
        model,
        prompt: String(prompt || ""),
        n: Math.min(4, Math.max(1, Number(n) || 1)),
        response_format: "b64_json",
      };
      if (aspect && ASPECTS[aspect]) body.aspect_ratio = ASPECTS[aspect];
      if (imageSize && ["512", "768", "1K", "1.5K", "2K", "4K"].includes(imageSize)) body.resolution = imageSize;
      return await this._images(body);
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async edit({ imageBuffers, prompt, model, aspect, imageSize, n }: EditParams): Promise<string[]> {
    try {
      if (!Array.isArray(imageBuffers) || !imageBuffers.length) {
        throw new ProviderError("No image selected.", 0);
      }
      const body: Record<string, unknown> = {
        model,
        prompt: String(prompt || ""),
        n: Math.min(4, Math.max(1, Number(n) || 1)),
        response_format: "b64_json",
        input_references: (imageBuffers as ImageInput[]).slice(0, 16).map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mime || "image/png"};base64,${img.data}` },
        })),
      };
      if (aspect && ASPECTS[aspect]) body.aspect_ratio = ASPECTS[aspect];
      if (imageSize && ["512", "768", "1K", "1.5K", "2K", "4K"].includes(imageSize)) body.resolution = imageSize;
      return await this._images(body);
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }
}
