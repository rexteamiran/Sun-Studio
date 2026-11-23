/**
 * Client integration tests against a local mock — no network, no keys.
 * Verifies the exact request shapes each provider client produces:
 *   - OpenAI-compatible: /models (test), /images/generations size/quality mapping
 *   - Google: /v1beta/interactions body (input blocks + response_format)
 *   - kie.ai: credit check, base64 upload, createTask input per family, polling
 *
 * Run: npm run test:clients   (tsx)
 */
import http from "http";
import assert from "assert";
import { OpenAICompatibleClient } from "../src/server/providers/openai";
import { GoogleClient } from "../src/server/providers/google";
import { KieClient } from "../src/server/providers/kie";
import type { ProviderMeta } from "../src/server/providers/types";

// payload must exceed collectImageBlocks' 1024-char heuristic (same as production data)
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" +
  "iVBORw0KGgo".repeat(120);

const captured: { name: string; value: unknown }[] = [];
const kieTasks: Record<string, { polls: number; fail: boolean }> = {};

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, "http://x");
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/json");

    // ---- OpenAI-compatible mock ----
    if (url.pathname === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "m-a" }, { id: "m-b" }] }));
      return;
    }
    if (url.pathname === "/v1/images/generations") {
      captured.push({ name: "openai.generate", value: JSON.parse(raw.toString()) });
      res.end(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }));
      return;
    }

    // ---- Google mock ----
    if (url.pathname === "/v1beta/interactions") {
      captured.push({ name: "google.interactions", value: JSON.parse(raw.toString()) });
      res.end(
        JSON.stringify({
          steps: [{ output_image: { mime_type: "image/png", data: PNG_B64 } }],
        })
      );
      return;
    }

    // ---- kie.ai mock ----
    if (url.pathname === "/api/v1/chat/credit") {
      res.end(JSON.stringify({ code: 200, msg: "success", data: 55.5 }));
      return;
    }
    if (url.pathname === "/api/file-base64-upload") {
      res.end(
        JSON.stringify({
          code: 200,
          msg: "ok",
          data: { downloadUrl: "http://127.0.0.1:" + (server.address() as { port: number }).port + "/files/in.png" },
        })
      );
      return;
    }
    if (url.pathname === "/api/v1/jobs/createTask") {
      const j = JSON.parse(raw.toString());
      captured.push({ name: "kie.createTask:" + j.model, value: j.input });
      const id = "task_" + captured.length + (j.input?.prompt === "FORCE_FAIL" ? "_f" : "");
      kieTasks[id] = { polls: 0, fail: !!j.input?.prompt?.includes?.("FORCE_FAIL") };
      res.end(JSON.stringify({ code: 200, msg: "success", data: { taskId: id } }));
      return;
    }
    if (url.pathname === "/api/v1/jobs/recordInfo") {
      const id = url.searchParams.get("taskId")!;
      const t = kieTasks[id];
      if (!t) {
        res.end(JSON.stringify({ code: 404, msg: "task not found" }));
        return;
      }
      t.polls++;
      if (t.fail) {
        res.end(JSON.stringify({ code: 200, data: { state: "fail", failMsg: "content policy" } }));
        return;
      }
      if (t.polls < 2) {
        res.end(JSON.stringify({ code: 200, data: { state: "generating", progress: 42 } }));
        return;
      }
      res.end(
        JSON.stringify({
          code: 200,
          data: {
            state: "success",
            resultJson: JSON.stringify({
              resultUrls: ["http://127.0.0.1:" + (server.address() as { port: number }).port + "/files/out.png"],
            }),
          },
        })
      );
      return;
    }
    if (url.pathname === "/files/out.png" || url.pathname.startsWith("/files/in")) {
      res.setHeader("Content-Type", "image/png");
      res.end(Buffer.from(PNG_B64, "base64"));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
});

function openAiMeta(baseUrl: string): ProviderMeta {
  return {
    id: "mock",
    label: "Mock",
    type: "openai-compatible",
    baseUrl,
    keyHint: "",
    aspects: [],
    qualities: null,
    resolutions: null,
    background: true,
    dynamicModels: false,
    models: [],
    defaultModel: "m-a",
    keyEnv: "SUN_KEY_MOCK",
  };
}

function kieMeta(baseUrl: string): ProviderMeta {
  return { ...openAiMeta(baseUrl), label: "kie.ai", type: "AI marketplace · task API" };
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const key = () => "test-key";

  const results: string[] = [];
  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push("PASS  " + name);
    } catch (e) {
      results.push("FAIL  " + name + " — " + (e as Error).message);
    }
  };

  const openai = new OpenAICompatibleClient({ providerMeta: openAiMeta(base + "/v1"), getApiKey: key });
  const google = new GoogleClient({ getApiKey: key, baseUrl: base + "/v1beta" });
  const kie = new KieClient({ providerMeta: kieMeta(base), getApiKey: key });

  await test("openai.testKey lists models", async () => {
    const r = await openai.testKey();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.models, 2);
  });

  await test("openai.generate maps size + quality + background (dall-e-3 override)", async () => {
    const out = await openai.generate({ prompt: "p", model: "dall-e-3", aspect: "2:3", quality: "high", n: 1 });
    assert.strictEqual(out.length, 1);
    const body = captured.reverse().find((c) => c.name === "openai.generate")!.value as Record<string, unknown>;
    assert.strictEqual(body.size, "1024x1792"); // dall-e-3 portrait override
    assert.strictEqual(body.quality, "hd");
    assert.strictEqual(body.response_format, "b64_json");
  });

  await test("openai.generate passes transparent background for gpt-image-1", async () => {
    await openai.generate({ prompt: "p", model: "gpt-image-1", aspect: "1:1", quality: "medium", n: 1, background: "transparent" });
    const body = captured.reverse().find((c) => c.name === "openai.generate")!.value as Record<string, unknown>;
    assert.strictEqual(body.size, "1024x1024");
    assert.strictEqual(body.quality, "medium");
    assert.strictEqual(body.background, "transparent");
  });

  await test("google.generate builds Interactions body with aspect + size", async () => {
    const out = await google.generate({ prompt: "p", model: "gemini-3.1-flash-image", aspect: "16:9", imageSize: "2K", n: 1 });
    assert.strictEqual(out.length, 1);
    const body = captured.reverse().find((c) => c.name === "google.interactions")!.value as {
      model: string;
      input: { type: string }[];
      response_format: Record<string, unknown>;
    };
    assert.strictEqual(body.model, "gemini-3.1-flash-image");
    assert.strictEqual(body.input[body.input.length - 1].type, "text");
    assert.strictEqual(body.response_format.aspect_ratio, "16:9");
    assert.strictEqual(body.response_format.image_size, "2K");
  });

  await test("kie.testKey reads credit balance", async () => {
    const r = await kie.testKey();
    assert.strictEqual(r.credits, 55.5);
  });

  await test("kie.generate nano-banana-2-1: aspect/resolution/output_format", async () => {
    const before = captured.filter((c) => c.name.startsWith("kie.createTask")).length;
    const out = await kie.generate({ prompt: "cat", model: "nano-banana-2-1", aspect: "16:9", imageSize: "2K", n: 2 });
    assert.strictEqual(out.length, 2);
    const tasks = captured.filter((c) => c.name.startsWith("kie.createTask")).slice(before);
    const input = tasks[0].value as Record<string, unknown>;
    assert.strictEqual(input.aspect_ratio, "16:9");
    assert.strictEqual(input.resolution, "2K");
    assert.strictEqual(input.output_format, "png");
    assert.deepStrictEqual(input.image_input, []);
  });

  await test("kie.edit gpt-image i2i: uploads file, uses input_urls + quality mapping", async () => {
    const before = captured.filter((c) => c.name.startsWith("kie.createTask")).length;
    const out = await kie.edit({
      imageBuffers: [{ mime: "image/png", data: PNG_B64 }],
      prompt: "dress the woman",
      model: "gpt-image/1.5-image-to-image",
      aspect: "16:9",
      imageSize: "1K",
      n: 1,
    });
    assert.strictEqual(out.length, 1);
    const input = captured.filter((c) => c.name.startsWith("kie.createTask")).slice(before)[0].value as Record<
      string,
      unknown
    >;
    assert.strictEqual(input.aspect_ratio, "3:2"); // 16:9 falls back on gpt-image
    assert.strictEqual(input.quality, "medium"); // 1K -> medium
    assert.strictEqual((input.input_urls as string[]).length, 1);
  });

  await test("kie grok i2i: no aspect field, @image(1) appended", async () => {
    const before = captured.filter((c) => c.name.startsWith("kie.createTask")).length;
    await kie.edit({
      imageBuffers: [{ mime: "image/png", data: PNG_B64 }],
      prompt: "make it night",
      model: "grok-imagine/image-to-image",
      aspect: "3:2",
      imageSize: "1K",
      n: 1,
    });
    const input = captured.filter((c) => c.name.startsWith("kie.createTask")).slice(before)[0].value as Record<
      string,
      unknown
    >;
    assert.strictEqual(input.aspect_ratio, undefined);
    assert.ok(/@image\(1\)/.test(input.prompt as string));
  });

  await test("kie failed task surfaces failMsg", async () => {
    await assert.rejects(
      kie.generate({ prompt: "FORCE_FAIL", model: "nano-banana-2-1", aspect: "1:1", imageSize: "1K", n: 1 }),
      /generation failed on kie\.ai.*content policy/
    );
  });

  console.log("\n=== client tests ===");
  for (const r of results) console.log(r);
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  server.close();
  if (failed) process.exit(1);
  console.log("ALL " + results.length + " TESTS PASSED");
}

main();
