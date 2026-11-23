"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import { api, type Boot, type ProviderInfo } from "./api";
import CreateView from "./CreateView";
import EditView from "./EditView";
import GalleryView from "./GalleryView";
import SettingsView from "./SettingsView";

type View = "create" | "edit" | "restyle" | "gallery" | "settings";

const TABS: { id: View; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "edit", label: "Edit" },
  { id: "restyle", label: "Restyle" },
  { id: "gallery", label: "Gallery" },
  { id: "settings", label: "Settings" },
];

export interface Toast {
  id: number;
  msg: string;
  type: "info" | "error" | "ok";
}

export default function Studio() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [view, setView] = useState<View>("create");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pillOpen, setPillOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const toastSeq = useRef(1);

  const toast = useCallback((msg: string, type: Toast["type"] = "info", ms = 4200) => {
    const id = toastSeq.current++;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const reload = useCallback(async () => {
    try {
      setBoot(await api.bootstrap());
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!pillOpen) return;
    const close = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) setPillOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pillOpen]);

  const switchProvider = async (id: string) => {
    try {
      setBoot(await api.updateSettings({ provider: id }));
      toast("Provider switched.", "ok");
      setPillOpen(false);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const setTheme = async (theme: string) => {
    document.documentElement.dataset.theme = theme;
    try {
      setBoot(await api.updateSettings({ theme }));
    } catch {
      /* keep visual change anyway */
    }
  };

  useEffect(() => {
    if (boot?.settings.theme) document.documentElement.dataset.theme = boot.settings.theme;
  }, [boot?.settings.theme]);

  if (!boot) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-[13px]" style={{ color: "var(--muted)" }}>
          Connecting to the local server…
        </div>
      </main>
    );
  }

  const meta: ProviderInfo = boot.providers[boot.provider] || boot.providers.aipass;
  const providerIds = Object.keys(boot.providers);

  return (
    <main className="min-h-screen flex flex-col">
      {/* top bar */}
      <header className="border-b sticky top-0 z-40" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2.5 shrink-0">
            <Logo size={20} />
            <span className="font-bold tracking-[0.18em] text-[13px]">SUN&nbsp;STUDIO</span>
          </div>
          <nav className="flex items-center gap-5 flex-1 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} className={"tab " + (view === t.id ? "active" : "")} onClick={() => setView(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="relative shrink-0" ref={pillRef}>
            <button
              className="btn-ghost !py-1.5 !px-3 flex items-center gap-2"
              onClick={() => setPillOpen((v) => !v)}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: meta.hasKey ? "var(--ok)" : "var(--danger)" }}
              />
              <span className="text-[12px]">{meta.label}</span>
              <span className="text-[10px] opacity-60">▾</span>
            </button>
            {pillOpen && (
              <div className="absolute right-0 mt-2 w-64 card shadow-lg overflow-hidden z-50">
                {providerIds.map((id) => {
                  const p = boot.providers[id];
                  return (
                    <button
                      key={id}
                      className="w-full text-left px-3 py-2.5 hover:bg-[var(--bg)] flex items-center justify-between gap-2"
                      onClick={() => switchProvider(id)}
                    >
                      <span>
                        <span className="text-[13px] font-semibold">{p.label}</span>
                        <span className="block mono-value text-[var(--muted)]">
                          {p.type}
                          {!p.hasKey && " · no key"}
                        </span>
                      </span>
                      {id === boot.provider && (
                        <span className="mono-label" style={{ color: "var(--ok)" }}>
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* views */}
      <div className="flex-1">
        <div className="max-w-5xl mx-auto px-5 py-8">
          {view === "create" && <CreateView boot={boot} meta={meta} toast={toast} reload={reload} />}
          {view === "edit" && (
            <EditView boot={boot} meta={meta} toast={toast} allowMask key={"edit-" + boot.provider} />
          )}
          {view === "restyle" && (
            <EditView boot={boot} meta={meta} toast={toast} allowMask={false} key={"restyle-" + boot.provider} />
          )}
          {view === "gallery" && <GalleryView toast={toast} refreshSignal={boot.version} />}
          {view === "settings" && <SettingsView boot={boot} toast={toast} reload={reload} setTheme={setTheme} />}
        </div>
      </div>

      {/* footer */}
      <footer className="border-t" style={{ borderColor: "var(--line)" }}>
        <div className="max-w-5xl mx-auto px-5 h-10 flex items-center justify-between">
          <span className="mono-label">No AI inside — your keys, your providers</span>
          <span className="mono-value text-[var(--muted)]">v{boot.version} · 127.0.0.1 only</span>
        </div>
      </footer>

      {/* toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + (t.type === "error" ? "error" : t.type === "ok" ? "ok" : "")}>
            {t.msg}
          </div>
        ))}
      </div>
    </main>
  );
}
