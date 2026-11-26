import { NextRequest, NextResponse } from "next/server";
import { store, gallery, qualityParams, clampN, parseDataUrl, jsonError } from "@/src/server/service";
import { getClient } from "@/src/server/clients";
import { ensureStoreDir } from "@/src/server/store";
import { ImageBatchError } from "@/src/server/providers/batch";
import { ProviderError } from "@/src/server/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Persist completed outputs before reporting a complete or partial outcome. */
export async function POST(req: NextRequest) {
  const items: { id: string; url: string; meta: object }[] = [];
  const taskIds: string[] = [];
  try {
    await ensureStoreDir();
    await store.load();
    const providerId = store.data.provider;
    const meta = store.providerMeta(providerId);
    if (!meta) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
    if (!store.getApiKey(providerId)) {
      return NextResponse.json({ error: `No ${meta.label} API key configured. Add it in Settings first.` }, { status: 400 });
    }
    const body = await req.json();
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) return NextResponse.json({ error: "Prompt is empty." }, { status: 400 });
    const images = (Array.isArray(body?.images) ? body.images : [])
      .map(parseDataUrl).filter(Boolean) as { mime: string; data: string }[];
    if (!images.length) return NextResponse.json({ error: "No image selected." }, { status: 400 });
    const maskParsed = parseDataUrl(body?.mask);
    if (body?.mask && (!maskParsed || maskParsed.mime !== "image/png")) {
      return NextResponse.json({ error: "The edit mask must be a PNG data URL." }, { status: 400 });
    }
    const maskPng = maskParsed ? Buffer.from(maskParsed.data, "base64") : null;
    const model = String(body?.model || "") || store.data.settings.models[providerId] || meta.defaultModel;
    const aspect = String(body?.aspect || store.data.settings.size);
    const qp = qualityParams(meta, body || {}, store.data.settings);
    const n = clampN(body?.n);
    const client = getClient(providerId, store, meta);
    let delivered = 0;
    let saveQueue = Promise.resolve();
    const onImage = (base64: string): Promise<void> => {
      const saved = saveQueue.then(async () => {
        const item = await gallery.saveBuffer(Buffer.from(base64, "base64"), {
          kind: "edit", provider: providerId, prompt, model, aspect, quality: qp.label, source: "image",
        });
        items.push({ id: item.id, url: `/api/gallery/file/${item.id}`, meta: { ...item } });
        delivered++;
      });
      saveQueue = saved.catch(() => {});
      return saved;
    };
    const b64s = await client.edit({
      images, imageBuffers: images, maskPng,
      prompt, model, aspect, quality: qp.quality, imageSize: qp.imageSize, n,
      background: String(body?.background || "auto"), onImage,
      onTask: (id) => { taskIds.push(id); },
    });
    for (const base64 of b64s.slice(delivered)) await onImage(base64);
    return NextResponse.json({ items, ...(taskIds.length ? { taskIds } : {}) });
  } catch (e) {
    const { error, status } = jsonError(e);
    const failures = e instanceof ImageBatchError
      ? e.failures.map((failure) => ({ ...failure,
          message: jsonError(new ProviderError(failure.message, failure.status)).error,
        }))
      : [{ index: items.length, status, message: error }];
    if (e instanceof ImageBatchError) {
      for (const id of e.taskIds) if (!taskIds.includes(id)) taskIds.push(id);
    }
    const details = { failures, ...(taskIds.length ? { taskIds } : {}) };
    if (items.length) return NextResponse.json({ items, partial: true, ...details });
    return NextResponse.json({ error, ...details }, { status });
  }
}
