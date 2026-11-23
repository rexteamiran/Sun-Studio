# Changelog

All notable changes to Sun Studio are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/) — versions follow
[Semantic Versioning](https://semver.org/); every release is a git tag `vX.Y.Z` built by CI.

## [0.0.12] — 2026-11-23

### Fixed
- **The in-app updater never worked** (user report) — two independent defects:
  1. `package.json` carried no `build.publish`, so electron-builder never baked
     `resources/app-update.yml` into the installer and `checkForUpdates()` died immediately with
     "Unable to find app-update.yml". The GitHub feed (`provider: github · rexteamiran/Sun-Studio`)
     is now declared in `package.json` — verified: the file lands in the packaged resources.
  2. `initUpdater({ win: () => win })` hands over a getter, but the wrapper called
     `win.isDestroyed()` on it — the first updater event crashed the main process with a TypeError
     before any state reached the UI (invisible in smoke tests, which quit within 1.5 s). The
     wrapper now normalizes both shapes; covered by a new mocked-module test suite
     (`npm run test:updater`, 10 checks).

### Added
- **Self-update for already-installed copies**: installers built before v0.0.12 carry no
  app-update.yml — when it is missing, the updater sets the GitHub feed at runtime
  (`setFeedURL`), so a v0.0.10/v0.0.11 install updates itself to v0.0.12 without a manual download.
- **Manual escape hatch**: Settings → Updates shows the real error text plus an
  "Open releases page" button (`update:open-releases` IPC) whenever a check fails — a way out on
  networks where the GitHub API is blocked or rate-limited.
- The background auto-check now runs only in packaged builds (dev was logging updater failures).

## [0.0.11] — 2026-11-23

### Changed
- **Providers are user-managed** (per user request): API CONNECTION no longer hard-lists OpenAI and
  Google. A **provider directory** (Settings → Add provider) lists 16 famous image-capable
  providers — OpenAI, Google Gemini, AI Pass, OpenRouter, Stability AI, kie.ai, fal.ai, Together AI,
  Replicate, DeepInfra, DeepSeek, Groq, Mistral, xAI Grok, Hyperbolic, Novita AI — and any of them
  (OpenAI and Google included) can be added or removed from API CONNECTION at will. Removing a
  provider keeps its saved key in secrets.env. Settings schema moved to v5 (`enabledProviders`);
  upgrading users keep everything they had a key for.
- **Two new built-in clients** (endpoint shapes verified against current docs): **OpenRouter**
  (`POST /api/v1/images` — aspect_ratio/resolution/n, `input_references` for image-to-image,
  `GET /api/v1/images/models`) and **Stability AI** (`POST /v2beta/stable-image/generate/{core|ultra|sd3}`
  multipart, Bearer auth, `aspect_ratio`/`model`/`mode=image-to-image`+`strength`, JSON base64
  response; core/ultra edits route through the sd3.5 family).

### Added
- **Custom models on every provider**: a "Models · add new ones any time" box on each provider
  card — type model ids (comma-separated) or add from a fetched list; user-added models appear as
  removable chips and merge into that provider's model picker everywhere.
- **Fetch models**: a live "⇩ Fetch models" button per provider pulls the provider's real model
  list (`/models` on its API) into a searchable list with one-click Add. Requires a saved key —
  honest error when there is none.
- **Commercial polish pass**: brighter micro-label contrast (WCAG-safe), a "Getting started"
  01/02/03 side panel in the empty Gallery, a three-column how-it-works panel in Edit/Restyle,
  consistent prompt boxes (no stray resize handle), and no card can collide with the footer anymore.

### Removed
- Technical texts from the chrome: "Local server · 127.0.0.1", "Local · 127.0.0.1" and
  "Connecting to the local server…" are gone — the footer now shows provider connection state,
  and the boot screen says "Starting Sun Studio…".

## [0.0.10] — 2026-11-23

### Changed
- **Reference-design redesign** (per user's reference screens): the top-nav layout became a dark
  SaaS **dashboard with a left sidebar** — workspace header with the B/W logomark, glassy provider
  pill, icon nav (Workspace) and a System section, view header with per-view subtitle, quiet footer.
  New default theme **Studio**: charcoal-green layered surfaces (`#0d0f0d` → `#1c1f1c`), one vivid
  green accent (`#3ddc55`) with a soft glow on primary buttons, hairline borders, rounded 10–14px
  panels. Theme list rationalized to Studio / Midnight / Sunset / Violet / Paper; retired themes map
  forward in migration (`mono`/`dark` → Studio, old accents keep their palette where kept).
- **Branding is strictly black & white**: app icon, installer sidebar/header art regenerated as the
  white line logomark on a black tile — no orange anywhere (verified grayscale in the asset script).

### Added
- **Visible in-app updater, always on**: a live **Updates** section in Settings (current version,
  Check for updates, per-state status line, "Restart & install" when ready) plus a sidebar status
  chip (downloading %, restart-to-update, up-to-date). The updater state flows from the main
  process to the renderer through the sandboxed preload bridge (`update:*` IPC); web/dev builds
  show an honest "updater lives in the desktop app" note instead of a dead button.

### Fixed
- Promo card at the bottom of Create no longer collides with the footer (margin added).

## [0.0.9] — 2026-11-23

### Changed
- **Dark studio redesign — the default look is now a commercial dark theme.** The window is
  **frameless** with a custom in-app dark title bar (logo, wordmark, version, minimize /
  maximize / close caption buttons via a sandboxed preload bridge) — the native Windows chrome
  (accent-colored frame, system title bar) is gone completely. New default theme **Studio Dark**:
  near-black surfaces (`#0c0c0e` page → `#141417` panels), warm amber accent, hairline borders,
  dark scrollbars, styled focus rings; the v0.0.6 dark themes (Sunset, Ember, Ocean, Forest,
  Violet) return with refined palettes, plus Midnight; Mono and Paper remain as the light
  options. v0.0.6 updates land on their old theme; v0.0.7/v0.0.8 `mono` maps to **Studio Dark**.

### Added
- **Commercial polish pass** across all views: designed empty-states for Create ("Your results
  will appear here") and Gallery (with a *Create your first image* CTA that navigates to Create),
  chevron affordances on every select, Ctrl/Cmd+Enter to generate (with on-screen tip), Generate
  button arrow icon, quieter footer copy, neutral gray (not alarming red) status dots for
  providers without a saved key.

### Kept
- Installer, updater path (exe + latest.yml + blockmap), v0.0.6 data migration, all providers
  and the Hermes-style API connection — unchanged from v0.0.8.

## [0.0.8] — 2026-11-23

### Changed
- **Windows installer is back** — the v0.0.7 web zip was not what users wanted. The same
  Next.js 16 + React 18 studio (kept intact from v0.0.7) now ships inside a minimal **Electron
  45 shell**: the shell boots the Next standalone server as a child process on `127.0.0.1`
  (picks a free port), opens a window on it, and packages as a familiar assisted NSIS installer
  (`SunStudio-Setup-0.0.8.exe`, license page, install-dir picker, shortcuts, runs after setup).

### Added
- **v0.0.6 → v0.0.8 data migration** so existing installs keep everything: the old
  `settings.json` (v3, DPAPI-encrypted keys) is migrated on first launch into the Hermes-style
  layout (`data/settings.json` v4 without keys + `data/secrets.env` 0600) — provider, models,
  size/quality/resolution, theme, custom endpoints and **all keys** (encrypted ones are
  decrypted in the main process, with plain fallback); the v0.0.6 gallery images + metadata are
  carried over (thumbs are dropped, the new UI doesn't need them). Legacy files stay untouched;
  migration is idempotent.
- **Auto-update path restored** — electron-updater is back with the GitHub Releases feed
  (`latest.yml` + `blockmap` on every release). Installed v0.0.6 apps see v0.0.8 in
  **Settings → Updates** and upgrade in place; new installs self-update in the background and
  offer a restart dialog when a build is ready.

### Kept
- The whole v0.0.7 studio: monochrome open-design-style UI with black-and-white default theme,
  Hermes-style API connection (env-named secrets, doctor-style test), all four providers +
  custom endpoints, mask painting with the magenta-cover trick, local gallery.

## [0.0.7] — 2026-11-23

### Changed — breaking
- **Electron is gone; Sun Studio is now a local web app** built on the same stack as the
  nexu-io/open-design workspace: **Next.js 16.2.6 + React 18.3.1 + Tailwind CSS 4** in
  TypeScript. You run a small server on `127.0.0.1:3570` (binds localhost only) and use the
  studio in any browser. There is no installer and no in-app updater anymore — the release is a
  self-contained `SunStudio-Web-vX.Y.Z.zip` (`start-web.bat` / `start-web.sh` → `node server.js`).

### Added
- **Hermes-style API connection** (pattern from NousResearch/hermes-agent): API keys live in a
  dedicated `data/secrets.env` (mode 0600) referenced by env names (`SUN_KEY_KIE`,
  `SUN_KEY_GOOGLE`, …) — never inside `settings.json` and never in the browser; custom endpoints
  get a URL-hash env name (`SUN_KEY_CUSTOM_<8-hex>`), and secrets are re-read live so saving a key
  applies without a restart. The Settings → API connection panel shows endpoint, secret reference
  and a doctor-style **Test** verdict line (including your kie.ai credit balance).
- **Monochrome redesign** inspired by open-design: new black-and-white `Mono` default theme
  (hairline borders, uppercase micro-labels, mono-font values) plus `Midnight` and the six
  previous accent themes; new black-and-white logomark (inline SVG + favicon).
- Live model list is folded into `/api/bootstrap`; the searchable model picker, per-provider
  options (aspects, quality vs resolution, background) and promo cards all come from the server
  registry — the old duplicated renderer mirror is gone.

### Kept
- All four built-in providers with their v0.0.6 behaviour (OpenAI Images API, AI Pass live
  models, kie.ai async job pipeline with per-model recipes, Google Interactions + legacy
  fallback), custom OpenAI-compatible endpoints, magenta-cover mask trick for providers without
  mask input, local gallery with metadata.

### Moved
- Everything runs server-side now: provider clients, settings store, secrets and the gallery
  live in `src/server/` (TypeScript); the UI calls `/api/*` route handlers. Client behaviour is
  pinned by `npm run test:clients` (9 mock-server tests) and a full-flow e2e mock
  (`scripts/e2e-mock-openai.js`).

## [0.0.6] — 2026-11-21

### Added
- **kie.ai provider** — the fourth built-in provider, implemented directly from docs.kie.ai:
  nine verified image models (nano-banana-2-1, nano-banana-pro, nano-banana, Seedream 5 Pro
  text-to-image/edit, GPT-Image 1.5 text-to-image/edit, Grok Imagine text-to-image/edit) behind
  a new async task client (`src/main/kie.js`): `createTask` → poll `recordInfo` → download
  `resultUrls`, with per-family input recipes (image field names, aspect enums, quality knobs)
  and friendly body-code errors (kie.ai returns HTTP 200 for everything).
- kie.ai Edit/Image-to-Image works too: local images are uploaded via the base64 upload API and
  passed as URLs; Edit keeps the magenta-cover mask trick; the `Test` button shows your credit
  balance. Polling surfaces live progress (e.g. "Generating on kie.ai… 40%") next to the timer.

### Improved
- The mask note in Edit now speaks generically for providers without mask input (Google, kie.ai).

## [0.0.5] — 2026-11-21

### Added
- **Model picker in Create** — the studio panel finally has its own Model selector: a styled
  popover listing every model of the active provider (static + fetched live lists), with
  description badges (recommended / fastest / best quality / classic…), a search box that also
  accepts any raw model id on Enter, and one-click switching that saves the per-provider default.
- **Themes** — six switchable UI themes in Settings → Appearance: Sunset (default warm gold),
  Ember, Ocean, Forest, Violet and Paper (light). The whole palette is CSS-variable driven now;
  the choice is persisted in app settings and applied on startup.
- **More models** — dall-e-3 added to the OpenAI provider list (the client already maps its
  sizes 1792x1024/1024x1792 and standard/hd quality correctly).

### Improved
- Visual overhaul: layered background glows, soft panel shadows, refined buttons/inputs/chips,
  consistent accent-driven focus rings, adaptive empty-state artwork, active provider pill and
  nav polish. Every previously hardcoded color now follows the active theme.

## [0.0.4] — 2026-11-21

### Fixed
- **"Out of funds — HTTP 402"** told the user nothing actionable. Provider error bodies are now
  parsed properly (`error.message`, top-level `message`, or plain text up to 300 chars) and 402
  responses read e.g. *"Your AI Pass account has no credit left — <provider's own message>. Top
  up the balance, then try again → https://aipass.one"*. Every provider carries a `billingUrl`
  (AI Pass, OpenAI billing, Google pricing; custom providers use their own base URL).
- Toasts render http(s) links as **clickable** — clicking opens the URL in the system browser.
- Same 402 treatment for the Google Gemini client.

## [0.0.3] — 2026-11-21

### Added
- **Custom providers** — bring any OpenAI-compatible endpoint (a proxy, a self-hosted server, a
  local runner): name + base URL + key, editable and deletable at any time. Keys are encrypted
  with DPAPI like the built-in providers; the active provider may be a custom one.
- **Model management in Settings** — for every provider: pick from the known list,
  **fetch the live model list** from the provider's API (one click), or **type any model id
  manually**.
- **AI Pass is the default provider** and carries a recommendation card in Settings:
  *new accounts get $1 of free API credit* (link to aipass.one).
- **Custom window chrome** — frameless window with a custom title bar (drag to move,
  provider pill, version badge) and custom minimize / maximize / close controls. The native
  Windows menu bar is removed; `Ctrl+G` → Gallery, `Ctrl+,` → Settings, `F12` → DevTools.

### Changed
- Complete UI redesign: refined sidebar (grouped nav, active accent bar), two-column studio
  layout with sticky controls, richer empty states, layered panels, custom select styling,
  hover-overlay result cards, accent-colored toasts.
- Settings store schema → v3 (`customProviders` list; `provider` may reference a custom id);
  automatic migration from v2 and v1.

### Fixed
- **"The provider returned no image data."** — responses that return image **URLs** instead of
  inline base64 (common with proxies and the dall-e-3 default) are now downloaded and rendered.
  Errors also became actionable: a model that replies with text instead of an image (Google)
  quotes the reply, and a non-image model selection points to Settings → Default model.

## [0.0.2] — 2026-11-21

### Added
- **Multi-provider support** with a provider registry and a switcher pill in the top bar
  (OpenAI · AI Pass · Google Gemini). Each provider keeps its own key and default model;
  aspect-ratio / quality / background options adapt to the active provider.
- **AI Pass provider** — OpenAI-compatible wallet/proxy at `https://aipass.one/v1`
  (`sk-aikey-…` keys from the Developer Dashboard). Model list is fetched live via
  `GET /v1/models` and filtered to image models; supports gpt-image-1, dall-e-3 and more.
- **Google Gemini provider** — Gemini API image models via the new Interactions API
  (`POST /v1beta/interactions`, `Api-Revision: 2026-05-20`) with automatic fallback to the
  legacy `models/{model}:generateContent` (`responseModalities` + `imageConfig`).
  Models: Nano Banana 2.1, Flash Lite Image, Flash Image, Nano Banana Pro (1K/2K/4K resolutions).
- **In-app updater** (electron-updater + GitHub Releases): automatic check at startup
  (toggleable), manual check in Settings → Updates, in-app download with progress bar,
  install via the standard NSIS wizard. Releases now ship `latest.yml` + `.blockmap`.
- Provider cards in Settings (status, save / test / use) and per-provider encrypted keys.
- Magenta-cover compositing for masked edits on Google (Gemini has no mask input):
  painted areas are covered in solid magenta and replaced per the prompt.
- `file:writeTempPng` IPC channel (temp composited images for provider requests).

### Changed
- Settings store schema → v2 (`provider`, per-provider `apiKeys`, per-provider `models`);
  automatic migration from v1 (single OpenAI key).
- Redesigned UI (v2): sticky top bar with provider pill, grouped sidebar
  (Studio / Library / App), refined dark-gold theme, softer panels/buttons, update chip.
- Aspect ratios are now canonical (`1:1`, `3:2`, `2:3`, …) and mapped per provider at request time.

## [0.0.1] — 2026-11-21

### Added
- Initial release: **Create**, **Edit** (brush/erase mask painting, presets:
  remove background / restore & enhance / extend), **Image to Image** (up to 3 reference
  images), **Gallery** (local PNG + metadata, save-as / open / delete / reuse prompt),
  **Settings**.
- **OpenAI provider** — gpt-image-1 and gpt-image-1-mini via the official Images API
  (generations + edits with binary mask, transparent background support, 1–4 images).
- API key storage encrypted with Windows DPAPI (Electron `safeStorage`).
- NSIS installer with custom icon, sidebar/header art and license page
  (assets generated by `scripts/gen_assets.py`).
- GitHub Actions pipeline: builds the installer on `windows-latest` for tags `v*`,
  creates the GitHub Release and uploads `exe + latest.yml + blockmap`.
