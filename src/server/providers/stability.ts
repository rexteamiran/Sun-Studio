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
 * Stability AI Stable Image client (docs: docs.stability.ai).
 *
 *   POST /v2beta/stable-image/generate/{core|ultra|sd3}
 *   multipart/form-data · Authorization: Bearer · Accept: application/json
 *
 * Model ids the app uses: "core", "ultra", "sd3.5-large", "sd3.5-large-turbo",
 * "sd3.5-medium" (the sd3 endpoint takes the `model` form field; sd3.5-flash is
 * covered by sd3.5-large-turbo fallback in recipeFor).
 * img2img (sd3 only): mode=image-to-image + `image` file field + `strength`.
 */

const ASPECTS = ["21:9", "16:9", "3:2", "5:4", "1:1", "4:5", "2:3", "9:16", "9:21"];

function endpointFor(model: string): { path: string; modelField?: string } {
  if (model === "core") return { path: "core" };
  if (model === "ultra") return { path: "ultra" };
  // sd3.5 family — the endpoint accepts the model as a form field
  return { path: "sd3", modelField: model };
}

export class StabilityClient implements ImageClient {
  baseUrl: string;
  getApiKey: () => string | null;

  constructor({ baseUrl, getApiKey }: { baseUrl?: string; getApiKey: () => string | null }) {
    this.baseUrl = (baseUrl || "https://api.stability.ai").replace(/\/+$/, "");
    this.getApiKey = getApiKey;
  }

  _authHeader(): string {
    const key = this.getApiKey();
    if (!key) throw new ProviderError("No Stability API key configured. Add it in Settings first.", 0);
    return `Bearer ${key}`;
  }

  async _check(res: Response): Promise<void> {
    if (res.ok) return;
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.name) msg = String(j.name) + (Array.isArray(j.errors) && j.errors.length ? " — " + j.errors.join("; ") : "");
    } catch {
      /* keep default */
    }
    if (res.status === 401) msg = "Invalid or revoked Stability key. Check the key in Settings.";
    if (res.status === 402) msg = "Your Stability account is out of credits — top up at platform.stability.ai.";
    if (res.status === 403) msg = "Rejected by content moderation — " + msg;
    if (res.status === 429) msg = "Rate limit reached (150 requests / 10s) — wait a minute and retry.";
    throw new ProviderError(msg, res.status);
  }

  async testKey(): Promise<TestResult> {
    // no cheap authenticated GET on the image API — verify with a 1-credit-free
    // bad request: an invalid model returns 400 only with a valid key; without
    // a key it's 401. Keep it minimal and harmless.
    try {
      const fd = new FormData();
      fd.append("prompt", "ping");
      fd.append("output_format", "png");
      const res = await fetch(`${this.baseUrl}/v2beta/stable-image/generate/core`, {
        method: "POST",
        headers: { Authorization: this._authHeader(), Accept: "application/json" },
        body: fd,
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 401 || res.status === 403) {
        await this._check(res); // turns into the friendly invalid-key message
      }
      // any other status means the key itself is valid (it may still error on
      // moderation/quota, which testKey reports through its message)
      const ok = res.status !== 401 && res.status !== 403;
      let message = "Connected";
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { finish_reason?: string } | null;
        if (j && j.finish_reason === "CONTENT_FILTERED") message = "Key valid — but the test prompt was filtered";
      } else if (res.status === 402) {
        message = "Key valid — no credits left";
      } else if (res.status === 429) {
        message = "Key valid — rate limited right now";
      }
      return { ok, models: null, ids: [], credits: null, message } as TestResult;
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async _generate({
    prompt,
    model,
    aspect,
    n,
    images,
  }: {
    prompt: string;
    model: string;
    aspect?: string;
    n?: number;
    images?: ImageInput[];
  }): Promise<string[]> {
    const { path, modelField } = endpointFor(model);
    const count = Math.min(4, Math.max(1, Number(n) || 1));
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const fd = new FormData();
      fd.append("prompt", String(prompt || ""));
      if (modelField) fd.append("model", modelField);
      const pick = ASPECTS.includes(aspect || "") ? aspect! : "1:1";
      if (images && images.length && modelField) {
        // sd3 image-to-image: mode + image + strength (no aspect_ratio)
        fd.append("mode", "image-to-image");
        fd.append("strength", "0.95");
        const img = images[0];
        fd.append(
          "image",
          new Blob([new Uint8Array(Buffer.from(img.data, "base64"))], { type: img.mime || "image/png" }),
          "input.png"
        );
      } else {
        fd.append("aspect_ratio", pick);
      }
      fd.append("output_format", "png");

      const res = await fetch(`${this.baseUrl}/v2beta/stable-image/generate/${path}`, {
        method: "POST",
        headers: { Authorization: this._authHeader(), Accept: "application/json" },
        body: fd,
        signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = (await res.json()) as { image?: string; finish_reason?: string };
      if (!j.image) throw new ProviderError(`Stability returned no image data for "${model}".`, 0);
      if (j.finish_reason === "CONTENT_FILTERED") {
        throw new ProviderError("The output was filtered by Stability's content moderation. Try rephrasing the prompt.", 0);
      }
      out.push(j.image);
    }
    return out;
  }

  async generate({ prompt, model, aspect, n }: GenerateParams): Promise<string[]> {
    try {
      return await this._generate({ prompt, model, aspect, n, images: [] });
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  async edit({ imageBuffers, prompt, model, aspect, n }: EditParams): Promise<string[]> {
    try {
      if (!Array.isArray(imageBuffers) || !imageBuffers.length) {
        throw new ProviderError("No image selected.", 0);
      }
      // core/ultra have no img2img: route edits through the sd3.5 family
      const editModel = model === "core" || model === "ultra" ? "sd3.5-medium" : model;
      return await this._generate({ prompt, model: editModel, aspect, n, images: imageBuffers });
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }
}
