"use client";

import { useRef, useState } from "react";
import { api, type Boot, type ProviderInfo } from "./api";
import { ASPECT_LABELS, Field, ModelPicker, Select, Spinner } from "./ui";
import type { Toast } from "./Studio";

interface Stroke {
  points: { x: number; y: number }[]; // normalized 0..1 against the preview box
  size: number;
}

const MAGENTA = "#ff00ff";

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
  color: string,
  mode: "paint" | "erase"
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.globalCompositeOperation = mode === "erase" ? "source-over" : "source-over";
    if (mode === "erase") {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
    } else {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
    }
    ctx.lineWidth = s.size;
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const x = p.x * w;
      const y = p.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (s.points.length === 1) {
      ctx.arc(s.points[0].x * w, s.points[0].y * h, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

export default function EditView({
  boot,
  meta,
  toast,
  allowMask,
}: {
  boot: Boot;
  meta: ProviderInfo;
  toast: (m: string, t?: Toast["type"], ms?: number) => void;
  allowMask: boolean;
}) {
  const [images, setImages] = useState<{ id: string; dataUrl: string }[]>([]);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState(boot.settings.size);
  const [quality, setQuality] = useState(boot.settings.quality);
  const [imageSize, setImageSize] = useState(boot.settings.imageSize);
  const [background, setBackground] = useState("auto");
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [paintMode, setPaintMode] = useState(false);
  const [brush, setBrush] = useState(24);
  const [results, setResults] = useState<{ id: string; url: string }[]>([]);
  const [strokeCount, setStrokeCount] = useState(0);

  const strokesRef = useRef<Stroke[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const model = boot.settings.models[meta.id] || meta.defaultModel;
  const noMaskProvider = meta.type === "Gemini API" || meta.type === "AI marketplace · task API";

  const pickFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files).slice(0, 4 - images.length);
    let added = 0;
    for (const f of list) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        setImages((prev) => [...prev, { id: String(Math.random()), dataUrl }]);
        strokesRef.current = [];
        setStrokeCount(0);
      };
      reader.readAsDataURL(f);
      added++;
    }
    if (added && allowMask) setPaintMode(true);
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (paintMode && strokeCount > 0) {
      drawStrokes(ctx, strokesRef.current, canvas.width, canvas.height, "rgba(0,0,0,0.45)", "paint");
    }
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintMode || !images.length) return;
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    strokesRef.current.push({ points: [pos(e)], size: brush });
    setStrokeCount(strokesRef.current.length);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    strokesRef.current[strokesRef.current.length - 1]?.points.push(pos(e));
    redraw();
  };
  const onUp = () => {
    drawingRef.current = false;
    redraw();
  };

  const clearMask = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    redraw();
  };

  /** Binary PNG: opaque black = keep, transparent = repaint (OpenAI-compatible). */
  const exportMask = (w: number, h: number): string | null => {
    if (!strokesRef.current.length) return null;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    drawStrokes(ctx, strokesRef.current, w, h, "#000000", "paint");
    ctx.globalCompositeOperation = "source-over";
    return c.toDataURL("image/png");
  };

  /** Magenta cover over painted areas (Gemini / kie.ai have no mask input). */
  const buildCoveredImage = (img: HTMLImageElement): string => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    drawStrokes(ctx, strokesRef.current, c.width, c.height, MAGENTA, "paint");
    return c.toDataURL("image/png");
  };

  const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });

  const run = async () => {
    if (!prompt.trim()) {
      toast("Write a prompt first.", "error");
      return;
    }
    if (!images.length) {
      toast("Pick an image first.", "error");
      return;
    }
    if (!meta.hasKey) {
      toast(`No ${meta.label} API key — add it in Settings → API connection.`, "error");
      return;
    }
    setBusy(true);
    try {
      let payloadImages: string[] = images.map((i) => i.dataUrl);
      let maskDataUrl: string | null = null;

      if (allowMask && strokeCount > 0) {
        const first = await loadImage(images[0].dataUrl);
        if (noMaskProvider) {
          payloadImages = [];
          for (const im of images) payloadImages.push(buildCoveredImage(await loadImage(im.dataUrl)));
          void first;
        } else {
          maskDataUrl = exportMask(first.naturalWidth, first.naturalHeight);
        }
      }

      const r = await api.edit({
        prompt,
        images: payloadImages,
        mask: maskDataUrl,
        model,
        aspect,
        quality: meta.qualities ? quality : undefined,
        imageSize: meta.resolutions ? imageSize : undefined,
        background: meta.background && !noMaskProvider ? background : undefined,
        n,
      });
      setResults(r.items);
      toast("Saved to Gallery — " + r.items.length + " image" + (r.items.length > 1 ? "s" : "") + ".", "ok");
    } catch (e) {
      toast((e as Error).message, "error", 8000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="mono-label">{allowMask ? "Source image · paint to repaint an area" : "Source image"}</span>
          <div className="flex gap-2">
            <button className="btn-ghost !py-1.5 text-[12px]" onClick={() => fileRef.current?.click()}>
              + Add image
            </button>
            {images.length > 0 && (
              <button
                className="btn-ghost btn-danger !py-1.5 text-[12px]"
                onClick={() => {
                  setImages([]);
                  clearMask();
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />

        {images.length === 0 ? (
          <button
            className="border border-dashed rounded-md py-10 text-[13px] text-[var(--muted)] hover:border-[var(--btn)]"
            style={{ borderColor: "var(--line)" }}
            onClick={() => fileRef.current?.click()}
          >
            Click to choose a PNG / JPG / WebP (up to 4)
          </button>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[0].dataUrl} alt="Source" className="w-full rounded-md border max-h-96 object-contain" style={{ borderColor: "var(--line)" }} />
              {allowMask && paintMode && (
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full cursor-crosshair rounded-md"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  width={800}
                  height={800}
                  onLoadedMetadata={redraw}
                />
              )}
            </div>
            {images.length > 1 && (
              <div className="flex flex-wrap gap-2 content-start">
                {images.slice(1).map((im) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={im.id} src={im.dataUrl} alt="Source" className="h-20 rounded border object-cover" style={{ borderColor: "var(--line)" }} />
                ))}
              </div>
            )}
          </div>
        )}

        {allowMask && images.length > 0 && (
          <div className="flex flex-wrap items-center gap-4">
            <button className={paintMode ? "btn !py-1.5 text-[12px]" : "btn-ghost !py-1.5 text-[12px]"} onClick={() => { setPaintMode((v) => !v); setTimeout(redraw, 0); }}>
              {paintMode ? "Painting on" : "Paint mask"}
            </button>
            <label className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
              Brush
              <input type="range" min={8} max={60} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-28" />
            </label>
            <button className="btn-ghost !py-1.5 text-[12px]" onClick={clearMask}>
              Clear mask
            </button>
            {strokeCount > 0 && noMaskProvider && (
              <span className="text-[12px] text-[var(--muted)]">
                {meta.label} has no mask input — painted areas will be covered with a magenta marker and replaced per your prompt.
              </span>
            )}
          </div>
        )}

        <Field label="Prompt">
          <textarea
            className="field min-h-24 resize-y"
            placeholder={allowMask ? "What should change?…" : "Describe the style to apply…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label={`Model · ${meta.label}`}>
            <ModelPicker
              provider={meta}
              models={meta.models}
              value={model}
              onChange={() => toast("Pick the default model in Settings → API connection.", "info")}
            />
          </Field>
          <Field label="Aspect ratio">
            <Select value={aspect} options={meta.aspects.map((a) => ({ value: a, label: ASPECT_LABELS[a] || a }))} onChange={setAspect} />
          </Field>
          {meta.resolutions ? (
            <Field label="Resolution">
              <Select value={imageSize} options={meta.resolutions.map((r) => ({ value: r, label: r }))} onChange={setImageSize} />
            </Field>
          ) : (
            <Field label="Quality">
              <Select value={quality} options={(meta.qualities || ["medium"]).map((q) => ({ value: q, label: QUALITY_LBL[q] || q }))} onChange={setQuality} />
            </Field>
          )}
          <Field label="Variants">
            <Select value={String(n)} options={[1, 2, 3, 4].map((x) => ({ value: String(x), label: String(x) }))} onChange={(v) => setN(Number(v))} />
          </Field>
        </div>

        <div className="flex items-center justify-end">
          <button className="btn" onClick={run} disabled={busy}>
            {busy && <Spinner />} {busy ? "Working…" : allowMask ? "Apply edit" : "Restyle"}
          </button>
        </div>
      </section>

      {results.length > 0 && (
        <section className="card p-5">
          <div className="mono-label mb-3">Results</div>
          <div className="grid grid-cols-2 gap-4">
            {results.map((r) => (
              <div key={r.id} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="Result" className="w-full rounded-md border" style={{ borderColor: "var(--line)" }} />
                <a className="btn-ghost !py-1.5 text-[12px]" href={r.url + "?download=1"}>
                  Download PNG
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const QUALITY_LBL: Record<string, string> = { low: "Low · fastest", medium: "Medium", high: "High · slowest" };
