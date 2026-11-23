import { NextRequest, NextResponse } from "next/server";
import { store } from "@/src/server/service";
import { ensureStoreDir } from "@/src/server/store";
import { dropClient } from "@/src/server/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add/remove providers in API CONNECTION (v0.0.11).
 *   { action: "add", id }       — add a catalog provider
 *   { action: "remove", id }    — remove an added provider (key stays in secrets)
 */
export async function POST(req: NextRequest) {
  await ensureStoreDir();
  await store.load();
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const id = String(body?.id || "");
    if (action === "add") {
      await store.addProvider(id);
    } else if (action === "remove") {
      await store.removeProvider(id);
      dropClient(id);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json(store.snapshot());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
