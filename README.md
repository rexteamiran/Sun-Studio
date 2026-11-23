# Sun Studio

**A local web studio for AI image generation.** Generate, edit and restyle images with the best image models — through **your own keys**. Sun Studio ships with no AI inside: it connects directly to each provider's official API from a small server on your machine, so you always use your own account, your own limits and your own data.

> v0.0.7 note — Sun Studio was a Windows (Electron) app until v0.0.6. It is now a **Next.js 16 + React 18 local web app** (same stack as the open-design workspace): you run it on `127.0.0.1`, open it in any browser, and the UI talks to a tiny local server that holds your keys and talks to the providers. Electron is gone entirely.

## Documentation

| File | What's inside |
|---|---|
| [AGENTS.md](AGENTS.md) | Operating playbook for agent/dev sessions: rules, session checklist, smoke tests, pitfalls, security |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, HTTP API map, settings + secrets schema |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Provider layer, request shapes, mask semantics, how to add a provider |
| [docs/RELEASE.md](docs/RELEASE.md) | Tag-driven release routine (versions, CI, release assets, rollback) |
| [docs/BUILD.md](docs/BUILD.md) | Dev setup, commands, CI walkthrough |
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

### 1. Run the app

Requires **Node.js 20.9+**.

```bash
unzip SunStudio-Web-v0.0.7.zip && cd SunStudio-Web-v0.0.7
./start-web.sh            # Windows: start-web.bat
# → open http://127.0.0.1:3570
```

Or from source: `npm ci && npm run build && npm start`.

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
npm run dev            # http://127.0.0.1:3570 (hot reload)
npm run test:clients   # provider client integration tests (local mock, no network)
npm run build && npm start
```

## Building from CI

Pushing a tag like `v0.0.7` triggers `.github/workflows/build.yml`, which builds the Next.js standalone bundle on `ubuntu-latest` and attaches `SunStudio-Web-vX.Y.Z.zip` to a GitHub release.

## Privacy & security

- API keys are written to `data/secrets.env` (mode **0600**) on this machine and are read **only inside the local server** to sign requests to the selected provider (`api.openai.com`, `aipass.one`, `api.kie.ai` or `generativelanguage.googleapis.com`). They never reach the browser, settings.json or any log.
- The server binds to **127.0.0.1** only. Prompts and images are sent **directly** to the active provider. No accounts, no telemetry.
- Generated images and history live in `data/` next to the server (override with `SUN_STUDIO_DATA`).

## Roadmap

- v0.0.8 — live task progress streaming (SSE) for kie.ai, batch export, prompt library
- v0.1 — Docker image, HTTPS/localhost auth token, per-project galleries

## License

Apache-2.0 — see [LICENSE](LICENSE).
