import fsp from "fs/promises";
import {
  ProviderError,
  friendlyNetworkError,
  type ImageClient,
  type ProviderMeta,
  type TestResult,
  type EditParams,
  type GenerateParams,
} from "./types";

function openAiSizeFor(aspect?: string): string {
  return (
    {
      "1:1": "1024x1024",
      "3:2": "1536x1024",
      "2:3": "1024x1536",
      "16:9": "1792x1024",
      "9:16": "1024x1792",
    }[aspect || ""] || "1024x1024"
  );
}

function dallE3SizeFor(aspect?: string): string {
  return (
    { "1:1": "1024x1024", "3:2": "1792x1024", "2:3": "1024x1792" }[aspect || ""] ||
    "1024x1024"
  );
}

/**
 * Some OpenAI-compatible providers (proxies, dall-e-3 defaults) return image
 * URLs instead of inline base64 — download and convert so the app can show it.
 */
async function fetchAsB64(url: string): Promise<string> {
  const res = await fetch(String(url), { signal: AbortSignal.timeout(120000) });
  if (!res.ok)
    throw new ProviderError(`Could not download the generated image (HTTP ${res.status}).`, 0);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new ProviderError("The provider returned an empty image URL.", 0);
  return buf.toString("base64");
}

/** Pull base64 out of one response item, whether it is inline or a URL. */
async function itemToB64(d: unknown): Promise<string | null> {
  const item = d as Record<string, unknown> | null;
  if (!item || typeof item !== "object") return null;
  if (item.b64_json) return String(item.b64_json);
  if (
    typeof item.image === "string" &&
    (item.image as string).length > 512
  )
    return item.image; // some proxies: raw base64
  const imageUrl = item.image_url as { url?: string } | string | undefined;
  const url =
    (item.url as string) ||
    (typeof imageUrl === "string" ? imageUrl : undefined) ||
    (typeof imageUrl === "object" && imageUrl ? imageUrl.url : undefined) ||
    (item.output_url as string | undefined);
  if (url) return fetchAsB64(url);
  return null;
}

function itemsFrom(j: { data?: unknown; images?: unknown; error?: { message?: string } }): unknown[] {
  return Array.isArray(j.data) ? j.data : Array.isArray(j.images) ? j.images : [];
}

/**
 * Client for OpenAI and every OpenAI-compatible endpoint (AI Pass proxy,
 * custom endpoints). Both expose POST /images/generations and /images/edits.
 */
export class OpenAICompatibleClient implements ImageClient {
  meta: ProviderMeta;
  baseUrl: string;
  getApiKey: () => string | null;

  constructor({ providerMeta, getApiKey }: { providerMeta: ProviderMeta; getApiKey: () => string | null }) {
    this.meta = providerMeta;
    this.baseUrl = (providerMeta.baseUrl || "").replace(/\/+$/, "");
    this.getApiKey = getApiKey;
  }

  _authHeader(): string {
    const key = this.getApiKey();
    if (!key) {
      throw new ProviderError(
        `No ${this.meta.label} API key configured. Add it in Settings first.`,
        0
      );
    }
    return `Bearer ${key}`;
  }

  async _check(res: Response): Promise<void> {
    if (res.ok) return;
    let msg = `HTTP ${res.status}`;
    let hasProviderMsg = false;
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: { message?: string }; message?: string };
        const m = (j && j.error && j.error.message) || (j && j.message) || "";
        if (m && typeof m === "string") {
          msg = m;
          hasProviderMsg = true;
        }
      } catch {
        if (text && text.length <= 300 && text.trim()) {
          msg = text.trim();
          hasProviderMsg = true;
        }
      }
    } catch {
      /* keep default */
    }
    if (res.status === 401) msg = "Invalid or revoked API key. Check the key in Settings.";
    if (res.status === 402) {
      const detail = hasProviderMsg ? " — " + msg : "";
      msg =
        `Your ${this.meta.label} account has no credit left${detail}. ` +
        "Top up the balance, then try again" +
        (this.meta.billingUrl ? " → " + this.meta.billingUrl : ".");
    }
    if (res.status === 403) msg = "Access denied (key invalid or endpoint not allowed) — " + msg;
    if (res.status === 429) msg = "Rate limit / quota reached — " + msg;
    throw new ProviderError(msg, res.status);
  }

  async testKey(): Promise<TestResult> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: this._authHeader() },
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      const ids = Array.isArray(j.data) ? j.data.map((m: { id: string }) => m.id) : [];
      return { ok: true, models: ids.length, ids };
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: this._authHeader() },
        signal: AbortSignal.timeout(20000),
      });
      await this._check(res);
      const j = await res.json();
      return (Array.isArray(j.data) ? j.data.map((m: { id: string }) => m.id) : []).sort();
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async generate({
    prompt,
    model,
    aspect,
    quality,
    n,
    background,
  }: GenerateParams): Promise<string[]> {
    try {
      const isDallE3 = String(model).startsWith("dall-e-3");
      const body: Record<string, unknown> = {
        model,
        prompt: String(prompt || ""),
        n: Math.min(4, Math.max(1, Number(n) || 1)),
      };
      if (isDallE3) {
        body.size = dallE3SizeFor(aspect);
        body.quality = quality === "high" ? "hd" : "standard";
        body.response_format = "b64_json";
      } else {
        body.size = openAiSizeFor(aspect);
        body.quality = quality || "medium";
        if (background && background !== "auto") body.background = background;
      }

      const res = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: { Authorization: this._authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      if (j && j.error && j.error.message) throw new ProviderError(j.error.message, 0);
      const out: string[] = [];
      for (const d of itemsFrom(j)) {
        const b = await itemToB64(d);
        if (b) out.push(b);
      }
      if (!out.length) {
        throw new ProviderError(
          `The provider returned no image data for "${model}". If this model does not generate images, pick an image model in Settings → Default model.`,
          0
        );
      }
      return out;
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async edit({
    images = [],
    maskPng,
    prompt,
    model,
    aspect,
    quality,
    n,
    background,
  }: EditParams): Promise<string[]> {
    try {
      const isDallE3 = String(model).startsWith("dall-e-3");
      const fd = new FormData();
      fd.append("model", model);
      fd.append("prompt", String(prompt || ""));
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const buf = Buffer.from(img.data, "base64");
        const isJpg = (img.mime || "").includes("jpeg");
        const field = images.length > 1 ? "image[]" : "image";
        fd.append(
          field,
          new Blob([new Uint8Array(buf)], { type: isJpg ? "image/jpeg" : "image/png" }),
          `image${i}${isJpg ? ".jpg" : ".png"}`
        );
      }
      if (isDallE3) {
        // dall-e-3 has no edits endpoint; the server rejects with a clear message
        fd.append("size", dallE3SizeFor(aspect));
        fd.append("response_format", "b64_json");
        fd.append("n", "1");
      } else {
        fd.append("size", openAiSizeFor(aspect));
        if (maskPng)
          fd.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
        if (quality) fd.append("quality", quality);
        if (background && background !== "auto") fd.append("background", background);
        fd.append("n", String(Math.min(4, Math.max(1, Number(n) || 1))));
      }

      const res = await fetch(`${this.baseUrl}/images/edits`, {
        method: "POST",
        headers: { Authorization: this._authHeader() },
        body: fd,
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = await res.json();
      if (j && j.error && j.error.message) throw new ProviderError(j.error.message, 0);
      const out: string[] = [];
      for (const d of itemsFrom(j)) {
        const b = await itemToB64(d);
        if (b) out.push(b);
      }
      if (!out.length) {
        throw new ProviderError(
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

export { openAiSizeFor, dallE3SizeFor, fetchAsB64, itemToB64 };
