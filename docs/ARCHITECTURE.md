# Architecture

One Electron app, three layers, a strict bridge between them. No frameworks, no bundler.

```
┌─────────────────────────────── src/renderer/ ───────────────────────────────┐
│ index.html (views) · styles.css (v2 dark-gold theme) · app.js (all UI logic)│
│   state.provider + PROVIDERS_META drive every option list                    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ window.sun.* (contextBridge — the only door)
┌──────────────────────────────┴──────────────────────────────────────────────┐
│ src/preload/preload.js — wraps ipcRenderer.invoke / .on, unwraps {ok,data}   │
└──────────────────────────────┬──────────────────────────────────────────────┘
┌──────────────────────────────┴──────────────────────────────────────────────┐
│ src/main/main.js — window, menu, ipcMain.handle registry, saveResults,       │
│                    provider client factory, smoke-test hook                  │
│   ├─ store.js     settings v2 + DPAPI-encrypted API keys (userData/settings.json)
│   ├─ providers.js registry: { openai, aipass, google } metadata              │
│   ├─ openai.js    OpenAICompatibleClient (openai + aipass)                   │
│   ├─ google.js    GoogleClient (Interactions API + legacy fallback)          │
│   ├─ gallery.js   local PNG store + metadata (userData/gallery)              │
│   └─ updater.js   electron-updater wrapper → state events                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Security boundaries: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
The renderer never sees Node or keys — keys are decrypted only inside `store.js` in the main
process and used to sign requests there.

## Generation data flow (Create)

```
Create ▸ app.js runJob('create', api.generate(params))
  params { prompt, model, aspect:'1:1', quality|imageSize, n, background }
  ▸ ipc 'gen:image' (main.js)
      provider = store.data.provider          # single source of truth
      model    = p.model || settings.models[provider] || meta.defaultModel
      client   = getClient(provider)          # cached per provider
      google   → client.generate({prompt, model, aspect, imageSize, n})   # sequential per image
      openai*  → client.generate({prompt, model, aspect, quality, n, background})
      ▸ [base64, …]
  ▸ saveResults(): nativeImage → PNG buffer → gallery.saveBuffer()
      (+ optional copy to settings.outputDir when autoSave)
  ▸ renderer: result cards in #create-results + toast
```

Edit flow differs per provider: OpenAI-compatible → multipart `POST /images/edits` with the
source PNG(s) and a **binary mask** (transparent = repaint). Google → the renderer composites a
magenta cover (`buildCoveredImage`), writes it to a temp file (`file:writeTempPng`) and sends a
prefixed prompt; no mask file is sent.

## IPC channels

| Channel | Direction | Purpose |
|---|---|---|
| `app:info` | R→M | version, electron, platform, encryption mode, packaged |
| `settings:get` | R→M | full snapshot `{provider, settings, providers{id:{hasKey,encrypted,hint}}}` |
| `settings:setApiKey` | R→M | `{provider, key}` → encrypt + persist |
| `settings:update` | R→M | partial `{provider?, models?, size?, quality?, imageSize?, outputDir?, autoSave?, checkUpdates?}` |
| `key:test` | R→M | test a provider key (GET models) |
| `provider:models` | R→M | static list or live `GET /v1/models` (AI Pass) |
| `gen:image` | R→M | text→image |
| `image:edit` | R→M | edit / restyle (multipart or inline base64) |
| `file:pickImage` / `file:readImage` | R→M | pick + normalize to PNG (≤50 MB) |
| `file:writeTempPng` | R→M | persist a renderer-produced PNG (magenta cover) to tmp |
| `gallery:list/delete/saveAs/openFolder` | R→M | gallery CRUD |
| `image:open` / `dir:pickOutput` / `export:png` | R→M | shell + save dialogs |
| `update:state/check/download/install` | R→M | updater control |
| `op:stage` | M→R | progress stage text during jobs |
| `menu:navigate` | M→R | native menu → view switch |
| `update:event` | M→R | updater state machine events |

Errors cross the bridge as `{ok:false, error}` and become toasts in the renderer.

## Settings store (v2)

`%APPDATA%/Sun Studio/settings.json`

```json
{
  "version": 2,
  "provider": "openai | aipass | google",
  "apiKeys": { "<id>": { "enc": "<safeStorage base64 | null>", "plain": "<string | null>" } },
  "settings": {
    "models":  { "openai": "gpt-image-1", "aipass": "gpt-image-1", "google": "gemini-nano-banana-2.1" },
    "size": "1:1", "quality": "medium", "imageSize": "1K",
    "outputDir": "", "autoSave": false, "checkUpdates": true
  }
}
```

`store.js` migrates v1 (`apiKeyEnc`/`apiKeyPlain`) into `apiKeys.openai` on load.

## Updater state machine (`updater.js` → `update:event` → `app.js applyUpdateState`)

```
idle → checking → available ──(user: download)──► progress ──► downloaded ──(user: install)──► quitAndInstall
                  └─ none (up to date)                          any state ──► error {message}
```

`autoDownload=false`, `autoInstallOnAppQuit=true`. Startup check runs 6 s after launch when
`settings.checkUpdates` is true and `app.isPackaged` (never in dev — the handler answers `{error:'dev'}`).

## Renderer map (`app.js`)

- `PROVIDERS_META` — mirrored provider metadata (see the pitfall in `AGENTS.md`).
- Views: `#view-create`, `#view-edit`, `#view-restyle`, `#view-gallery`, `#view-settings`;
  nav via `.nav-item[data-view]`, `nav()` toggles `.active`.
- Option population: `populateViewOptions(view)` fills `#<view>-size` (aspects),
  `#<view>-quality` (qualities **or** resolutions for Google) and hides `#<view>-bg-field`
  when `meta.background` is false.
- Mask painting: canvas overlay `#edit-mask`; `opaqueStrokes()` → binary mask; `exportMask()` →
  OpenAI-style PNG; `buildCoveredImage()` → magenta composite for Google.
- Update chip: `applyUpdateState()` maps the state machine to the top-bar chip + Settings panel.
- No `window.sun` (plain browser) → `createMockApi()` keeps the UI previewable outside Electron.

## Smoke-test hook

`main.js`, only when `process.env.SUN_SMOKE === '1'`: after `did-finish-load`, optionally clicks
`[data-view="SUN_VIEW"]`, captures the page to `SUN_SHOT`, prints `SMOKE_OK`, exits. Used for the
headless per-view screenshots described in `AGENTS.md`.
