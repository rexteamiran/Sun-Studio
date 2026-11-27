"use client";

/** Browser-side API surface — secrets never cross this boundary. */

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderInfo {
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
  hasKey: boolean;
  hint: string;
  keyEnv: string;
}

export interface Boot {
  provider: string;
  enabledProviders: string[];
  catalog: { id: string; label: string; kind: string; baseUrl: string }[];
  settings: {
    provider: string;
    models: Record<string, string>;
    size: string;
    quality: string;
    imageSize: string;
    theme: string;
  };
  providers: Record<string, ProviderInfo>;
  customProviders: { id: string; label: string; baseUrl: string; keyEnv: string; models: string[] }[];
  extraModels: Record<string, string[]>;
  dataDir: string;
  version: string;
}

export interface GalleryEntry {
  id: string;
  url: string;
  createdAt: number;
  kind: string;
  provider: string;
  prompt: string;
  model: string;
  aspect?: string;
  quality?: string;
}

export interface ImageFailure {
  index: number;
  status: number;
  message: string;
  taskId?: string;
}
export interface ImageOperationResult {
  items: { id: string; url: string; meta?: Record<string, unknown> }[];
  partial?: boolean;
  failures?: ImageFailure[];
  taskIds?: string[];
}
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly taskIds: string[] = [],
    readonly failures: ImageFailure[] = [], readonly endpointSaved = false, readonly providerId?: string) {
    super(message);
    this.name = "ApiError";
  }
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}
function failures(value: unknown): ImageFailure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const f = record(item);
    return Number.isInteger(f.index) && typeof f.index === "number" && f.index >= 0 &&
      typeof f.status === "number" && typeof f.message === "string"
      ? [{ index: f.index, status: f.status, message: f.message,
          ...(typeof f.taskId === "string" ? { taskId: f.taskId } : {}) }] : [];
  });
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j: unknown = await res.json().catch(() => null);
  const value = record(j);
  if (!res.ok || typeof value.error === "string") throw new ApiError(typeof value.error === "string" ? value.error : "HTTP " + res.status,
    res.status, strings(value.taskIds), failures(value.failures), res.status === 409 && value.endpointSaved === true,
    typeof value.providerId === "string" ? value.providerId : undefined);
  if (j === null || typeof j !== "object" || Array.isArray(j)) throw new ApiError("The local server returned an invalid response.", res.status);
  return j as T;
}
async function imageOperation(url: string, body: unknown): Promise<ImageOperationResult> {
  const result = await postJson<unknown>(url, body);
  const value = record(result);
  if (!Array.isArray(value.items) || !value.items.every((item) => {
    const entry = record(item);
    return typeof entry.id === "string" && typeof entry.url === "string";
  }) || (value.partial !== undefined && typeof value.partial !== "boolean") ||
    (value.failures !== undefined && (!Array.isArray(value.failures) || failures(value.failures).length !== value.failures.length)) ||
    (value.taskIds !== undefined && (!Array.isArray(value.taskIds) || strings(value.taskIds).length !== value.taskIds.length))) {
    throw new ApiError("The local server returned an invalid image response.", 200, strings(value.taskIds));
  }
  if (!value.items.length && !value.partial && !failures(value.failures).length) {
    throw new ApiError("The local server returned no saved images.", 200, strings(value.taskIds));
  }
  return result as ImageOperationResult;
}
export function validOption(value: string, options: string[] | null, fallback: string): string {
  if (!options?.length) return value;
  return options.includes(value) ? value : options.includes(fallback) ? fallback : options[0];
}
function operationDetails(result: { failures?: ImageFailure[]; taskIds?: string[] }): string {
  const detail = result.failures?.map((f) => "Image " + (f.index + 1) + ": " + f.message + (f.taskId ? " (task " + f.taskId + ")" : "")).join(" ") || "";
  const ids = Array.from(new Set([...(result.taskIds || []), ...(result.failures || []).flatMap((f) => f.taskId ? [f.taskId] : [])]));
  return detail + (ids.length ? " Provider task IDs: " + ids.join(", ") + "." : "");
}
const RETRY_NOTICE = " No automatic retry was submitted. The remote outcome may be unknown; check provider task status and Gallery before retrying. Another request may incur charges.";
export function operationMessage(result: ImageOperationResult): string {
  const saved = "Saved to Gallery: " + result.items.length + " image(s).";
  return !result.partial && !result.failures?.length ? saved + operationDetails({ taskIds: result.taskIds }) : saved + " Partial result. " + operationDetails(result) + RETRY_NOTICE;
}
export function operationErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "The request failed.") +
    (error instanceof ApiError ? " " + operationDetails(error) : "") + RETRY_NOTICE;
}
export const api = {
  bootstrap: async (): Promise<Boot> => {
    const res = await fetch("/api/bootstrap");
    const j: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError("The local server is not responding.", res.status);
    const value = record(j);
    if (typeof value.provider !== "string" || !value.providers || Array.isArray(value.providers) ||
      typeof value.providers !== "object" || !value.settings || typeof value.settings !== "object" || !Array.isArray(value.catalog) || !Array.isArray(value.customProviders) || !value.extraModels) {
      throw new ApiError("The local server returned invalid startup data.", res.status);
    }
    return j as Boot;
  },
  updateSettings: (patch: Record<string, unknown>) => postJson<Boot>("/api/settings", patch),
  saveKey: async (provider: string, key: string) => {
    const result = await postJson<{ ok: boolean; provider: string; keyEnv: string; hasKey: boolean; hint: string }>("/api/keys", { provider, key });
    if (result.ok !== true || result.provider !== provider || typeof result.hasKey !== "boolean") {
      throw new ApiError("The key update could not be confirmed. Check Settings before saving again.", 200);
    }
    return result;
  },
  testProvider: (provider: string) => postJson<{ ok: boolean; message: string }>("/api/test", { provider }),
  addProvider: (id: string) => postJson<Boot>("/api/providers", { action: "add", id }),
  removeProvider: (id: string) => postJson<Boot>("/api/providers", { action: "remove", id }),
  addModels: (provider: string, models: string[]) => postJson<{ ok: boolean; models: string[]; snapshot: Boot }>("/api/models", { action: "add", provider, models }),
  removeModel: (provider: string, model: string) => postJson<{ ok: boolean; models: string[]; snapshot: Boot }>("/api/models", { action: "remove", provider, model }),
  fetchModels: (provider: string) => postJson<{ ok: boolean; ids: string[] }>("/api/models", { action: "fetch", provider }),
  custom: (action: "save" | "delete", payload: Record<string, unknown>) => postJson<Boot>("/api/custom-providers", { action, ...payload }),
  generate: (body: Record<string, unknown>) => imageOperation("/api/generate", body),
  edit: (body: Record<string, unknown>) => imageOperation("/api/edit", body),
  gallery: async (): Promise<GalleryEntry[]> => {
    const res = await fetch("/api/gallery");
    const j = record(await res.json().catch(() => null));
    if (!res.ok) throw new ApiError(typeof j.error === "string" ? j.error : "HTTP " + res.status, res.status);
    if (!Array.isArray(j.items) || j.items.some((item) => { const row = record(item); return typeof row.id !== "string" || typeof row.url !== "string" || typeof row.prompt !== "string" || typeof row.model !== "string"; })) throw new ApiError("The local server returned an invalid gallery response.", res.status);
    return j.items as GalleryEntry[];
  },
  galleryDelete: async (id: string): Promise<{ ok: true }> => {
    const res = await fetch("/api/gallery?id=" + encodeURIComponent(id), { method: "DELETE" });
    const j = record(await res.json().catch(() => null));
    if (!res.ok || j.ok !== true) throw new ApiError(typeof j.error === "string" ? j.error : "The image could not be deleted.", res.status);
    return { ok: true };
  },
};
