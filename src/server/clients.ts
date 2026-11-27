import { OpenAICompatibleClient } from "./providers/openai";
import { GoogleClient } from "./providers/google";
import { KieClient } from "./providers/kie";
import { OpenRouterClient } from "./providers/openrouter";
import { StabilityClient } from "./providers/stability";
import { PROVIDER_CATALOG, catalogToMeta } from "./providers/registry";
import { ProviderError, type ImageClient, type ProviderMeta } from "./providers/types";
import type { Store } from "./store";

interface CachedClient { store: Store; fingerprint: string; client: ImageClient; }
const clients = new Map<string, CachedClient>();
function endpointIdentity(meta: ProviderMeta): string {
  return JSON.stringify([meta.id, meta.type, meta.baseUrl || "", meta.keyEnv]);
}
export function getClient(providerId: string, store: Store, meta: ProviderMeta): ImageClient {
  const fingerprint = endpointIdentity(meta);
  const cached = clients.get(providerId);
  if (cached && cached.store === store && cached.fingerprint === fingerprint) return cached.client;
  const getApiKey = () => {
    const current = store.providerMeta(providerId);
    // Protect held clients and stale route metadata, not only cache lookup.
    if (!current || endpointIdentity(current) !== fingerprint) {
      throw new ProviderError("The provider connection changed. Select the current connection and try again.", 409);
    }
    return store.getApiKey(providerId);
  };
  let client: ImageClient;
  if (meta.type === "Gemini API") {
    client = new GoogleClient({ getApiKey, baseUrl: meta.baseUrl });
  } else if (meta.type === "AI marketplace · task API") {
    client = new KieClient({ providerMeta: meta, getApiKey });
  } else if (meta.type === "OpenRouter Image API") {
    client = new OpenRouterClient({ baseUrl: meta.baseUrl, getApiKey });
  } else if (meta.type === "Stable Image API") {
    client = new StabilityClient({ baseUrl: meta.baseUrl, getApiKey });
  } else {
    client = new OpenAICompatibleClient({ providerMeta: meta, getApiKey });
  }
  clients.set(providerId, { store, fingerprint, client });
  return client;
}
export function dropClient(providerId: string): void { clients.delete(providerId); }
export function metaFor(providerId: string): ProviderMeta | null {
  const entry = PROVIDER_CATALOG.find((item) => item.id === providerId);
  return entry ? catalogToMeta(entry) : null;
}
