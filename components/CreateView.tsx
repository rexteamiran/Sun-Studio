"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Boot, type ProviderInfo } from "./api";
import { ASPECT_LABELS, QUALITY_LABELS, RESOLUTION_LABELS, Field, ModelPicker, Select, Spinner } from "./ui";
import type { Toast } from "./Studio";

interface ResultItem {
  id: string;
  url: string;
}

export default function CreateView({
  boot,
  meta,
  toast,
  reload,
}: {
  boot: Boot;
  meta: ProviderInfo;
  toast: (m: string, t?: Toast["type"], ms?: number) => void;
  reload: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState(boot.settings.size);
  const [quality, setQuality] = useState(boot.settings.quality);
  const [imageSize, setImageSize] = useState(boot.settings.imageSize);
  const [background, setBackground] = useState("auto");
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);

  const models = useMemo(() => meta.models, [meta]);
  const model = boot.settings.models[meta.id] || meta.defaultModel;

  const generate = async () => {
    if (busy) return;
    if (!prompt.trim()) {
      toast("Write a prompt first.", "error");
      return;
    }
    if (!meta.hasKey) {
      toast(`No ${meta.label} API key — add it in Settings → API connection.`, "error");
      return;
    }
    setBusy(true);
    try {
      const r = await api.generate({
        prompt,
        model,
        aspect,
        quality: meta.qualities ? quality : undefined,
        imageSize: meta.resolutions ? imageSize : undefined,
        background: meta.background ? background : undefined,
        n,
      });
      setResults(r.items);
      toast("Saved to Gallery — " + r.items.length + " image" + (r.items.length > 1 ? "s" : "") + ".", "ok");
      reload();
    } catch (e) {
      toast((e as Error).message, "error", 8000);
    } finally {
      setBusy(false);
    }
  };

  // Ctrl/Cmd+Enter generates from anywhere on the view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        generate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-5 flex flex-col gap-5">
        <Field label="Prompt">
          <textarea
            className="field min-h-28 resize-none"
            placeholder="Describe the image you want…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label={`Model · ${meta.label}`}>
            <ModelPicker
              provider={meta}
              models={models}
              value={model}
              onChange={(id) => {
                api.updateSettings({ models: { [meta.id]: id } }).then(() => reload(), () => {});
              }}
            />
          </Field>
          <Field label="Aspect ratio">
            <Select value={aspect} options={meta.aspects.map((a) => ({ value: a, label: ASPECT_LABELS[a] || a }))} onChange={setAspect} />
          </Field>
          {meta.resolutions ? (
            <Field label="Resolution">
              <Select
                value={imageSize}
                options={meta.resolutions.map((r) => ({ value: r, label: RESOLUTION_LABELS[r] || r }))}
                onChange={setImageSize}
              />
            </Field>
          ) : (
            <Field label="Quality">
              <Select
                value={quality}
                options={(meta.qualities || ["medium"]).map((q) => ({ value: q, label: QUALITY_LABELS[q] || q }))}
                onChange={setQuality}
              />
            </Field>
          )}
          {meta.background ? (
            <Field label="Background">
              <Select
                value={background}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "transparent", label: "Transparent" },
                  { value: "opaque", label: "Opaque" },
                ]}
                onChange={setBackground}
              />
            </Field>
          ) : (
            <Field label="Images">
              <Select value={String(n)} options={[1, 2, 3, 4].map((x) => ({ value: String(x), label: String(x) }))} onChange={(v) => setN(Number(v))} />
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[12px] flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <circle cx="8" cy="8" r="6.3" />
              <path d="M8 7.4v3.4" strokeLinecap="round" />
              <circle cx="8" cy="4.9" r="0.15" fill="currentColor" />
            </svg>
            {meta.resolutions
              ? "Runs on the provider's job queue — results usually take up to a few minutes"
              : "Every result is saved to your local gallery automatically"}
          </span>
          <div className="flex items-center gap-3">
            {meta.background && (
              <label className="flex items-center gap-2">
                <span className="mono-label">Images</span>
                <Select
                  value={String(n)}
                  options={[1, 2, 3, 4].map((x) => ({ value: String(x), label: String(x) }))}
                  onChange={(v) => setN(Number(v))}
                />
              </label>
            )}
            <button className="btn" onClick={generate} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Generating…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h13M13 6l6 6-6 6" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </section>
      <div className="text-[11px] text-center" style={{ color: "var(--muted)", opacity: 0.75 }}>
        Tip: press <kbd className="mono-value px-1 py-0.5 rounded border" style={{ borderColor: "var(--line)" }}>Ctrl</kbd>
        {" + "}
        <kbd className="mono-value px-1 py-0.5 rounded border" style={{ borderColor: "var(--line)" }}>Enter</kbd> to generate
      </div>

      {results.length > 0 ? (
        <section className="card p-5">
          <div className="mono-label mb-3">Latest results</div>
          <div className="grid grid-cols-2 gap-4">
            {results.map((r) => (
              <div key={r.id} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="Generated" className="w-full rounded-md border" style={{ borderColor: "var(--line)" }} />
                <a className="btn-ghost !py-1.5 text-[12px]" href={r.url + "?download=1"}>
                  Download PNG
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="card empty-state p-10 mb-4 flex flex-col items-center justify-center text-center gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="opacity-30" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M3 16l4.5-4.5a2 2 0 0 1 2.8 0L14 15.2" />
            <path d="M13 13.2l2-2a2 2 0 0 1 2.8 0L21 14.4" />
            <circle cx="9" cy="8.6" r="1.3" />
          </svg>
          <div className="text-[14px] font-semibold">Your results will appear here</div>
          <div className="text-[12.5px] max-w-sm" style={{ color: "var(--muted)" }}>
            Write a prompt above and press Generate. Everything you create is stored locally in the
            Gallery tab — nothing is uploaded anywhere else.
          </div>
        </section>
      )}

      {meta.promo && (
        <section className="card p-4 mb-2 flex items-center justify-between gap-4">
          <span className="text-[13px]">{meta.promo.title}</span>
          <a className="btn-ghost !py-1.5" href={meta.promo.url} target="_blank" rel="noreferrer">
            {meta.promo.urlLabel}
          </a>
        </section>
      )}
    </div>
  );
}
