import { NextRequest, NextResponse } from "next/server";
import { store, publicErrorMessage } from "@/src/server/service";
import { ensureStoreDir, CustomProviderKeySaveError } from "@/src/server/store";
import { dropClient } from "@/src/server/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save endpoint and optional key as one serialized Store command. */
export async function POST(req: NextRequest) {
  try {
    await ensureStoreDir();
    await store.load();
    const body = await req.json();
    const action = String(body?.action || "");
    if (action === "save") {
      const p = body.provider || {};
      if (p.key !== undefined && typeof p.key !== "string") {
        return NextResponse.json({ error: "The API key must be text." }, { status: 400 });
      }
      const key = typeof p.key === "string" ? p.key.trim() : "";
      if (key.length > 500 || /[\x00-\x1f\x7f]/.test(key)) {
        return NextResponse.json({ error: "The API key contains unsupported characters or is too long." }, { status: 400 });
      }
      const id = await store.saveCustomProvider({
        id: p.id ? String(p.id) : undefined,
        label: String(p.label || ""), baseUrl: String(p.baseUrl || ""),
        models: Array.isArray(p.models) ? p.models : [],
      }, key || undefined);
      dropClient(id);
    } else if (action === "delete") {
      const id = String(body?.id || "");
      await store.deleteCustomProvider(id);
      dropClient(id);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json(store.snapshot());
  } catch (error) {
    if (error instanceof CustomProviderKeySaveError) {
      dropClient(error.providerId);
      return NextResponse.json({ error: error.message, endpointSaved: true, providerId: error.providerId }, { status: 409 });
    }
    return NextResponse.json({ error: publicErrorMessage(error) }, { status: 400 });
  }
}
