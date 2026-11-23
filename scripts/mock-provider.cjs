#!/usr/bin/env node
/** Tiny mock OpenAI-compatible server for the fetch-models UI test. */
const http = require('http');
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/v1/models') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [
      { id: 'flux-pro' }, { id: 'flux-dev' }, { id: 'sdxl-base' }, { id: 'mock-image-xl' },
    ]}));
    return;
  }
  res.statusCode = 404;
  res.end('{}');
});
server.listen(3999, '127.0.0.1', () => console.log('mock on 3999'));
setTimeout(() => process.exit(0), 120000);
