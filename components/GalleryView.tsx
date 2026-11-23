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
    return (
      <section className="card empty-state p-10 flex flex-col items-center justify-center text-center gap-3">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="opacity-30" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 16l4.5-4.5a2 2 0 0 1 2.8 0L14 15.2" />
          <path d="M13 13.2l2-2a2 2 0 0 1 2.8 0L21 14.4" />
          <circle cx="9" cy="8.6" r="1.3" />
        </svg>
        <div className="text-[14px] font-semibold">Your gallery is empty</div>
        <div className="text-[12.5px] max-w-sm" style={{ color: "var(--muted)" }}>
          Images you generate are stored locally on this machine and appear here — always private,
          never uploaded anywhere else.
        </div>
        <a className="btn !py-2 text-[12.5px] mt-1" href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("sun:navigate", { detail: "create" })); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create your first image
        </a>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="mono-label">{items.length} images · stored locally on this machine</span>
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
