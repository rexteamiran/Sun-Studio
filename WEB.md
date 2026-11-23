# Run Sun Studio (web edition)

Sun Studio is a local web studio for AI image generation. It runs on **your**
machine, binds to `127.0.0.1` only, and calls the providers you connect with
**your** keys. No AI inside, no accounts, no telemetry.

## Requirements

- **Node.js 20.9+** (24 recommended) — <https://nodejs.org>

## Run

1. Unzip this archive anywhere.
2. Run the launcher:
   - Windows: double-click `start-web.bat` (or `node server.js`)
   - macOS / Linux: `./start-web.sh`
3. Open <http://127.0.0.1:3570> in your browser.

## Connect a provider

Open **Settings → API connection**, pick a provider (OpenAI, AI Pass, kie.ai,
Google Gemini, or your own OpenAI-compatible endpoint), paste the key and press
**Save key**, then **Test** — a doctor-style line tells you if the connection is
healthy. Keys are stored in `data/secrets.env` on this machine (mode 0600) and
referenced by env names like `SUN_KEY_KIE` — they never touch the browser.

## Data

Everything lives in the `data/` folder next to `server.js`:

- `data/settings.json` — non-secret settings (provider, models, theme)
- `data/secrets.env`  — your API keys (0600, never synced anywhere)
- `data/gallery/`     — generated images + metadata

Override the location with the `SUN_STUDIO_DATA` environment variable; change
the port with `PORT` (default 3570).
