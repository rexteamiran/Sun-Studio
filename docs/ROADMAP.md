# Roadmap

Living document — when you ship a milestone, move leftovers here and note decisions in
`CHANGELOG.md`. Keep scope per release small (one theme + fixes) so the tag-driven release
routine stays boring.

## v0.0.6 — next candidates
- More providers on the same layer (Stability AI, fal.ai, OpenRouter) — see
  `docs/PROVIDERS.md` § "Adding a provider"; each is one registry entry + client + mirror.
- Batch export from Gallery (zip or folder pick).
- Prompt library (save/favorite prompts locally, insert into Create).
- UI language toggle (English / فارسی) — strings currently live inline in `index.html`/`app.js`;
  factor them into a small dictionary first.

## v0.1 — bigger moves
- Drag & drop images from Explorer into Edit / Image to Image.
- Per-project galleries (subfolders + switcher).
- Prerelease update channel (`allowPrerelease` + `vX.Y.Z-beta` tags).
- Signed installer (EV/OV certificate) to kill SmartScreen warnings.
- Portable build in the release alongside the setup exe (script exists: `npm run dist:portable`).

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
