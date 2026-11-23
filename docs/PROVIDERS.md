# Providers

How the provider layer works and how to add a provider. The single registry lives in
`src/server/providers/registry.ts` (since v0.0.7 there is no second mirror — the UI receives
everything from `/api/bootstrap`, so **change only the registry**).

## Current providers (v0.0.7)

| id | type | base URL | key | models | notes |
|---|---|---|---|---|---|
| `openai` | `openai-compatible` | `https://api.openai.com/v1` | `sk-…` | gpt-image-1, gpt-image-1-mini | official Images API; mask = binary PNG; `background: transparent/opaque` |
| `aipass` | `openai-compatible` | `https://aipass.one/v1` | `sk-aikey-…` | live from `GET /v1/models` (filtered by `IMAGE_MODEL_RE`), defaults gpt-image-1 / gpt-image-1-mini / dall-e-3 | universal AI wallet/proxy; docs: https://aipass.one/docs/rest/openai-compatible; allowed endpoints include `POST /v1/images/generations`, `POST /v1/images/edits`; 402 = out of funds, 403 = key invalid / endpoint not allowed |
| `kie` | `kie` | `https://api.kie.ai` | kie.ai API key (console) | nano-banana-2-1, nano-banana-pro, nano-banana, seedream/5-pro-text-to-image, seedream/5-pro-image-to-image, gpt-image/1.5-text-to-image, gpt-image/1.5-image-to-image, grok-imagine/text-to-image, grok-imagine/image-to-image | **async job API** (`src/main/kie.js`): `POST /api/v1/jobs/createTask` → poll `GET /api/v1/jobs/recordInfo?taskId=…` until `state: success/fail` → download `resultJson.resultUrls`; body `code` is the real status (HTTP is always 200); credits via `GET /api/v1/chat/credit` (the `Test` button shows the balance); i2i models need **uploaded URLs** — `POST /api/file-base64-upload` (24h retention); input field per family: `image_input` (nano-banana), `image_urls` (seedream/grok), `input_urls` (gpt-image); grok i2i prompts get an `@image(1)` reference appended; quality mapping: nano-banana takes `resolution` 1K/2K/4K directly, seedream 1K→`basic` 2K/4K→`high`, gpt-image 1K→`medium` 2K/4K→`high`, grok has none; no mask input (magenta-cover trick); no `background` |
| `google` | `google` | `https://generativelanguage.googleapis.com/v1beta` | `AIza…` (AI Studio) | gemini-nano-banana-2.1, gemini-3.1-flash-lite-image, gemini-3.1-flash-image, gemini-3-pro-image, gemini-2.5-flash-image | Interactions API first, legacy `generateContent` fallback; `image_size` **uppercase** `1K/2K/4K`; no mask input (magenta-cover trick); no `background` |

## Registry entry fields (`providers.js`)

```js
{
  id: 'aipass',
  label: 'AI Pass',            // shown in pill + cards + errors
  type: 'openai-compatible',   // or 'google' — decides the client class and request mapping
  baseUrl: 'https://aipass.one/v1',
  keyHint: 'sk-aikey-…',       // placeholder + validation hint in Settings
  keyDocs: 'aipass.one · Developer Dashboard',
  aspects: ['1:1','3:2','2:3'],            // canonical aspect ratios offered in the UI
  qualities: ['low','medium','high'],      // for openai-compatible…
  resolutions: null,                       // …or ['1K','2K','4K'] for google (quality label switches)
  background: true,            // false hides the Background select everywhere
  dynamicModels: true,         // true → renderer/main fetch GET {baseUrl}/models
  models: [{ id, label }],     // static fallback list (google: full curated list)
  defaultModel: 'gpt-image-1',
}
```

Canonical aspects are mapped per provider at request time:
- OpenAI-compatible: `1:1→1024x1024`, `3:2→1536x1024`, `2:3→1024x1536`, `16:9→1792x1024`,
  `9:16→1024x1792` (`openAiSizeFor`); dall-e-3 overrides to `1792x1024`/`1024x1792`
  (`dallE3SizeFor`). The wider 16:9/9:16 set is only offered to custom providers (built-in
  OpenAI/AI Pass metas list just 1:1, 3:2, 2:3, which gpt-image-1 supports).
- Google: the aspect string is passed through as `aspect_ratio`.

## Custom providers (v0.0.3)

Users can add any OpenAI-compatible endpoint in Settings → *Custom providers*:
name + base URL + optional key + optional comma-separated model ids. Entries live in
`settings.json` under `customProviders` (schema v3, see `store.js saveCustomProvider/
deleteCustomProvider`) and are merged into the registry at runtime by
`providerMeta(id, store.data.customProviders)` → `customToMeta()`; the renderer mirrors them via
`customMetas()`. They behave exactly like built-in OpenAI-compatible providers: live model list
via `GET {baseUrl}/models`, DPAPI-encrypted key, `Test` button, usable as the active provider.
**Always resolve metadata through the custom-aware helpers** (`metaFor()` in `main.js`,
`metaFor()`/`providerIds()` in `app.js`) — never through the static registry alone.

## Client contract

Every client returns **base64 image strings** (any container format); `gallery.saveBuffer()`
sniffs the format (PNG/JPEG/WebP) and stores it under `data/gallery/`. Failures throw
`ProviderError(message, status)`; network-layer issues go through `friendlyNetworkError()`
(timeout / ENOTFOUND / ECONNREFUSED → friendly text). Responses may deliver images inline
(`b64_json`) **or as URLs** — `itemToB64()` in `openai.ts` downloads URL-based results (common
with proxies and dall-e-3 defaults); a 200-response carrying `{error:{message}}` is surfaced as
an error, and empty results name the model and point to Settings → Default model.

```ts
// openai-compatible (src/server/providers/openai.ts — serves OpenAI, AI Pass and custom endpoints)
testKey()                                  // GET {baseUrl}/models → {ok, models, ids}
listModels()                               // sorted id list (dynamicModels)
generate({ prompt, model, aspect, quality, n, background })   // POST /images/generations
edit({ images: [{mime, data}], maskPng, prompt, model, aspect, quality, n, background })
                                           // POST /images/edits (multipart, mask optional)

// google (src/server/providers/google.ts)
testKey()                                  // GET /v1beta/models (x-goog-api-key)
generate({ prompt, model, aspect, imageSize, n })             // sequential calls, one image each
edit({ imageBuffers: [{mime, data}], prompt, model, aspect, imageSize })

// kie.ai (src/server/providers/kie.ts — job-based)
testKey()                                  // GET /api/v1/chat/credit → {ok, credits}
generate({ prompt, model, aspect, imageSize, n, onStage })    // createTask ×n (parallel) → poll → download
edit({ imageBuffers: [{mime, data}], prompt, model, aspect, imageSize, n, onStage })
                                           // uploads each buffer via /api/file-base64-upload first
```

All clients share the `ImageClient` interface (`src/server/providers/types.ts`) and take
`{ providerMeta, getApiKey }` (Google takes `{ getApiKey, baseUrl? }` so tests can point it at a
mock). Keys come from `store.getApiKey(providerId)` — a **fresh read of `data/secrets.env`**
(Hermes pattern: the value never sits in memory longer than the request, and a newly saved key
applies without restart).

Routing in `src/server/clients.ts`: `getClient(providerId, store, meta)` caches one client per
provider. Routes (`app/api/generate|edit`) guard every request with a friendly
"No <label> API key configured" error. Model resolution:
`body.model || settings.models[provider] || meta.defaultModel`.

Error mapping (`openai.js _check` / `google.js _check`): 401 → invalid key,
402 → "Out of funds", 403 → access denied, 429 → rate limit / quota; provider JSON
`error.message` is always preserved in the text.

## Request shapes (reference)

AI Pass / OpenAI-compatible (Bearer auth):
```bash
curl https://aipass.one/v1/images/generations \
  -H "Authorization: Bearer sk-aikey-YOUR_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "gpt-image-1", "prompt": "…", "size": "1024x1024", "quality": "medium", "n": 1 }'
# response: { data: [ { b64_json } ] }
```

Google — new Interactions API (tried first):
```json
POST /v1beta/interactions
headers: x-goog-api-key: KEY · Api-Revision: 2026-05-20
{
  "model": "gemini-nano-banana-2.1",
  "input": [ { "type": "image", "mime_type": "image/png", "data": "<base64>" },
             { "type": "text", "text": "…" } ],
  "response_format": { "type": "image", "aspect_ratio": "16:9", "image_size": "2K" }
}
```
Responses are mined by `collectImageBlocks()` — a recursive extractor that accepts the new shape
(`output_image`, `mime_type`) **and** the legacy shape (`inlineData`/`inline_data`), so small
upstream field renames don't break parsing.

Google — legacy fallback (auto on 404 / 501 / 400 "unsupported|unknown name|not found|…"):
```json
POST /v1beta/models/{model}:generateContent
{ "contents": [ { "parts": [ { "inline_data": { "mime_type": "image/png", "data": "…" } },
                              { "text": "…" } ] } ],
  "generationConfig": { "responseModalities": ["IMAGE"],
                        "imageConfig": { "aspectRatio": "16:9", "imageSize": "2K" } } }
```

## Mask semantics

| provider | mask handling |
|---|---|
| OpenAI-compatible | browser `EditView` exports a **binary** PNG (opaque black = keep, transparent = repaint) as the `mask` field; strokes are thresholded before export |
| google, kie | no mask input — browser `buildCoveredImage()` composites solid `#ff00ff` over painted areas; the covered image is sent to the server, prompt is prefixed with *"Replace the solid magenta-covered area with the following change…"* |

## Adding a provider — checklist

1. **Registry**: add the entry in `src/server/providers/registry.ts` (fields above). Every entry
   carries its Hermes-style `keyEnv` secret reference.
2. **Client**: if `openai-compatible` — done, the shared client covers it. Otherwise write
   `src/server/providers/<name>.ts` implementing the `ImageClient` contract, export it, and
   branch on the new `type` in `getClient()` (`src/server/clients.ts`) and in the
   `generate` / `edit` routes.
3. **UI**: nothing else — the pill, Settings cards and per-view selects are generated from
   `/api/bootstrap`. If its model list is dynamic, set `dynamicModels` and make sure `testKey()`
   returns `{ ok, models, ids }`.
4. **Special params**: size mapping (client), dall-e-3-style overrides, mask support decision
   (`docs/ARCHITECTURE.md` → Edit flow), background support flag.
5. **Docs**: add a row to the table above and the README providers table; add a CHANGELOG entry.
6. **Test**: `npx tsc --noEmit`, extend `scripts/test-clients.ts` with a mock-server test for the
   request shape, smoke-test all five views (`AGENTS.md`); if the provider API shape is
   documented, hand-verify the request builder against the docs.
7. **Release**: patch version bump + release per `docs/RELEASE.md`.
