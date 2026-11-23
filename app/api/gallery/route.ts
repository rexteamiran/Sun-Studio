import { NextRequest, NextResponse } from "next/server";
import { store, gallery } from "@/src/server/service";
import { ensureStoreDir } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureStoreDir();
  await store.load();
  const items = await gallery.list();
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      url: `/api/gallery/file/${i.id}`,
      createdAt: i.createdAt,
      kind: i.kind,
      provider: i.provider,
      prompt: i.prompt,
      model: i.model,
      aspect: i.aspect,
      quality: i.quality,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  await ensureStoreDir();
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await gallery.remove(id);
  return NextResponse.json({ ok: true });
}
