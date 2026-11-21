# Sun Studio

**AI image studio for Windows.** Generate, edit and restyle images with the best image models — through your own keys. Sun Studio ships with no AI inside; it connects directly to each provider's official API, so you always use your own account, your own limits and your own data.

## Documentation

| File | What's inside |
|---|---|
| [AGENTS.md](AGENTS.md) | Operating playbook for agent/dev sessions: rules, session checklist, smoke tests, pitfalls, security |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, IPC channel map, settings schema, updater state machine |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Provider layer, request shapes, mask semantics, how to add a provider |
| [docs/RELEASE.md](docs/RELEASE.md) | Tag-driven release routine (versions, CI, updater assets, rollback) |
| [docs/BUILD.md](docs/BUILD.md) | Dev setup, installer assets, packaging config, CI walkthrough |
| [docs/SPEC.md](docs/SPEC.md) | Product spec: views, behaviors, provider-adaptive matrix, privacy |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned releases and decision log |
| [CHANGELOG.md](CHANGELOG.md) | What shipped in every version |

## Providers (v0.0.2)

| Provider | Type | Key | Image models |
|---|---|---|---|
| **OpenAI** | Direct API | `sk-…` from platform.openai.com | gpt-image-1, gpt-image-1-mini |
| **AI Pass** | OpenAI-compatible wallet (`https://aipass.one/v1`) | `sk-aikey-…` from the Developer Dashboard | gpt-image-1, dall-e-3 and more (model list is fetched live from the proxy) |
| **Google Gemini** | Gemini API | `AIza…` from aistudio.google.com/apikey | Nano Banana 2.1, Flash Lite Image, Flash Image, Nano Banana Pro (1K/2K/4K) |

Switch providers any time from the pill at the top of the window — each provider keeps its own encrypted key and its own default model. Aspect ratio, quality/resolution and background options adapt automatically to what the active provider supports.

## Features

| | |
|---|---|
| **Create** | Text-to-image with aspect ratio, quality/resolution, image count and transparent-background support (where available). |
| **Edit** | Paint a mask over any area and describe the change — inpainting, object removal, background removal and quick presets. For Google (no mask input) the painted area is sent as a magenta cover and replaced per your prompt. |
| **Image to Image** | Feed up to 3 reference images and describe the new look — style transfer, outfits, scenes. |
| **Gallery** | Every result is saved locally with its prompt, provider, model and settings. Save as, open, delete or reuse a prompt in one click. |
| **Updates** | Built-in updater (electron-updater): checks GitHub releases at startup, downloads in-app with a progress bar and installs via the standard wizard. Check manually from **Settings → Updates**. |
| **Settings** | Bring your own keys. Each key is encrypted with Windows DPAPI and never leaves your device except to call the selected provider directly. |

## Getting started

### 1. Download the installer

Grab `SunStudio-Setup-x.y.z.exe` from the [Releases](https://github.com/rexteamiran/Sun-Studio/releases) page, or build it yourself (below). The installer lets you pick the install folder, creates a desktop shortcut and offers to launch the app right away. Installed apps update themselves from this releases page.

### 2. Add a provider key

1. Pick a provider in the top bar (OpenAI, AI Pass or Google Gemini)
2. Open **Settings**, paste the key under **Providers**, press **Save**
3. Press **Test** — you should see *Connection successful*
4. Press **Use provider** (or just keep it active from step 1)

> Image generation is billed by the provider to **your** account — check current pricing on the provider's pricing page.

### 3. Create something

Type a prompt in **Create** and hit **Generate**. Results appear in seconds-to-a-minute and are stored in **Gallery** automatically.

## Development

Requirements: **Node.js 20+** and npm.

```bash
npm install
npm start        # run the app in dev mode
npm run dist     # build the Windows NSIS installer into dist/
```

The installer is configured in `electron-builder.yml` (assisted NSIS wizard, license page, custom sidebar art, desktop + start menu shortcuts, GitHub publish metadata for the in-app updater).

## Building from CI

Pushing a tag like `v0.0.3` triggers the GitHub Actions workflow in `.github/workflows/build.yml`, which builds the installer on `windows-latest` and attaches the setup EXE, `latest.yml` and `.blockmap` to a GitHub release — exactly the files the in-app updater needs for automatic updates.

## Privacy & security

- API keys are stored encrypted on this device (Windows DPAPI via Electron `safeStorage`) and are only decrypted in the main process to sign requests to the selected provider (`api.openai.com`, `aipass.one` or `generativelanguage.googleapis.com`).
- Prompts and images are sent **directly** from your machine to the active provider. Sun Studio runs no server and collects no telemetry.
- Generated images and history live in `%APPDATA%/Sun Studio/` on your disk.

## Roadmap

- v0.0.3 — more providers behind the same UI (Stability, fal.ai), batch export, prompt library
- v0.1 — drag & drop from Explorer, per-project galleries, auto-update channel with prereleases

## License

Apache-2.0 — see [LICENSE](LICENSE).
