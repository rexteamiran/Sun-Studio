import { OpenAICompatibleClient } from "../src/server/providers/openai";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSequentialImages, ImageBatchError } from "../src/server/providers/batch";
import { GoogleClient } from "../src/server/providers/google";
import { KieClient } from "../src/server/providers/kie";
import { OpenRouterClient } from "../src/server/providers/openrouter";
import { StabilityClient } from "../src/server/providers/stability";
import { PROVIDERS } from "../src/server/providers/registry";
import { ProviderError, type ImageClient } from "../src/server/providers/types";

const image = { mime: "image/png", data: Buffer.from("synthetic image").toString("base64") };
const key = () => "synthetic-key";

test("sequential batch persists before dispatch and stops after one failure", async () => {
  let calls = 0;
  const saved: string[] = [];
  const events: string[] = [];
  await assert.rejects(runSequentialImages(4, async () => {
    calls++;
    events.push("call" + calls);
    if (calls === 2) throw new ProviderError("synthetic rate limit", 429);
    return [image.data];
  }, async (base64) => { saved.push(base64); events.push("save"); }), (error: unknown) => {
    assert.ok(error instanceof ImageBatchError);
    assert.equal(error.failures[0].status, 429);
    assert.equal(error.failures[0].index, 1);
    assert.deepEqual(error.images, saved);
    return true;
  });
  assert.equal(calls, 2);
  assert.deepEqual(events, ["call1", "save", "call2"]);
});

test("persistence failure prevents a second paid submission", async () => {
  let calls = 0;
  await assert.rejects(runSequentialImages(4, async () => { calls++; return [image.data]; },
    async () => { throw Error("synthetic save failure"); }), /save failure/);
  assert.equal(calls, 1);
});

test("Stability diagnostics never invoke fetch", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw Error("unexpected network"); });
  const result = await new StabilityClient({ getApiKey: key }).testKey();
  assert.equal(result.ok, false);
  assert.match(result.message || "", /Not tested/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("separate non-OpenAI masks reject before any network request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw Error("unexpected network"); });
  const clients: ImageClient[] = [new GoogleClient({ getApiKey: key }),
    new KieClient({ providerMeta: PROVIDERS.kie, getApiKey: key }),
    new OpenRouterClient({ getApiKey: key }), new StabilityClient({ getApiKey: key })];
  for (const client of clients) await assert.rejects(client.edit({ imageBuffers: [image],
    maskPng: Buffer.from("synthetic mask"), prompt: "edit", model: "sd3.5-medium", n: 1 }),
    (error: unknown) => error instanceof ProviderError && error.status === 400);
  assert.equal(fetch.mock.callCount(), 0);
});

test("Stability unsupported models and multiple references reject without fetch", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw Error("unexpected network"); });
  const client = new StabilityClient({ getApiKey: key });
  for (const model of ["core", "ultra"]) await assert.rejects(client.edit({ imageBuffers: [image],
    prompt: "edit", model, n: 1 }), /Select an SD3.5 model explicitly/);
  await assert.rejects(client.edit({ imageBuffers: [image, image], prompt: "edit", model: "sd3.5-medium" }), /one reference/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("Kie collects an already submitted task after a later creation failure", async (t) => {
  const client = new KieClient({ providerMeta: PROVIDERS.kie, getApiKey: key });
  let creates = 0;
  const polled: string[] = [];
  const tasks: string[] = [];
  const saved: string[] = [];
  t.mock.method(client, "createTask", async () => { if (++creates === 2) throw new ProviderError("synthetic limit", 429); return "synthetic-task-1"; });
  t.mock.method(client, "pollTask", async (id: string) => { polled.push(id); return ["https://synthetic.example/image"]; });
  t.mock.method(globalThis, "fetch", async () => new Response(Buffer.from("synthetic output"), { status: 200 }));
  await assert.rejects(client.generate({ prompt: "test", model: "nano-banana-2-1", n: 4,
    onImage: async (data) => { saved.push(data); }, onTask: (id) => tasks.push(id) }),
    (error: unknown) => error instanceof ImageBatchError && error.taskIds[0] === "synthetic-task-1");
  assert.equal(creates, 2);
  assert.deepEqual(polled, tasks);
  assert.equal(saved.length, 1);
});

test("unsupported Kie edit recipes and DALL-E 3 never dispatch", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw Error("unexpected network"); });
  const kie = new KieClient({ providerMeta: PROVIDERS.kie, getApiKey: key });
  const upload = t.mock.method(kie, "uploadImage", async () => { throw Error("unexpected upload"); });
  for (const model of ["nano-banana", "gpt-image/1.5-text-to-image", "synthetic-unknown"]) {
    await assert.rejects(kie.edit({ imageBuffers: [image], prompt: "edit", model }),
      (error: unknown) => error instanceof ProviderError && error.status === 400);
  }
  const openai = new OpenAICompatibleClient({ providerMeta: PROVIDERS.openai, getApiKey: key });
  await assert.rejects(openai.edit({ images: [image], prompt: "edit", model: "dall-e-3" }),
    (error: unknown) => error instanceof ProviderError && error.status === 400);
  assert.equal(upload.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test("OpenAI editing preserves WebP MIME, filename and bytes", async (t) => {
  const bytes = Buffer.from("synthetic WebP bytes");
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    assert.ok(init?.body instanceof FormData);
    const file = init.body.get("image") as File;
    assert.equal(file.type, "image/webp");
    assert.equal(file.name, "image0.webp");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    return new Response(JSON.stringify({ data: [{ b64_json: image.data }] }), { status: 200 });
  });
  const client = new OpenAICompatibleClient({ providerMeta: PROVIDERS.openai, getApiKey: key });
  await client.edit({ images: [{ mime: "image/webp", data: bytes.toString("base64") }], prompt: "edit", model: "gpt-image-1" });
});