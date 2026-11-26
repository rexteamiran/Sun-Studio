import { runSequentialImages } from "./batch";
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
    // No validated non-generating verification endpoint is available for this integration.
    return { ok: false, models: null,
      message: "Not tested: Stability connection verification is unavailable without a validated non-generating endpoint. No image request was sent." };
  }

  async _generate({ prompt, model, aspect, n, images, onImage }: {
    prompt: string; model: string; aspect?: string; n?: number;
    images?: ImageInput[]; onImage?: (base64: string) => Promise<void>;
  }): Promise<string[]> {
    const { path, modelField } = endpointFor(model);
    return runSequentialImages(n, async () => {
      const fd = new FormData();
      fd.append("prompt", String(prompt || ""));
      if (modelField) fd.append("model", modelField);
      const pick = ASPECTS.includes(aspect || "") ? aspect! : "1:1";
      if (images && images.length && modelField) {
        fd.append("mode", "image-to-image");
        fd.append("strength", "0.95");
        const img = images[0];
        fd.append("image", new Blob([new Uint8Array(Buffer.from(img.data, "base64"))],
          { type: img.mime || "image/png" }), "input.png");
      } else {
        fd.append("aspect_ratio", pick);
      }
      fd.append("output_format", "png");
      const res = await fetch(`${this.baseUrl}/v2beta/stable-image/generate/${path}`, {
        method: "POST", headers: { Authorization: this._authHeader(), Accept: "application/json" },
        body: fd, signal: AbortSignal.timeout(300000),
      });
      await this._check(res);
      const j = (await res.json()) as { image?: string; finish_reason?: string };
      if (!j.image) throw new ProviderError(`Stability returned no image data for "${model}".`, 0);
      if (j.finish_reason === "CONTENT_FILTERED") {
        throw new ProviderError("The output was filtered by Stability content moderation. Try rephrasing the prompt.", 0);
      }
      return [j.image];
    }, onImage);
  }

  async generate({ prompt, model, aspect, n, onImage }: GenerateParams): Promise<string[]> {
    try { return await this._generate({ prompt, model, aspect, n, images: [], onImage }); }
    catch (e) { throw friendlyNetworkError(e); }
  }

  async edit({ imageBuffers, maskPng, prompt, model, aspect, n, onImage }: EditParams): Promise<string[]> {
    try {
      if (!Array.isArray(imageBuffers) || !imageBuffers.length) throw new ProviderError("No image selected.", 400);
      if (maskPng) throw new ProviderError("This Stability integration does not support a separate edit mask.", 400);
      if (imageBuffers.length !== 1) throw new ProviderError("This Stability integration supports one reference image per edit.", 400);
      if (model === "core" || model === "ultra") {
        throw new ProviderError("Stability Core and Ultra do not support image-to-image in this integration. Select an SD3.5 model explicitly.", 400);
      }
      return await this._generate({ prompt, model, aspect, n, images: imageBuffers, onImage });
    } catch (e) { throw friendlyNetworkError(e); }
  }
}
