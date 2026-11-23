import { NextResponse } from "next/server";
import { store, APP_VERSION } from "@/src/server/service";
import { ensureStoreDir } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One call the UI needs on startup — no secret values ever cross this boundary. */
export async function GET() {
  await ensureStoreDir();
  await store.load();
  return NextResponse.json({ ...store.snapshot(), version: APP_VERSION });
}
