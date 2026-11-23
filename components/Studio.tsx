"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import TitleBar from "./TitleBar";
import { Spinner } from "./ui";
import { useUpdater } from "./useUpdater";
import { api, type Boot, type ProviderInfo } from "./api";
import CreateView from "./CreateView";
import EditView from "./EditView";
import GalleryView from "./GalleryView";
import SettingsView from "./SettingsView";

type View = "create" | "edit" | "restyle" | "gallery" | "settings";

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  {
    id: "create",
    label: "Create",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    id: "edit",
    label: "Edit",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    ),
  },
  {
    id: "restyle",
    label: "Restyle",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12c2-5 4-7 6-7s3 2 3 4 2 3 4 3 4-2 5-3" />
        <path d="M14 19l3 3 4-4" />
      </svg>
    ),
  },
  {
    id: "gallery",
    label: "Gallery",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="M3 16l4.5-4.5a2 2 0 0 1 2.8 0L14 15.2" />
        <circle cx="9" cy="8.6" r="1.3" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
      </svg>
    ),
  },
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
  const [provOpen, setProvOpen] = useState(false);
  const provRef = useRef<HTMLDivElement>(null);
  const toastSeq = useRef(1);
  const { state: updateState, check: checkUpdate, install: installUpdate, openReleases, available: updatesAvailable } = useUpdater();

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
    if (!provOpen) return;
    const close = (e: MouseEvent) => {
      if (provRef.current && !provRef.current.contains(e.target as Node)) setProvOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [provOpen]);

  const switchProvider = async (id: string) => {
    try {
      setBoot(await api.updateSettings({ provider: id }));
      toast("Provider switched.", "ok");
      setProvOpen(false);
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

  // custom navigation event (Gallery empty-state CTA)
  useEffect(() => {
    const nav = (e: Event) => setView((e as CustomEvent<string>).detail as View);
    window.addEventListener("sun:navigate", nav);
    return () => window.removeEventListener("sun:navigate", nav);
  }, []);

  if (!boot) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-[13px]" style={{ color: "var(--muted)" }}>
          Starting Sun Studio…
        </div>
      </main>
    );
  }

  const meta: ProviderInfo = boot.providers[boot.provider] || Object.values(boot.providers)[0];
  const providerIds = Object.keys(boot.providers);

  const updateChip = () => {
    if (updateState.status === "downloading")
      return (
        <div className="side-item !cursor-default" style={{ color: "var(--muted)" }}>
          <Spinner />
          <span className="truncate">Downloading update{updateState.progress ? " · " + updateState.progress.percent + "%" : ""}</span>
        </div>
      );
    if (updateState.status === "ready")
      return (
        <button className="side-item app-no-drag" style={{ color: "var(--accent)" }} onClick={installUpdate} title={"Sun Studio " + (updateState.version || "")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          <span className="truncate">Restart to update</span>
        </button>
      );
    return (
      <button className="side-item" onClick={checkUpdate} disabled={!updatesAvailable} style={{ cursor: updatesAvailable ? "pointer" : "default", opacity: updatesAvailable ? 1 : 0.55 }} title="Check for updates">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="truncate">{updateState.status === "uptodate" ? "Up to date · v" + boot.version : "Check for updates"}</span>
      </button>
    );
  };

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* custom window title bar (frameless) */}
      <TitleBar version={boot.version} />

      <div className="flex-1 flex min-h-0">
        {/* ---------- sidebar ---------- */}
        <aside className="sidebar w-[228px] shrink-0 hidden md:flex flex-col app-drag">
          <div className="app-no-drag flex flex-col gap-4 p-3 flex-1 overflow-y-auto">
            {/* workspace header */}
            <div className="px-2 pt-1 flex items-center gap-2.5">
              <Logo size={22} />
              <div className="leading-tight">
                <div className="text-[13.5px] font-semibold tracking-wide">Sun Studio</div>
                <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>AI image workspace</div>
              </div>
            </div>

            {/* provider selector */}
            <div className="relative px-1" ref={provRef}>
              <button className="pill w-full justify-between" onClick={() => setProvOpen((v) => !v)}>
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: meta.hasKey ? "var(--ok)" : "var(--muted)" }}
                  />
                  <span className="truncate">{meta.label}</span>
                </span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <path d="M2 3.8L5 6.8L8 3.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {provOpen && (
                <div className="absolute left-1 right-1 mt-2 card shadow-2xl overflow-hidden z-50">
                  {providerIds.map((id) => {
                    const p = boot.providers[id];
                    return (
                      <button
                        key={id}
                        className="w-full text-left px-3 py-2.5 hover:bg-[var(--panel-2)] flex items-center justify-between gap-2"
                        onClick={() => switchProvider(id)}
                      >
                        <span className="min-w-0">
                          <span className="text-[13px] font-semibold flex items-center gap-2">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: p.hasKey ? "var(--ok)" : "var(--muted)" }}
                            />
                            <span className="truncate">{p.label}</span>
                          </span>
                          <span className="block mono-value text-[var(--muted)] truncate">
                            {p.type}
                            {!p.hasKey && " · no key"}
                          </span>
                        </span>
                        {id === boot.provider && (
                          <span className="mono-label shrink-0" style={{ color: "var(--ok)" }}>
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* nav */}
            <div className="flex flex-col gap-0.5">
              <div className="side-header mb-1.5">Workspace</div>
              {NAV.map((n) => (
                <button key={n.id} className={"side-item " + (view === n.id ? "active" : "")} onClick={() => setView(n.id)}>
                  {n.icon}
                  {n.label}
                </button>
              ))}
            </div>

            <div className="mt-auto flex flex-col gap-0.5">
              <div className="side-header mb-1.5">System</div>
              {updateChip()}
            </div>
          </div>
        </aside>

        {/* ---------- main column ---------- */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* view header */}
          <header className="border-b shrink-0 flex items-center justify-between gap-4 px-6 h-[54px]" style={{ borderColor: "var(--line)", background: "var(--chrome)" }}>
            <div className="flex items-center gap-3 min-w-0">
              {/* mobile nav (sidebar hidden on small windows) */}
              <nav className="flex md:hidden items-center gap-3 overflow-x-auto">
                {NAV.map((n) => (
                  <button key={n.id} className={"tab " + (view === n.id ? "active" : "")} onClick={() => setView(n.id)}>
                    {n.label}
                  </button>
                ))}
              </nav>
              <div className="hidden md:flex items-center gap-2 min-w-0">
                <h1 className="text-[15px] font-semibold truncate">{NAV.find((n) => n.id === view)?.label}</h1>
                <span className="text-[12px] truncate" style={{ color: "var(--muted)" }}>
                  {view === "create" && "Generate images from a text prompt"}
                  {view === "edit" && "Paint a mask over any area and describe the change"}
                  {view === "restyle" && "Feed reference images and describe the new look"}
                  {view === "gallery" && "Everything you have created, stored locally"}
                  {view === "settings" && "Providers, appearance and updates"}
                </span>
              </div>
            </div>
            {view !== "settings" && (
              <button className="pill shrink-0 app-no-drag" onClick={() => setView("settings")} title={meta.hasKey ? "Key connected — manage in Settings" : "No key saved — add it in Settings"}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" strokeLinejoin="round" />
                </svg>
                {meta.hasKey ? meta.label : meta.label + " · add key"}
              </button>
            )}
          </header>

          {/* views */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-6 pt-7 pb-16">
              {view === "create" && <CreateView boot={boot} meta={meta} toast={toast} reload={reload} />}
              {view === "edit" && (
                <EditView boot={boot} meta={meta} toast={toast} allowMask key={"edit-" + boot.provider} />
              )}
              {view === "restyle" && (
                <EditView boot={boot} meta={meta} toast={toast} allowMask={false} key={"restyle-" + boot.provider} />
              )}
              {view === "gallery" && <GalleryView toast={toast} refreshSignal={boot.version} />}
              {view === "settings" && <SettingsView boot={boot} toast={toast} reload={reload} setTheme={setTheme} updateState={updateState} updatesAvailable={updatesAvailable} checkUpdate={checkUpdate} installUpdate={installUpdate} openReleases={openReleases} />}
            </div>
          </div>

          {/* footer */}
          <footer className="border-t shrink-0" style={{ borderColor: "var(--line)", background: "var(--chrome)" }}>
            <div className="px-6 h-9 flex items-center justify-between">
              <span className="text-[11px] tracking-wide" style={{ color: "var(--muted)" }}>
                Bring your own key — private by design
              </span>
              <span className="text-[11px] tracking-wide" style={{ color: "var(--muted)" }}>
                {meta.label}{meta.hasKey ? " · connected" : " · add a key in Settings"}
              </span>
            </div>
          </footer>
        </div>
      </div>

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
