import { NextRequest, NextResponse } from "next/server";
import { store } from "@/src/server/service";
import { ensureStoreDir } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Update non-secret settings (provider switch, models, size/quality/imageSize, theme). */
export async function POST(req: NextRequest) {
  await ensureStoreDir();
  await store.load();
  try {
    const body = await req.json();
    await store.update(body || {});
    return NextResponse.json(store.snapshot());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
