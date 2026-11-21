'use strict';

/**
 * Provider registry — Sun Studio has no AI inside; every provider is reached
 * through its public API with the user's own key.
 *
 * Aspect ratios are canonical across the app ('1:1', '3:2', '2:3', '16:9', ...)
 * and mapped per provider at request time.
 */

const OPENAI_SIZES = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'sk-…',
    keyDocs: 'platform.openai.com/api-keys',
    aspects: Object.keys(OPENAI_SIZES),
    qualities: ['low', 'medium', 'high'],
    background: true,
    dynamicModels: false,
    models: [
      { id: 'gpt-image-1', label: 'gpt-image-1 · best quality' },
      { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini · faster & cheaper' },
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
    aspects: Object.keys(OPENAI_SIZES),
    qualities: ['low', 'medium', 'high'],
    background: true,
    dynamicModels: true,
    models: [
      { id: 'gpt-image-1', label: 'gpt-image-1' },
      { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini' },
      { id: 'dall-e-3', label: 'dall-e-3' },
    ],
    defaultModel: 'gpt-image-1',
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

function providerMeta(id) {
  return PROVIDERS[id] || null;
}

module.exports = { PROVIDERS, OPENAI_SIZES, providerMeta };
