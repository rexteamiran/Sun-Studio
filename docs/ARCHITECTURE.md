# Architecture

A local web app in three layers: a React UI in the browser, Next.js route handlers as the only
door to the server layer, and the provider clients that talk to the outside world. The browser
never sees a key; the server never serves a page it doesn't own. (As of v0.0.7 the Electron shell
is gone — this replaced the old renderer/preload/main-process bridge with plain HTTP.)

```
┌────────────────────────── components/*.tsx (client) ──────────────────────────┐
│ Studio.tsx (state, tabs, pill, toasts)                                        │
│   CreateView · EditView (mask canvas) · GalleryView · SettingsView            │
│   theme: app/globals.css [data-theme] — mono (default), midnight, 6 accents   │
└──────────────────────────────┬────────────────────────────────────────────────┘
                               │ fetch → /api/* (the only door)
┌──────────────────────────────┴────────────────────────────────────────────────┐
│ app/api/*/route.ts — bootstrap · settings · keys · test · custom-providers ·  │
│                      generate · edit · gallery · gallery/file/[id]            │
└──────────────────────────────┬────────────────────────────────────────────────┘
┌──────────────────────────────┴────────────────────────────────────────────────┐
│ src/server/                                                                    │
│   service.ts     store + gallery singletons, dataURL parsing, quality mapping │
│   clients.ts     client factory (cached per provider)                          │
│   store.ts       data/settings.json — non-secret settings, provider registry   │
│   secrets.ts     data/secrets.env — SUN_KEY_* (0600, re-read live, Hermes style)│
│   gallery.ts     data/gallery/ + index.json (PNG/JPEG/WebP sniffing)           │
│   providers/     registry.ts · openai.ts · google.ts · kie.ts · types.ts      │
└───────────────────────────────────────────────────────────────────────────────┘
```

Security boundaries: the server binds `127.0.0.1` (`start-web.sh/.bat`, `npm start`, `npm run dev`).
Keys are read only inside `secrets.ts`/`store.ts` and used server-side to sign requests. The API
returns key presence + a short hint (`sk-moc…3456`) and the env reference name — never the value.

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

Override the data folder with `SUN_STUDIO_DATA`; the port with `PORT` (default 3570).

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
