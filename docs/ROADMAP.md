# Sun Studio Roadmap: 0.0.x to 1.0

## Status and authority

The user approved the staged 0.1-to-1.0 product direction and requested an additional current 0.0.x phase for visual polish and bug fixing. This document records that roadmap. It does not authorize implementation, paid API calls, releases, or changes to other agents. Dates, budgets, staffing, hardware targets, and numerical performance thresholds are not committed. Owners below are proposed, not assigned capacity.

Historical evidence describes Create, Edit, Restyle, Gallery, and Settings at commit 3c0e83405abef6c270a1c20e2b9dedc3ea5b0ff2. This is a historical reference, not verification of current HEAD or runtime behavior. Existing working functionality should be validated and completed rather than rebuilt. Version labels below describe target stages, not claims that features have shipped.

Related documents: [project overview](../README.md), [contribution and agent rules](../AGENTS.md), [product specification](SPEC.md), and [shipped changes](../CHANGELOG.md). Existing descriptions of shipped behavior are not evidence that future roadmap stages are complete.

## English-only project policy

All project-maintained content must be in English: source code identifiers where language-bearing, comments, UI copy, documentation, filenames, test descriptions and fixtures, commit messages, issues, and pull requests. Do not add Persian words to the project. Audit existing tracked content during 0.0.x and resolve any violations through reviewed changes. This policy does not assert that a repository-wide language audit has already passed. Previous roadmap wording that specifically required Persian UI or Persian sample text is superseded by the English-only policy. Generic text-editing functionality remains in scope.

## Product destination

Sun Studio 1.0 is a professional Windows image studio centered on AI, with a simple and an advanced workspace backed by the same editor. The complete journey is: create or import an image, edit with AI, compose layers and text, compare and revise, save a recoverable project, and export publication-ready images.

Use official provider integrations and the user's own API credentials. Keep projects and settings local. Explain that remote AI operations send the required images and prompts to the selected provider. Preserve the existing Windows installation/update path and user data. No hosted application backend, internal account system, telemetry, or cloud synchronization is part of this roadmap.

## Stage 0.0.x - Current visual polish and bug-fixing phase

**Goal:** Improve the appearance and usability of the existing application and systematically find, reproduce, fix, and regression-test defects before beginning feature expansion in 0.1.

**Work packages:**
- Audit every existing screen and state: Create, Edit, Restyle, Gallery, Settings, first launch, loading, empty, success, error, disabled controls, dialogs, and different supported window sizes.
- Establish a coherent visual system for spacing, typography, colors, contrast, icons, buttons, forms, feedback, and navigation. Improve keyboard focus, readable status copy, and basic accessibility without changing frameworks.
- Keep one defect register with reproduction steps, impact, severity, owner, evidence, fix status, and regression coverage. Revalidate historical findings against the current revision before treating them as current defects.
- Investigate and fix security, credential storage, local-service access control, migrations, provider request/mask handling, async test-runner correctness, UI state loss, gallery error/delete handling, installation, and updater defects where reproducible.
- Audit project-maintained content for compliance with the English-only policy.
- Validate the existing generation/editing flows with mocks and automated checks. Paid live requests, local builds, or implementation work require their own valid authorization; this roadmap grants none.

**Exit gate:** The agreed existing-screen checklist is reviewed; no known, confirmed defect remains unresolved or untriaged; fixes have appropriate regression evidence; critical security/data-loss/install/update issues are closed; English-only audit findings are resolved or the phase remains open. A defect that requires a feature redesign must be explicitly resolved with the user, not silently reclassified or deferred. No test campaign can prove the absence of every possible bug; do not claim absolute bug freedom. Improvements continue throughout all later stages.

**Proposed owners:** Sun Studio Team Lead coordinates; UX Designer and Frontend Developer own visual work; Bug Hunter and QA Engineer own discovery and validation; Security & Privacy Engineer, Windows Desktop Engineer, Image API Engineer, and Software Architect own relevant technical areas.

**Dependencies:** Current-revision baseline, a reproducible defect register, and an agreed visual checklist.

**Stop/rollback:** Do not advance to 0.1 with an unmet 0.0.x exit gate. Stop distribution of a faulty package. Preserve a known-good package and data backups; never downgrade across incompatible data formats blindly.

**Out of scope:** New major product features, framework/language rewrites, or claiming implementation has started merely because this plan is recorded.

## Stage 0.1 - Reliable core workflow

**Goal:** Establish the verified baseline for feature growth after 0.0.x, without postponing existing bug fixes to this stage.

**Scope:** Validate and complete image creation/import, gallery persistence, connection settings, explicit pending/success/failure/unknown-result states, draft preservation between views, the distinction between saved credentials and a tested connection, and the actual capability matrix for supported models. Reject incompatible settings before submission. Recheck the security, migration, and test-quality gates established in 0.0.x.

**Acceptance:** Successful generated images persist in the gallery; failures do not erase inputs; an uncertain remote outcome never triggers an automatic billable retry; incompatible options are rejected before dispatch; upgrades preserve prior settings and gallery data.

**Dependency:** 0.0.x exit gate.
**Proposed owners:** Windows Desktop Engineer, Image API Engineer, Security & Privacy Engineer; QA Engineer validates.
**Stop/rollback:** Block release on security, migration, or paid-retry failures; preserve existing data and the known-good package.
**Not included:** Full layered editor or advanced creative tooling.

## Stage 0.2 - Local canvas and essential editing

**Goal:** Prepare images locally without API charges.

**Scope:** Canvas zoom, pan, rotation and fit; crop, resize and custom/preset aspect ratios; brightness, contrast, saturation and color temperature; undo/redo while preserving the source image; basic PNG/JPEG/WebP export; an initial native project format that restores these edits.

**Acceptance:** Local edits make no AI request; reopening a saved project restores its saved editing state; output dimensions and supported transparency are correct; failed saves do not overwrite the last valid project.

**Dependency:** 0.1 and an agreed document/history contract.
**Proposed owners:** Frontend Developer and Software Architect; QA Engineer validates.
**Stop/rollback:** Keep the previous valid save and block rollout on source-image or project corruption.
**Not included:** Full layers, advanced masks, or text composition.

## Stage 0.3 - Precise selection and before/after AI editing

**Goal:** Let users choose an edit region and review results before accepting them.

**Scope:** Brush/lasso selection, add/erase/invert selection, brush size and softness, feathering and mask refinement; AI object removal, addition and replacement; before/after slider and side-by-side comparison; Accept, Reject and Try Again actions.

**Acceptance:** Reject leaves the project unchanged; accepted edits remain undoable; Try Again requires an explicit user action; mask contracts and behavior outside the selected region are tested and provider limitations disclosed. Do not promise pixel preservation where a model cannot guarantee it.

**Dependency:** 0.2 canvas and 0.1 capability contracts.
**Proposed owners:** Frontend Developer, Image API Engineer and UX Designer; QA Engineer validates.
**Stop/rollback:** Disable an incompatible tool/model combination rather than silently changing provider or applying an unsafe result.
**Not included:** Losing the original image when accepting an edit.

## Stage 0.4 - Layers, history and recoverable projects

**Goal:** Make multi-step work organized, editable and recoverable.

**Scope:** Image layers, reorder, transform, opacity, visibility, lock and grouping; per-layer masks and basic compositing; visual history; native projects containing required assets, layers and masks; autosave and crash recovery; the shared foundation of simple and advanced workspaces.

**Acceptance:** Reopening restores saved composition and appearance; recovery does not silently replace a valid file; workspace switching preserves all data; project-format changes have a tested backup/migration path. AI results retain before/after review before application.

**Dependency:** 0.2 and 0.3, with a reviewed project schema.
**Proposed owners:** Software Architect and Frontend Developer; QA Engineer validates.
**Stop/rollback:** Block release on data-loss or incompatible-format regressions; restore from backups only through a validated recovery path.
**Not included:** PSD interchange or a Photoshop-complete compositing engine.

## Stage 0.5 - Core creative AI toolkit

**Goal:** Connect generation, reference-based work and scene editing in one workflow.

**Scope:** Background removal, replacement, generation and blur; outpainting; style changes through text or reference images; one or multiple references where supported; generation size/aspect/quality/output-count controls; multi-result comparison; direct transfer to the editor; reusable prompts and compatible settings.

**Acceptance:** Tools are enabled only for supported models; results enter the project without download/reimport; submitted output counts and parameters match the user's choice; removed models or incompatible reused settings produce clear guidance.

**Dependency:** 0.1 capability matrix, 0.3 comparison and 0.4 projects.
**Proposed owners:** Image API Engineer and Frontend Developer; QA Engineer validates.
**Stop/rollback:** Disable a failing integration; do not silently switch provider, increase charges, or promise exact identity/product consistency.
**Not included:** Universal subject-identity guarantees or support for every provider catalog entry.

## Stage 0.6 - Content design, text and personal templates

**Goal:** Turn edited images into posts, stories, covers and promotional designs.

**Scope:** Editable text layers with font, size, spacing, alignment, outline and shadow; simple shapes, frames, backgrounds and gradients; independent logo/image layers; alignment guides, snapping and safe areas; editable output presets and custom dimensions; local personal templates using selected colors, fonts and logos. Project-maintained UI, examples and test copy remain English-only.

**Acceptance:** Text and composition render consistently in the canvas, reopened projects and exports; missing fonts are disclosed with a deliberate fallback; resizing does not silently crop text/logos; exact copy and logos use real layers rather than generated lettering.

**Dependency:** 0.4 layers and project storage.
**Proposed owners:** Frontend Developer and UX Designer; QA Engineer validates.
**Stop/rollback:** Block release on corrupt text/project rendering; retain valid template/project versions.
**Not included:** Online template marketplace or mandatory non-English interface/content.

## Stage 0.7 - Restoration, relighting and advanced finishing

**Goal:** Improve image quality and final visual treatment.

**Scope:** Supported AI upscaling, denoising and restoration; relighting, mood/time/weather changes; basic provider-supported portrait enhancement with limitations; local highlights/shadows, curves and color controls; editable or removable adjustments that preserve the source.

**Acceptance:** Local and billable AI actions are clearly separated; AI results use before/after review; restoration is not presented as guaranteed factual reconstruction or identity preservation; local adjustments remain reversible.

**Dependency:** 0.2 controls and the 0.3-to-0.5 editing pipeline.
**Proposed owners:** Image API Engineer and Frontend Developer; QA Engineer validates.
**Stop/rollback:** Restrict or disable low-quality provider/tool combinations instead of shipping them to complete a feature checklist.
**Not included:** Guaranteed recovery of missing detail or perfect facial identity.

## Stage 0.8 - Professional gallery and batch output

**Goal:** Make many assets and multiple deliverables manageable.

**Scope:** Gallery search, filters and favorites; stored prompt/model/settings metadata; gallery-to-create/edit reuse; multi-size export with per-size crop preview; local export queue and explicit AI batch queue; per-item progress and cancellation of unsent items; reliable cost estimates when authoritative data exists, otherwise an explicit unknown-cost notice before submission.

**Acceptance:** One failed item does not discard successful outputs; stopping a queue prevents later submissions; already-submitted work is not falsely labeled cancelled/free; gallery failure is not shown as an empty gallery; failed deletion is not displayed as successful; billable batch dispatch requires a clear user action.

**Dependency:** Earlier project, template and AI contracts.
**Proposed owners:** Frontend Developer and Image API Engineer; QA Engineer validates.
**Stop/rollback:** Pause dispatch on queue-accounting or duplicate-request defects and preserve completed outputs.
**Not included:** Direct social-network publishing or hidden paid retries.

## Stage 0.9 - Feature-complete beta and real-workflow validation

**Goal:** Validate the integrated destination and prioritize fixes over new tools.

**Scope:** Complete simple/advanced workspace behavior, shortcuts and onboarding; end-to-end workflow tests; large-image/project tests; a documented set of verified official integrations; custom endpoints for compatible APIs with explicit destination/security rules; install/update/recovery/backward-compatibility tests; documentation matching actual shipped functionality.

**Acceptance:** No unresolved release-blocking workflow, data-loss or significant security defects; performance measured on agreed reference hardware against thresholds agreed before testing; provider capability claims backed by evidence; known limitations documented; English-only content audit repeated.

**Dependency:** 0.8 feature scope complete.
**Proposed owners:** QA Engineer leads validation, Sun Studio Team Lead coordinates, Windows Desktop Engineer owns Windows package readiness; relevant specialists resolve findings.
**Stop/rollback:** Delay release when gates fail. Any scope reduction returns to the user for approval; do not silently drop approved features.
**Not included:** New major feature families.

## Stage 1.0 - Stable professional image studio

**Goal:** Release the agreed destination as a coherent, dependable product.

**Scope:** Resolve beta blockers; final security/privacy/credential review; saved-project, recovery and upgrade validation; accurate provider/cost/limitation documentation; Windows installer and updater readiness; evaluate signing prerequisites without assuming an existing certificate or authorization to purchase one.

**Acceptance:** A complete create/import -> AI edit -> layers/text -> save/close/reopen -> multi-output workflow passes; existing user data survives installation/upgrade; no unwanted billable requests; all earlier release gates pass; user approval for any actual release is obtained separately.

**Dependency:** 0.9 exit criteria.
**Proposed owners:** QA Engineer and Windows Desktop Engineer, coordinated by Sun Studio Team Lead; Product Manager validates product scope.
**Stop/rollback:** A failed critical gate blocks release. Stop distribution of a bad build and use only a tested, data-compatible recovery plan.
**Not included:** Last-minute major feature additions or relabeling an unqualified beta as stable.

## Gates applying to every stage

- Security and privacy are continuous requirements, not deferred to 1.0.
- No automatic billable retries, hidden provider changes, or fabricated price estimates.
- Protect credentials and restrict the local API boundary; avoid leaking secrets in logs/errors.
- Test settings/gallery/project migrations and preserve backups before data-format changes.
- Run trustworthy automated checks and installation/workflow checks through separately authorized execution. A successful build alone is not release evidence.
- Keep the Windows NSIS installation/update path and existing user data compatible.
- Use valid provider mocks for routine tests. Any live paid verification needs separate approval and controlled scope.
- Keep English project text, readable copy, keyboard focus and baseline accessibility throughout development.
- Record scope, evidence revision, test results, unresolved risks and recovery instructions for each release.

## Estimates and dependencies

No calendar dates, staffing assumptions, budget, or invented delivery duration are approved. Re-estimate work packages after a current-revision review and capacity confirmation. 0.0.x is prerequisite to 0.1; subsequent product stages build on the dependencies above. Specialist analysis can proceed in parallel when authorized, but passing a later stage never waives an earlier gate.

Relative planning risks: 0.0.x/0.1 security and migration; 0.4 document model and recovery; 0.6 typography/composition; 0.8 queue/cost accounting. AI quality and capability depend on provider/model behavior. 0.9 and 1.0 duration depends on validation findings. A numerical performance target must be agreed against explicit hardware before it is used as an acceptance gate.

## Outside this roadmap

Android and other platforms; language/framework rewrites; video editing; PSD interchange; hosted application backend; internal accounts; cloud sync; online collaboration; template marketplace; universal provider support; guaranteed identity consistency. Website subscriptions are not a substitute for an official supported API integration.

## Earlier candidates and superseded directions

The previous roadmap mixed candidate ideas with version labels that are no longer the approved release sequence. Keep the following non-conflicting ideas visible for refinement; they are not claims of implementation or additional release gates:

- Live task progress for kie.ai, including the earlier SSE/poll-state idea: review existing feedback in 0.0.x and reliable pending/outcome behavior in 0.1. Do not assume an old callback or transport description proves current behavior.
- Drag-and-drop import from Explorer into Edit/Restyle: retain as an input-workflow candidate for 0.1.
- Batch Gallery export, including the earlier ZIP-download option: refine with 0.8 local output queues. The local prompt library maps to reusable prompts in 0.5.
- Per-project galleries/subfolders and switching: refine with 0.4 saved projects and 0.8 gallery organization.
- Exported PNG prompt/settings metadata and metadata re-import: retained as an unassigned candidate; review privacy, compatibility and scope before committing it to a stage.
- Multi-monitor-friendly viewing and modal zoom/pan: refine with 0.2 canvas/view controls and 0.9 workflow validation.
- Gallery search/filter by prompt, provider and date maps to 0.8; keyboard navigation and screen-reader labels map to 0.0.x visual/accessibility review and continuous gates.
- Earlier provider-expansion suggestions must be reconciled with the current capability matrix before planning new integrations. Do not rebuild integrations solely because an older document listed them as future work.
- Earlier Docker/portable-distribution suggestions are not commitments in this Windows NSIS roadmap. The old optional localhost-auth idea does not defer the 0.0.x local-service access-control review.
- The earlier Tauri-shell suggestion is superseded by the approved no-rewrite direction and preservation of the existing Electron/NSIS installation and update path.

**Decision recorded:** Adopt the staged 0.0.x-to-1.0 roadmap, place existing-screen polish and confirmed-defect resolution before 0.1, and apply the English-only policy to all project-maintained content. This records planning and documentation only; implementation and release are not started or authorized by this entry.

**Historical record:** The decision log below is preserved verbatim from the previous document. Its dated implementation, test, pricing and provider statements describe the historical record, not a fresh audit or verification of current runtime behavior. They do not override the roadmap or language policy above. Use [CHANGELOG.md](../CHANGELOG.md) for release history and revalidate historical findings before treating them as current.

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
