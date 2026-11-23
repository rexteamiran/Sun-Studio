import { createHash } from "crypto";
import type { ProviderMeta } from "./types";

/**
 * Provider registry — Sun Studio has no AI inside; every provider is reached
 * through its public API with the user's own key.
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
};

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
