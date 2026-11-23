# Product spec — Sun Studio

An AI image studio for Windows with **no AI inside**: the user brings their own provider key (OpenAI, AI
Pass, kie.ai, Google Gemini) and every request goes from the local server (`127.0.0.1`) directly
to the provider. This spec is the behavioral reference; implementation details live in
`docs/ARCHITECTURE.md`. (v0.0.8: the v0.0.7 studio UI ships inside an Electron shell — the views
and behaviors below are unchanged.)

## Non-goals

- No built-in models, no bundled credits, no in-app billing.
- No backend server, no accounts, no analytics/telemetry of any kind.
- No cross-device sync; everything (keys, gallery) is local.

## Views

### Create (text → image)
- Prompt textarea, 4000-char limit with live counter.
- Options adapt to the active provider: aspect ratio (from `meta.aspects`), Quality
  (`low/medium/high`) **or** Resolution (`1K/2K/4K` for Google), Background
  (`auto/transparent/opaque`, hidden when `meta.background === false`), Images 1–4.
- Results appear as cards (checkerboard backing for transparency) with hover actions:
  Save as / Open / Edit (loads into the editor) / Reuse prompt (copies to Create).
- While working: sun-spinner progress with live stage text (`op:stage` events) and a timer.
- No key configured → warn toast + jump to Settings (never a silent failure).

### Edit (mask + prompt)
- Start screen: dashed drop area, *Choose image* (PNG/JPG/WebP ≤ 50 MB, normalized to PNG).
- Editor: image canvas + transparent mask overlay; **Brush** / **Erase** tools, brush size
  slider 8–140, Clear mask, Remove image.
- Presets: *Remove background* (sets background=transparent), *Restore & enhance*, *Extend the
  scene* — each fills the prompt (and clears the mask for bg removal).
- Mask semantics per provider: OpenAI-compatible → binary mask PNG uploaded with the request;
  Google → magenta-cover composite + prefixed prompt (a dashed note explains this in the UI).
- No mask painted → whole-image edit. Background select (where supported), Images 1–4.

### Image to Image (references + prompt)
- 1–3 reference image slots (add / remove), prompt describing the result, aspect, quality,
  Images 1–4. Single multipart request (`image[]`).

### Gallery
- Every generation/edit result is stored locally (PNG + JSON metadata: id, prompt, kind,
  provider, model, aspect, quality, source, createdAt).
- Grid cards show prompt excerpt + date + provider; click opens the modal:
  meta line, full prompt, Save as… / Open file / Reuse prompt / Delete / Close.
- *Open folder* reveals the gallery on disk. Refresh re-reads the store.

### Settings
- **Providers** — one card per provider: type + homepage hint, key status
  (`Key sk-…abcd · encrypted` / *No key saved yet*), password input + **Save**, **Test**
  (connection check; for dynamic providers it also refreshes the model list), **Use provider**.
  The active provider card is highlighted with an *Active* badge.
- **Default model** — dropdown for the active provider (static list or live-filtered
  image models via `IMAGE_MODEL_RE`).
- **API connection** — one card per provider: endpoint, secret reference (`SUN_KEY_*`), key save,
  doctor-style test line, default model (Hermes-style config/secrets separation).
- **Appearance** — theme swatches (`mono` default, `midnight`, six accent themes).
- **About** — version, data folder, one-line privacy statement.

### Global chrome
- Top bar: logo + `SUN STUDIO` wordmark, view tabs (Create / Edit / Restyle / Gallery /
  Settings), provider pill with a green dot per provider when a key is saved.
- Footer: "No AI inside — your keys, your providers" + version + `127.0.0.1 only`.
- Banner/button state when the active provider has no key: generate buttons refuse with a
  friendly pointer to Settings → API connection.
- Toasts (info/ok/error) for all async outcomes; errors are provider messages made friendly
  (401 invalid key, 402 out of funds, 403 denied, 429 rate limit, timeout, network down).

## Provider-adaptive behavior (summary)

| aspect | OpenAI / AI Pass | Google Gemini |
|---|---|---|
| sizes | 1024², 1536×1024, 1024×1536 | `aspect_ratio` strings incl. 16:9 / 9:16 / 4:3 |
| quality control | low / medium / high | 1K / 2K / 4K `image_size` |
| background | transparent/opaque | not offered |
| mask | binary mask PNG | magenta-cover composite |
| multi-image (n) | one request, n images | sequential requests |
| model list | AI Pass: live `GET /models`; OpenAI: static | static curated list |

kie.ai follows the Google column for sizes/quality (aspects + `resolution` 1K/2K/4K, no
background), uses per-model job recipes (see `docs/PROVIDERS.md`) and runs n images as parallel
tasks; its model list is static and curated.

## Privacy & security requirements

- Keys live in `data/secrets.env` (mode 0600), referenced by env names; decrypted/used only
  inside the local server, never logged, never sent to the browser, never included in error
  surfaces (only a `first6…last4` hint).
- Outbound calls only to: `api.openai.com`, `aipass.one`, `api.kie.ai`,
  `generativelanguage.googleapis.com`.
- Gallery and settings under `data/` next to the server (`SUN_STUDIO_DATA` overrides); deleting
  an image in the app deletes its files.
- The server binds to `127.0.0.1` only; the browser's only privileged surface is the `/api/*`
  route handlers, which never return secret values.
