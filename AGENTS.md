# AGENTS.md — playbook for agent sessions working on Sun Studio

This file is the operating manual for AI agent sessions (and humans) continuing work on this repo.
Read it at the start of every session, then follow the pointers into `docs/`.

## Mission

Sun Studio is a **bring-your-own-key (BYOK)** Windows app for AI image work: **Create**
(text→image), **Edit** (mask painting + inpainting), **Restyle** (reference-based restyling),
**Gallery**, **Settings**. Since v0.0.8 the product is a **minimal Electron 45 shell around the
Next.js 16 + React 18 studio** (the open-design stack): the shell boots the Next standalone
server on `127.0.0.1`, opens a window on it, migrates v0.0.6 desktop data on first run, and
keeps electron-updater alive. The user's deliverable is the **NSIS installer** — releases are
`SunStudio-Setup-X.Y.Z.exe` + `latest.yml` + `.blockmap`; a bare zip is NOT acceptable.

Non-goals — never break these:
- **No AI inside.** The app has no models; it calls provider APIs directly with the user's keys.
- **No accounts, no telemetry.** Keys live in `data/secrets.env` (0600) on the user's machine.
- **Secrets never reach the UI/browser.** The UI gets only `{hasKey, hint, keyEnv}` per provider.
- Requests go **only** to the configured provider's own API base URL (built-ins or a user-added
  custom OpenAI-compatible endpoint), from the server side.
- The server binds to **127.0.0.1 only** — never `0.0.0.0`.
- **The v0.0.6→new updater path is sacred**: same appId/productName (NSIS over-install), GitHub
  Releases feed with `latest.yml` + `.blockmap` on every tag, and the v3→v4 data migration must
  stay idempotent and lossless.

## Stack & rules

| Thing | Choice |
|---|---|
| UI framework | **Next.js 16.2.6 + React 18.3.1 + Tailwind CSS 4** (the exact open-design versions — React 18 is pinned deliberately) |
| Desktop shell | **Electron 45** (`electron/main.cjs`, CommonJS): spawns the Next standalone server via `ELECTRON_RUN_AS_NODE`, picks a free port (3570 preferred), opens a **frameless** window (`frame: false`) with a custom dark title bar (`components/TitleBar.tsx` + `electron/preload.cjs` IPC: `win:minimize/maximize/close`) |
| Packaging | electron-builder → assisted NSIS, `asar: false` (the node child must read `server/`), appId `com.rexteamiran.sunstudio`, productName `Sun Studio` |
| Updates | electron-updater (must stay in **`dependencies`**); feed lives in `electron-builder.yml` (`publish: github rexteamiran/Sun-Studio`) — **never add a `build` field to package.json**: electron-builder then ignores the yml and silently loses asar:false, the electron/ + server/ file selection and the `SunStudio-Setup-*` artifact name (a plain node child cannot read server/ from inside an asar — the app would not boot). `electron/updater.cjs` (v0.0.12): normalizes the `win` getter from main.cjs (passing the getter and calling `.isDestroyed()` on it crashed every update event — the v0.0.10/11 "updater does not work" bug), falls back to `setFeedURL` when `resources/app-update.yml` is missing, gates the background auto-check on `app.isPackaged` (`SUN_UPDATE_CHECK_DELAY` overrides the 8 s delay), and exposes `update:*` IPC incl. `update:open-releases` (manual escape hatch button in Settings → Updates). State flows to `components/useUpdater.ts` → sidebar chip + Settings section; regression suite: `npm run test:updater` |
| Migration | `electron/migrate.cjs` — v0.0.6 `settings.json` v3 (DPAPI keys) + `gallery/` → v5 Hermes layout in `userData/data` (adds `enabledProviders` seeded from the active provider + every legacy key owner); idempotent, legacy files untouched; retired theme ids (`mono`/`dark`) → `studio` |
| Server layer | `src/server/` (TypeScript) — provider clients, store, secrets, gallery, service singletons. v0.0.11: providers are user-managed (`PROVIDER_CATALOG` = 16 famous providers + `store.enabledProviders`, settings schema v5), per-provider user models in `store.extraModels`, live fetch via `client.listModels()`; OpenRouter + Stability are built-in clients |
| API | Next.js route handlers under `app/api/*` (all `runtime = "nodejs"`, `dynamic = "force-dynamic"`) |
| UI | `components/*.tsx` client components; theme via CSS vars in `app/globals.css` (`data-theme`, default **studio** = dark SaaS: charcoal-green + green accent) |
| Secrets | **Hermes pattern**: `data/settings.json` (no keys) + `data/secrets.env` (`SUN_KEY_*`, 0600, re-read live). Custom endpoints: `SUN_KEY_CUSTOM_<8-hex of URL>` |
| Tests | `npm run test:clients` (provider shapes) + `node scripts/test-migration.cjs` (v3→v4) + `scripts/e2e-mock-openai.js` (full flow) |
| Release | tag `vX.Y.Z` → windows-latest CI → NSIS exe + latest.yml + blockmap (see `docs/RELEASE.md`) |

Golden rules:
1. Project-maintained content is **English-only** (see the policy below); replies to the user in chat are **Persian**.
2. Registry entries live **once**: `src/server/providers/registry.ts` is the source of truth and the
   UI receives everything via `/api/bootstrap` — do **not** re-mirror metadata in components.
3. Every provider client returns **base64 strings**; `gallery.saveBuffer()` does the format sniffing.
4. TypeScript is strict — `npx tsc --noEmit` must stay clean; `npm run build` type-checks again.
5. Installer art + versions move together: `scripts/gen_assets.py` sidebar text, `package.json`,
   `src/server/service.ts APP_VERSION`, CHANGELOG.

## English-only project policy

All project-maintained content must be in English: source code identifiers where language-bearing,
comments, UI copy, documentation, filenames, test descriptions and fixtures, commit messages,
issues, and pull requests. Do not add Persian words to the project. Keep user-facing chat replies
in Persian; that does not permit non-English content in the repository or GitHub contributions.

Audit existing tracked content during the current 0.0.x polish and bug-fixing phase and resolve
violations through reviewed changes. This policy does not claim that a repository-wide language
audit has passed. It supersedes earlier roadmap requirements for Persian UI or Persian sample
text; generic text-editing functionality remains in scope. See the
[approved roadmap](docs/ROADMAP.md) for stage gates and authorization limits.

## Session checklist

1. `git fetch` + `git status` — make sure you are in sync before editing.
2. `npx tsc --noEmit` after every server-layer change.
3. `npm run test:clients` after touching `src/server/providers/*`; `node scripts/test-migration.cjs`
   after touching `electron/migrate.cjs`.
4. For UI work: `npm run dev` (or `build && start`) + agent-browser screenshots (below).
5. For shell work: the Electron smoke (below) under Xvfb — look at the captured PNG.
6. Docs live in `docs/` — update ARCHITECTURE/PROVIDERS when the shape changes, CHANGELOG for any
   shipped behavior, ROADMAP decision log for decisions.

## Smoke tests (headless)

Browser-side UI (same views the Electron window loads):

```bash
npm run build
nohup npm run start > /tmp/sun-server.log 2>&1 & disown; sleep 6
curl -s http://127.0.0.1:3570/api/bootstrap | python3 -m json.tool | head   # provider list
agent-browser set viewport 1440 960
agent-browser open http://127.0.0.1:3570
agent-browser find text "Settings" click && agent-browser screenshot --full /tmp/render/s.png
```

Packaged-app shell (window + server spawn + real migration):

```bash
npm run build && npm run prepare:electron
# legacy v0.0.6 userData fixture at /tmp/sun-legacy-ud (settings.json v3 + gallery/)
(nohup Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp >/tmp/xvfb.log 2>&1 & disown); sleep 1.5
SUN_USER_DATA=/tmp/sun-legacy-ud SUN_SMOKE=1 SUN_SHOT=/tmp/render/sun-electron.png \
  SUN_NO_UPDATER=1 DISPLAY=:99 ./node_modules/.bin/electron . --no-sandbox 2>/dev/null | grep SMOKE
# expect: SMOKE ok — url=http://127.0.0.1:3570/  + data/ migrated under the fixture dir
```

Full-flow e2e without any real key:

```bash
node scripts/e2e-mock-openai.js 3990 &
curl -s -X POST localhost:3570/api/custom-providers -H 'Content-Type: application/json' \
  -d '{"action":"save","provider":{"label":"Mock","baseUrl":"http://127.0.0.1:3990/v1","models":["mock-img"],"key":"sk-mock"}}'
# switch provider to the new custom id (see /api/bootstrap), then:
curl -s -X POST localhost:3570/api/generate -H 'Content-Type: application/json' \
  -d '{"prompt":"test","aspect":"1:1","n":1}'            # → { items: [{id,url}] }
curl -s "localhost:3570/api/gallery/file/<id>" -o /tmp/out.png   # → valid PNG bytes
```

## Pitfalls (learned the hard way)

- **Next 16 route params are async**: `ctx.params` is a `Promise` — `await` it
  (`app/api/gallery/file/[id]/route.ts`).
- **`collectImageBlocks` heuristic**: image payloads shorter than 1024 chars are ignored by design;
  test fixtures must pad their fake base64 (see `scripts/test-clients.ts`).
- **kie.ai returns HTTP 200 for everything** — always check the body `code` (`KieClient._checkBody`).
- **Input field names differ per kie.ai family**: `image_input` / `image_urls` / `input_urls` —
  never normalize them; the recipes in `kie.ts` are transcribed from docs.kie.ai.
- **kie.ai File Upload API lives on its own base** — `https://kieai.redpandaai.co`
  (`/api/file-base64-upload`); api.kie.ai 404s that path (v0.0.13). `KieClient._uploadBase()`
  keeps a custom baseUrl (proxy) for uploads.
- **kie.ai createTask validation requires `input.aspect_ratio`** on every job model except
  `grok-imagine/image-to-image` — never ship an aspect-less recipe for a new model id (v0.0.13).
- **React 18 is pinned** with Next 16 — do not "upgrade" React to 19 casually; the combo matches
  open-design and builds clean (npm may warn about peer ranges; harmless).
- **Google client is test-aware**: pass `baseUrl` to point it at a mock; default stays the real API.
- **asar must stay false**: the standalone server runs as a plain node child — it cannot read
  inside an asar archive. `server/` is assembled by `scripts/prepare-electron.mjs`; forgetting the
  `.next/static` copy loads the UI without CSS.
- **No `public/` dir exists** (favicon is `app/icon.png`) — CI copy steps must guard for it.
- **Pipes mask exit codes**: `node script | tail` swallows a crashed script's failure — check
  `$?` of the node process, not tail's.
- **safeStorage in migration**: decrypt may throw OR return empty — both must fall back to the
  legacy `plain` value (v0.0.6 stored plain when DPAPI was unavailable).
- Never print or commit the GitHub token; use `/home/z/my-project/.secrets/ghtoken` via env.

## Security rules

- Never log or echo key values; the UI shows only `hint` (first6…last4).
- `secrets.ts` + `migrate.cjs` enforce mode 0600 on `secrets.env`; `data/` is git-ignored.
- Provider clients throw `ProviderError(message, status)`; routes map them to `{error}` with the
  provider's own message preserved (never a bare HTTP code).
