import { NextRequest, NextResponse } from "next/server";
import { store } from "@/src/server/service";
import { getClient } from "@/src/server/clients";
import { ensureStoreDir } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Doctor-style connection check (like `hermes doctor`): always HTTP 200 with a
 * { ok, message } verdict the UI can print as a diagnostic line.
 */
export async function POST(req: NextRequest) {
  await ensureStoreDir();
  await store.load();
  try {
    const body = await req.json();
    const provider = String(body?.provider || "");
    const meta = store.providerMeta(provider);
    if (!meta) return NextResponse.json({ ok: false, message: "Unknown provider." });
    if (!store.getApiKey(provider)) {
      return NextResponse.json({
        ok: false,
        message: `No ${meta.label} API key configured — save a key first.`,
      });
    }
    const client = getClient(provider, store, meta);
    const r = await client.testKey();
    let message: string;
    if (r.credits != null) message = `Connected — balance ${r.credits} credits`;
    else if (r.models != null) message = `Connected — ${r.models} models available`;
    else message = "Connected";
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message || "Connection failed." });
  }
}
