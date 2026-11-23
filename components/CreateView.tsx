"use client";

import { useMemo, useState } from "react";
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

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-5 flex flex-col gap-5">
        <Field label="Prompt">
          <textarea
            className="field min-h-28 resize-y"
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
          {meta.background && (
            <Field label="Images">
              <Select value={String(n)} options={[1, 2, 3, 4].map((x) => ({ value: String(x), label: String(x) }))} onChange={(v) => setN(Number(v))} />
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="mono-label">
            {meta.resolutions
              ? "Tasks run on the provider's job queue — up to a few minutes"
              : "Results are saved to the local gallery"}
          </span>
          <button className="btn" onClick={generate} disabled={busy}>
            {busy && <Spinner />} {busy ? "Generating…" : "Generate"}
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
                <img src={r.url} alt="Generated" className="w-full rounded-md border" style={{ borderColor: "var(--line)" }} />
                <a className="btn-ghost !py-1.5 text-[12px]" href={r.url + "?download=1"}>
                  Download PNG
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {meta.promo && (
        <section className="card p-4 flex items-center justify-between gap-4">
          <span className="text-[13px]">{meta.promo.title}</span>
          <a className="btn-ghost !py-1.5" href={meta.promo.url} target="_blank" rel="noreferrer">
            {meta.promo.urlLabel}
          </a>
        </section>
      )}
    </div>
  );
}
