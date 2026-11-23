import { NextRequest, NextResponse } from "next/server";
import { store } from "@/src/server/service";
import { ensureStoreDir } from "@/src/server/store";
import { dropClient } from "@/src/server/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add/edit/delete custom OpenAI-compatible endpoints (Hermes custom_providers pattern). */
export async function POST(req: NextRequest) {
  await ensureStoreDir();
  await store.load();
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (action === "save") {
      const p = body.provider || {};
      await store.saveCustomProvider({
        id: p.id ? String(p.id) : undefined,
        label: String(p.label || ""),
        baseUrl: String(p.baseUrl || ""),
        models: Array.isArray(p.models) ? p.models : [],
      });
      const entry = store.data.customProviders.find((c) => c.label === String(p.label || ""));
      if (entry) dropClient(entry.id);
      // a new custom provider may carry its first key alongside
      if (p.key && String(p.key).trim()) {
        const id = entry ? entry.id : null;
        if (id) await store.setApiKey(id, String(p.key).trim());
      }
    } else if (action === "delete") {
      const id = String(body?.id || "");
      await store.deleteCustomProvider(id);
      dropClient(id);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json(store.snapshot());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
