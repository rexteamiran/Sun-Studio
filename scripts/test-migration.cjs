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
const { runTests } = require('./test-runner.cjs');

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
  const tests = [];
  const test = (name, fn) => tests.push([name, fn]);

  const settings = JSON.parse(await fsp.readFile(path.join(dataDir, 'settings.json'), 'utf8'));
  const secrets = await fsp.readFile(path.join(dataDir, 'secrets.env'), 'utf8');

  test('migration ran once from v3', () => assert.strictEqual(result.from, 3));
  test('settings version 5 + provider kie', () => {
    assert.strictEqual(settings.version, 5);
    assert.strictEqual(settings.provider, 'kie');
  });
  test('enabledProviders seeded: active + every legacy key owner (custom included)', () => {
    assert.deepStrictEqual(settings.enabledProviders.sort(), ['aipass', 'custom-abc', 'kie', 'openai']);
  });
  test('extraModels starts empty', () => assert.deepStrictEqual(settings.extraModels, {}));
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
  test('unknown v0.0.6 theme → studio default (v0.0.10)', async () => {
    // rewrite the fixture with an unknown theme and re-run in a fresh dir
    const ud2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sun-legacy2-'));
    await fsp.writeFile(
      path.join(ud2, 'settings.json'),
      JSON.stringify({ version: 3, provider: 'kie', apiKeys: {}, customProviders: [], settings: { theme: 'neon-unknown' } })
    );
    const r2 = await run({ userData: ud2, dataDir: path.join(ud2, 'data'), safeStorage: fakeSafeStorage, fs, path });
    const s2 = JSON.parse(await fsp.readFile(path.join(ud2, 'data', 'settings.json'), 'utf8'));
    assert.strictEqual(r2.migrated, true);
    assert.strictEqual(s2.settings.theme, 'studio');
  });
  test('retired mono theme (v0.0.7/8) → studio', async () => {
    const ud3 = fs.mkdtempSync(path.join(os.tmpdir(), 'sun-legacy3-'));
    await fsp.writeFile(
      path.join(ud3, 'settings.json'),
      JSON.stringify({ version: 3, provider: 'kie', apiKeys: {}, customProviders: [], settings: { theme: 'mono' } })
    );
    await run({ userData: ud3, dataDir: path.join(ud3, 'data'), safeStorage: fakeSafeStorage, fs, path });
    const s3 = JSON.parse(await fsp.readFile(path.join(ud3, 'data', 'settings.json'), 'utf8'));
    assert.strictEqual(s3.settings.theme, 'studio');
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

  const summary = await runTests(tests);
  console.log('\n=== migration tests ===');
  for (const result of summary.results) console.log(result.status + '  ' + result.name + (result.error ? ' - ' + result.error : ''));
  if (summary.failed) process.exitCode = 1;
  else console.log('ALL ' + summary.passed + ' MIGRATION TESTS PASSED');
}

main().catch((error) => { console.error('Migration test runner failed:', error); process.exitCode = 1; });
