'use strict';
async function runTests(tests) {
  const results = [];
  for (const [name, fn] of tests) {
    try { await fn(); results.push({ name, status: 'PASS', error: '' }); }
    catch (error) { results.push({ name, status: 'FAIL', error: error instanceof Error ? error.stack || error.message : String(error) }); }
  }
  const passed = results.filter((result) => result.status === 'PASS').length;
  return { results, passed, failed: results.length - passed };
}
module.exports = { runTests };
