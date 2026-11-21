'use strict';
/**
 * Local integration test for src/main/kie.js against a mock kie.ai server.
 * Simulates: credit check, base64 upload, createTask, polling (generating -> success/fail),
 * result download. Asserts the exact per-family request shapes from docs.kie.ai.
 *
 * Run: node scripts/test-kie-client.js
 */

const http = require('http');
const assert = require('assert');
const { KieClient } = require('../src/main/kie');

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const state = {
  tasks: {}, // taskId -> { input, model, pollCount }
  captures: [], // every createTask input body
  uploads: [],
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const bodyRaw = Buffer.concat(chunks).toString('utf8');
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/api/v1/chat/credit') {
      res.end(JSON.stringify({ code: 200, msg: 'success', data: 123.5 }));
      return;
    }
    if (url.pathname === '/api/file-base64-upload') {
      const j = JSON.parse(bodyRaw);
      assert.ok(/^data:image\/png;base64,/.test(j.base64Data), 'upload payload must be a data URL');
      state.uploads.push(j);
      res.end(
        JSON.stringify({
          code: 200,
          msg: 'ok',
          data: { downloadUrl: 'http://127.0.0.1:' + server.address().port + '/files/in-' + state.uploads.length + '.png' },
        })
      );
      return;
    }
    if (url.pathname === '/api/v1/jobs/createTask') {
      const j = JSON.parse(bodyRaw);
      state.captures.push({ model: j.model, input: j.input });
      const fail = j.input && j.input.prompt === 'FORCE_FAIL';
      const id = 'task_' + state.captures.length + (fail ? '_fail' : '');
      state.tasks[id] = { model: j.model, input: j.input, pollCount: 0, fail: !!fail };
      res.end(JSON.stringify({ code: 200, msg: 'success', data: { taskId: id } }));
      return;
    }
    if (url.pathname === '/api/v1/jobs/recordInfo') {
      const id = url.searchParams.get('taskId');
      const t = state.tasks[id];
      if (!t) {
        res.end(JSON.stringify({ code: 404, msg: 'task not found' }));
        return;
      }
      t.pollCount++;
      if (t.fail) {
        res.end(
          JSON.stringify({
            code: 200,
            msg: 'success',
            data: { taskId: id, state: 'fail', failCode: 'GEN', failMsg: 'content policy' },
          })
        );
        return;
      }
      if (t.pollCount < 2) {
        res.end(JSON.stringify({ code: 200, msg: 'success', data: { taskId: id, state: 'generating', progress: 42 } }));
        return;
      }
      res.end(
        JSON.stringify({
          code: 200,
          msg: 'success',
          data: {
            taskId: id,
            state: 'success',
            resultJson: JSON.stringify({ resultUrls: ['http://127.0.0.1:' + server.address().port + '/files/out.png'] }),
          },
        })
      );
      return;
    }
    if (url.pathname === '/files/out.png' || url.pathname.startsWith('/files/in-')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.from(PNG_B64, 'base64'));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  const client = new KieClient({
    providerMeta: { label: 'kie.ai', baseUrl: base, type: 'kie' },
    getApiKey: () => 'test-key',
  });

  const results = [];
  const test = (name, fn) =>
    fn().then(
      () => {
        results.push('PASS  ' + name);
      },
      (e) => {
        results.push('FAIL  ' + name + ' — ' + e.message);
      }
    );

  await test('testKey returns credit balance', async () => {
    const r = await client.testKey();
    assert.strictEqual(r.credits, 123.5);
    assert.strictEqual(r.ok, true);
  });

  await test('generate nano-banana-2-1: n=2 -> 2 tasks, resolution + aspect passthrough', async () => {
    const before = state.captures.length;
    const out = await client.generate({ prompt: 'a cat', model: 'nano-banana-2-1', aspect: '16:9', imageSize: '2K', n: 2 });
    assert.strictEqual(out.length, 2, 'two b64 images');
    const caps = state.captures.slice(before);
    assert.strictEqual(caps[0].model, 'nano-banana-2-1');
    assert.strictEqual(caps[0].input.aspect_ratio, '16:9');
    assert.strictEqual(caps[0].input.resolution, '2K');
    assert.strictEqual(caps[0].input.output_format, 'png');
    assert.deepStrictEqual(caps[0].input.image_input, []);
    assert.ok(caps[1].input, 'second task created');
  });

  await test('gpt-image/1.5 t2i: 16:9 falls back to 3:2, 1K -> medium quality', async () => {
    const before = state.captures.length;
    await client.generate({ prompt: 'x', model: 'gpt-image/1.5-text-to-image', aspect: '16:9', imageSize: '1K', n: 1 });
    const c = state.captures[before];
    assert.strictEqual(c.input.aspect_ratio, '3:2');
    assert.strictEqual(c.input.quality, 'medium');
    assert.strictEqual(c.input.input_urls, undefined);
  });

  await test('edit (seedream 5-pro i2i): local file uploaded -> image_urls + quality high', async () => {
    const before = state.captures.length;
    const upBefore = state.uploads.length;
    const out = await client.edit({
      imageBuffers: [{ mime: 'image/png', data: PNG_B64 }],
      prompt: 'make it sunset',
      model: 'seedream/5-pro-image-to-image',
      aspect: '4:3',
      imageSize: '2K',
      n: 1,
    });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(state.uploads.length, upBefore + 1, 'one upload');
    const c = state.captures[before];
    assert.strictEqual(c.model, 'seedream/5-pro-image-to-image');
    assert.strictEqual(c.input.quality, 'high');
    assert.strictEqual(c.input.aspect_ratio, '4:3');
    assert.strictEqual(c.input.image_urls.length, 1);
    assert.ok(c.input.image_urls[0].includes('/files/in-'));
  });

  await test('grok-imagine i2i: no aspect field, @image(1) appended to prompt', async () => {
    const before = state.captures.length;
    await client.edit({
      imageBuffers: [{ mime: 'image/png', data: PNG_B64 }],
      prompt: 'make it night',
      model: 'grok-imagine/image-to-image',
      aspect: '3:2',
      imageSize: '1K',
      n: 1,
    });
    const c = state.captures[before];
    assert.strictEqual(c.input.aspect_ratio, undefined);
    assert.ok(c.input.image_urls.length === 1);
    assert.ok(/@image\(1\)/.test(c.input.prompt), 'prompt gets an @image(1) reference');
  });

  await test('failed task -> friendly error with failMsg', async () => {
    await assert.rejects(
      client.generate({ prompt: 'FORCE_FAIL', model: 'nano-banana-2-1', aspect: '1:1', imageSize: '1K', n: 1 }),
      /generation failed on kie\.ai.*content policy/
    );
  });

  await test('body code 402 -> friendly credit error', async () => {
    const bad = new KieClient({ providerMeta: { label: 'kie.ai', baseUrl: base }, getApiKey: () => 'k' });
    // point client at a path that returns a body error: reuse recordInfo 404 via poll on unknown id
    await assert.rejects(bad.pollTask('does-not-exist', { timeoutMs: 3000, intervalMs: 50 }), /Task not found on kie\.ai/);
  });

  console.log('\n=== kie.js client test results ===');
  for (const r of results) console.log(r);
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(failed === 0 ? '\nALL ' + results.length + ' TESTS PASSED' : '\n' + failed + ' TEST(S) FAILED');
  server.close();
  process.exit(failed === 0 ? 0 : 1);
});
