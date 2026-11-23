import { OpenAICompatibleClient } from "./providers/openai";
import { GoogleClient } from "./providers/google";
import { KieClient } from "./providers/kie";
import type { ImageClient, ProviderMeta } from "./providers/types";
import type { Store } from "./store";

/**
 * One client instance per provider, created against the current registry meta
 * and a store-backed key getter (fresh secrets.env read on every call).
 */
const clients: Record<string, ImageClient> = {};

export function getClient(providerId: string, store: Store, meta: ProviderMeta): ImageClient {
  if (clients[providerId]) return clients[providerId];
  const getApiKey = () => store.getApiKey(providerId);
  if (meta.type === "Gemini API") {
    clients[providerId] = new GoogleClient({ getApiKey });
  } else if (meta.type === "AI marketplace · task API") {
    clients[providerId] = new KieClient({ providerMeta: meta, getApiKey });
  } else {
    clients[providerId] = new OpenAICompatibleClient({ providerMeta: meta, getApiKey });
  }
  return clients[providerId];
}

/** Invalidate a cached client (e.g. after a custom provider edit). */
export function dropClient(providerId: string): void {
  delete clients[providerId];
}
