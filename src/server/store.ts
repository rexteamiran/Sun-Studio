import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
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

export class CustomProviderKeySaveError extends Error {
  constructor(readonly providerId: string) {
    super("The endpoint was saved, but its API key could not be saved. Save the key again in Settings; no connection was tested.");
    this.name = "CustomProviderKeySaveError";
  }
}

export class Store {
  file: string;
  data: StoreData;
  loaded = false;
  private loading: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();

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
    if (!this.loading) this.loading = this.loadFromDisk().finally(() => { this.loading = undefined; });
    await this.loading;
  }

  private async loadFromDisk(): Promise<void> {
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code !== "ENOENT") {
        throw new Error("Settings could not be loaded. The existing file was not changed.");
      }
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

  /** One queue per Store instance; callbacks must not re-enter queued methods. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.writes.then(work);
    this.writes = result.then(() => undefined, () => undefined);
    return result;
  }
  private async writeSettings(data: StoreData): Promise<void> {
    const body = JSON.stringify({ version: 5, provider: data.provider,
      enabledProviders: data.enabledProviders, customProviders: data.customProviders,
      extraModels: data.extraModels, settings: data.settings }, null, 2);
    await ensureDataDir();
    const temporary = this.file + "." + randomUUID() + ".tmp";
    let created = false;
    try {
      const handle = await fsp.open(temporary, "wx", 0o600);
      created = true;
      try { await handle.writeFile(body, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      // Never unlink the destination as a replacement fallback.
      await fsp.rename(temporary, this.file);
    } finally {
      if (created) await fsp.unlink(temporary).catch(() => undefined);
    }
  }
  private transaction<T>(change: (draft: StoreData) => T, afterCommit?: (result: T) => Promise<void>): Promise<T> {
    return this.enqueue(async () => {
      await this.load();
      const draft = structuredClone(this.data);
      const result = change(draft);
      if (JSON.stringify(draft) !== JSON.stringify(this.data)) {
        await this.writeSettings(draft);
        this.data = draft;
      }
      if (afterCommit) await afterCommit(result);
      return result;
    });
  }
  async persist(): Promise<void> {
    await this.enqueue(async () => { await this.load(); await this.writeSettings(structuredClone(this.data)); });
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
    const id = String(providerId);
    const value = String(key || "").trim() || null;
    await this.enqueue(async () => {
      await this.load();
      if (!this.isKnown(id)) throw new Error("Unknown provider.");
      const envName = this.keyEnvFor(id);
      await upsertSecret(envName, value);
    });
  }
  async addProvider(id: string): Promise<void> {
    await this.transaction((draft) => {
      const clean = cleanId(id);
      if (!clean || !this.isKnown(clean)) throw new Error("Unknown provider.");
      if (draft.enabledProviders.includes(clean)) return;
      draft.enabledProviders.push(clean);
      const meta = this.providerMeta(clean);
      if (meta && !draft.settings.models[clean]) draft.settings.models[clean] = meta.defaultModel;
    });
  }
  async removeProvider(id: string): Promise<void> {
    await this.transaction((draft) => {
      const clean = cleanId(id);
      if (!clean) throw new Error("Unknown provider.");
      if (!draft.enabledProviders.includes(clean)) throw new Error("Provider is not added.");
      if (draft.enabledProviders.length <= 1) throw new Error("Keep at least one provider - add another before removing this one.");
      draft.enabledProviders = draft.enabledProviders.filter((value) => value !== clean);
      if (draft.provider === clean) draft.provider = draft.enabledProviders[0];
    });
  }
  extraModelsFor(providerId: string): string[] { return this.data.extraModels[providerId] || []; }
  async addModels(providerId: string, models: string[]): Promise<string[]> {
    const incoming = (Array.isArray(models) ? models : []).map((model) => String(model || "").trim()).filter(Boolean).slice(0, 100);
    return this.transaction((draft) => {
      const clean = cleanId(providerId);
      if (!clean || !this.isKnown(clean)) throw new Error("Unknown provider.");
      if (!incoming.length) throw new Error("Type at least one model id.");
      const merged = Array.from(new Set([...(draft.extraModels[clean] || []), ...incoming])).slice(0, 100);
      draft.extraModels[clean] = merged;
      return [...merged];
    });
  }
  async removeModel(providerId: string, model: string): Promise<string[]> {
    return this.transaction((draft) => {
      const clean = cleanId(providerId);
      const value = String(model || "").trim();
      if (!clean || !value) throw new Error("Unknown model.");
      draft.extraModels[clean] = (draft.extraModels[clean] || []).filter((item) => item !== value);
      return [...draft.extraModels[clean]];
    });
  }
  async saveCustomProvider(p: { id?: string; label: string; baseUrl: string; models?: string[] }, apiKey?: string): Promise<string> {
    const label = String(p.label || "").trim();
    const baseUrl = String(p.baseUrl || "").trim().replace(/\/+$/, "");
    const requestedId = p.id ? String(p.id) : null;
    const key = typeof apiKey === "string" ? apiKey.trim() : "";
    if (!label) throw new Error("Provider name is required.");
    let parsed: URL;
    try { parsed = new URL(baseUrl); } catch { throw new Error("Invalid provider base URL."); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("Use an HTTP or HTTPS base URL without credentials, a query or a fragment.");
    }
    const models = (Array.isArray(p.models) ? p.models : []).map((model) => String(model || "").trim()).filter(Boolean).slice(0, 200);
    const saved = await this.transaction((draft) => {
      let entry = requestedId ? draft.customProviders.find((item) => item.id === requestedId) : undefined;
      if (requestedId && !entry) throw new Error("Custom provider not found.");
      if (!entry) {
        let id: string;
        do { id = "custom-" + randomUUID().replace(/-/g, ""); } while (this.isKnown(id));
        entry = { id, label, baseUrl, keyEnv: customKeyEnv(baseUrl), models };
        draft.customProviders.push(entry);
      } else {
        entry.label = label; entry.baseUrl = baseUrl;
        entry.keyEnv = customKeyEnv(baseUrl); entry.models = models;
      }
      if (!draft.enabledProviders.includes(entry.id)) draft.enabledProviders.push(entry.id);
      if (!draft.settings.models[entry.id]) draft.settings.models[entry.id] = models[0] || "gpt-image-1";
      return { id: entry.id, keyEnv: entry.keyEnv };
    }, async (entry) => {
      if (!key) return;
      try { await upsertSecret(entry.keyEnv, key); }
      catch { throw new CustomProviderKeySaveError(entry.id); }
    });
    return saved.id;
  }
  async deleteCustomProvider(id: string): Promise<void> {
    await this.transaction((draft) => {
      if (!draft.customProviders.some((entry) => entry.id === id)) throw new Error("Custom provider not found.");
      draft.customProviders = draft.customProviders.filter((entry) => entry.id !== id);
      draft.enabledProviders = draft.enabledProviders.filter((value) => value !== id);
      if (!draft.enabledProviders.length) draft.enabledProviders.push(DEFAULT_SETTINGS.provider);
      if (!draft.enabledProviders.includes(draft.provider)) draft.provider = draft.enabledProviders[0];
    });
  }
  async update(partial: Partial<StoreData["settings"]> & { provider?: string }): Promise<void> {
    const p = structuredClone(partial || {});
    await this.transaction((draft) => {
      if (p.provider && draft.enabledProviders.includes(p.provider)) draft.provider = p.provider;
      if (p.models && typeof p.models === "object" && !Array.isArray(p.models)) draft.settings.models = { ...draft.settings.models, ...p.models };
      for (const key of ["size", "quality", "imageSize", "theme"] as const) {
        if (key in p) (draft.settings as Record<string, unknown>)[key] = p[key];
      }
    });
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
