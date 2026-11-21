# AGENTS.md — playbook for agent sessions working on Sun Studio

This file is the operating manual for AI agent sessions (and humans) continuing work on this repo.
Read it at the start of every session, then follow the pointers into `docs/`.

## Mission

Sun Studio is a **bring-your-own-key (BYOK)** Windows desktop app (Electron) for AI image work:
**Create** (text→image), **Edit** (mask painting + inpainting), **Image to Image** (reference-based
restyling), **Gallery**, **Settings**, **in-app updater**.

Non-goals — never break these:
- **No AI inside.** The app has no models; it calls provider APIs directly with the user's keys.
- **No server, no accounts, no telemetry.** Keys live encrypted on the device (Windows DPAPI).
- Requests go **only** to the configured provider's own API base URL (built-ins or a user-added
  custom OpenAI-compatible endpoint).

## Stack & rules

| Thing | Choice |
|---|---|
| Runtime | Electron 45, CommonJS (`require`) everywhere, Node 22 in CI |
| Renderer | Vanilla HTML/CSS/JS — **no frameworks, no bundler, no build step**; frameless window with custom title bar (no native menu) |
| Packaging | electron-builder → NSIS installer (`npm run dist`) |
| Updates | electron-updater (must stay in **`dependencies`**, not devDependencies — it ships in the app) |
| Installer art | `scripts/gen_assets.py` (Python + Pillow) generates `build/` assets |
| Static check | `node --check` on every changed JS file before commit — there is no linter |

Golden rules:
1. UI text is **English**; replies to the user in chat are **Persian**.
2. `src/renderer/app.js` has a `PROVIDERS_META` constant that **must mirror** `src/main/providers.js`
   (built-ins only — user-created custom providers are mapped by `customMetas()` on both sides).
   If you change one, change both.
3. The version string lives in **three places** you must bump together:
   `package.json`, `scripts/gen_assets.py` (the `center("v0.0.x", …)` line), and `CHANGELOG.md`.
4. Never print, commit or store the GitHub token (see *Security*).
5. Test what you can: smoke-test every view after renderer changes (see below). Provider API calls
   cannot be live-tested without real keys — rely on documented request shapes and friendly errors.
6. New IPC channels touch **three** places: `ipcMain.handle` in `main.js`, the `contextBridge`
   wrapper in `preload.js`, and the mock API in `app.js` (so the UI still previews in a browser).

## Repo layout

```
src/main/     main.js (frameless window, NO app menu, IPC, smoke hook) · store.js (settings v3,
              DPAPI keys, custom providers) · providers.js (registry + customToMeta)
              openai.js (OpenAI-compatible client) · google.js (Gemini client)
              gallery.js · updater.js (electron-updater wrapper)
src/preload/  preload.js — contextBridge API `window.sun` (the ONLY bridge)
src/renderer/ index.html · styles.css (v0.0.3 theme, custom titlebar) · app.js (all UI logic)
scripts/      gen_assets.py — installer icons/bitmaps/license (version text lives here)
build/        generated installer assets (committed)
dist/         build output (gitignored)
docs/         ARCHITECTURE.md · PROVIDERS.md · RELEASE.md · BUILD.md · SPEC.md · ROADMAP.md
.github/workflows/build.yml — Windows NSIS build + GitHub Release on tags v*
```

## Session start checklist

```bash
cd /home/z/my-project/sun-studio
TOK=$(cat /home/z/my-project/.secrets/ghtoken)
git fetch "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" refs/heads/main:refs/remotes/origin/main
git status --short --branch          # should be clean and level with origin/main
git log --oneline -5
```

Then read `CHANGELOG.md` (what shipped last) and `docs/ROADMAP.md` (what's next).

> **Gotcha:** pushing with the token URL (`git push https://x-access-token:$TOK@…`) does **not**
> update `refs/remotes/origin/main`, so `git status` can show a false `[ahead N]`. Fix the ref with
> the `git fetch …:refs/remotes/origin/main` line above, or verify truth via the API:
> `curl -H "Authorization: Bearer $TOK" https://api.github.com/repos/rexteamiran/Sun-Studio/commits/main`

## Common tasks

### Run in dev
```bash
npm start          # or: ./node_modules/.bin/electron . --no-sandbox (in a headless sandbox use Xvfb)
```

### Smoke-test the UI (all five views, headless)
```bash
nohup Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp >/tmp/xvfb.log 2>&1 & disown; sleep 1.5
for v in create edit restyle gallery settings; do
  DISPLAY=:99 SUN_SMOKE=1 SUN_VIEW=$v SUN_SHOT=/tmp/render/sun-$v.png ./node_modules/.bin/electron . --no-sandbox 2>/dev/null | grep -E "SMOKE|Error"
done
```
Expect `SMOKE_OK` for each view, then look at the PNGs (low-res zoom, don't re-render hi-res).
The hook lives in `src/main/main.js` under `process.env.SUN_SMOKE === '1'` and clicks the view,
screenshots it, and exits.

### Add a provider
Follow `docs/PROVIDERS.md` § "Adding a provider" — registry entry, client class, renderer mirror,
docs/CHANGELOG updates, smoke test, patch release.

### Release a version
Follow `docs/RELEASE.md` — bump versions, smoke, commit, push main, tag `vX.Y.Z`, watch Actions,
verify the release has `exe + latest.yml + .blockmap`, download the installer into
`/home/z/my-project/download/` as the deliverable.

## Security

- GitHub token: `/home/z/my-project/.secrets/ghtoken` (outside the repo). Use it only inline as
  `$(cat /home/z/my-project/.secrets/ghtoken)`; never echo it, never write it into files or
  `.git/config`. Ask the user to rotate it if it ever appeared in a chat.
- User API keys: encrypted at rest (`safeStorage`/DPAPI) by `store.js`; decrypted only in the main
  process; never logged. Errors surfaced to the UI must never include the key.
- The renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`); everything crosses
  the bridge in `src/preload/preload.js` — keep it that way.

## Pitfalls (learned the hard way)

- Some OpenAI-compatible endpoints return image **URLs**, not `b64_json` — `openai.js`
  `itemToB64()` downloads them; never assume inline base64 only.
- `electron-updater` in `devDependencies` → updater dies at runtime. It belongs in `dependencies`.
- `scripts/gen_assets.py` version text and `package.json` version disagree → installer shows the
  wrong version; regenerate assets after bumping.
- Forgetting `dist/*.yml` + `dist/*.blockmap` in the release → in-app updater breaks silently.
  The workflow already uploads them; don't remove them.
- Provider metadata is resolved with `providerMeta(id, store.data.customProviders)` in the main
  process and `metaFor(id)` in the renderer — never call the static registry directly, or custom
  providers break.
- Google (Gemini) has **no mask input**: the renderer composites a magenta cover over painted areas
  and prefixes the prompt (`buildCoveredImage` in `app.js`). Keep that path intact when touching Edit.
- OpenAI-compatible masks must be **binary** (opaque black/transparent PNG): `opaqueStrokes()` in
  `app.js` thresholds the painted strokes — keep it before `exportMask()`/cover compositing.
- `dall-e-3` has no edits endpoint and different params (see `openai.js` special-casing).
- Gemini `image_size` values must be **uppercase** `1K/2K/4K`.
- The window is `frame: false` with `Menu.setApplicationMenu(null)` — window controls are IPC
  (`win:min/max/close`); don't re-introduce a native menu.
- The sandbox recycles between messages: processes die, files persist. Never rely on a running
  Xvfb/electron from a previous message; re-start them.
