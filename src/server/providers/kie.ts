import { ImageBatchError, imageFailure, type ImageFailure } from "./batch";
import {
  ProviderError,
  friendlyNetworkError,
  type ImageClient,
  type EditParams,
  type GenerateParams,
  type ImageInput,
  type ProviderMeta,
  type TestResult,
} from "./types";

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
 *   - Local files must be uploaded first via the File Upload API (URLs expire in
 *     24h) and passed as URLs. That service lives on its OWN base URL —
 *     https://kieai.redpandaai.co (docs.kie.ai/file-upload-api/quickstart);
 *     api.kie.ai does not host /api/file-base64-upload (404, reproduced).
 *   - Every job model expects `input.aspect_ratio` (the createTask validation
 *     rejects the request with "aspect_ratio is required" when it is missing —
 *     seen in the field with legacy nano-banana and custom model ids). Only
 *     grok-imagine/image-to-image takes none (sizes come from @image refs).
 *   - grok-imagine/image-to-image requires @image(n) references inside the prompt.
 *   - Model quality knobs differ: nano-banana* takes `resolution` (1K/2K/4K), seedream
 *     takes `quality` (basic/high), gpt-image takes `quality` (medium/high), grok none.
 */

const KIE_BASE = "https://api.kie.ai";
/** The File Upload API is a separate kie.ai service with its own base URL. */
const KIE_UPLOAD_BASE = "https://kieai.redpandaai.co";

/** Body-code -> friendly message (HTTP is always 200, so codes are read from the body). */
function friendlyBodyError(code: number, msg?: string): string {
  const detail = msg ? " — " + msg : "";
  switch (code) {
    case 401:
      return "Invalid or revoked kie.ai API key. Check the key in Settings.";
    case 402:
      return "Your kie.ai account has no credit left. Top up the balance on kie.ai, then try again.";
    case 404:
      return "Task not found on kie.ai" + detail;
    case 408:
      return "kie.ai returned no result for over 10 minutes — try again.";
    case 422:
      return "kie.ai rejected the request" + (detail || " — check the model and parameters.");
    case 429:
      return "Rate limit reached (kie.ai allows 20 new tasks per 10 seconds) — wait a moment and retry.";
    case 455:
      return "kie.ai is under maintenance — try again later.";
    case 501:
      return "The generation failed on kie.ai" + detail;
    case 505:
      return "This feature is currently disabled on kie.ai.";
    case 500:
      return "kie.ai server error — try again.";
    default:
      return "kie.ai error " + code + detail;
  }
}

/** Canonical aspect -> closest aspect each model accepts (documented enums). */
const ASPECT_FALLBACK: Record<string, string> = {
  "16:9": "3:2",
  "9:16": "2:3",
  "4:3": "3:2",
  "3:4": "2:3",
};

interface Recipe {
  kind: "nano" | "seedream" | "gptimage" | "grok";
  i2i: boolean;
  imageField?: "image_input" | "image_urls" | "input_urls";
  aspects?: string[] | null;
  resolution?: boolean;
  quality?: Record<string, string>;
  promptRef?: boolean;
}

/**
 * Per-model recipe, transcribed from the docs.kie.ai pages of each endpoint.
 */
const MODEL_RECIPES: Record<string, Recipe> = {
  "nano-banana-2-1": {
    kind: "nano",
    i2i: true,
    imageField: "image_input",
    resolution: true,
    aspects: ["1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5", "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"],
  },
  "nano-banana-pro": {
    kind: "nano",
    i2i: true,
    imageField: "image_input",
    resolution: true,
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
  },
  "nano-banana": {
    kind: "nano",
    i2i: false,
    // official nano-banana aspect enum (kie.ai model page); "auto" excluded —
    // the app always picks an explicit ratio
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
  },
  "seedream/5-pro-text-to-image": {
    kind: "seedream",
    i2i: false,
    aspects: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"],
    quality: { "1K": "basic", "2K": "high", "4K": "high" },
  },
  "seedream/5-pro-image-to-image": {
    kind: "seedream",
    i2i: true,
    imageField: "image_urls",
    aspects: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"],
    quality: { "1K": "basic", "2K": "high", "4K": "high" },
  },
  "gpt-image/1.5-text-to-image": {
    kind: "gptimage",
    i2i: false,
    aspects: ["1:1", "2:3", "3:2"],
    quality: { "1K": "medium", "2K": "high", "4K": "high" },
  },
  "gpt-image/1.5-image-to-image": {
    kind: "gptimage",
    i2i: true,
    imageField: "input_urls",
    aspects: ["1:1", "2:3", "3:2"],
    quality: { "1K": "medium", "2K": "high", "4K": "high" },
  },
  "grok-imagine/text-to-image": { kind: "grok", i2i: false, aspects: ["1:1", "2:3", "3:2", "16:9", "9:16"] },
  "grok-imagine/image-to-image": {
    kind: "grok",
    i2i: true,
    imageField: "image_urls",
    aspects: null,
    promptRef: true,
  },
};

function recipeFor(model: string): Recipe {
  return (
    MODEL_RECIPES[String(model)] || {
      // custom model ids: safest generic shape — jobs-style input with the
      // common aspect enum (aspect_ratio is required by createTask validation)
      kind: "nano",
      i2i: false,
      aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    }
  );
}

async function fetchJson(url: string, options: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try {
      const t = await res.text();
      if (t && t.length <= 300) msg = t.trim();
      // Spring-style error JSON ({"status":404,...}) — make it human-readable
      const parsed = JSON.parse(msg) as { status?: number; error?: string; path?: string };
      if (parsed && parsed.status && parsed.error) {
        msg =
          "HTTP " + parsed.status + " — " + parsed.error +
          (parsed.path ? " (no such endpoint: " + parsed.path + ")" : "");
      }
    } catch {
      /* keep the raw text */
    }
    throw new ProviderError(msg, res.status);
  }
  return res.json();
}

async function fetchAsB64(url: string): Promise<string> {
  const res = await fetch(String(url), { signal: AbortSignal.timeout(120000) });
  if (!res.ok)
    throw new ProviderError("Could not download the generated image (HTTP " + res.status + ").", 0);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new ProviderError("kie.ai returned an empty image URL.", 0);
  return buf.toString("base64");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function extFor(mime?: string): string {
  const sub = String(mime || "image/png").split("/")[1] || "png";
  const ext = sub.split("+")[0].replace(/[^a-z0-9]/gi, "");
  return ext.length && ext.length <= 5 ? ext : "png";
}

export class KieClient implements ImageClient {
  meta: ProviderMeta;
  baseUrl: string;
  getApiKey: () => string | null;

  constructor({ providerMeta, getApiKey }: { providerMeta: ProviderMeta; getApiKey: () => string | null }) {
    this.meta = providerMeta;
    this.baseUrl = (providerMeta.baseUrl || KIE_BASE).replace(/\/+$/, "");
    this.getApiKey = getApiKey;
  }

  _authHeader(): Record<string, string> {
    const key = this.getApiKey();
    if (!key) {
      throw new ProviderError("No kie.ai API key configured. Add it in Settings first.", 0);
    }
    return { Authorization: "Bearer " + key, "Content-Type": "application/json" };
  }

  /** kie.ai returns HTTP 200 even for failures — always validate the body code. */
  _checkBody(j: Record<string, unknown>): void {
    if (j && typeof j === "object" && j.code === 200) return;
    const code = Number((j && j.code) || 0);
    throw new ProviderError(friendlyBodyError(code, j && (j.msg as string)), code);
  }

  async testKey(): Promise<TestResult> {
    try {
      const j = await fetchJson(this.baseUrl + "/api/v1/chat/credit", { headers: this._authHeader() });
      this._checkBody(j);
      return { ok: true, models: null, ids: [], credits: j.data as number };
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  /** Upload one local image (raw base64) and return a public URL the jobs API accepts. */
  async uploadImage(img: ImageInput): Promise<string> {
    const j = await fetchJson(this._uploadBase() + "/api/file-base64-upload", {
      method: "POST",
      headers: this._authHeader(),
      body: JSON.stringify({
        base64Data: "data:" + (img.mime || "image/png") + ";base64," + img.data,
        uploadPath: "sun-studio/inputs",
        fileName:
          "sunstudio-" +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 6) +
          "." + extFor(img.mime),
      }),
    });
    this._checkBody(j);
    const data = j.data as { downloadUrl?: string } | undefined;
    const url = data && data.downloadUrl;
    if (!url) throw new ProviderError("kie.ai did not return an upload URL.", 0);
    return url;
  }

  /** The File Upload API lives on its own base — api.kie.ai returns 404 there.
   * A custom baseUrl (self-hosted proxy) keeps being used for uploads too. */
  _uploadBase(): string {
    return this.baseUrl === KIE_BASE || this.baseUrl.startsWith("https://api.kie.ai")
      ? KIE_UPLOAD_BASE
      : this.baseUrl;
  }

  async createTask(model: string, input: Record<string, unknown>): Promise<string> {
    const j = await fetchJson(this.baseUrl + "/api/v1/jobs/createTask", {
      method: "POST",
      headers: this._authHeader(),
      body: JSON.stringify({ model, input }),
    });
    this._checkBody(j);
    const data = j.data as { taskId?: string } | undefined;
    const id = data && data.taskId;
    if (!id) throw new ProviderError("kie.ai did not return a task id.", 0);
    return id;
  }

  async pollTask(
    taskId: string,
    { timeoutMs = 480000, intervalMs = 3000, onStage }: { timeoutMs?: number; intervalMs?: number; onStage?: (s: string) => void } = {}
  ): Promise<string[]> {
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > timeoutMs) {
        throw new ProviderError(
          "The kie.ai task did not finish in 8 minutes. Check kie.ai/logs for its status.",
          0
        );
      }
      const j = await fetchJson(
        this.baseUrl + "/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(taskId),
        { headers: this._authHeader() }
      );
      this._checkBody(j);
      const d = (j.data || {}) as {
        state?: string;
        resultJson?: string;
        failMsg?: string;
        failCode?: string;
        progress?: number;
      };
      if (d.state === "success") {
        let urls: string[] = [];
        try {
          const rj =
            typeof d.resultJson === "string"
              ? (JSON.parse(d.resultJson) as { resultUrls?: string[] })
              : (d.resultJson as unknown as { resultUrls?: string[] });
          urls = ((rj && Array.isArray(rj.resultUrls) ? rj.resultUrls : []) as string[]).filter(Boolean);
        } catch {
          /* fall through to the empty check */
        }
        if (!urls.length)
          throw new ProviderError("kie.ai finished the task but returned no image URL.", 0);
        return urls;
      }
      if (d.state === "fail") {
        const msg = d.failMsg || d.failCode || "unknown failure";
        throw new ProviderError(friendlyBodyError(501, msg), 501);
      }
      if (onStage && d.progress) onStage("Generating on kie.ai… " + d.progress + "%");
      await sleep(intervalMs);
    }
  }

  /** Build the per-family `input` object (field names verified against each docs page). */
  buildInput(
    model: string,
    { prompt, aspect, imageSize, imageUrls }: { prompt: string; aspect?: string; imageSize?: string; imageUrls?: string[] | null }
  ): Record<string, unknown> {
    const r = recipeFor(model);
    const input: Record<string, unknown> = { prompt: String(prompt || "") };

    if (r.i2i && r.imageField) {
      input[r.imageField] = (imageUrls || []).slice(0, r.imageField === "image_input" ? 10 : 5);
      if (r.promptRef && !/@image\(\d+\)/.test(String(input.prompt)) && imageUrls && imageUrls.length) {
        input.prompt = String(input.prompt) + " @image(1)";
      }
    }
    // createTask validation requires aspect_ratio on every job model except
    // grok image-to-image (aspects: null — output size follows the @image refs)
    if (r.aspects !== null) {
      const pick = r.aspects && r.aspects.includes(aspect || "") ? aspect : ASPECT_FALLBACK[aspect || ""] || "1:1";
      input.aspect_ratio = pick;
    }
    if (r.resolution && imageSize) input.resolution = imageSize;
    if (r.quality && imageSize) input.quality = r.quality[imageSize] || r.quality["1K"];
    if (r.kind === "nano") input.output_format = "png";
    if (r.kind === "seedream") input.output_format = "png";
    return input;
  }

  async _runTasks({ model, prompt, aspect, imageSize, imageUrls, n, onStage, onImage, onTask }: {
    model: string; prompt: string; aspect?: string; imageSize?: string; imageUrls?: string[] | null;
    n?: number; onStage?: (s: string) => void;
    onImage?: (base64: string) => Promise<void>; onTask?: (taskId: string) => void;
  }): Promise<string[]> {
    const nTasks = Math.min(4, Math.max(1, Math.floor(Number(n) || 1)));
    onStage?.("Submitting " + (nTasks > 1 ? nTasks + " tasks" : "task") + " to kie.ai...");
    const ids: string[] = [];
    const failures: ImageFailure[] = [];
    for (let index = 0; index < nTasks; index++) {
      try {
        const id = await this.createTask(model, this.buildInput(model, { prompt, aspect, imageSize, imageUrls }));
        ids.push(id);
        onTask?.(id);
      } catch (error) { failures.push(imageFailure(error, index)); break; }
    }
    onStage?.("Waiting for submitted kie.ai tasks...");
    const b64s: string[] = [];
    await Promise.all(ids.map(async (id, index) => {
      let urls: string[];
      try { urls = await this.pollTask(id, { onStage }); }
      catch (error) { failures.push(imageFailure(error, index, id)); return; }
      for (const url of urls) {
        try {
          const base64 = await fetchAsB64(url);
          b64s.push(base64);
          await onImage?.(base64);
        } catch (error) { failures.push(imageFailure(error, index, id)); }
      }
    }));
    if (failures.length) throw new ImageBatchError(b64s, failures, ids);
    if (!b64s.length) throw new ProviderError(`kie.ai returned no image data for "${model}".`, 0);
    return b64s;
  }

  async generate({ prompt, model, aspect, imageSize, n, onStage, onImage, onTask }: GenerateParams): Promise<string[]> {
    try { return await this._runTasks({ model, prompt, aspect, imageSize, imageUrls: null, n, onStage, onImage, onTask }); }
    catch (e) { throw friendlyNetworkError(e); }
  }

  async edit({
    imageBuffers,
    maskPng,
    prompt,
    model,
    aspect,
    imageSize,
    n,
    onStage,
    onImage,
    onTask,
  }: EditParams): Promise<string[]> {
    try {
      if (maskPng) throw new ProviderError("This kie.ai integration requires a browser-composited reference instead of a separate edit mask.", 400);
      if (!Array.isArray(imageBuffers) || !imageBuffers.length) {
        throw new ProviderError("No image selected.", 0);
      }
      if (onStage) onStage("Uploading your image to kie.ai…");
      const urls: string[] = [];
      for (const img of imageBuffers) urls.push(await this.uploadImage(img));
      return await this._runTasks({ model, prompt, aspect, imageSize, imageUrls: urls, n, onStage, onImage, onTask });
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }
}

export { MODEL_RECIPES };
