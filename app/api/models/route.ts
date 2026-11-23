import { NextRequest, NextResponse } from "next/server";
import { store } from "@/src/server/service";
import { ensureStoreDir } from "@/src/server/store";
import { getClient } from "@/src/server/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-provider model management (v0.0.11).
 *   { action: "add",    provider, models: string[] } — add user models (any provider)
 *   { action: "remove", provider, model }            — remove a user-added model
 *   { action: "fetch",  provider }                   — live-fetch the provider's model list
 *                                                      (GET /models on its API) and return
 *                                                      the ids; nothing is saved automatically.
 */
export async function POST(req: NextRequest) {
  await ensureStoreDir();
  await store.load();
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const provider = String(body?.provider || "");

    if (action === "add") {
      const models = Array.isArray(body.models) ? body.models : [String(body?.model || "")];
      const list = await store.addModels(provider, models);
      return NextResponse.json({ ok: true, models: list, snapshot: store.snapshot() });
    }
    if (action === "remove") {
      const list = await store.removeModel(provider, String(body?.model || ""));
      return NextResponse.json({ ok: true, models: list, snapshot: store.snapshot() });
    }
    if (action === "fetch") {
      const meta = store.providerMeta(provider);
      if (!meta) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
      if (!store.getApiKey(provider)) {
        return NextResponse.json(
          { error: `Save a ${meta.label} API key first — fetching needs a live connection.` },
          { status: 400 }
        );
      }
      const client = getClient(provider, store, meta);
      if (!client.listModels) {
        return NextResponse.json(
          { error: `${meta.label} does not expose a model list — add model ids by hand below.` },
          { status: 400 }
        );
      }
      const ids = await client.listModels();
      return NextResponse.json({ ok: true, ids });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
