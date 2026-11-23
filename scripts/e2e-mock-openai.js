/**
 * Tiny OpenAI-compatible mock for local end-to-end checks.
 * GET  /v1/models              -> model list
 * POST /v1/images/generations  -> one 64x64 PNG (b64_json)
 *
 * Run: node scripts/e2e-mock-openai.js [port]
 */
const http = require("http");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAKklEQVR4nO3NMQEAIAzAsIF/z0OGg6F3QNZYliVJkiRJkiRJkiRJkiRJkiT7ewGwrANY0dH3DwAAAABJRU5ErkJggg==",
  "base64"
);

const port = Number(process.argv[2] || 3990);
const calls = { models: 0, generations: 0 };

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (req.url === "/v1/models") {
        calls.models++;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: [{ id: "mock-img" }] }));
        return;
      }
      if (req.url === "/v1/images/generations") {
        const auth = req.headers.authorization || "";
        if (!auth.startsWith("Bearer ")) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: { message: "missing bearer" } }));
          return;
        }
        calls.generations++;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }] }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
  })
  .listen(port, "127.0.0.1", () => console.log("mock openai on http://127.0.0.1:" + port, JSON.stringify(calls)));
