import { OpenAICompatibleClient } from "./providers/openai";
import { GoogleClient } from "./providers/google";
import { KieClient } from "./providers/kie";
import { OpenRouterClient } from "./providers/openrouter";
import { StabilityClient } from "./providers/stability";
import { PROVIDER_CATALOG, catalogToMeta } from "./providers/registry";
import type { ImageClient, ProviderMeta } from "./providers/types";
import type { Store } from "./store";

/**
 * One client instance per provider, created against the current registry meta
 * and a store-backed key getter (fresh secrets.env read on every call).
 *
 * Routing is by `meta.type` (single source of truth, set by the registry /
 * catalog). Catalog providers without a dedicated client (fal, together, …)
 * run through the OpenAI-compatible client — that is what their `type` says.
 */
const clients: Record<string, ImageClient> = {};

export function getClient(providerId: string, store: Store, meta: ProviderMeta): ImageClient {
  if (clients[providerId]) return clients[providerId];
  const getApiKey = () => store.getApiKey(providerId);
  if (meta.type === "Gemini API") {
    clients[providerId] = new GoogleClient({ getApiKey, baseUrl: meta.baseUrl });
  } else if (meta.type === "AI marketplace · task API") {
    clients[providerId] = new KieClient({ providerMeta: meta, getApiKey });
  } else if (meta.type === "OpenRouter Image API") {
    clients[providerId] = new OpenRouterClient({ baseUrl: meta.baseUrl, getApiKey });
  } else if (meta.type === "Stable Image API") {
    clients[providerId] = new StabilityClient({ baseUrl: meta.baseUrl, getApiKey });
  } else {
    clients[providerId] = new OpenAICompatibleClient({ providerMeta: meta, getApiKey });
  }
  return clients[providerId];
}

/** Invalidate a cached client (e.g. after a custom provider edit). */
export function dropClient(providerId: string): void {
  delete clients[providerId];
}

/** Meta for any known provider id: full registry entry or a catalog row. */
export function metaFor(providerId: string): ProviderMeta | null {
  const cat = PROVIDER_CATALOG.find((c) => c.id === providerId);
  return cat ? catalogToMeta(cat) : null;
}
