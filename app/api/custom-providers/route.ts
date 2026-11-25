import { NextRequest, NextResponse } from "next/server";
import { store, publicErrorMessage } from "@/src/server/service";
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
      const id = await store.saveCustomProvider({
        id: p.id ? String(p.id) : undefined,
        label: String(p.label || ""),
        baseUrl: String(p.baseUrl || ""),
        models: Array.isArray(p.models) ? p.models : [],
      });
      dropClient(id);
      // Bind the key to the exact saved endpoint, never a non-unique display label.
      if (typeof p.key === "string" && p.key.trim()) {
        await store.setApiKey(id, p.key.trim());
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
    return NextResponse.json({ error: publicErrorMessage(e) }, { status: 400 });
  }
}
