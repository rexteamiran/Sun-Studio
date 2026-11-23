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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
  return j as T;
}

export const api = {
  bootstrap: async (): Promise<Boot> => {
    const res = await fetch("/api/bootstrap");
    if (!res.ok) throw new Error("The local server is not responding.");
    return res.json();
  },
  updateSettings: (patch: Record<string, unknown>) => postJson<Boot>("/api/settings", patch),
  saveKey: (provider: string, key: string) =>
    postJson<{ ok: boolean; provider: string; keyEnv: string; hasKey: boolean; hint: string }>(
      "/api/keys",
      { provider, key }
    ),
  testProvider: (provider: string) =>
    postJson<{ ok: boolean; message: string }>("/api/test", { provider }),
  addProvider: (id: string) => postJson<Boot>("/api/providers", { action: "add", id }),
  removeProvider: (id: string) => postJson<Boot>("/api/providers", { action: "remove", id }),
  addModels: (provider: string, models: string[]) =>
    postJson<{ ok: boolean; models: string[]; snapshot: Boot }>("/api/models", { action: "add", provider, models }),
  removeModel: (provider: string, model: string) =>
    postJson<{ ok: boolean; models: string[]; snapshot: Boot }>("/api/models", { action: "remove", provider, model }),
  fetchModels: (provider: string) =>
    postJson<{ ok: boolean; ids: string[] }>("/api/models", { action: "fetch", provider }),
  custom: (action: "save" | "delete", payload: Record<string, unknown>) =>
    postJson<Boot>("/api/custom-providers", { action, ...payload }),
  generate: (body: Record<string, unknown>) =>
    postJson<{ items: { id: string; url: string; meta: Record<string, unknown> }[] }>(
      "/api/generate",
      body
    ),
  edit: (body: Record<string, unknown>) =>
    postJson<{ items: { id: string; url: string; meta: Record<string, unknown> }[] }>(
      "/api/edit",
      body
    ),
  gallery: async (): Promise<GalleryEntry[]> => {
    const res = await fetch("/api/gallery");
    const j = await res.json();
    return (j.items || []) as GalleryEntry[];
  },
  galleryDelete: (id: string) =>
    fetch(`/api/gallery?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => r.json()),
};
