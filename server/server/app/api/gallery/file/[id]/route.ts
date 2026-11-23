import { NextRequest, NextResponse } from "next/server";
import { gallery } from "@/src/server/service";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve one gallery image (by item id); `?download=1` forces a file download. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const item = gallery.get(id);
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let buf: Buffer;
  try {
    buf = fs.readFileSync(gallery.filePath(item));
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": gallery.mimeOf(item),
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="sun-studio-${item.id}.${item.ext}"`;
  }
  return new NextResponse(new Uint8Array(buf), { headers });
}
