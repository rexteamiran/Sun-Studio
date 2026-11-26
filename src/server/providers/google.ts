import { runSequentialImages } from "./batch";
import {
  ProviderError,
  friendlyNetworkError,
  type ImageClient,
  type ImageInput,
  type TestResult,
  type GenerateParams,
} from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Interactions API revision documented for the current Gemini image models
const API_REVISION = "2026-05-20";

interface ImgBlock {
  mime: string;
  data: string;
}

/**
 * Deep-search a provider response for base64 image payloads. Resilient to both
 * the new Interactions API shape (output_image / steps blocks with mime_type)
 * and the legacy generateContent shape (inlineData / inline_data parts).
 */
export function collectImageBlocks(node: unknown, out: ImgBlock[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectImageBlocks(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const mime = String(obj.mime_type || obj.mimeType || "");
  const data = obj.data;
  const looksImage =
    typeof data === "string" &&
    data.length > 1024 &&
    (mime.startsWith("image/") ||
      obj.type === "image" ||
      obj.kind === "image" ||
      !!obj.inlineData ||
      !!obj.inline_data ||
      !!obj.output_image);
  if (looksImage) out.push({ mime: mime || "image/png", data: data as string });
  for (const k of Object.keys(obj)) {
    if (k === "text" || k === "prompt") continue;
    collectImageBlocks(obj[k], out);
  }
}

/** First human-readable text block in a response (model refusals, notes). */
function firstText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) {
    for (const n of node) {
      const t = firstText(n);
      if (t) return t;
    }
    return "";
  }
  const obj = node as Record<string, unknown>;
  const t = typeof obj.text === "string" ? obj.text : "";
  if (t.trim()) return t.trim();
  for (const k of Object.keys(obj)) {
    if (k === "data" || k === "prompt") continue;
    const r = firstText(obj[k]);
    if (r) return r;
  }
  return "";
}

function noImageError(model: string, j: unknown): ProviderError {
  const t = firstText(j || {});
  const said = t ? ` The model replied: "${t.slice(0, 180)}"` : "";
  return new ProviderError(
    `Google returned no image data for "${model}".` +
      (said || " Try a different image model in Settings → Default model."),
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
export class GoogleClient implements ImageClient {
  baseUrl: string;
  getApiKey: () => string | null;

  constructor({ getApiKey, baseUrl }: { getApiKey: () => string | null; baseUrl?: string }) {
    this.baseUrl = (baseUrl || API_BASE).replace(/\/+$/, "");
    this.getApiKey = getApiKey;
  }

  _headers(extra?: Record<string, string>): Record<string, string> {
    const key = this.getApiKey();
    if (!key) {
      throw new ProviderError("No Google Gemini API key configured. Add it in Settings first.", 0);
    }
    return { "x-goog-api-key": key, ...(extra || {}) };
  }

  async _check(res: Response): Promise<void> {
    if (res.ok) return;
    let msg = `HTTP ${res.status}`;
    const status = res.status;
    try {
      const j = await res.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch {
      /* keep default */
    }
    if (res.status === 400 && /API key not valid/i.test(msg)) {
      msg = "Invalid Google API key. Check the key in Settings.";
    }
    if (res.status === 402) {
      msg = "Your Google account has no credit left. Check billing → https://ai.google.dev/pricing";
    }
    if (res.status === 403) msg = "Access denied — " + msg;
    if (res.status === 429) msg = "Rate limit / quota reached — " + msg;
    throw new ProviderError(msg, status);
  }

  async testKey(): Promise<TestResult> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      const ids = Array.isArray(j.models)
        ? j.models.map((m: { name?: string }) => (m.name || "").replace("models/", ""))
        : [];
      return { ok: true, models: ids.length, ids };
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async generate({ prompt, model, aspect, imageSize, n, onImage }: GenerateParams): Promise<string[]> {
    return runSequentialImages(n,
      () => this._imageOnce({ prompt, model, aspect, imageSize, images: [] }), onImage);
  }

  async edit({ imageBuffers, maskPng, prompt, model, aspect, imageSize, n, onImage }: import("./types").EditParams): Promise<string[]> {
    if (maskPng) throw new ProviderError("This Google integration requires a browser-composited reference instead of a separate edit mask.", 400);
    if (!Array.isArray(imageBuffers) || !imageBuffers.length) throw new ProviderError("No image selected.", 400);
    return runSequentialImages(n,
      () => this._imageOnce({ prompt, model, aspect, imageSize, images: imageBuffers }), onImage);
  }

  async _imageOnce({
    prompt,
    model,
    aspect,
    imageSize,
    images,
  }: {
    prompt: string;
    model: string;
    aspect?: string;
    imageSize?: string;
    images: ImageInput[];
  }): Promise<string[]> {
    try {
      return await this._interactions({ prompt, model, aspect, imageSize, images });
    } catch (e) {
      const err = e as ProviderError;
      const retriableLegacy =
        err.status === 404 ||
        err.status === 501 ||
        (err.status === 400 &&
          /unsupported|unknown name|not found|not supported|unimplemented/i.test(err.message || ""));
      if (!retriableLegacy) throw e;
      return this._generateContentLegacy({ prompt, model, aspect, imageSize, images });
    }
  }

  async _interactions({
    prompt,
    model,
    aspect,
    imageSize,
    images,
  }: {
    prompt: string;
    model: string;
    aspect?: string;
    imageSize?: string;
    images: ImageInput[];
  }): Promise<string[]> {
    try {
      const body: Record<string, unknown> = { model, input: [] };
      const input = body.input as Array<Record<string, unknown>>;
      for (const img of images) {
        input.push({ type: "image", mime_type: img.mime || "image/png", data: img.data });
      }
      input.push({ type: "text", text: String(prompt || "") });
      const rf: Record<string, unknown> = { type: "image" };
      if (aspect) rf.aspect_ratio = aspect;
      if (imageSize) rf.image_size = imageSize;
      body.response_format = rf;

      const res = await fetch(`${this.baseUrl}/interactions`, {
        method: "POST",
        headers: this._headers({ "Content-Type": "application/json", "Api-Revision": API_REVISION }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      const blocks: ImgBlock[] = [];
      collectImageBlocks(j, blocks);
      if (!blocks.length) throw noImageError(model, j);
      return blocks.slice(0, 1).map((b) => b.data);
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async _generateContentLegacy({
    prompt,
    model,
    aspect,
    imageSize,
    images,
  }: {
    prompt: string;
    model: string;
    aspect?: string;
    imageSize?: string;
    images: ImageInput[];
  }): Promise<string[]> {
    try {
      const parts: Record<string, unknown>[] = images.map((im) => ({
        inline_data: { mime_type: im.mime || "image/png", data: im.data },
      }));
      parts.push({ text: String(prompt || "") });
      const genCfg: Record<string, unknown> = { responseModalities: ["IMAGE"] };
      const imgCfg: Record<string, unknown> = {};
      if (aspect) imgCfg.aspectRatio = aspect;
      if (imageSize) imgCfg.imageSize = imageSize;
      if (Object.keys(imgCfg).length) genCfg.imageConfig = imgCfg;

      const res = await fetch(`${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: this._headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ contents: [{ parts }], generationConfig: genCfg }),
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      const blocks: ImgBlock[] = [];
      collectImageBlocks(j, blocks);
      if (!blocks.length) throw noImageError(model, j);
      return blocks.map((b) => b.data);
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }
}
