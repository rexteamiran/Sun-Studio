import { NextRequest, NextResponse } from "next/server";
import { store } from "@/src/server/service";
import { ensureStoreDir } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save or clear one provider key. The value is written to data/secrets.env
 * (mode 0600) under the provider's Hermes-style env name; settings.json and
 * the browser only ever learn a short hint afterwards.
 */
export async function POST(req: NextRequest) {
  await ensureStoreDir();
  await store.load();
  try {
    const body = await req.json();
    const provider = String(body?.provider || "");
    const meta = store.providerMeta(provider);
    if (!meta) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
    const key = String(body?.key ?? "");
    if (key.length > 500) return NextResponse.json({ error: "Key looks too long." }, { status: 400 });
    await store.setApiKey(provider, key);
    const info = store._providerInfo(provider);
    return NextResponse.json({
      ok: true,
      provider,
      keyEnv: info.keyEnv,
      hasKey: info.hasKey,
      hint: info.hint,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
