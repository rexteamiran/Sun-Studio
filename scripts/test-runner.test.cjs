'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { runTests } = require('./test-runner.cjs');

test('awaits asynchronous callbacks in order and records rejection', async () => {
  const order = [];
  const summary = await runTests([
    ['first', async () => { await new Promise((resolve) => setImmediate(resolve)); order.push('first'); }],
    ['second', () => { assert.deepEqual(order, ['first']); order.push('second'); }],
    ['rejection', async () => { await Promise.resolve(); throw Error('synthetic failure'); }],
  ]);
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.results[2].status, 'FAIL');
});
for (const kind of ['throw', 'reject', 'pass']) {
  test(kind + ' produces the correct child exit code', () => {
    const fn = kind === 'pass' ? 'async()=>{}' : kind === 'throw'
      ? '()=>{throw Error("synthetic")}' : 'async()=>{await Promise.resolve();throw Error("synthetic")}';
    const code = 'const {runTests}=require(' + JSON.stringify(require.resolve('./test-runner.cjs')) + ');' +
      'runTests([["first",' + fn + '],["later",()=>{}]]).then(r=>{console.log(JSON.stringify(r));process.exitCode=r.failed?1:0})';
    const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '-e', code], { encoding: 'utf8', timeout: 10000 });
    assert.ifError(child.error);
    assert.equal(child.signal, null);
    assert.equal(child.status, kind === 'pass' ? 0 : 1, child.stderr);
    assert.ok(JSON.parse(child.stdout).results.some((r) => r.name === 'later' && r.status === 'PASS'));
  });
}
