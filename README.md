# Sun Studio

**An AI image studio for Windows.** Generate, edit and restyle images with the best image models — through **your own keys**. Sun Studio ships with no AI inside: it connects directly to each provider's official API from a small server on your machine, so you always use your own account, your own limits and your own data.

> v0.0.8 note — the studio UI is the **Next.js 16 + React 18** app introduced in v0.0.7 (the open-design stack, monochrome black-and-white design, Hermes-style API connection). It now ships again inside a minimal **Electron shell** as a familiar Windows installer, with a one-time migration that carries over every setting, key and gallery image from v0.0.6 — and installed v0.0.6 apps update to v0.0.8 through their built-in updater.

## Documentation

| File | What's inside |
|---|---|
| [AGENTS.md](AGENTS.md) | Operating playbook for agent/dev sessions: rules, session checklist, smoke tests, pitfalls, security |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers (Electron shell → HTTP API → studio), migration, settings + secrets schema |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Provider layer, request shapes, mask semantics, how to add a provider |
| [docs/RELEASE.md](docs/RELEASE.md) | Tag-driven release routine (versions, CI, updater assets, rollback) |
| [docs/BUILD.md](docs/BUILD.md) | Dev setup, commands, installer packaging, CI walkthrough |
| [docs/SPEC.md](docs/SPEC.md) | Product spec: views, behaviors, provider-adaptive matrix, privacy |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned releases and decision log |
| [CHANGELOG.md](CHANGELOG.md) | What shipped in every version |

## Providers

| Provider | Type | Key | Image models |
|---|---|---|---|
| **AI Pass** ⭐ recommended | OpenAI-compatible wallet (`https://aipass.one/v1`) | `sk-aikey-…` from the Developer Dashboard | gpt-image-1, dall-e-3 and more (model list is fetched live from the proxy) |
| **OpenAI** | Direct API | `sk-…` from platform.openai.com | gpt-image-1, gpt-image-1-mini, dall-e-3 |
| **kie.ai** | AI marketplace (async task API) | kie.ai API key from the kie.ai console | nano-banana-2-1, nano-banana-pro, Seedream 5 Pro, GPT-Image 1.5, Grok Imagine (1K/2K/4K) |
| **Google Gemini** | Gemini API | `AIza…` from aistudio.google.com/apikey | Nano Banana 2.1, Flash Lite Image, Flash Image, Nano Banana Pro (1K/2K/4K) |
| **Custom** | Any OpenAI-compatible endpoint | your key | whatever the endpoint serves — type model ids manually or fetch the live list |

> 💡 **AI Pass is the recommended way to start** — [new accounts get **$1 of free API credit**](https://aipass.one), enough to try every model in the app.

Switch providers any time from the pill in the top bar. Aspect ratio, quality/resolution and background options adapt automatically to what the active provider supports.

## Features

| | |
|---|---|
| **Create** | Text-to-image with aspect ratio, quality/resolution, image count and transparent-background support (where available). |
| **Edit** | Paint a mask over any area and describe the change — inpainting, object removal, background removal. For providers without mask input (Gemini, kie.ai) the painted area is sent as a magenta cover and replaced per your prompt. |
| **Restyle** | Feed reference images and describe the new look — style transfer, outfits, scenes. |
| **Model picker** | Searchable per-provider model dropdown with quality badges; live model list for AI Pass and custom endpoints. |
| **Hermes-style API connection** | Keys live in `data/secrets.env` (mode 0600), referenced by env names (`SUN_KEY_KIE`, URL-hashed `SUN_KEY_CUSTOM_<HASH>` for custom endpoints) — the same config/secrets separation the Hermes agent uses. A doctor-style **Test** line shows the connection verdict and credit balance. |
| **Local gallery** | Every result is stored server-side with prompt, provider, model and settings; download or delete from the grid. |
| **Monochrome design** | A black-and-white default theme (`Mono`) inspired by open-design, plus Midnight and six accent themes. |
| **Localhost only** | The server binds to `127.0.0.1` — nothing is exposed to the network. |

## Getting started

### 1. Install

Download `SunStudio-Setup-0.0.8.exe` from the [latest release](https://github.com/rexteamiran/Sun-Studio/releases/latest) and run it — assisted setup with a license page, an install-dir picker and shortcuts. Nothing else is required (the studio server ships inside).

Already on **v0.0.6**? Just open the installed app → **Settings → Updates → Check for updates** — v0.0.8 installs over it and your keys, models, settings and gallery are migrated automatically on first launch.

### 2. Add a provider key

**Recommended: AI Pass** — one wallet key that reaches gpt-image-1, dall-e-3 and more. [Create a free account at aipass.one](https://aipass.one) and get **$1 of free API credit** on new accounts.

1. Open **Settings → API connection**
2. Paste the key under the provider, press **Save key**
3. Press **Test** — you should see *✓ Connected — …* (the kie.ai test also shows your credit balance)
4. Press **Set active** on the provider card

> Image generation is billed by the provider to **your** account — check current pricing on the provider's pricing page.

### 3. Create something

Type a prompt in **Create** and hit **Generate**. Results appear in seconds-to-minutes (task APIs like kie.ai queue jobs) and are stored in **Gallery** automatically.

## Development

```bash
npm ci
npm run dev             # studio in a browser: http://127.0.0.1:3570 (hot reload)
npm run test:clients    # provider client integration tests (local mock, no network)
node scripts/test-migration.cjs   # v0.0.6 data migration unit tests
npm run dist            # full Windows installer: next build → assemble server/ → NSIS exe
```

`npm run dist` chains `npm run build` + `scripts/prepare-electron.mjs` (copies the Next standalone server into `server/`) + electron-builder NSIS. For a quick packaged-app check without the installer, run the shell directly: `npm run build && npm run prepare:electron && electron .`

## Building from CI

Pushing a tag like `v0.0.8` triggers `.github/workflows/build.yml` (windows-latest): Next build → assemble Electron payload → electron-builder NSIS → release assets `SunStudio-Setup-X.Y.Z.exe` + `latest.yml` + `.blockmap` (the last two are what the in-app updater reads).

## Privacy & security

- API keys are written to `data/secrets.env` (mode **0600**, inside the app's user-data folder) and are read **only inside the local server** to sign requests to the selected provider (`api.openai.com`, `aipass.one`, `api.kie.ai` or `generativelanguage.googleapis.com`). They never reach the UI, `settings.json` or any log.
- The server binds to **127.0.0.1** only. Prompts and images are sent **directly** to the active provider. No accounts, no telemetry.
- Generated images and history live in the app's `data/` folder (`%APPDATA%/Sun Studio/data`; override with `SUN_STUDIO_DATA`).

## Roadmap

- v0.0.9 — live task progress streaming (SSE) for kie.ai, batch export, prompt library
- v0.1 — per-project galleries, optional portable build

## License

Apache-2.0 — see [LICENSE](LICENSE).
