# Sun Studio

**AI image studio for Windows.** Generate, edit and restyle images with state-of-the-art OpenAI image models — through your own API key. Sun Studio ships with no AI inside; it connects to OpenAI through the official API, so you always use your own account, your own limits and your own data.

## Features

| | |
|---|---|
| **Create** | Text-to-image with aspect ratio, quality, image count and transparent-background support (gpt-image-1). |
| **Edit** | Paint a mask over any area and describe the change — inpainting, object removal, background removal and quick presets. |
| **Image to Image** | Feed up to 3 reference images and describe the new look — style transfer, outfits, scenes. |
| **Gallery** | Every result is saved locally with its prompt, model and settings. Save as, open, delete or reuse a prompt in one click. |
| **Settings** | Bring your own OpenAI key. It is encrypted with Windows DPAPI and never leaves your device except to call `api.openai.com` directly. |

## Getting started

### 1. Download the installer

Grab `SunStudio-Setup-x.y.z.exe` from the [Releases](https://github.com/rexteamiran/Sun-Studio/releases) page, or build it yourself (below). The installer lets you pick the install folder, creates a desktop shortcut and offers to launch the app right away.

### 2. Add your OpenAI API key

1. Create a key at https://platform.openai.com/api-keys
2. Open **Sun Studio → Settings**, paste the key, press **Save key**
3. Press **Test connection** — you should see *Connection successful*

> Image generation is billed by OpenAI to **your** account. As a rule of thumb, one medium-quality 1024×1024 image costs a few cents — check current pricing on the OpenAI pricing page.

### 3. Create something

Type a prompt in **Create** and hit **Generate**. Results appear in seconds-to-a-minute and are stored in **Gallery** automatically.

## Development

Requirements: **Node.js 20+** and npm.

```bash
npm install
npm start        # run the app in dev mode
npm run dist     # build the Windows NSIS installer into dist/
```

The installer is configured in `electron-builder.yml` (assisted NSIS wizard, license page, custom sidebar art, desktop + start menu shortcuts).

## Building from CI

Pushing a tag like `v0.0.2` triggers the GitHub Actions workflow in `.github/workflows/build.yml`, which builds the installer on `windows-latest`, uploads it as a workflow artifact and attaches it to a GitHub release.

## Privacy & security

- The API key is stored encrypted on this device (Windows DPAPI via Electron `safeStorage`) and is only decrypted in the main process to sign requests to `api.openai.com`.
- Prompts and images are sent **directly** from your machine to OpenAI. Sun Studio runs no server and collects no telemetry.
- Generated images and history live in `%APPDATA%/Sun Studio/` on your disk.

## Roadmap

- v0.0.2 — more providers (Stability, Google Imagen) behind the same UI, batch folders export
- v0.1 — brush-size memory, prompt library, drag & drop from Explorer, auto-update channel

## License

Apache-2.0 — see [LICENSE](LICENSE).
