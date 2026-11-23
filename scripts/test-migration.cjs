/**
 * Migration unit test — builds a fake v0.0.6 userData tree and runs
 * electron/migrate.cjs against it with plain node (fake safeStorage).
 * Run: node scripts/test-migration.cjs
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const assert = require('assert');

const { run, customKeyEnv } = require('../electron/migrate.cjs');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'sun-legacy-'));
  const dataDir = path.join(ud, 'data');

  // fake v0.0.6 userData
  await fsp.writeFile(
    path.join(ud, 'settings.json'),
    JSON.stringify({
      version: 3,
      provider: 'kie',
      apiKeys: {
        openai: { enc: null, plain: 'sk-openai-plain' },
        aipass: { enc: 'garbage-not-decryptable', plain: 'sk-aikey-fallback' },
        kie: { enc: null, plain: 'kie-key-123' },
        google: { enc: null, plain: '' }, // empty → skipped
        'custom-abc': { enc: null, plain: 'sk-custom-plain' },
      },
      customProviders: [
        { id: 'custom-abc', label: 'My proxy', baseUrl: 'https://proxy.example.com/v1', models: ['gpt-image-1'] },
      ],
      settings: {
        models: { openai: 'dall-e-3', 'custom-abc': 'my-model' },
        size: '2:3',
        quality: 'high',
        imageSize: '2K',
        theme: 'ember',
      },
    }),
    'utf8'
  );
  await fsp.mkdir(path.join(ud, 'gallery'), { recursive: true });
  await fsp.writeFile(path.join(ud, 'gallery', 'g1.png'), PNG_1PX);
  await fsp.writeFile(path.join(ud, 'gallery', 'g2.png'), PNG_1PX);
  await fsp.writeFile(
    path.join(ud, 'gallery', 'index.json'),
    JSON.stringify([
      { id: 'g1', file: 'g1.png', thumb: 'data:…', createdAt: 111, kind: 'generate', provider: 'kie', prompt: 'a', model: 'nano-banana-2-1', aspect: '1:1', quality: '1K' },
      { id: 'g2', file: 'g2.png', thumb: '', createdAt: 222, kind: 'edit', provider: 'openai', prompt: 'b', model: 'gpt-image-1', aspect: '2:3', quality: 'high' },
    ])
  );

  const fakeSafeStorage = {
    decryptString: (buf) => {
      if (buf.toString().startsWith('garbage')) throw new Error('dpapi fail');
      return null;
    },
  };

  const result = await run({ userData: ud, dataDir, safeStorage: fakeSafeStorage, fs, path });
  const checks = [];
  const test = (name, fn) => {
    try {
      fn();
      checks.push('PASS  ' + name);
    } catch (e) {
      checks.push('FAIL  ' + name + ' — ' + e.message);
    }
  };

  const settings = JSON.parse(await fsp.readFile(path.join(dataDir, 'settings.json'), 'utf8'));
  const secrets = await fsp.readFile(path.join(dataDir, 'secrets.env'), 'utf8');

  test('migration ran once from v3', () => assert.strictEqual(result.from, 3));
  test('settings version 4 + provider kie', () => {
    assert.strictEqual(settings.version, 4);
    assert.strictEqual(settings.provider, 'kie');
  });
  test('theme ember preserved', () => assert.strictEqual(settings.settings.theme, 'ember'));
  test('size/quality/imageSize preserved', () => {
    assert.strictEqual(settings.settings.size, '2:3');
    assert.strictEqual(settings.settings.quality, 'high');
    assert.strictEqual(settings.settings.imageSize, '2K');
  });
  test('custom provider got Hermes keyEnv (URL hash)', () => {
    assert.strictEqual(settings.customProviders[0].keyEnv, customKeyEnv('https://proxy.example.com/v1'));
    assert.match(settings.customProviders[0].keyEnv, /^SUN_KEY_CUSTOM_[0-9A-F]{8}$/);
  });
  test('per-provider models migrated incl. custom', () => {
    assert.strictEqual(settings.settings.models.openai, 'dall-e-3');
    assert.strictEqual(settings.settings.models['custom-abc'], 'my-model');
  });
  test('plain keys → secrets.env, undecryptable enc falls back to plain', () => {
    assert.ok(secrets.includes('SUN_KEY_OPENAI=sk-openai-plain'));
    assert.ok(secrets.includes('SUN_KEY_AIPASS=sk-aikey-fallback'));
    assert.ok(secrets.includes('SUN_KEY_KIE=kie-key-123'));
    assert.ok(secrets.includes('SUN_KEY_CUSTOM_'));
    assert.ok(!secrets.includes('SUN_KEY_GOOGLE')); // empty key skipped
    assert.strictEqual(result.keys, 4);
  });
  test('secrets.env is NOT inside settings.json', () => {
    assert.ok(!JSON.stringify(settings).includes('sk-'));
  });
  test('gallery migrated with ext, without thumb', async () => {
    const idx = JSON.parse(await fsp.readFile(path.join(dataDir, 'gallery', 'index.json'), 'utf8'));
    assert.strictEqual(idx.length, 2);
    assert.strictEqual(idx[0].ext, 'png');
    assert.ok(!('thumb' in idx[0]));
    assert.strictEqual(idx[0].prompt, 'a');
    assert.strictEqual(result.gallery, 2);
  });
  test('legacy files untouched', async () => {
    const raw = await fsp.readFile(path.join(ud, 'settings.json'), 'utf8');
    assert.strictEqual(JSON.parse(raw).version, 3);
    assert.ok(fs.existsSync(path.join(ud, 'gallery', 'g1.png')));
  });
  test('idempotent — second run skipped', async () => {
    const r2 = await run({ userData: ud, dataDir, safeStorage: fakeSafeStorage, fs, path });
    assert.strictEqual(r2.migrated, false);
    assert.match(r2.skipped, /already present/);
  });

  console.log('\n=== migration tests ===');
  for (const c of checks) console.log(c);
  const failed = checks.filter((c) => c.startsWith('FAIL')).length;
  if (failed) process.exit(1);
  console.log('ALL ' + checks.length + ' MIGRATION TESTS PASSED');
}

main();
