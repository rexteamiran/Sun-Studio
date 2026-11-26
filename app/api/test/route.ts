import { NextRequest, NextResponse } from "next/server";
import { store, jsonError } from "@/src/server/service";
import { getClient } from "@/src/server/clients";
import { ensureStoreDir } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** HTTP 200 carries an honest diagnostic verdict; never generate an image. */
export async function POST(req: NextRequest) {
  try {
    await ensureStoreDir();
    await store.load();
    const body = await req.json();
    const provider = String(body?.provider || "");
    const meta = store.providerMeta(provider);
    if (!meta) return NextResponse.json({ ok: false, message: "Unknown provider." });
    if (!store.getApiKey(provider)) {
      return NextResponse.json({ ok: false, message: `No ${meta.label} API key configured - save a key first.` });
    }
    const result = await getClient(provider, store, meta).testKey();
    const providerMessage = result.message ? jsonError(new Error(result.message)).error : undefined;
    if (!result.ok) return NextResponse.json({ ok: false, message: providerMessage || "Connection could not be verified." });
    const message = providerMessage || (result.credits != null
      ? `Connected - balance ${result.credits} credits`
      : result.models != null ? `Connected - ${result.models} models available` : "Connected");
    return NextResponse.json({ ok: true, message });
  } catch (error) {
    return NextResponse.json({ ok: false, message: jsonError(error).error });
  }
}
