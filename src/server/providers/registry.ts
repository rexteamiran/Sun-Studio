import { createHash } from "crypto";
import type { ProviderMeta } from "./types";

/**
 * Provider registry — Sun Studio has no AI inside; every provider is reached
 * through its public API with the user's own key.
 *
 * v0.0.11 layout:
 *   PROVIDER_CATALOG — every known provider, famous list the user can add from
 *     (Settings → Add Provider). Nothing is auto-installed except what the user
 *     adds (plus anything already active from earlier versions).
 *   PROVIDERS — full metas for the providers that carry built-in clients.
 *
 * Aspect ratios are canonical across the app ('1:1', '3:2', '2:3', '16:9', ...)
 * and mapped per provider at request time.
 *
 * Every entry carries its Hermes-style secret reference (`keyEnv`) — the key
 * itself lives in data/secrets.env, never in settings.json or the browser.
 */

/** Hermes-style env name for a custom endpoint: SUN_KEY_CUSTOM_<8-hex of URL>. */
export function customKeyEnv(baseUrl: string): string {
  const hash = createHash("sha256").update(String(baseUrl).toLowerCase()).digest("hex");
  return "SUN_KEY_CUSTOM_" + hash.slice(0, 8).toUpperCase();
}

function builtin(id: string): string {
  return "SUN_KEY_" + id.toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Providers with built-in clients (full metas)                        */
/* ------------------------------------------------------------------ */

export const PROVIDERS: Record<string, ProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    type: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    keyHint: "sk-…",
    keyDocs: "platform.openai.com/api-keys",
    billingUrl: "https://platform.openai.com/settings/organization/billing",
    aspects: ["1:1", "3:2", "2:3"],
    qualities: ["low", "medium", "high"],
    resolutions: null,
    background: true,
    dynamicModels: false,
    models: [
      { id: "gpt-image-1", label: "gpt-image-1 · best quality" },
      { id: "gpt-image-1-mini", label: "gpt-image-1-mini · faster & cheaper" },
      { id: "dall-e-3", label: "dall-e-3 · classic" },
    ],
    defaultModel: "gpt-image-1",
    keyEnv: builtin("openai"),
  },
  aipass: {
    id: "aipass",
    label: "AI Pass",
    type: "OpenAI-compatible wallet",
    baseUrl: "https://aipass.one/v1",
    keyHint: "sk-aikey-…",
    keyDocs: "aipass.one · Developer Dashboard",
    billingUrl: "https://aipass.one",
    aspects: ["1:1", "3:2", "2:3"],
    qualities: ["low", "medium", "high"],
    resolutions: null,
    background: true,
    dynamicModels: true,
    recommended: true,
    promo: {
      badge: "Recommended",
      title: "New to AI Pass? New accounts get $1 of free API credit.",
      url: "https://aipass.one",
      urlLabel: "Create a free account →",
    },
    models: [
      { id: "gpt-image-1", label: "gpt-image-1" },
      { id: "gpt-image-1-mini", label: "gpt-image-1-mini" },
      { id: "dall-e-3", label: "dall-e-3" },
    ],
    defaultModel: "gpt-image-1",
    keyEnv: builtin("aipass"),
  },
  kie: {
    id: "kie",
    label: "kie.ai",
    type: "AI marketplace · task API",
    baseUrl: "https://api.kie.ai",
    keyHint: "kie.ai API key",
    keyDocs: "docs.kie.ai/getting-started",
    billingUrl: "https://kie.ai",
    aspects: ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3"],
    qualities: null,
    resolutions: ["1K", "2K", "4K"],
    background: false,
    dynamicModels: false,
    // every id verified against its docs.kie.ai endpoint page (job-based API)
    models: [
      { id: "nano-banana-2-1", label: "nano-banana-2-1 · recommended" },
      { id: "nano-banana-pro", label: "nano-banana-pro · up to 4K" },
      { id: "nano-banana", label: "nano-banana · legacy" },
      { id: "seedream/5-pro-text-to-image", label: "Seedream 5 Pro · text to image" },
      { id: "seedream/5-pro-image-to-image", label: "Seedream 5 Pro · edit" },
      { id: "gpt-image/1.5-text-to-image", label: "GPT-Image 1.5 · text to image" },
      { id: "gpt-image/1.5-image-to-image", label: "GPT-Image 1.5 · edit" },
      { id: "grok-imagine/text-to-image", label: "Grok Imagine · text to image" },
      { id: "grok-imagine/image-to-image", label: "Grok Imagine · edit" },
    ],
    defaultModel: "nano-banana-2-1",
    keyEnv: builtin("kie"),
  },
  google: {
    id: "google",
    label: "Google Gemini",
    type: "Gemini API",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyHint: "AIza…",
    keyDocs: "aistudio.google.com/apikey",
    aspects: ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3"],
    qualities: null,
    resolutions: ["1K", "2K", "4K"],
    background: false,
    dynamicModels: false,
    models: [
      { id: "gemini-nano-banana-2.1", label: "Nano Banana 2.1 · recommended" },
      { id: "gemini-3.1-flash-lite-image", label: "Flash Lite Image · fastest" },
      { id: "gemini-3.1-flash-image", label: "Flash Image · up to 4K" },
      { id: "gemini-3-pro-image", label: "Nano Banana Pro · 4K" },
      { id: "gemini-2.5-flash-image", label: "Nano Banana (legacy)" },
    ],
    defaultModel: "gemini-nano-banana-2.1",
    keyEnv: builtin("google"),
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    type: "OpenRouter Image API",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "sk-or-v1-…",
    keyDocs: "openrouter.ai/settings/keys",
    billingUrl: "https://openrouter.ai/credits",
    aspects: ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "21:9"],
    qualities: null,
    resolutions: ["1K", "2K", "4K"],
    background: false,
    dynamicModels: true,
    models: [
      { id: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image · fast" },
      { id: "openai/gpt-image-1", label: "GPT Image 1" },
      { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5" },
      { id: "black-forest-labs/flux.2-pro", label: "FLUX.2 Pro" },
    ],
    defaultModel: "google/gemini-2.5-flash-image",
    keyEnv: builtin("openrouter"),
  },
  stability: {
    id: "stability",
    label: "Stability AI",
    type: "Stable Image API",
    baseUrl: "https://api.stability.ai",
    keyHint: "sk-…",
    keyDocs: "platform.stability.ai/account/keys",
    billingUrl: "https://platform.stability.ai/account/credits",
    aspects: ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "5:4", "4:5", "21:9"],
    qualities: null,
    resolutions: null,
    background: false,
    dynamicModels: false,
    models: [
      { id: "core", label: "Stable Image Core · fast" },
      { id: "ultra", label: "Stable Image Ultra · best quality" },
      { id: "sd3.5-large", label: "SD 3.5 Large" },
      { id: "sd3.5-large-turbo", label: "SD 3.5 Large Turbo" },
      { id: "sd3.5-medium", label: "SD 3.5 Medium" },
    ],
    defaultModel: "core",
    keyEnv: builtin("stability"),
  },
};

/* ------------------------------------------------------------------ */
/* Catalog — the famous-provider list shown in "Add provider"          */
/* ------------------------------------------------------------------ */

/** One row of the Add Provider catalog. */
export interface CatalogEntry {
  id: string; // provider id once added
  label: string;
  kind: string; // one-line description for the catalog card
  client: "openai" | "google" | "kie" | "openrouter" | "stability" | "custom";
  baseUrl: string;
  keyHint: string;
  keyDocs?: string;
  models: string[]; // suggested model ids when the provider is added
  defaultModel: string;
}

/**
 * Famous image-capable providers. `client` selects which built-in client talks
 * to the endpoint; "custom" = OpenAI-compatible generic.
 */
export const PROVIDER_CATALOG: CatalogEntry[] = [
  { id: "openai", label: "OpenAI", kind: "GPT Image · the official API", client: "openai", baseUrl: "https://api.openai.com/v1", keyHint: "sk-…", keyDocs: "platform.openai.com/api-keys", models: ["gpt-image-1", "gpt-image-1-mini", "dall-e-3"], defaultModel: "gpt-image-1" },
  { id: "google", label: "Google Gemini", kind: "Nano Banana · Gemini API", client: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta", keyHint: "AIza…", keyDocs: "aistudio.google.com/apikey", models: ["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-3-pro-image"], defaultModel: "gemini-nano-banana-2.1" },
  { id: "aipass", label: "AI Pass", kind: "Wallet for GPT Image · $1 free credit", client: "openai", baseUrl: "https://aipass.one/v1", keyHint: "sk-aikey-…", keyDocs: "aipass.one", models: ["gpt-image-1", "gpt-image-1-mini", "dall-e-3"], defaultModel: "gpt-image-1" },
  { id: "openrouter", label: "OpenRouter", kind: "One key · every major model", client: "openrouter", baseUrl: "https://openrouter.ai/api/v1", keyHint: "sk-or-v1-…", keyDocs: "openrouter.ai/settings/keys", models: ["google/gemini-2.5-flash-image", "openai/gpt-image-1", "bytedance-seed/seedream-4.5", "black-forest-labs/flux.2-pro"], defaultModel: "google/gemini-2.5-flash-image" },
  { id: "stability", label: "Stability AI", kind: "Stable Image · SD 3.5", client: "stability", baseUrl: "https://api.stability.ai", keyHint: "sk-…", keyDocs: "platform.stability.ai/account/keys", models: ["core", "ultra", "sd3.5-large", "sd3.5-medium"], defaultModel: "core" },
  { id: "kie", label: "kie.ai", kind: "Marketplace · 20+ image models", client: "kie", baseUrl: "https://api.kie.ai", keyHint: "kie.ai API key", keyDocs: "docs.kie.ai", models: ["nano-banana-2-1", "nano-banana-pro", "seedream/5-pro-text-to-image"], defaultModel: "nano-banana-2-1" },
  { id: "fal", label: "fal.ai", kind: "FLUX · fast inference cloud", client: "custom", baseUrl: "https://fal.run/v1", keyHint: "key_id:key_secret", keyDocs: "fal.ai/dashboard/keys", models: ["fal-ai/flux/schnell", "fal-ai/flux/dev", "fal-ai/flux-pro/v1.1"], defaultModel: "fal-ai/flux/schnell" },
  { id: "together", label: "Together AI", kind: "FLUX.1 [schnell/dev] endpoint", client: "custom", baseUrl: "https://api.together.xyz/v1", keyHint: "…", keyDocs: "api.together.ai/settings/api-keys", models: ["black-forest-labs/FLUX.1-schnell", "black-forest-labs/FLUX.1-dev"], defaultModel: "black-forest-labs/FLUX.1-schnell" },
  { id: "replicate", label: "Replicate", kind: "Hosted open-source models", client: "custom", baseUrl: "https://api.replicate.com/v1", keyHint: "r8_…", keyDocs: "replicate.com/account/api-tokens", models: ["black-forest-labs/flux-schnell", "black-forest-labs/flux-dev", "bytedance/sd3.5"], defaultModel: "black-forest-labs/flux-schnell" },
  { id: "deepinfra", label: "DeepInfra", kind: "FLUX models · cheap inference", client: "custom", baseUrl: "https://api.deepinfra.com/v1/openai", keyHint: "…", keyDocs: "deepinfra.com/dashboard/tokens", models: ["black-forest-labs/FLUX.1-schnell", "black-forest-labs/FLUX.1-dev"], defaultModel: "black-forest-labs/FLUX.1-schnell" },
  { id: "deepseek", label: "DeepSeek", kind: "OpenAI-compatible endpoint", client: "custom", baseUrl: "https://api.deepseek.com/v1", keyHint: "sk-…", keyDocs: "platform.deepseek.com/api_keys", models: ["deepseek-image"], defaultModel: "deepseek-image" },
  { id: "groq", label: "Groq", kind: "OpenAI-compatible · ultra fast", client: "custom", baseUrl: "https://api.groq.com/openai/v1", keyHint: "gsk_…", keyDocs: "console.groq.com/keys", models: ["groq/flux-dev"], defaultModel: "groq/flux-dev" },
  { id: "mistral", label: "Mistral AI", kind: "OpenAI-compatible endpoint", client: "custom", baseUrl: "https://api.mistral.ai/v1", keyHint: "…", keyDocs: "console.mistral.ai/api-keys", models: ["mistral-image"], defaultModel: "mistral-image" },
  { id: "xai", label: "xAI Grok", kind: "Grok Imagine · image API", client: "custom", baseUrl: "https://api.x.ai/v1", keyHint: "xai-…", keyDocs: "console.x.ai", models: ["grok-2-image"], defaultModel: "grok-2-image" },
  { id: "hyperbolic", label: "Hyperbolic", kind: "Open-source model inference cloud", client: "custom", baseUrl: "https://api.hyperbolic.xyz/v1", keyHint: "eyJ…", keyDocs: "hyperbolic.xyz/settings", models: ["FLUX.1-dev"], defaultModel: "FLUX.1-dev" },
  { id: "novita", label: "Novita AI", kind: "Marketplace · SDXL, FLUX", client: "custom", baseUrl: "https://api.novita.ai/v3/openai", keyHint: "sk_…", keyDocs: "novita.ai/dashboard", models: ["flux-1.1-pro", "sd3.5-large-turbo"], defaultModel: "flux-1.1-pro" },
];

/** Which catalog ids map to a full built-in meta (vs generic OpenAI-compatible). */
export function catalogToMeta(e: CatalogEntry): ProviderMeta {
  const full = PROVIDERS[e.id];
  if (full) return full;
  return {
    id: e.id,
    label: e.label,
    type: "OpenAI-compatible",
    baseUrl: e.baseUrl,
    keyHint: e.keyHint,
    keyDocs: e.keyDocs,
    billingUrl: /^https?:\/\/.+/i.test(e.baseUrl) ? e.baseUrl.replace(/\/v1.*$/, "") : null,
    aspects: ["1:1", "3:2", "2:3", "16:9", "9:16"],
    qualities: ["low", "medium", "high"],
    resolutions: null,
    background: true,
    dynamicModels: true,
    models: e.models.map((id) => ({ id, label: id })),
    defaultModel: e.defaultModel,
    keyEnv: builtin(e.id),
  };
}

export const BUILTIN_IDS = Object.keys(PROVIDERS);

export interface CustomProviderEntry {
  id: string;
  label: string;
  baseUrl: string;
  keyEnv: string; // Hermes-style: SUN_KEY_CUSTOM_<hash8>
  models: string[];
}

export function customToMeta(c: CustomProviderEntry): ProviderMeta {
  const models = (c.models || []).map((id) => ({ id, label: id }));
  return {
    id: c.id,
    label: c.label,
    type: "Custom OpenAI-compatible",
    baseUrl: c.baseUrl,
    keyHint: "sk-… / API key",
    keyDocs: c.baseUrl,
    billingUrl: /^https?:\/\/.+/i.test(c.baseUrl) ? c.baseUrl : null,
    aspects: ["1:1", "3:2", "2:3", "16:9", "9:16"],
    qualities: ["low", "medium", "high"],
    resolutions: null,
    background: true,
    dynamicModels: true,
    custom: true,
    models: models.length ? models : [{ id: "gpt-image-1", label: "gpt-image-1" }],
    defaultModel: models.length ? models[0].id : "gpt-image-1",
    keyEnv: c.keyEnv,
  };
}
