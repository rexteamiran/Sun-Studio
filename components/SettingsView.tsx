"use client";

import { useState } from "react";
import Logo from "./Logo";
import { api, type Boot, type ProviderInfo } from "./api";
import { ModelPicker, Spinner } from "./ui";
import type { Toast } from "./Studio";

const THEMES: { id: string; label: string }[] = [
  { id: "dark", label: "Studio Dark" },
  { id: "midnight", label: "Midnight" },
  { id: "sunset", label: "Sunset" },
  { id: "ember", label: "Ember" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "violet", label: "Violet" },
  { id: "mono", label: "Mono (light)" },
  { id: "paper", label: "Paper (light)" },
];

export default function SettingsView({
  boot,
  toast,
  reload,
  setTheme,
}: {
  boot: Boot;
  toast: (m: string, t?: Toast["type"], ms?: number) => void;
  reload: () => Promise<void>;
  setTheme: (t: string) => Promise<void>;
}) {
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [doctor, setDoctor] = useState<Record<string, { ok: boolean; message: string } | "busy">>({});
  const [dynamicLists, setDynamicLists] = useState<Record<string, { id: string; label: string }[]>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

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
      if (r.ok && p.dynamicModels) {
        // re-test via the client also refreshes the model list; fetch it by
        // saving the key again is overkill — the test endpoint returns ids? it
        // returns a message only, so refetch bootstrap + rely on testKey's ids
        // through a fresh test call:
      }
    } catch (e) {
      setDoctor((d) => ({ ...d, [p.id]: { ok: false, message: (e as Error).message } }));
    } finally {
      setTesting((t) => ({ ...t, [p.id]: false }));
    }
  };

  const saveCustom = async (edit?: { id: string; label: string; baseUrl: string; models: string[] }) => {
    setCpBusy(true);
    try {
      if (edit) {
        await api.custom("save", {
          provider: { id: edit.id, label: edit.label, baseUrl: edit.baseUrl, models: edit.models },
        });
        toast("Custom endpoint updated.", "ok");
      } else {
        const models = cpModels.split(",").map((m) => m.trim()).filter(Boolean);
        await api.custom("save", {
          provider: { label: cpLabel, baseUrl: cpUrl, models, key: cpKey },
        });
        setCpLabel("");
        setCpUrl("");
        setCpModels("");
        setCpKey("");
        toast("Custom endpoint added — its key env is derived from the URL hash.", "ok");
      }
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

  const modelsFor = (p: ProviderInfo) => dynamicLists[p.id] || p.models;

  return (
    <div className="flex flex-col gap-8">
      {/* ---------- API CONNECTION (Hermes-style) ---------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Logo size={18} />
          <h2 className="text-[15px] font-bold tracking-wide">API CONNECTION</h2>
        </div>
        <p className="text-[13px] text-[var(--muted)] max-w-3xl">
          Keys are stored in <span className="mono-value">data/secrets.env</span> on this machine — never in
          settings.json and never in the browser. Each provider references its key by an env name
          (like <span className="mono-value">SUN_KEY_KIE</span>), and custom endpoints get a URL-hash name — the
          same config/secrets separation the Hermes agent uses. Secrets are re-read live: saving a key
          applies without a restart.
        </p>

        <div className="flex flex-col gap-3">
          {Object.values(boot.providers).map((p) => {
            const active = p.id === boot.provider;
            const d = doctor[p.id];
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
                  {!active && (
                    <button
                      className="btn-ghost !py-1.5 text-[12px]"
                      onClick={() => api.updateSettings({ provider: p.id }).then(reload).then(() => toast("Provider switched.", "ok"), (e: Error) => toast(e.message, "error"))}
                    >
                      Set active
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <span className="mono-label">Endpoint</span>
                    <div className="mono-value">{p.baseUrl || "—"}</div>
                  </div>
                  <div>
                    <span className="mono-label">Secret reference · hint</span>
                    <div className="mono-value">
                      {p.keyEnv} · {p.hasKey ? p.hint : "no key saved"}
                    </div>
                  </div>
                </div>

                {p.custom && (
                  <div className="mono-value text-[var(--muted)]">
                    models: {p.models.map((m) => m.id).join(", ") || "—"}
                  </div>
                )}

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

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <span className="mono-label">Default model</span>
                    <ModelPicker
                      provider={p}
                      models={modelsFor(p)}
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
            <div>
              <div className="text-[13px] font-semibold">{c.label}</div>
              <div className="mono-value text-[var(--muted)]">
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
          <span>
            Sun Studio v{boot.version} — local web studio · server bound to <span className="mono-value">127.0.0.1</span>
          </span>
          <span>
            Data folder: <span className="mono-value">{boot.dataDir}</span>
          </span>
          <span>No AI inside: Sun Studio ships no model and no key — it only talks to the providers you connect.</span>
        </div>
      </section>
    </div>
  );
}
