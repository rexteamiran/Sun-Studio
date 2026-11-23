/** Shared provider-layer types (server-side only). */

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderMeta {
  id: string;
  label: string;
  type: string;
  baseUrl?: string;
  keyHint: string;
  keyDocs?: string;
  billingUrl?: string | null;
  aspects: string[];
  qualities: string[] | null;
  resolutions: string[] | null;
  background: boolean;
  dynamicModels: boolean;
  recommended?: boolean;
  promo?: { badge: string; title: string; url: string; urlLabel: string };
  models: ProviderModel[];
  defaultModel: string;
  custom?: boolean;
  keyEnv: string; // Hermes-style secret reference, e.g. SUN_KEY_KIE
}

export interface ImageInput {
  mime: string;
  data: string; // raw base64 (no data: prefix)
}

export interface GenerateParams {
  prompt: string;
  model: string;
  aspect?: string;
  quality?: string;
  imageSize?: string;
  n?: number;
  background?: string;
  onStage?: (s: string) => void;
}

export interface EditParams {
  images?: ImageInput[]; // OpenAI-compatible shape (originals + optional mask)
  maskPng?: Buffer | null; // binary PNG (opaque = keep) — OpenAI-compatible only
  imageBuffers?: ImageInput[]; // Gemini / kie.ai shape (pre-composited in browser)
  prompt: string;
  model: string;
  aspect?: string;
  quality?: string;
  imageSize?: string;
  n?: number;
  background?: string;
  onStage?: (s: string) => void;
}

export interface TestResult {
  ok: boolean;
  models: number | null;
  ids?: string[];
  credits?: number | null;
  message?: string;
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export function friendlyNetworkError(e: unknown): Error {
  const err = e as Error & { cause?: { code?: string } };
  if (err && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return new ProviderError(
      "The request timed out. High-quality images can take a while — check your internet connection and try again.",
      0
    );
  }
  const code = err?.cause?.code;
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ECONNRESET") {
    return new ProviderError("Could not reach the provider — check your internet connection.", 0);
  }
  return err instanceof Error ? err : new ProviderError(String(e), 0);
}

export interface ImageClient {
  testKey(): Promise<TestResult>;
  listModels?(): Promise<string[]>;
  generate(p: GenerateParams): Promise<string[]>;
  edit(p: EditParams): Promise<string[]>;
}
