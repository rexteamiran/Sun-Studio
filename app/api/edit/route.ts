import { NextRequest, NextResponse } from "next/server";
import { store, gallery, qualityParams, clampN, parseDataUrl, jsonError } from "@/src/server/service";
import { getClient } from "@/src/server/clients";
import { ensureStoreDir } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Edit / image-to-image on the active provider.
 * The browser sends images as data URLs:
 *   - OpenAI-compatible: original image(s) + optional binary `mask` PNG
 *   - Gemini / kie.ai: pre-composited image(s) (the magenta mask-cover trick
 *     happens in the browser, mirroring the desktop app's renderer behaviour)
 */
export async function POST(req: NextRequest) {
  await ensureStoreDir();
  await store.load();
  try {
    const providerId = store.data.provider;
    const meta = store.providerMeta(providerId);
    if (!meta) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
    if (!store.getApiKey(providerId)) {
      return NextResponse.json(
        { error: `No ${meta.label} API key configured. Add it in Settings first.` },
        { status: 400 }
      );
    }
    const body = await req.json();
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) return NextResponse.json({ error: "Prompt is empty." }, { status: 400 });

    const images = (Array.isArray(body?.images) ? body.images : [])
      .map(parseDataUrl)
      .filter(Boolean) as { mime: string; data: string }[];
    if (!images.length) {
      return NextResponse.json({ error: "No image selected." }, { status: 400 });
    }
    const maskParsed = parseDataUrl(body?.mask);
    const maskPng = maskParsed ? Buffer.from(maskParsed.data, "base64") : null;

    const model =
      String(body?.model || "") || store.data.settings.models[providerId] || meta.defaultModel;
    const aspect = String(body?.aspect || store.data.settings.size);
    const qp = qualityParams(meta, body || {}, store.data.settings);
    const n = clampN(body?.n);
    const client = getClient(providerId, store, meta);

    let b64s: string[];
    if (meta.type === "Gemini API") {
      b64s = await client.edit({ imageBuffers: images, prompt, model, aspect, imageSize: qp.imageSize });
    } else if (meta.type === "AI marketplace · task API") {
      b64s = await client.edit({
        imageBuffers: images,
        prompt,
        model,
        aspect,
        imageSize: qp.imageSize,
        n,
      });
    } else {
      b64s = await client.edit({
        images,
        maskPng,
        prompt,
        model,
        aspect,
        quality: qp.quality,
        n,
        background: String(body?.background || "auto"),
      });
    }

    const items = [];
    for (const b64 of b64s) {
      const item = await gallery.saveBuffer(Buffer.from(b64, "base64"), {
        kind: "edit",
        provider: providerId,
        prompt,
        model,
        aspect,
        quality: qp.label,
        source: images.length ? "image" : "",
      });
      items.push({ id: item.id, url: `/api/gallery/file/${item.id}`, meta: { ...item } });
    }
    return NextResponse.json({ items });
  } catch (e) {
    const { error, status } = jsonError(e);
    return NextResponse.json({ error }, { status });
  }
}
