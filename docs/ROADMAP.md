# Roadmap

Living document — when you ship a milestone, move leftovers here and note decisions in
`CHANGELOG.md`. Keep scope per release small (one theme + fixes) so the tag-driven release
routine stays boring.

## v0.0.11 — next candidates
- Live task progress for kie.ai (SSE stream of poll states) — v0.0.7 kept the simple
  request/response shape; the client already accepts `onStage`.
- Batch export from Gallery (zip download) and prompt library (save/favorite locally).
- More providers on the same layer (Stability AI, fal.ai, OpenRouter) — see
  `docs/PROVIDERS.md` § "Adding a provider".
- Docker image + optional localhost auth token for shared machines.

## v0.1 — bigger moves
- Drag & drop images from Explorer into Edit / Restyle.
- Per-project galleries (subfolders + switcher).
- Desktop shell again (Tauri) around the same Next.js UI, if a native feel is ever needed.

## Backlog ideas
- Local gallery search/filter (prompt, provider, date).
- Embed prompt + settings into exported PNG metadata (tEXt chunks) and re-import it.
- Multi-monitor-friendly viewer, zoom/pan in the modal.
- Accessibility pass (keyboard nav for all actions, screen-reader labels).

## Decision log
- 2026-11-21 — v0.0.1: NSIS assisted installer, OpenAI-only, DPAPI key storage.
- 2026-11-21 — v0.0.2: provider layer generalized (registry + mirror constant); Google via
  Interactions API with legacy fallback (upstream may deprecate shapes — `collectImageBlocks`
  is deliberately tolerant); updater = electron-updater + GitHub Releases with
  `latest.yml` + `.blockmap` in every release.
- 2026-11-21 — v0.0.3: custom (BYO-endpoint) providers stored in settings v3 and merged into
  the registry at runtime; AI Pass made the default (recommended, $1 free credit); frameless
  window with fully custom chrome — native menu removed; OpenAI-compatible responses may return
  image URLs — clients download them instead of failing.
- 2026-11-21 — v0.0.4: provider error bodies are parsed in full (`error.message` / `message` /
  plain text) instead of leaking bare HTTP codes; 402 became actionable with a per-provider
  `billingUrl`, and toasts render clickable external links.
- 2026-11-21 — v0.0.5: the entire palette moved to CSS variables with six themes
  (sunset/ember/ocean/forest/violet/paper) switchable in Settings → Appearance and persisted in
  the store; Create gained a searchable model picker with badges; dall-e-3 added for OpenAI.
- 2026-11-21 — v0.0.6: kie.ai added as the first job-based (async) provider — `src/main/kie.js`
  polls `recordInfo` and normalizes nine documented models into the existing UI (per-family
  input recipes + credit balance in `testKey`); masked Edit reuses the magenta-cover trick.
- 2026-11-23 — v0.0.7: migrated to a local web app — Next.js 16.2.6 + React 18.3.1 + Tailwind 4
  (the exact nexu-io/open-design versions), Electron removed; keys moved to a Hermes-style
  `data/secrets.env` (0600, env-name references, URL-hash names for custom endpoints) and never
  cross into the browser; server binds 127.0.0.1 only; release = standalone web zip (no installer,
  no updater); UI redesigned monochrome (`mono` default + `midnight`) with a new B/W logomark.
- 2026-11-23 — v0.0.8: user feedback reversed the v0.0.7 packaging call — the deliverable is the
  **Windows NSIS installer** again. The v0.0.7 studio ships unchanged inside a minimal Electron 45
  shell (server child process + window + electron-updater); same appId/productName as v0.0.6 so
  the old updater upgrades in place; one-shot v3→v4 data migration keeps keys/settings/gallery
  (legacy files untouched); releases carry exe + latest.yml + blockmap again.
- 2026-11-23 — v0.0.9: user feedback again — the light monochrome default and the native Windows
  frame read as "not commercial". Redesign: **frameless window** + custom dark title bar
  (caption buttons over a sandboxed preload bridge), default theme **Studio Dark**
  (near-black + amber accent), v0.0.6 dark themes restored with refined palettes, mono→dark
  mapping in migration, empty-states + affordance polish across all views. The installer/updater
  path is untouched.
- 2026-11-23 — v0.0.13: kie.ai field reports — (1) edit flow 404: the File Upload API lives on
  https://kieai.redpandaai.co (its own base per docs.kie.ai/file-upload-api/quickstart), not
  api.kie.ai (both /api and /api/v1 paths 404 there — reproduced by probe); (2) "aspect_ratio is
  required" 422: legacy nano-banana + custom model ids fell through to an aspect-less recipe.
  Uploads now target the upload service, aspect_ratio is always sent (opt-out stays grok i2i),
  Spring-style error bodies are reformatted, +2 regression tests (clients suite at 18).
- 2026-11-23 — v0.0.12: user report "the updater does not work" — root cause: `initUpdater`
  receives a `win` getter but called `.isDestroyed()` on it; the first updater event threw a
  TypeError that killed the check → download pipeline before any state reached the UI (the feed
  itself was fine — `electron-builder.yml` always carried publish and baked app-update.yml).
  Fixed the getter handling; added a runtime `setFeedURL` fallback when app-update.yml is missing,
  packaged-only auto-check, an "Open releases page" escape hatch in Settings → Updates, and a
  10-check mocked updater suite (`npm run test:updater`). Verified packaging via local
  electron-builder --dir (app-update.yml + unpacked electron//server/). Also caught a trap the
  hard way: adding a `build` field to package.json makes electron-builder ignore electron-builder.yml
  (asar:true + wrong file selection + default artifact name) — first v0.0.12 tag was re-cut for it.
- 2026-11-23 — v0.0.11: user directives — (1) providers became user-managed: a 16-provider
  **directory** in Settings (OpenAI/Google removable like everything else), settings schema v5
  with `enabledProviders` (+ migration seeds it with every legacy key owner); (2) **custom models
  on every provider** with removable chips; (3) **fetch models** — live `/models` pull into a
  searchable add-list (needs a saved key); (4) technical chrome texts ("Local server · 127.0.0.1"
  etc.) removed in favor of provider-connection state; (5) commercial polish: label contrast,
  Gallery "Getting started" panel, Edit how-it-works panel, footer-safe spacing. New built-in
  clients: OpenRouter Image API + Stability Stable Image API (verified against current docs).
- 2026-11-23 — v0.0.10: user supplied reference screens and three directives. (1) The updater is
  now **visible and always on** — Settings → Updates section + sidebar status chip, state pushed
  over `update:*` IPC from the rewritten updater wrapper. (2) The whole brand is **strictly B/W**
  — app icon and NSIS art regenerated as the white line logomark on black. (3) The UI adopts the
  reference language: dark SaaS dashboard with a left sidebar, charcoal-green layered surfaces,
  vivid green accent with glow, glassy pills; default theme renamed **Studio**; themes
  rationalized (Studio / Midnight / Sunset / Violet / Paper) with retired ids mapped in migration.
