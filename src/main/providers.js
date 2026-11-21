'use strict';

/**
 * Provider registry — Sun Studio has no AI inside; every provider is reached
 * through its public API with the user's own key.
 *
 * Aspect ratios are canonical across the app ('1:1', '3:2', '2:3', '16:9', ...)
 * and mapped per provider at request time.
 *
 * Custom (bring-your-own-endpoint) providers live in the store and are merged
 * into the registry by providerMeta(id, customProviders).
 */

const OPENAI_SIZES = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };
// wider set offered to custom endpoints (most OpenAI-compatible servers accept these)
const CUSTOM_SIZES = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
};

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'sk-…',
    keyDocs: 'platform.openai.com/api-keys',
    billingUrl: 'https://platform.openai.com/settings/organization/billing',
    aspects: Object.keys(OPENAI_SIZES),
    qualities: ['low', 'medium', 'high'],
    background: true,
    dynamicModels: false,
    models: [
      { id: 'gpt-image-1', label: 'gpt-image-1 · best quality' },
      { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini · faster & cheaper' },
      { id: 'dall-e-3', label: 'dall-e-3 · classic' },
    ],
    defaultModel: 'gpt-image-1',
  },
  aipass: {
    id: 'aipass',
    label: 'AI Pass',
    type: 'openai-compatible',
    baseUrl: 'https://aipass.one/v1',
    keyHint: 'sk-aikey-…',
    keyDocs: 'aipass.one · Developer Dashboard',
    billingUrl: 'https://aipass.one',
    aspects: Object.keys(OPENAI_SIZES),
    qualities: ['low', 'medium', 'high'],
    background: true,
    dynamicModels: true,
    recommended: true,
    promo: {
      badge: 'Recommended',
      title: 'New to AI Pass? New accounts get $1 of free API credit.',
      url: 'https://aipass.one',
      urlLabel: 'Create a free account →',
    },
    models: [
      { id: 'gpt-image-1', label: 'gpt-image-1' },
      { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini' },
      { id: 'dall-e-3', label: 'dall-e-3' },
    ],
    defaultModel: 'gpt-image-1',
  },
  kie: {
    id: 'kie',
    label: 'kie.ai',
    type: 'kie',
    baseUrl: 'https://api.kie.ai',
    keyHint: 'kie.ai API key',
    keyDocs: 'docs.kie.ai/getting-started',
    billingUrl: 'https://kie.ai',
    aspects: ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3'],
    qualities: null,
    resolutions: ['1K', '2K', '4K'],
    background: false,
    dynamicModels: false,
    // every string verified against its docs.kie.ai endpoint page (job-based API)
    models: [
      { id: 'nano-banana-2-1', label: 'nano-banana-2-1 · recommended' },
      { id: 'nano-banana-pro', label: 'nano-banana-pro · up to 4K' },
      { id: 'nano-banana', label: 'nano-banana · legacy' },
      { id: 'seedream/5-pro-text-to-image', label: 'Seedream 5 Pro · text to image' },
      { id: 'seedream/5-pro-image-to-image', label: 'Seedream 5 Pro · edit' },
      { id: 'gpt-image/1.5-text-to-image', label: 'GPT-Image 1.5 · text to image' },
      { id: 'gpt-image/1.5-image-to-image', label: 'GPT-Image 1.5 · edit' },
      { id: 'grok-imagine/text-to-image', label: 'Grok Imagine · text to image' },
      { id: 'grok-imagine/image-to-image', label: 'Grok Imagine · edit' },
    ],
    defaultModel: 'nano-banana-2-1',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    type: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyHint: 'AIza…',
    keyDocs: 'aistudio.google.com/apikey',
    aspects: ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3'],
    resolutions: ['1K', '2K', '4K'],
    background: false,
    dynamicModels: false,
    models: [
      { id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1 · recommended' },
      { id: 'gemini-3.1-flash-lite-image', label: 'Flash Lite Image · fastest' },
      { id: 'gemini-3.1-flash-image', label: 'Flash Image · up to 4K' },
      { id: 'gemini-3-pro-image', label: 'Nano Banana Pro · 4K' },
      { id: 'gemini-2.5-flash-image', label: 'Nano Banana (legacy)' },
    ],
    defaultModel: 'gemini-nano-banana-2.1',
  },
};

/** Map a stored custom provider entry to registry metadata. */
function customToMeta(c) {
  const models = (c.models || []).map((id) => ({ id, label: id }));
  return {
    id: c.id,
    label: c.label,
    type: 'openai-compatible',
    custom: true,
    baseUrl: c.baseUrl,
    keyHint: 'sk-… / API key',
    keyDocs: c.baseUrl,
    billingUrl: /^https?:\/\/.+/i.test(c.baseUrl) ? c.baseUrl : null,
    aspects: Object.keys(CUSTOM_SIZES),
    qualities: ['low', 'medium', 'high'],
    background: true,
    dynamicModels: true,
    models: models.length ? models : [{ id: 'gpt-image-1', label: 'gpt-image-1' }],
    defaultModel: models.length ? models[0].id : 'gpt-image-1',
  };
}

function providerMeta(id, customProviders) {
  if (PROVIDERS[id]) return PROVIDERS[id];
  const c = (customProviders || []).find((x) => x && x.id === id);
  return c ? customToMeta(c) : null;
}

module.exports = { PROVIDERS, OPENAI_SIZES, CUSTOM_SIZES, customToMeta, providerMeta };
