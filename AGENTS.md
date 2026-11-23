# AGENTS.md — playbook for agent sessions working on Sun Studio

This file is the operating manual for AI agent sessions (and humans) continuing work on this repo.
Read it at the start of every session, then follow the pointers into `docs/`.

## Mission

Sun Studio is a **bring-your-own-key (BYOK)** **local web app** for AI image work: **Create**
(text→image), **Edit** (mask painting + inpainting), **Restyle** (reference-based restyling),
**Gallery**, **Settings**. As of v0.0.7 it is **not** an Electron app — it is a Next.js 16 + React 18
web studio (mirroring the nexu-io/open-design stack) served on `127.0.0.1` by its own Node server.

Non-goals — never break these:
- **No AI inside.** The app has no models; it calls provider APIs directly with the user's keys.
- **No accounts, no telemetry.** Keys live in `data/secrets.env` (0600) on the user's machine.
- **Secrets never reach the browser.** The UI gets only `{hasKey, hint, keyEnv}` per provider.
- Requests go **only** to the configured provider's own API base URL (built-ins or a user-added
  custom OpenAI-compatible endpoint), from the server side.
- The server binds to **127.0.0.1 only** — never `0.0.0.0`.

## Stack & rules

| Thing | Choice |
|---|---|
| Framework | **Next.js 16.2.6 + React 18.3.1 + Tailwind CSS 4** (the exact open-design versions — React 18 is pinned deliberately) |
| Language | TypeScript everywhere (`app/`, `components/`, `src/server/`) |
| Server layer | `src/server/` — provider clients, store, secrets, gallery, service singletons |
| API | Next.js route handlers under `app/api/*` (all `runtime = "nodejs"`, `dynamic = "force-dynamic"`) |
| UI | `components/*.tsx` client components; theme via CSS vars in `app/globals.css` (`data-theme`, default **mono**) |
| Secrets | **Hermes pattern**: `data/settings.json` (no keys) + `data/secrets.env` (`SUN_KEY_*`, 0600, re-read live). Custom endpoints: `SUN_KEY_CUSTOM_<8-hex of URL>` |
| Client tests | `npm run test:clients` → `scripts/test-clients.ts` (local mock server, no network) |
| E2E mock | `scripts/e2e-mock-openai.js` — tiny OpenAI-compatible server for full-flow checks |
| Release | tag `vX.Y.Z` → CI builds `.next/standalone` → `SunStudio-Web-vX.Y.Z.zip` (see `docs/RELEASE.md`) |

Golden rules:
1. UI text is **English**; replies to the user in chat are **Persian**.
2. Registry entries live **once**: `src/server/providers/registry.ts` is the source of truth and the
   UI receives everything via `/api/bootstrap` — do **not** re-mirror metadata in components
   (v0.0.7 removed the old Electron-era renderer mirror duplication).
3. Every provider client returns **base64 strings**; `gallery.saveBuffer()` does the format sniffing.
4. TypeScript is strict — `npx tsc --noEmit` must stay clean; `npm run build` type-checks again.

## Session checklist

1. `git fetch` + `git status` — make sure you are in sync before editing.
2. `npx tsc --noEmit` after every server-layer change.
3. `npm run test:clients` after touching `src/server/providers/*`.
4. For UI work: `npm run dev` (or `build && start`) + agent-browser screenshots (below).
5. Docs live in `docs/` — update ARCHITECTURE/PROVIDERS when the shape changes, CHANGELOG for any
   shipped behavior, ROADMAP decision log for decisions.

## Smoke tests (headless)

```bash
npm run build
nohup npm run start > /tmp/sun-server.log 2>&1 & disown; sleep 6
curl -s http://127.0.0.1:3570/api/bootstrap | python3 -m json.tool | head   # provider list
agent-browser set viewport 1440 960
agent-browser open http://127.0.0.1:3570
# walk the tabs and screenshot each: Create / Edit / Restyle / Gallery / Settings
agent-browser find text "Settings" click && agent-browser screenshot --full /tmp/render/s.png
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
- **React 18 is pinned** with Next 16 — do not "upgrade" React to 19 casually; the combo matches
  open-design and builds clean (npm may warn about peer ranges; harmless).
- **Google client is test-aware**: pass `baseUrl` to point it at a mock; default stays the real API.
- **Standalone zip**: `.next/static` and `public` must be copied into the bundle or the UI loads
  without CSS (see the assemble step in `build.yml`).
- Never print or commit the GitHub token; use `/home/z/my-project/.secrets/ghtoken` via env.

## Security rules

- Never log or echo key values; the UI shows only `hint` (first6…last4).
- `secrets.ts` enforces mode 0600 on every write; `data/` is git-ignored.
- Provider clients throw `ProviderError(message, status)`; routes map them to `{error}` with the
  provider's own message preserved (never a bare HTTP code).
