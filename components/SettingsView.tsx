"use client";

import { useState } from "react";
import Logo from "./Logo";
import { api, type Boot, type ProviderInfo } from "./api";
import { ModelPicker, Spinner } from "./ui";
import type { UpdateState } from "./useUpdater";
import type { Toast } from "./Studio";

const THEMES: { id: string; label: string }[] = [
  { id: "studio", label: "Studio (dark)" },
  { id: "midnight", label: "Midnight" },
  { id: "sunset", label: "Sunset" },
  { id: "violet", label: "Violet" },
  { id: "paper", label: "Paper (light)" },
];

export default function SettingsView({
  boot,
  toast,
  reload,
  setTheme,
  updateState,
  updatesAvailable,
  checkUpdate,
  installUpdate,
  openReleases,
}: {
  boot: Boot;
  toast: (m: string, t?: Toast["type"], ms?: number) => void;
  reload: () => Promise<void>;
  setTheme: (t: string) => Promise<void>;
  updateState: UpdateState;
  updatesAvailable: boolean;
  checkUpdate: () => void;
  installUpdate: () => void;
  openReleases: () => void;
}) {
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [doctor, setDoctor] = useState<Record<string, { ok: boolean; message: string } | "busy">>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState<Record<string, boolean>>({});
  const [fetched, setFetched] = useState<Record<string, string[]>>({});
  const [fetchedQuery, setFetchedQuery] = useState<Record<string, string>>({});
  const [addingFromFetch, setAddingFromFetch] = useState<Record<string, boolean>>({});

  // custom provider form
  const [cpLabel, setCpLabel] = useState("");
  const [cpUrl, setCpUrl] = useState("");
  const [cpModels, setCpModels] = useState("");
  const [cpKey, setCpKey] = useState("");
  const [cpBusy, setCpBusy] = useState(false);

  const saveKey = async (p: ProviderInfo) => {
    const key = (keyDraft[p.id] || "").trim();
    if (!key) {
      toast("Paste a key first.", "error");
      return;
    }
    try {
      await api.saveKey(p.id, key);
      setKeyDraft((d) => ({ ...d, [p.id]: "" }));
      await reload();
      toast(`Key saved → ${p.keyEnv} (data/secrets.env, mode 0600)`, "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const test = async (p: ProviderInfo) => {
    setTesting((t) => ({ ...t, [p.id]: true }));
    setDoctor((d) => ({ ...d, [p.id]: "busy" }));
    try {
      const r = await api.testProvider(p.id);
      setDoctor((d) => ({ ...d, [p.id]: r }));
    } catch (e) {
      setDoctor((d) => ({ ...d, [p.id]: { ok: false, message: (e as Error).message } }));
    } finally {
      setTesting((t) => ({ ...t, [p.id]: false }));
    }
  };

  const addProvider = async (id: string, label: string) => {
    setBusyProvider(id);
    try {
      await api.addProvider(id);
      await reload();
      toast(`${label} added — paste its API key below.`, "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyProvider(null);
    }
  };

  const removeProvider = async (p: ProviderInfo) => {
    setBusyProvider(p.id);
    try {
      await api.removeProvider(p.id);
      await reload();
      toast(`${p.label} removed. Its saved key stays in secrets.env.`, "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyProvider(null);
    }
  };

  const fetchModels = async (p: ProviderInfo) => {
    setFetching((f) => ({ ...f, [p.id]: true }));
    try {
      const r = await api.fetchModels(p.id);
      setFetched((f) => ({ ...f, [p.id]: r.ids }));
      setFetchedQuery((f) => ({ ...f, [p.id]: "" }));
      toast(`${r.ids.length} models fetched from ${p.label}.`, "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setFetching((f) => ({ ...f, [p.id]: false }));
    }
  };

  const addModel = async (p: ProviderInfo, raw: string) => {
    const ids = raw.split(",").map((m) => m.trim()).filter(Boolean);
    if (!ids.length) {
      toast("Type a model id first.", "error");
      return;
    }
    setAddingFromFetch((f) => ({ ...f, [p.id]: true }));
    try {
      await api.addModels(p.id, ids);
      await reload();
      setModelDraft((d) => ({ ...d, [p.id]: "" }));
      toast(`Added: ${ids.join(", ")}`, "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setAddingFromFetch((f) => ({ ...f, [p.id]: false }));
    }
  };

  const removeModel = async (p: ProviderInfo, model: string) => {
    try {
      await api.removeModel(p.id, model);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const saveCustom = async () => {
    setCpBusy(true);
    try {
      const models = cpModels.split(",").map((m) => m.trim()).filter(Boolean);
      await api.custom("save", {
        provider: { label: cpLabel, baseUrl: cpUrl, models, key: cpKey },
      });
      setCpLabel("");
      setCpUrl("");
      setCpModels("");
      setCpKey("");
      toast("Custom endpoint added — its key env is derived from the URL hash.", "ok");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCpBusy(false);
    }
  };

  const deleteCustom = async (id: string) => {
    try {
      await api.custom("delete", { id });
      await reload();
      toast("Custom endpoint deleted.", "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const activeProviders = Object.values(boot.providers);
  const notAdded = boot.catalog.filter((c) => !boot.providers[c.id]);

  const updateLine = () => {
    if (!updatesAvailable)
      return (
        <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
          Running outside the desktop app (web/dev mode) — the built-in updater is part of the
          Windows app and always stays on there.
        </span>
      );
    if (updateState.status === "checking") return <span className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--muted)" }}><Spinner /> Checking for updates…</span>;
    if (updateState.status === "downloading")
      return (
        <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
          Downloading {updateState.version ? "v" + updateState.version : "update"}
          {updateState.progress ? " — " + updateState.progress.percent + "%" : ""}…
        </span>
      );
    if (updateState.status === "ready")
      return (
        <span className="text-[12.5px] flex flex-wrap items-center gap-3">
          <span style={{ color: "var(--ok)" }}>
            ✓ Sun Studio {updateState.version ? "v" + updateState.version : ""} is downloaded and ready.
          </span>
          <button className="btn !py-1.5 !px-3 text-[12px]" onClick={installUpdate}>Restart &amp; install</button>
        </span>
      );
    if (updateState.status === "uptodate")
      return <span className="text-[12.5px]" style={{ color: "var(--ok)" }}>✓ You are up to date — Sun Studio v{boot.version}.</span>;
    if (updateState.status === "error")
      return (
        <span className="text-[12.5px] flex flex-wrap items-center gap-3">
          <span style={{ color: "var(--danger)" }}>Update check failed — {updateState.error}</span>
          <button className="btn-ghost !py-1 !px-2.5 text-[11.5px]" onClick={openReleases} title="Download the latest installer manually">
            Open releases page
          </button>
        </span>
      );
    return (
      <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
        Updates download silently in the background and install when you close the app.
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ---------- API CONNECTION ---------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Logo size={18} />
            <h2 className="text-[15px] font-bold tracking-wide">API CONNECTION</h2>
          </div>
          <button className="btn !py-1.5 text-[12px]" onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? "Close list" : "+ Add provider"}
          </button>
        </div>

        {addOpen && (
          <div className="card p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="mono-label">Provider directory</span>
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                {notAdded.length ? `${notAdded.length} available` : "Everything is already added"}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {boot.catalog.map((c) => {
                const added = !!boot.providers[c.id];
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-xl border"
                    style={{
                      borderColor: added ? "var(--accent-border)" : "var(--line)",
                      background: added ? "var(--accent-soft)" : "var(--panel-2)",
                      opacity: added ? 0.75 : 1,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{c.label}</div>
                      <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>{c.kind}</div>
                    </div>
                    {added ? (
                      <span className="mono-label shrink-0" style={{ color: "var(--ok)" }}>Added</span>
                    ) : (
                      <button
                        className="btn-ghost !py-1 !px-2.5 text-[11px] shrink-0"
                        disabled={busyProvider === c.id}
                        onClick={() => addProvider(c.id, c.label)}
                      >
                        {busyProvider === c.id ? <Spinner /> : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] mt-3" style={{ color: "var(--muted)" }}>
              Custom OpenAI-compatible endpoint? Use the Custom Endpoints section below.
            </div>
          </div>
        )}

        <p className="text-[13px] text-[var(--muted)] max-w-3xl">
          Keys are stored in <span className="mono-value">data/secrets.env</span> on this machine — never in
          settings.json and never in the browser. Each provider references its key by an env name
          (like <span className="mono-value">SUN_KEY_KIE</span>). Secrets are re-read live: saving a key
          applies without a restart.
        </p>

        <div className="flex flex-col gap-3">
          {activeProviders.map((p) => {
            const active = p.id === boot.provider;
            const d = doctor[p.id];
            const extra = boot.extraModels[p.id] || [];
            const list = fetched[p.id] || null;
            const q = (fetchedQuery[p.id] || "").trim().toLowerCase();
            const filteredList = list ? (q ? list.filter((id) => id.toLowerCase().includes(q)) : list) : null;
            return (
              <div key={p.id} className="card p-4 flex flex-col gap-3" data-provider={p.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: p.hasKey ? "var(--ok)" : "var(--muted)" }}
                      title={p.hasKey ? "Key saved" : "No key saved yet"}
                    />
                    <span className="text-[14px] font-semibold">{p.label}</span>
                    <span className="mono-label">{p.type}</span>
                    {active && (
                      <span className="mono-label px-1.5 py-0.5 border rounded" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!active && (
                      <button
                        className="btn-ghost !py-1.5 text-[12px]"
                        onClick={() => api.updateSettings({ provider: p.id }).then(reload).then(() => toast("Provider switched.", "ok"), (e: Error) => toast(e.message, "error"))}
                      >
                        Set active
                      </button>
                    )}
                    <button
                      className="btn-ghost btn-danger !py-1.5 text-[12px]"
                      title="Remove from API CONNECTION (the key stays saved)"
                      disabled={busyProvider === p.id || activeProviders.length <= 1}
                      onClick={() => removeProvider(p)}
                    >
                      {busyProvider === p.id ? <Spinner /> : "Remove"}
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <span className="mono-label">Endpoint</span>
                    <div className="mono-value truncate">{p.baseUrl || "—"}</div>
                  </div>
                  <div>
                    <span className="mono-label">Secret reference · hint</span>
                    <div className="mono-value truncate">
                      {p.keyEnv} · {p.hasKey ? p.hint : "no key saved"}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap items-center">
                  <input
                    type="password"
                    className="field max-w-xs"
                    placeholder={p.keyHint}
                    value={keyDraft[p.id] || ""}
                    onChange={(e) => setKeyDraft((d2) => ({ ...d2, [p.id]: e.target.value }))}
                  />
                  <button className="btn-ghost !py-1.5 text-[12px]" onClick={() => saveKey(p)}>
                    Save key
                  </button>
                  <button className="btn-ghost !py-1.5 text-[12px]" onClick={() => test(p)} disabled={testing[p.id]}>
                    {testing[p.id] && <Spinner />} Test
                  </button>
                </div>

                {d && (
                  <div className="mono-value" style={{ color: d === "busy" ? "var(--muted)" : d.ok ? "var(--ok)" : "var(--danger)" }}>
                    {d === "busy" ? "Checking…" : (d.ok ? "✓ " : "✗ ") + d.message}
                  </div>
                )}

                {/* default model */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <span className="mono-label">Default model</span>
                    <ModelPicker
                      provider={p}
                      models={p.models}
                      value={boot.settings.models[p.id] || p.defaultModel}
                      onChange={(id) => api.updateSettings({ models: { [p.id]: id } }).then(reload, () => {})}
                    />
                  </div>
                  {p.keyDocs && (
                    <div className="self-end">
                      <span className="mono-label">Where to get a key</span>
                      <div className="mono-value text-[var(--muted)]">{p.keyDocs}</div>
                    </div>
                  )}
                </div>

                {/* custom models */}
                <div className="rounded-xl border p-3 flex flex-col gap-2.5" style={{ borderColor: "var(--line-soft)", background: "var(--panel-2)" }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="mono-label">Models · add new ones any time</span>
                    <button
                      className="btn-ghost !py-1 !px-2.5 text-[11px]"
                      disabled={fetching[p.id] || !p.hasKey}
                      title={p.hasKey ? "Fetch the live model list from the provider" : "Save a key first"}
                      onClick={() => fetchModels(p)}
                    >
                      {fetching[p.id] ? <Spinner /> : "⇩ Fetch models"}
                    </button>
                  </div>

                  {extra.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {extra.map((m) => (
                        <span
                          key={m}
                          className="pill !py-0.5 !px-2.5 text-[11px]"
                          title="Your added model — click × to remove"
                        >
                          {m}
                          <button
                            className="opacity-60 hover:opacity-100"
                            onClick={() => removeModel(p, m)}
                            aria-label={"Remove " + m}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      className="field max-w-sm !py-1.5 text-[12px]"
                      placeholder="model-id, another-model, …"
                      value={modelDraft[p.id] || ""}
                      onChange={(e) => setModelDraft((d2) => ({ ...d2, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addModel(p, modelDraft[p.id] || "");
                      }}
                    />
                    <button
                      className="btn-ghost !py-1.5 !px-3 text-[12px]"
                      disabled={addingFromFetch[p.id]}
                      onClick={() => addModel(p, modelDraft[p.id] || "")}
                    >
                      {addingFromFetch[p.id] && <Spinner />} Add model
                    </button>
                  </div>

                  {filteredList && (
                    <div className="flex flex-col gap-1.5">
                      <input
                        className="field !py-1.5 text-[12px]"
                        placeholder={`Search ${filteredList.length} fetched models…`}
                        value={fetchedQuery[p.id] || ""}
                        onChange={(e) => setFetchedQuery((d2) => ({ ...d2, [p.id]: e.target.value }))}
                      />
                      <div className="max-h-44 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--line-soft)", background: "var(--panel)" }}>
                        {filteredList.slice(0, 200).map((id) => {
                          const known = p.models.some((m) => m.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b last:border-0" style={{ borderColor: "var(--line-soft)" }}>
                              <span className="mono-value truncate text-[11.5px]">{id}</span>
                              {known ? (
                                <span className="mono-label shrink-0" style={{ color: "var(--ok)" }}>In list</span>
                              ) : (
                                <button
                                  className="btn-ghost !py-0.5 !px-2 text-[11px] shrink-0"
                                  disabled={addingFromFetch[p.id]}
                                  onClick={() => addModel(p, id)}
                                >
                                  Add
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {!filteredList.length && (
                          <div className="px-2.5 py-2 text-[12px]" style={{ color: "var(--muted)" }}>No match.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {p.promo && (
                  <div className="text-[12px] text-[var(--muted)] flex items-center justify-between">
                    {p.promo.title}
                    <a className="btn-ghost !py-1 text-[11px]" href={p.promo.url} target="_blank" rel="noreferrer">
                      {p.promo.urlLabel}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- CUSTOM ENDPOINTS ---------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold tracking-wide">CUSTOM ENDPOINTS</h2>
        <p className="text-[13px] text-[var(--muted)]">
          Any OpenAI-compatible server (proxy, self-hosted runner). The key env name is derived from the
          base URL hash, exactly like Hermes <span className="mono-value">custom_providers</span>.
        </p>

        <div className="card p-4 grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <span className="mono-label">Name</span>
            <input className="field" placeholder="My proxy" value={cpLabel} onChange={(e) => setCpLabel(e.target.value)} />
            <span className="mono-label">Base URL</span>
            <input className="field mono-value" placeholder="https://example.com/v1" value={cpUrl} onChange={(e) => setCpUrl(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="mono-label">Model ids (comma-separated)</span>
            <input className="field mono-value" placeholder="gpt-image-1, my-model" value={cpModels} onChange={(e) => setCpModels(e.target.value)} />
            <span className="mono-label">API key (optional, saved to secrets)</span>
            <input className="field" type="password" placeholder="sk-…" value={cpKey} onChange={(e) => setCpKey(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button className="btn" disabled={cpBusy || !cpLabel || !cpUrl} onClick={() => saveCustom()}>
              {cpBusy && <Spinner />} Add endpoint
            </button>
          </div>
        </div>

        {boot.customProviders.map((c) => (
          <div key={c.id} className="card p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{c.label}</div>
              <div className="mono-value text-[var(--muted)] truncate">
                {c.baseUrl} · {c.keyEnv}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-ghost btn-danger !py-1.5 text-[12px]"
                onClick={() => deleteCustom(c.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* ---------- UPDATES ---------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold tracking-wide">UPDATES</h2>
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[13px]">
              <span className="font-semibold">Sun Studio v{boot.version}</span>
              <span className="text-[var(--muted)]"> · updates ship from GitHub Releases</span>
            </div>
            <button
              className="btn-ghost !py-1.5 text-[12px]"
              onClick={checkUpdate}
              disabled={!updatesAvailable || updateState.status === "checking" || updateState.status === "downloading"}
            >
              {updateState.status === "checking" || updateState.status === "downloading" ? <Spinner /> : null}
              Check for updates
            </button>
          </div>
          {updateLine()}
        </div>
      </section>

      {/* ---------- APPEARANCE ---------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold tracking-wide">APPEARANCE</h2>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={t.id === boot.settings.theme ? "btn !py-1.5 text-[12px]" : "btn-ghost !py-1.5 text-[12px]"}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---------- ABOUT ---------- */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold tracking-wide">ABOUT</h2>
        <div className="text-[13px] text-[var(--muted)] flex flex-col gap-1">
          <span>Sun Studio v{boot.version}</span>
          <span>
            Data folder: <span className="mono-value">{boot.dataDir}</span>
          </span>
          <span>No AI inside: Sun Studio ships no model and no key — it only talks to the providers you connect.</span>
        </div>
      </section>
    </div>
  );
}
