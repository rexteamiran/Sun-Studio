# Providers

How the provider layer works and how to add a provider. The registry lives in
`src/main/providers.js`; its renderer mirror is `PROVIDERS_META` in `src/renderer/app.js` —
**always change both together**.

## Current providers (v0.0.2)

| id | type | base URL | key | models | notes |
|---|---|---|---|---|---|
| `openai` | `openai-compatible` | `https://api.openai.com/v1` | `sk-…` | gpt-image-1, gpt-image-1-mini | official Images API; mask = binary PNG; `background: transparent/opaque` |
| `aipass` | `openai-compatible` | `https://aipass.one/v1` | `sk-aikey-…` | live from `GET /v1/models` (filtered by `IMAGE_MODEL_RE`), defaults gpt-image-1 / gpt-image-1-mini / dall-e-3 | universal AI wallet/proxy; docs: https://aipass.one/docs/rest/openai-compatible; allowed endpoints include `POST /v1/images/generations`, `POST /v1/images/edits`; 402 = out of funds, 403 = key invalid / endpoint not allowed |
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

Every client returns **base64 image strings** (any container format); `main.js saveResults()`
normalizes to PNG via `nativeImage`. Failures throw `OpenAIError(message, status)`; network-layer
issues go through `friendlyNetworkError()` (timeout / ENOTFOUND / ECONNREFUSED → friendly text).
Responses may deliver images inline (`b64_json`) **or as URLs** — `itemToB64()` in `openai.js`
downloads URL-based results (common with proxies and dall-e-3 defaults); a 200-response carrying
`{error:{message}}` is surfaced as an error, and empty results name the model and point to
Settings → Default model.

```js
// openai-compatible (src/main/openai.js — one class serves OpenAI and AI Pass)
testKey()                                  // GET {baseUrl}/models → {ok, models, ids}
listModels()                               // sorted id list (dynamicModels)
generate({ prompt, model, aspect, quality, n, background })   // POST /images/generations
edit({ imagePaths[], maskPng, prompt, model, aspect, quality, n, background })
                                           // POST /images/edits (multipart, mask optional)

// google (src/main/google.js)
testKey()                                  // GET /v1beta/models (x-goog-api-key)
generate({ prompt, model, aspect, imageSize, n })             // sequential calls, one image each
edit({ imageBuffers: [{mime, data}], prompt, model, aspect, imageSize })
```

Routing in `main.js`: `getClient(providerId)` caches one client per provider and injects
`getApiKey: () => store.getApiKey(providerId)`. `requireKey()` guards every request with a
friendly "No <label> API key configured" error. Model resolution:
`p.model || settings.models[provider] || meta.defaultModel`.

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
| OpenAI-compatible | renderer `exportMask()` sends a **binary** PNG (opaque black = keep, transparent = repaint) as the `mask` field; strokes are thresholded by `opaqueStrokes()` first |
| google | no mask input — renderer `buildCoveredImage()` composites solid `#ff00ff` over painted areas, `file:writeTempPng` saves it, prompt is prefixed with *"Replace the solid magenta-covered area with the following change…"* |

## Adding a provider — checklist

1. **Registry**: add the entry in `src/main/providers.js` (fields above).
2. **Client**: if `openai-compatible` — done, the shared client covers it. Otherwise write
   `src/main/<name>.js` implementing the client contract, export it, and branch on the new `type`
   in `getClient()` (`main.js`) and in the `gen:image` / `image:edit` handlers.
3. **Renderer mirror**: add the same entry to `PROVIDERS_META` (`app.js`) with user-facing labels.
   The provider pill, Settings cards and per-view selects are generated from this — no other UI
   edits needed. If its model list is dynamic, set `dynamicModels` and make sure the provider's
   `testKey()` returns `{ ok, models, ids }` so `state.dynamicModels` fills the model dropdown.
4. **Special params**: size mapping (`providers.js` / client), dall-e-3-style overrides, mask
   support decision (`docs/ARCHITECTURE.md` → Edit flow), background support flag.
5. **Docs**: add a row to the table above and the README providers table; add a CHANGELOG entry.
6. **Test**: `node --check` every touched file; smoke-test all five views (`AGENTS.md`); if the
   provider API shape is documented, hand-verify the request builder against the docs.
7. **Release**: patch version bump + release per `docs/RELEASE.md`.
