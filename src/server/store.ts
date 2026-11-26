import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { dataDir, ensureDataDir } from "./paths";
import { getSecret, upsertSecret } from "./secrets";
import {
  PROVIDERS,
  PROVIDER_CATALOG,
  catalogToMeta,
  customKeyEnv,
  customToMeta,
  type CustomProviderEntry,
} from "./providers/registry";
import type { ProviderMeta } from "./providers/types";

/**
 * Settings store — Hermes-style separation of config and secrets:
 *   data/settings.json  → non-secret settings only (never contains keys)
 *   data/secrets.env    → current plaintext keys; encrypted vault integration is pending
 *
 * v0.0.11: providers are user-managed. `enabledProviders` lists the ids the
 * user added from the catalog (or custom endpoints); the registry simply
 * describes them. `extraModels[id]` holds user-added model ids per provider on
 * top of the built-in list, so new models can be used on every provider.
 */

export const DEFAULT_SETTINGS = {
  provider: "aipass", // AI Pass is the recommended default (new accounts get $1 free credit)
  models: {
    openai: "gpt-image-1",
    aipass: "gpt-image-1",
    kie: "nano-banana-2-1",
    google: "gemini-nano-banana-2.1",
    openrouter: "google/gemini-2.5-flash-image",
    stability: "core",
  } as Record<string, string>,
  size: "1:1",
  quality: "medium",
  imageSize: "1K",
  theme: "studio", // dark SaaS default — see app/globals.css [data-theme]
};

/** v0.0.10 and earlier: these four were always-on built-ins. */
const LEGACY_ACTIVE = ["openai", "aipass", "kie", "google"];

interface StoreData {
  provider: string;
  enabledProviders: string[];
  customProviders: CustomProviderEntry[];
  extraModels: Record<string, string[]>;
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

function cleanId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const s = id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return s.length >= 2 && s.length <= 40 ? s : null;
}

export class Store {
  file: string;
  data: StoreData;
  loaded = false;

  constructor() {
    this.file = path.join(dataDir(), "settings.json");
    this.data = {
      provider: DEFAULT_SETTINGS.provider,
      enabledProviders: [],
      customProviders: [],
      extraModels: {},
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
        enabledProviders?: unknown;
        customProviders?: unknown[];
        extraModels?: Record<string, unknown>;
        settings?: Partial<StoreData["settings"]>;
      };
      if (Array.isArray(j.customProviders)) {
        this.data.customProviders = j.customProviders.filter(validCustom);
      }
      // enabled providers (v0.0.11+); absent in older files → migrate: whatever
      // was the active provider + the legacy built-ins that already have a key.
      if (Array.isArray(j.enabledProviders)) {
        this.data.enabledProviders = (j.enabledProviders as unknown[])
          .map(cleanId)
          .filter((id): id is string => !!id && this.isKnown(id));
      } else {
        const hadKey = LEGACY_ACTIVE.filter((id) => !!getSecret("SUN_KEY_" + id.toUpperCase()));
        this.data.enabledProviders = Array.from(
          new Set([typeof j.provider === "string" ? j.provider : DEFAULT_SETTINGS.provider, ...hadKey])
        ).filter((id) => this.isKnown(id));
      }
      if (j.extraModels && typeof j.extraModels === "object") {
        const em: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(j.extraModels)) {
          if (Array.isArray(v)) em[k] = v.map((m) => String(m || "").trim()).filter(Boolean).slice(0, 100);
        }
        this.data.extraModels = em;
      }
      const knownIds = this.providerIds();
      if (j.provider && knownIds.includes(j.provider)) this.data.provider = j.provider;
      else if (!knownIds.includes(this.data.provider)) this.data.provider = this.data.enabledProviders[0] || "aipass";
      const s = j.settings || {};
      this.data.settings = {
        ...DEFAULT_SETTINGS,
        ...s,
        models: { ...DEFAULT_SETTINGS.models, ...(s.models || {}) },
      } as StoreData["settings"];
    } catch {
      // first run — recommended default so the app is never empty
      this.data.enabledProviders = [DEFAULT_SETTINGS.provider];
    }
    // Repair stale/duplicate references in memory without rewriting user data on load.
    this.data.enabledProviders = Array.from(new Set(this.data.enabledProviders))
      .filter((id) => this.isKnown(id));
    if (!this.data.enabledProviders.length) {
      this.data.enabledProviders = [DEFAULT_SETTINGS.provider];
    }
    if (!this.data.enabledProviders.includes(this.data.provider)) {
      this.data.provider = this.data.enabledProviders[0];
    }
    this.loaded = true;
  }

  async persist(): Promise<void> {
    await ensureDataDir();
    const j = {
      version: 5,
      provider: this.data.provider,
      enabledProviders: this.data.enabledProviders,
      customProviders: this.data.customProviders,
      extraModels: this.data.extraModels,
      settings: this.data.settings,
      // NOTE: API keys intentionally NOT here — they live in data/secrets.env (0600).
    };
    await fsp.writeFile(this.file, JSON.stringify(j, null, 2), "utf8");
  }

  /** Known = registry built-in, catalog entry or saved custom endpoint. */
  isKnown(id: string): boolean {
    return (
      !!PROVIDERS[id] ||
      !!PROVIDER_CATALOG.find((c) => c.id === id) ||
      !!this.data.customProviders.find((c) => c.id === id)
    );
  }

  /** Hermes-style env var name for a provider's key. */
  keyEnvFor(providerId: string): string {
    const custom = this.data.customProviders.find((c) => c.id === providerId);
    if (custom) return custom.keyEnv || customKeyEnv(custom.baseUrl);
    if (PROVIDERS[providerId]) return PROVIDERS[providerId].keyEnv;
    const cat = PROVIDER_CATALOG.find((c) => c.id === providerId);
    if (cat) return "SUN_KEY_" + cat.id.toUpperCase();
    return "SUN_KEY_" + providerId.toUpperCase();
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

  // ---------- provider management (v0.0.11) ----------

  /** Add a catalog provider to API CONNECTION. Idempotent. */
  async addProvider(id: string): Promise<void> {
    await this.load();
    const clean = cleanId(id);
    if (!clean || !this.isKnown(clean)) throw new Error("Unknown provider.");
    if (this.data.enabledProviders.includes(clean)) return;
    this.data.enabledProviders.push(clean);
    // sensible default model if none recorded yet
    const meta = this.providerMeta(clean);
    if (meta && !this.data.settings.models[clean]) {
      this.data.settings.models[clean] = meta.defaultModel;
    }
    await this.persist();
  }

  /** Remove a provider from API CONNECTION (its saved key stays in secrets.env). */
  async removeProvider(id: string): Promise<void> {
    await this.load();
    const clean = cleanId(id);
    if (!clean) throw new Error("Unknown provider.");
    if (!this.data.enabledProviders.includes(clean)) throw new Error("Provider is not added.");
    if (this.data.enabledProviders.length <= 1) {
      throw new Error("Keep at least one provider — add another before removing this one.");
    }
    this.data.enabledProviders = this.data.enabledProviders.filter((x) => x !== clean);
    if (this.data.provider === clean) {
      this.data.provider = this.data.enabledProviders[0];
    }
    await this.persist();
  }

  /** User-added model ids for one provider (any provider, built-in included). */
  extraModelsFor(providerId: string): string[] {
    return this.data.extraModels[providerId] || [];
  }

  /** Add one or more model ids to a provider's list. Returns the new list. */
  async addModels(providerId: string, models: string[]): Promise<string[]> {
    await this.load();
    const clean = cleanId(providerId);
    if (!clean || !this.isKnown(clean)) throw new Error("Unknown provider.");
    const incoming = (Array.isArray(models) ? models : [])
      .map((m) => String(m || "").trim())
      .filter(Boolean)
      .slice(0, 100);
    if (!incoming.length) throw new Error("Type at least one model id.");
    const existing = this.data.extraModels[clean] || [];
    const merged = Array.from(new Set([...existing, ...incoming])).slice(0, 100);
    this.data.extraModels[clean] = merged;
    await this.persist();
    return merged;
  }

  /** Remove a user-added model id from a provider. */
  async removeModel(providerId: string, model: string): Promise<string[]> {
    await this.load();
    const clean = cleanId(providerId);
    const m = String(model || "").trim();
    if (!clean || !m) throw new Error("Unknown model.");
    const existing = this.data.extraModels[clean] || [];
    this.data.extraModels[clean] = existing.filter((x) => x !== m);
    await this.persist();
    return this.data.extraModels[clean];
  }

  // ---------- custom (BYO endpoint) providers ----------

  /** Create or update a custom OpenAI-compatible provider. */
  async saveCustomProvider(p: {
    id?: string;
    label: string;
    baseUrl: string;
    models?: string[];
  }): Promise<string> {
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
    if (!this.data.enabledProviders.includes(id!)) this.data.enabledProviders.push(id!);
    if (!this.data.settings.models[id!]) {
      this.data.settings.models[id!] = models[0] || "gpt-image-1";
    }
    await this.persist();
    return entry.id;
  }

  async deleteCustomProvider(id: string): Promise<void> {
    await this.load();
    if (!this.data.customProviders.some((c) => c.id === id)) {
      throw new Error("Custom provider not found.");
    }
    const customProviders = this.data.customProviders.filter((c) => c.id !== id);
    const enabledProviders = this.data.enabledProviders.filter((x) => x !== id);
    if (!enabledProviders.length) enabledProviders.push(DEFAULT_SETTINGS.provider);
    const provider = enabledProviders.includes(this.data.provider)
      ? this.data.provider
      : enabledProviders[0];
    const previous = this.data;
    this.data = { ...previous, customProviders, enabledProviders, provider };
    try {
      await this.persist();
    } catch (error) {
      this.data = previous;
      throw error;
    }
  }

  async update(partial: Partial<StoreData["settings"]> & { provider?: string }): Promise<void> {
    await this.load();
    const p = partial || {};
    const knownIds = this.providerIds();
    if (p.provider && knownIds.includes(p.provider)) this.data.provider = p.provider;
    const s = this.data.settings;
    if (p.models && typeof p.models === "object") s.models = { ...s.models, ...p.models };
    for (const k of ["size", "quality", "imageSize", "theme"] as const) {
      if (k in p) (s as Record<string, unknown>)[k] = p[k];
    }
    await this.persist();
  }

  providerMeta(providerId: string): ProviderMeta | null {
    if (PROVIDERS[providerId]) {
      const meta = PROVIDERS[providerId];
      const extra = this.extraModelsFor(providerId);
      if (!extra.length) return meta;
      // merge user-added models on top of the built-in list
      const ids = new Set(meta.models.map((m) => m.id));
      const models = [...meta.models, ...extra.filter((id) => !ids.has(id)).map((id) => ({ id, label: id + " · added" }))];
      return { ...meta, models };
    }
    const c = this.data.customProviders.find((x) => x.id === providerId);
    if (c) {
      const meta = customToMeta(c);
      return meta;
    }
    const cat = PROVIDER_CATALOG.find((x) => x.id === providerId);
    if (cat) {
      const meta = catalogToMeta(cat);
      const extra = this.extraModelsFor(providerId);
      if (!extra.length) return meta;
      const ids = new Set(meta.models.map((m) => m.id));
      const models = [...meta.models, ...extra.filter((id) => !ids.has(id)).map((id) => ({ id, label: id + " · added" }))];
      return { ...meta, models };
    }
    return null;
  }

  providerIds(): string[] {
    return [...this.data.enabledProviders];
  }

  _providerInfo(id: string): { hasKey: boolean; hint: string; keyEnv: string } {
    const key = this.getApiKey(id);
    const envName = this.keyEnvFor(id);
    if (!key) return { hasKey: false, hint: "", keyEnv: envName };
    const hint = key.length > 10 ? key.slice(0, 6) + "…" + key.slice(-4) : "Saved";
    return { hasKey: true, hint, keyEnv: envName };
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
      enabledProviders: [...this.data.enabledProviders],
      catalog: PROVIDER_CATALOG.map((c) => ({ id: c.id, label: c.label, kind: c.kind, baseUrl: c.baseUrl })),
      settings: { ...this.data.settings },
      providers,
      customProviders: this.data.customProviders.map((c) => ({ ...c })),
      extraModels: JSON.parse(JSON.stringify(this.data.extraModels)) as Record<string, string[]>,
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
