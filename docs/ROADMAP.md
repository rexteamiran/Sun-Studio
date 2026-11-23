# Roadmap

Living document — when you ship a milestone, move leftovers here and note decisions in
`CHANGELOG.md`. Keep scope per release small (one theme + fixes) so the tag-driven release
routine stays boring.

## v0.0.8 — next candidates
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
