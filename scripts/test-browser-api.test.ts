import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, operationMessage, operationErrorMessage, validOption } from "../components/api";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("partial images and all task IDs remain visible without any automatic retry", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => response({
    items: [{ id: "synthetic-image", url: "/api/gallery/file/synthetic-image" }], partial: true,
    failures: [{ index: 1, status: 429, message: "Synthetic limit", taskId: "task-failure" }], taskIds: ["task-top"],
  }));
  const result = await api.generate({ prompt: "Synthetic fixture" });
  assert.equal(result.items.length, 1);
  assert.equal(result.partial, true);
  const message = operationMessage(result);
  for (const text of ["Partial result", "Image 2", "task-failure", "task-top", "No automatic retry", "incur charges"]) assert.ok(message.includes(text), text);
  assert.equal(fetch.mock.callCount(), 1);
});

test("full image failure preserves task evidence and reports uncertain remote outcome", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => response({ error: "Synthetic failure", taskIds: ["task-full"],
    failures: [{ index: 0, status: 503, message: "Synthetic failure", taskId: "task-detail" }] }, 503));
  await assert.rejects(api.edit({ prompt: "Synthetic fixture" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 503);
    const message = operationErrorMessage(error);
    for (const text of ["task-full", "task-detail", "may be unknown", "No automatic retry"]) assert.ok(message.includes(text));
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
});

test("custom saved-endpoint errors retain exact ID and do not retry", async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    requests.push(String(url));
    return response({ error: "Endpoint saved; key update unconfirmed.", endpointSaved: true, providerId: "synthetic-exact-id" }, 409);
  });
  await assert.rejects(api.custom("save", { provider: { label: "Synthetic" } }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.endpointSaved, true);
    assert.equal(error.providerId, "synthetic-exact-id");
    return true;
  });
  assert.deepEqual(requests, ["/api/custom-providers"]);
});

test("malformed and empty successful image responses are not success", async (t) => {
  for (const body of [{}, { items: null }, { items: [null] }, { items: [] }, { items: [], partial: "yes" }, { error: "Synthetic body error", items: [] }]) {
    t.mock.method(globalThis, "fetch", async () => response(body));
    await assert.rejects(api.generate({}), ApiError);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, "fetch", async () => new Response("not json", { status: 200 }));
  await assert.rejects(api.generate({}), ApiError);
});

test("gallery HTTP, shape and delete confirmation failures never report empty or deleted success", async (t) => {
  for (const body of [{ error: "Synthetic gallery failure" }, {}, { items: [null] }]) {
    t.mock.method(globalThis, "fetch", async () => response(body));
    await assert.rejects(api.gallery(), ApiError);
    t.mock.restoreAll();
  }
  for (const status of [200, 500]) {
    t.mock.method(globalThis, "fetch", async () => response({ ok: false, error: "Synthetic deletion failure" }, status));
    await assert.rejects(api.galleryDelete("synthetic-image"), ApiError);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, "fetch", async () => response({ ok: true }));
  assert.deepEqual(await api.galleryDelete("synthetic-image"), { ok: true });
});

test("saved key requires confirmed server success for the same ID", async (t) => {
  for (const body of [{ ok: false }, { ok: true, provider: "wrong", hasKey: true }, {}]) {
    t.mock.method(globalThis, "fetch", async () => response(body));
    await assert.rejects(api.saveKey("synthetic-id", "synthetic-key"), ApiError);
    t.mock.restoreAll();
  }
});

test("option fallback only selects values advertised by current metadata", () => {
  assert.equal(validOption("4K", ["1K", "2K"], "2K"), "2K");
  assert.equal(validOption("4K", ["1K", "2K"], "4K"), "1K");
  assert.equal(validOption("2K", ["1K", "2K"], "1K"), "2K");
  assert.equal(validOption("unchanged", null, "fallback"), "unchanged");
});
