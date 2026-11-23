/**
 * v0.0.6 → v0.0.8 data migration (runs once, in the Electron main process).
 *
 * v0.0.6 (Electron desktop) stored everything in the userData dir:
 *   settings.json   — { version:3, provider, apiKeys:{id:{enc,plain}}, customProviders, settings }
 *   gallery/        — PNG files + index.json [{id, file, thumb, createdAt, ...meta}]
 *
 * v0.0.8 (Electron shell around the Next.js studio) keeps the same userData dir but uses the
 * Hermes-style layout inside it:
 *   data/settings.json  — { version:4, provider, customProviders:[{...keyEnv}], settings } (NO keys)
 *   data/secrets.env    — SUN_KEY_* lines, mode 0600
 *   data/gallery/       — files + index.json [{id, file, ext, createdAt, ...meta}]
 *
 * The server sees the new layout via SUN_STUDIO_DATA=<userData>/data. Legacy DPAPI-encrypted
 * keys are decrypted here (main process = where they were encrypted) and written to secrets.env.
 * Idempotent: skipped when data/settings.json already exists. The legacy files are kept as-is.
 */
function customKeyEnv(baseUrl) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(String(baseUrl).toLowerCase()).digest('hex');
  return 'SUN_KEY_CUSTOM_' + hash.slice(0, 8).toUpperCase();
}

const BUILTIN_IDS = ['openai', 'aipass', 'kie', 'google'];
// v0.0.6 shipped these (all dark); unknown → the v0.0.10 default "studio"
const KNOWN_THEMES = ['sunset', 'ember', 'ocean', 'forest', 'violet', 'paper'];
// theme ids retired along the way → mapped forward to their closest v0.0.10 theme
const RETIRED_THEMES = { mono: 'studio', midnight: 'midnight', dark: 'studio' };

function legacyKeyToEnv(providerId, customProviders) {
  if (BUILTIN_IDS.includes(providerId)) return 'SUN_KEY_' + providerId.toUpperCase();
  const custom = (customProviders || []).find((c) => c.id === providerId);
  if (custom && custom.baseUrl) return customKeyEnv(custom.baseUrl);
  return null;
}

function decryptKey(entry, safeStorage) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.enc) {
    let decrypted = null;
    try {
      decrypted = safeStorage.decryptString(Buffer.from(entry.enc, 'base64'));
    } catch (e) {
      /* DPAPI failure — fall back to plain */
    }
    if (decrypted) return String(decrypted);
  }
  return entry.plain ? String(entry.plain) : null;
}

async function run({ userData, dataDir, safeStorage, fs, path }) {
  const fsp = fs.promises;
  const result = { migrated: false, from: null, keys: 0, gallery: 0, skipped: null };

  const legacyFile = path.join(userData, 'settings.json');
  const newSettingsFile = path.join(dataDir, 'settings.json');
  if (fs.existsSync(newSettingsFile)) {
    result.skipped = 'new settings already present';
    return result;
  }

  let legacy = null;
  try {
    legacy = JSON.parse(await fsp.readFile(legacyFile, 'utf8'));
  } catch (e) {
    result.skipped = 'no legacy settings';
    return result;
  }
  if (!legacy || typeof legacy !== 'object') {
    result.skipped = 'legacy settings unreadable';
    return result;
  }
  result.migrated = true;
  result.from = legacy.version || 3;

  await fsp.mkdir(dataDir, { recursive: true });

  // ---- settings v5 (no secrets inside; providers are user-managed) ----
  const legacySettings = legacy.settings || {};
  const legacyKeys = legacy.apiKeys && typeof legacy.apiKeys === 'object' ? legacy.apiKeys : {};
  const legacyCustom = Array.isArray(legacy.customProviders) ? legacy.customProviders : [];
  const customProviders = legacyCustom
    .filter((c) => c && typeof c.id === 'string' && /^https?:\/\//i.test(String(c.baseUrl || '')))
    .map((c) => ({
      id: c.id,
      label: String(c.label || c.id),
      baseUrl: String(c.baseUrl).replace(/\/+$/, ''),
      keyEnv: customKeyEnv(c.baseUrl),
      models: Array.isArray(c.models) ? c.models.map(String) : [],
    }));

  const knownIds = [...BUILTIN_IDS, ...customProviders.map((c) => c.id)];
  const provider = knownIds.includes(legacy.provider) ? legacy.provider : 'aipass';
  const oldModels = legacySettings.models || {};
  const models = {
    openai: oldModels.openai || 'gpt-image-1',
    aipass: oldModels.aipass || 'gpt-image-1',
    kie: oldModels.kie || 'nano-banana-2-1',
    google: oldModels.google || 'gemini-nano-banana-2.1',
    openrouter: oldModels.openrouter || 'google/gemini-2.5-flash-image',
    stability: oldModels.stability || 'core',
  };
  for (const c of customProviders) {
    if (oldModels[c.id]) models[c.id] = String(oldModels[c.id]);
  }

  // v0.0.11: providers are user-added. Seed the enabled list with the legacy
  // active provider + anything that carries a key (they were all "installed"
  // in v0.0.6) so nothing the user relied on disappears after the update.
  const legacyKeyIds = Object.keys(legacyKeys).filter((id) => {
    const entry = legacyKeys[id];
    const k = decryptKey(entry, safeStorage);
    return !!k;
  });
  const enabledProviders = Array.from(
    new Set([provider, ...legacyKeyIds.filter((id) => knownIds.includes(id))])
  );

  const settings = {
    version: 5,
    provider,
    enabledProviders,
    customProviders,
    extraModels: {},
    settings: {
      models,
      size: legacySettings.size || '1:1',
      quality: legacySettings.quality || 'medium',
      imageSize: legacySettings.imageSize || '1K',
      theme: KNOWN_THEMES.includes(legacySettings.theme)
        ? legacySettings.theme
        : RETIRED_THEMES[legacySettings.theme] || 'studio',
    },
  };
  await fsp.writeFile(newSettingsFile, JSON.stringify(settings, null, 2), 'utf8');

  // ---- secrets.env ----
  const secretLines = [];
  for (const [providerId, entry] of Object.entries(legacyKeys)) {
    const envName = legacyKeyToEnv(providerId, customProviders);
    if (!envName) continue;
    const key = decryptKey(entry, safeStorage);
    if (key) {
      secretLines.push(envName + '=' + String(key).trim());
      result.keys++;
    }
  }
  if (secretLines.length) {
    const secretsFile = path.join(dataDir, 'secrets.env');
    const body =
      '# Sun Studio API keys — this file never leaves this machine.\n' +
      '# Migrated from Sun Studio v0.0.6 settings.json.\n' +
      secretLines.join('\n') + '\n';
    await fsp.writeFile(secretsFile, body, 'utf8');
    try { await fsp.chmod(secretsFile, 0o600); } catch (e) { /* Windows: no-op */ }
  }

  // ---- gallery ----
  try {
    const legacyGalleryDir = path.join(userData, 'gallery');
    const legacyIndex = JSON.parse(
      await fsp.readFile(path.join(legacyGalleryDir, 'index.json'), 'utf8')
    );
    if (Array.isArray(legacyIndex) && legacyIndex.length) {
      const newGalleryDir = path.join(dataDir, 'gallery');
      await fsp.mkdir(newGalleryDir, { recursive: true });
      const newIndex = [];
      for (const item of legacyIndex) {
        if (!item || !item.file || !item.id) continue;
        try {
          await fsp.copyFile(path.join(legacyGalleryDir, item.file), path.join(newGalleryDir, item.file));
          const ext = path.extname(item.file).replace('.', '') || 'png';
          newIndex.push({
            id: item.id,
            file: item.file,
            ext,
            createdAt: item.createdAt || 0,
            kind: item.kind || 'generate',
            provider: item.provider || '',
            prompt: item.prompt || '',
            model: item.model || '',
            aspect: item.aspect || '',
            quality: item.quality || '',
          });
          result.gallery++;
        } catch (e) {
          /* skip missing file */
        }
      }
      await fsp.writeFile(
        path.join(newGalleryDir, 'index.json'),
        JSON.stringify(newIndex, null, 2),
        'utf8'
      );
    }
  } catch (e) {
    /* no legacy gallery — fine */
  }

  return result;
}

module.exports = { run, customKeyEnv };
