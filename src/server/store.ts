import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { dataDir, ensureDataDir } from "./paths";
import { getSecret, upsertSecret } from "./secrets";
import {
  BUILTIN_IDS,
  PROVIDERS,
  customKeyEnv,
  customToMeta,
  type CustomProviderEntry,
} from "./providers/registry";
import type { ProviderMeta } from "./providers/types";

/**
 * Settings store — Hermes-style separation of config and secrets:
 *   data/settings.json  → non-secret settings only (never contains keys)
 *   data/secrets.env    → API keys, referenced from here via keyEnv names
 */

export const DEFAULT_SETTINGS = {
  provider: "aipass", // AI Pass is the recommended default (new accounts get $1 free credit)
  models: {
    openai: "gpt-image-1",
    aipass: "gpt-image-1",
    kie: "nano-banana-2-1",
    google: "gemini-nano-banana-2.1",
  },
  size: "1:1",
  quality: "medium",
  imageSize: "1K",
  theme: "studio", // dark SaaS default — see app/globals.css [data-theme]
};

interface StoreData {
  provider: string;
  customProviders: CustomProviderEntry[];
  settings: (typeof DEFAULT_SETTINGS) & { models: Record<string, string>; [k: string]: unknown };
}

function validCustom(c: unknown): c is CustomProviderEntry {
  const e = c as Partial<CustomProviderEntry>;
  return !!(
    e &&
    typeof e === "object" &&
    typeof e.id === "string" &&
    typeof e.label === "string" &&
    typeof e.baseUrl === "string" &&
    /^https?:\/\//i.test(e.baseUrl) &&
    Array.isArray(e.models)
  );
}

export class Store {
  file: string;
  data: StoreData;
  loaded = false;

  constructor() {
    this.file = path.join(dataDir(), "settings.json");
    this.data = {
      provider: DEFAULT_SETTINGS.provider,
      customProviders: [],
      settings: {
        ...DEFAULT_SETTINGS,
        models: { ...DEFAULT_SETTINGS.models },
      },
    };
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fsp.readFile(this.file, "utf8");
      const j = JSON.parse(raw) as {
        provider?: string;
        customProviders?: unknown[];
        settings?: Partial<StoreData["settings"]>;
      };
      if (Array.isArray(j.customProviders)) {
        this.data.customProviders = j.customProviders.filter(validCustom);
      }
      const knownIds = [...BUILTIN_IDS, ...this.data.customProviders.map((c) => c.id)];
      if (j.provider && knownIds.includes(j.provider)) this.data.provider = j.provider;
      const s = j.settings || {};
      this.data.settings = {
        ...DEFAULT_SETTINGS,
        ...s,
        models: { ...DEFAULT_SETTINGS.models, ...(s.models || {}) },
      } as StoreData["settings"];
    } catch {
      // first run — keep defaults
    }
    this.loaded = true;
  }

  async persist(): Promise<void> {
    await ensureDataDir();
    const j = {
      version: 4,
      provider: this.data.provider,
      customProviders: this.data.customProviders,
      settings: this.data.settings,
      // NOTE: API keys intentionally NOT here — they live in data/secrets.env (0600).
    };
    await fsp.writeFile(this.file, JSON.stringify(j, null, 2), "utf8");
  }

  /** Hermes-style env var name for a provider's key. */
  keyEnvFor(providerId: string): string {
    const custom = this.data.customProviders.find((c) => c.id === providerId);
    if (custom) return custom.keyEnv || customKeyEnv(custom.baseUrl);
    return PROVIDERS[providerId] ? PROVIDERS[providerId].keyEnv : "SUN_KEY_" + providerId.toUpperCase();
  }

  /** Fresh read from secrets.env on every lookup (new keys apply without restart). */
  getApiKey(providerId: string): string | null {
    const key = getSecret(this.keyEnvFor(providerId));
    return key ? key.trim() || null : null;
  }

  async setApiKey(providerId: string, key: string): Promise<void> {
    await this.load();
    const envName = this.keyEnvFor(providerId);
    await upsertSecret(envName, String(key || "").trim() || null);
  }

  // ---------- custom (BYO endpoint) providers ----------
  /** Create or update a custom OpenAI-compatible provider. */
  async saveCustomProvider(p: {
    id?: string;
    label: string;
    baseUrl: string;
    models?: string[];
  }): Promise<void> {
    await this.load();
    const label = String(p.label || "").trim();
    const baseUrl = String(p.baseUrl || "")
      .trim()
      .replace(/\/+$/, "");
    if (!label) throw new Error("Provider name is required.");
    if (!/^https?:\/\/.+/i.test(baseUrl)) throw new Error("Base URL must start with http:// or https://");
    const models = (Array.isArray(p.models) ? p.models : [])
      .map((m) => String(m || "").trim())
      .filter(Boolean)
      .slice(0, 200);

    let id = p.id ? String(p.id) : null;
    let entry = id ? this.data.customProviders.find((c) => c.id === id) : null;
    if (id && !entry) throw new Error("Custom provider not found.");
    if (!entry) {
      id = "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      entry = { id, label, baseUrl, keyEnv: customKeyEnv(baseUrl), models };
      this.data.customProviders.push(entry);
    } else {
      entry.label = label;
      entry.baseUrl = baseUrl;
      entry.keyEnv = customKeyEnv(baseUrl); // re-hash if the URL changed (Hermes pattern)
      entry.models = models;
    }
    if (!this.data.settings.models[id!]) {
      this.data.settings.models[id!] = models[0] || "gpt-image-1";
    }
    await this.persist();
  }

  async deleteCustomProvider(id: string): Promise<void> {
    await this.load();
    const before = this.data.customProviders.length;
    this.data.customProviders = this.data.customProviders.filter((c) => c.id !== id);
    if (this.data.customProviders.length === before) throw new Error("Custom provider not found.");
    if (this.data.provider === id) this.data.provider = "aipass";
    await this.persist();
  }

  async update(partial: Partial<StoreData["settings"]> & { provider?: string }): Promise<void> {
    await this.load();
    const p = partial || {};
    const knownIds = [...BUILTIN_IDS, ...this.data.customProviders.map((c) => c.id)];
    if (p.provider && knownIds.includes(p.provider)) this.data.provider = p.provider;
    const s = this.data.settings;
    if (p.models && typeof p.models === "object") s.models = { ...s.models, ...p.models };
    for (const k of ["size", "quality", "imageSize", "theme"] as const) {
      if (k in p) (s as Record<string, unknown>)[k] = p[k];
    }
    await this.persist();
  }

  providerMeta(providerId: string): ProviderMeta | null {
    if (PROVIDERS[providerId]) return PROVIDERS[providerId];
    const c = this.data.customProviders.find((x) => x.id === providerId);
    return c ? customToMeta(c) : null;
  }

  providerIds(): string[] {
    return [...BUILTIN_IDS, ...this.data.customProviders.map((c) => c.id)];
  }

  _providerInfo(id: string): { hasKey: boolean; hint: string; keyEnv: string } {
    const key = this.getApiKey(id);
    const envName = this.keyEnvFor(id);
    if (!key) return { hasKey: false, hint: "", keyEnv: envName };
    return { hasKey: true, hint: key.slice(0, 6) + "…" + key.slice(-4), keyEnv: envName };
  }

  /** Everything the UI needs — contains NO secret values, only presence + hint. */
  snapshot() {
    const providers: Record<string, ProviderMeta & { hasKey: boolean; hint: string }> = {};
    for (const id of this.providerIds()) {
      const meta = this.providerMeta(id);
      if (!meta) continue;
      const info = this._providerInfo(id);
      providers[id] = { ...meta, hasKey: info.hasKey, hint: info.hint };
    }
    return {
      provider: this.data.provider,
      settings: { ...this.data.settings },
      providers,
      customProviders: this.data.customProviders.map((c) => ({ ...c })),
      dataDir: dataDir(),
      secretsFile: "secrets.env",
    };
  }
}

export async function ensureStoreDir(): Promise<void> {
  await ensureDataDir();
  // best-effort: keep the settings file owner-only too
  try {
    await fsp.chmod(path.join(dataDir(), "settings.json"), 0o600);
  } catch {
    /* file may not exist yet */
  }
}

export function fileExists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
