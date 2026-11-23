"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderInfo } from "./api";

export const ASPECT_LABELS: Record<string, string> = {
  "1:1": "Square · 1:1",
  "3:2": "Landscape · 3:2",
  "2:3": "Portrait · 2:3",
  "16:9": "Wide · 16:9",
  "9:16": "Tall · 9:16",
  "4:3": "Classic · 4:3",
};
export const QUALITY_LABELS: Record<string, string> = {
  low: "Low · fastest",
  medium: "Medium",
  high: "High · slowest",
};
export const RESOLUTION_LABELS: Record<string, string> = {
  "1K": "1K · default",
  "2K": "2K · sharp",
  "4K": "4K · sharpest",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="mono-label">{label}</span>
      {children}
    </div>
  );
}

export function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        className="field appearance-none cursor-pointer pr-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
      >
        <path d="M2 3.8L5 6.8L8 3.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Searchable model dropdown (a la the v0.0.5 picker), badges come from labels. */
export function ModelPicker({
  provider,
  models,
  value,
  onChange,
}: {
  provider: ProviderInfo;
  models: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => (m.id + " " + m.label).toLowerCase().includes(q)) : models;
  }, [models, query]);

  const current = models.find((m) => m.id === value);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="field text-left flex items-center justify-between" onClick={() => setOpen((v) => !v)}>
        <span className="mono-value truncate">{current ? current.id : value || provider.defaultModel}</span>
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full card shadow-lg overflow-hidden">
          {provider.dynamicModels && models.length > 6 && (
            <div className="p-2 border-b" style={{ borderColor: "var(--line)" }}>
              <input
                autoFocus
                className="field"
                placeholder="Search models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {list.map((m) => (
              <button
                key={m.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg)]"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <div className="mono-value">{m.id}</div>
                {m.label !== m.id && <div className="text-[11px] text-[var(--muted)]">{m.label}</div>}
              </button>
            ))}
            {!list.length && <div className="px-3 py-3 text-[12px] text-[var(--muted)]">No match.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={"animate-spin " + className} width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
