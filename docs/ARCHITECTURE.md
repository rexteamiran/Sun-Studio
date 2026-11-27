# Architecture

## Maintained source and generated packaging payload

Maintain application code in `electron/`, `app/`, `components/`, and `src/server/`.
The root `server/` directory is a generated Electron packaging payload, not a second
application source tree. `npm run build` produces `.next/standalone`; the subsequent
`npm run prepare:electron` runs `scripts/prepare-electron.mjs`, which replaces `server/`
from that standalone output and copies `.next/static` to `server/.next/static`.
The expected entry point is `server/server.js`. The stylesheet/client asset copy is
required for the packaged UI. Preserve `asar: false` and the `server/**/*` packaging
selection in `electron-builder.yml`.

The root payload is excluded from automatic TypeScript source discovery and ignored
for newly untracked files. Existing tracked payload copies, including nested `server/`
content, remain untouched: ignore rules do not remove tracked files. Do not manually
patch those generated copies, relocate them, or treat them as maintained implementations.
Removing tracked artifacts requires a separately reviewed cleanup with reproducible
build/package evidence. This distinction alone is not proof that packaging passes.

The sections below contain historical runtime descriptions; security, migration, and
provider changes require their own current-revision evidence and regression checks.


Since v0.0.8 the product ships as a **minimal Electron shell around the Next.js studio** (that
was the v0.0.7 web app, unchanged). The UI is a React client, Next.js route handlers are the only
door to the server layer, and the provider clients talk to the outside world. The UI never sees a
key; the server never serves a page it doesn't own.

```
┌──────────────────── electron/ (shell — CommonJS, no build step) ───────────────┐
│ main.cjs     free-port picker → spawns server/ via ELECTRON_RUN_AS_NODE,       │
│              waits for /api/bootstrap, opens BrowserWindow on 127.0.0.1:<port> │
│ migrate.cjs  one-shot v0.0.6 → v0.0.8 data migration (see below)               │
│ updater.cjs  electron-updater: GitHub Releases feed, auto-download,            │
│              install-on-quit + "Restart now?" dialog                            │
└──────────────────────────────┬─────────────────────────────────────────────────┘
┌──────────────────────────────┴────────────────────────────────────────────────┐
│ server/ (Next.js standalone, assembled by scripts/prepare-electron.mjs)        │
│  ┌ components/*.tsx (client) ────────────────────────────────────────────────┐ │
│  │ Studio.tsx (state, tabs, pill, toasts)                                    │ │
│  │   CreateView · EditView (mask canvas) · GalleryView · SettingsView        │ │
│  │   theme: app/globals.css [data-theme] — mono (default), midnight, 6      │ │
│  └──────────────────────────────┬────────────────────────────────────────────┘ │
│  │ fetch → /api/* (the only door)                                              │
│  │ app/api/*/route.ts — bootstrap · settings · keys · test · custom-providers │
│  │                      · generate · edit · gallery · gallery/file/[id]        │
│  │ src/server/ — service.ts · clients.ts · store.ts · secrets.ts · gallery.ts │
│  │               providers/ (registry · openai · google · kie · types)        │
└────────────────────────────────────────────────────────────────────────────────┘
```

Security boundaries: the server binds `127.0.0.1` and the sandboxed window (contextIsolation +
nodeIntegration:false) is just a browser pointed at it. Keys are read only inside
`secrets.ts`/`store.ts` and used server-side to sign requests. The API returns key presence + a
short hint (`sk-moc…3456`) and the env reference name — never the value.

## v0.0.6 → v0.0.8 migration (first launch)

`electron/migrate.cjs` runs before the server starts, against the **same userData dir**
(`%APPDATA%/Sun Studio` — same appId/productName, so the NSIS over-install keeps it):

| legacy (v0.0.6) | → | new (v0.0.8) |
|---|---|---|
| `settings.json` v3 `{version, provider, apiKeys:{id:{enc,plain}}, customProviders:[{id,label,baseUrl,models}], settings}` | → | `data/settings.json` v4 (no keys) — provider, per-provider models, size/quality/imageSize, theme (unknown → `mono`), custom providers get `keyEnv` = `SUN_KEY_CUSTOM_<sha256-8hex of URL>` |
| DPAPI-encrypted keys (`apiKeys[*].enc`) | → | decrypted **in the main process** (same OS user, same safeStorage) → `data/secrets.env` 0600; decrypt failure/empty falls back to the legacy `plain` value |
| `gallery/` files + `index.json` (with data-URL thumbs) | → | files copied to `data/gallery/`, index rebuilt `{id, file, ext, createdAt, …meta}` without thumbs |

Idempotent (skips if `data/settings.json` already exists), legacy files stay untouched, and the
server reads the new layout via `SUN_STUDIO_DATA=<userData>/data`. Unit-tested in
`scripts/test-migration.cjs`.

## Generation data flow (Create)

```
CreateView ▸ POST /api/generate { prompt, model?, aspect, quality|imageSize, n, background? }
  provider = store.data.provider              # single source of truth
  model    = body.model || settings.models[provider] || meta.defaultModel
  client   = getClient(provider)              # cached per provider
  Gemini   → client.generate({prompt, model, aspect, imageSize, n})   # sequential per image
  kie.ai   → client.generate({prompt, model, aspect, imageSize, n})   # n tasks, parallel poll
  openai*  → client.generate({prompt, model, aspect, quality, n, background})
  ▸ [base64, …]
  ▸ gallery.saveBuffer(): Buffer → format sniff → data/gallery/<id>.<ext> + index entry
  ▸ response { items: [{ id, url: "/api/gallery/file/<id>", meta }] } → result cards
```

Edit flow differs per provider: OpenAI-compatible → multipart `POST /images/edits` with the source
image(s) and a **binary mask** (transparent = repaint) exported from the browser canvas.
Gemini / kie.ai → the browser composites a magenta cover (`buildCoveredImage` in `EditView.tsx`)
and sends the covered image; no mask file is sent. kie.ai additionally **uploads** the image first
(`POST /api/file-base64-upload`) because its jobs API accepts URLs only.

## HTTP API map

| Route | Method | Purpose |
|---|---|---|
| `/api/bootstrap` | GET | full UI snapshot: provider metas + `{hasKey, hint, keyEnv}`, settings, custom endpoints, dataDir, version |
| `/api/settings` | POST | partial update (provider switch, models, size/quality/imageSize, theme) |
| `/api/keys` | POST | save/clear one key → `secrets.env` under `SUN_KEY_*` |
| `/api/test` | POST | doctor-style check → `{ok, message}` (always HTTP 200) |
| `/api/custom-providers` | POST | `save` / `delete` custom endpoints (Hermes `custom_providers` pattern) |
| `/api/generate` | POST | text→image → gallery items |
| `/api/edit` | POST | edit / restyle (data-URL images + optional mask) → gallery items |
| `/api/gallery` | GET / DELETE | list / remove |
| `/api/gallery/file/[id]` | GET | image bytes (`?download=1` → attachment) |

Errors leave routes as `{error: message}` with the provider's own text preserved; network-layer
failures become friendly text in `friendlyNetworkError()`.

## Secrets & settings (v4)

`data/settings.json` — **no keys, by design**:

```json
{
  "version": 4,
  "provider": "aipass | openai | kie | google | custom-<id>",
  "customProviders": [ { "id": "custom-…", "label": "My proxy", "baseUrl": "https://…/v1",
                         "keyEnv": "SUN_KEY_CUSTOM_<HASH8>", "models": ["gpt-image-1"] } ],
  "settings": {
    "models": { "openai": "gpt-image-1", "aipass": "gpt-image-1", "kie": "nano-banana-2-1",
                "google": "gemini-nano-banana-2.1" },
    "size": "1:1", "quality": "medium", "imageSize": "1K", "theme": "mono"
  }
}
```

`data/secrets.env` (mode 0600) — one `KEY=VALUE` per line, parsed fresh on every lookup so a saved
key applies without restart (the Hermes behaviour):

```
SUN_KEY_OPENAI=sk-…
SUN_KEY_AIPASS=sk-aikey-…
SUN_KEY_KIE=…
SUN_KEY_GOOGLE=AIza…
SUN_KEY_CUSTOM_CD24289F=sk-…      # 8-hex sha256 of the lowercased base URL
```

The data folder is `%APPDATA%/Sun Studio/data` (the Electron shell passes it via
`SUN_STUDIO_DATA`; the env var also overrides it manually). The port is picked by the shell
(3570 preferred) and passed via `PORT`.

## Themes

`app/globals.css` defines `--bg/--panel/--ink/--muted/--line/--btn/--btn-fg/--danger/--ok` per
`[data-theme]`; `Studio.setTheme()` sets the attribute and persists the choice in settings. The
default is **mono** (black on white); **midnight** is the inverted black variant; the six accent
themes (sunset/ember/ocean/forest/violet/paper) keep the neutral structure and swap the accent.

## Component map (`components/`)

- `Studio.tsx` — bootstrap fetch, view tabs, provider pill (switch + status dot), toasts, theme.
- `CreateView.tsx` — prompt, ModelPicker, aspect/quality-or-resolution/background/images selects,
  results grid with download links, promo box.
- `EditView.tsx` — image picker (≤4), mask painting canvas (normalized strokes), binary-mask export
  for OpenAI-compatible, magenta-cover composite for Gemini/kie.ai, prompt + options + run.
- `GalleryView.tsx` — grid with lazy images, detail modal (download / delete).
- `SettingsView.tsx` — **API connection** cards (endpoint + secret ref + key save + doctor test +
  default model), custom endpoints form, theme swatches, about.
- `ui.tsx` — Field/Select/ModelPicker/Spinner primitives; `api.ts` — typed fetch surface.
