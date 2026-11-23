"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type GalleryEntry } from "./api";
import { Spinner } from "./ui";
import type { Toast } from "./Studio";

export default function GalleryView({
  toast,
  refreshSignal,
}: {
  toast: (m: string, t?: Toast["type"], ms?: number) => void;
  refreshSignal: string;
}) {
  const [items, setItems] = useState<GalleryEntry[] | null>(null);
  const [detail, setDetail] = useState<GalleryEntry | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.gallery());
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const remove = async (id: string) => {
    try {
      await api.galleryDelete(id);
      setItems((prev) => (prev || []).filter((i) => i.id !== id));
      setDetail(null);
      toast("Deleted.", "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (items === null) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
        <Spinner /> Loading gallery…
      </div>
    );
  }
  if (!items.length) {
    return <div className="text-[13px] text-[var(--muted)]">Nothing here yet — generate something in Create.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="mono-label">{items.length} images · stored locally in data/gallery</span>
        <button className="btn-ghost !py-1.5 text-[12px]" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((i) => (
          <button
            key={i.id}
            className="card overflow-hidden text-left hover:border-[var(--btn)]"
            onClick={() => setDetail(i)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.url} alt={i.prompt.slice(0, 60)} loading="lazy" className="w-full aspect-square object-cover" />
            <div className="px-3 py-2">
              <div className="mono-value truncate">{i.model}</div>
              <div className="text-[11px] text-[var(--muted)] truncate">{i.prompt}</div>
            </div>
          </button>
        ))}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setDetail(null)}>
          <div className="card max-w-2xl w-full p-4 flex flex-col gap-3 max-h-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={detail.url} alt={detail.prompt} className="max-h-[55vh] object-contain rounded" />
            <div className="text-[12px]">
              <span className="mono-value">{detail.model}</span>
              <span className="text-[var(--muted)]"> · {detail.provider} · {detail.aspect} · {detail.quality}</span>
            </div>
            <div className="text-[13px]">{detail.prompt}</div>
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost btn-danger !py-1.5 text-[12px]" onClick={() => remove(detail.id)}>
                Delete
              </button>
              <a className="btn-ghost !py-1.5 text-[12px]" href={detail.url + "?download=1"}>
                Download
              </a>
              <button className="btn !py-1.5 text-[12px]" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
