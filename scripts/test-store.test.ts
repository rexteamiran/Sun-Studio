import fs from "node:fs";
import { upsertSecret } from "../src/server/secrets";
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store, CustomProviderKeySaveError } from "../src/server/store";
import { getClient, dropClient } from "../src/server/clients";
import { ProviderError } from "../src/server/providers/types";

async function fixture(t: TestContext) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "sun-store-test-"));
  const previous = process.env.SUN_STUDIO_DATA;
  process.env.SUN_STUDIO_DATA = dir;
  t.after(async () => { if (previous === undefined) delete process.env.SUN_STUDIO_DATA; else process.env.SUN_STUDIO_DATA = previous; await fsp.rm(dir, { recursive: true, force: true }); });
  const store = new Store();
  await store.load();
  await store.persist();
  return { dir, store };
}

test("failed rename preserves both disk and committed memory; queue recovers", async (t) => {
  const { store } = await fixture(t);
  const before = await fsp.readFile(store.file, "utf8");
  const state = structuredClone(store.data);
  const rename = t.mock.method(fsp, "rename", async () => { throw Error("synthetic rename failure"); });
  await assert.rejects(store.update({ theme: "paper" }), /rename failure/);
  assert.equal(await fsp.readFile(store.file, "utf8"), before);
  assert.deepEqual(store.data, state);
  rename.mock.restore();
  await store.update({ theme: "paper" });
  assert.equal(JSON.parse(await fsp.readFile(store.file, "utf8")).settings.theme, "paper");
});

test("concurrent commands retain independent updates", async (t) => {
  const { store } = await fixture(t);
  await Promise.all([store.update({ theme: "paper" }), store.update({ quality: "high" }), store.addModels("aipass", ["synthetic-model"])]);
  const disk = JSON.parse(await fsp.readFile(store.file, "utf8"));
  assert.equal(disk.settings.theme, "paper");
  assert.equal(disk.settings.quality, "high");
  assert.deepEqual(disk.extraModels.aipass, ["synthetic-model"]);
});

test("wx EEXIST never removes a temporary file owned by someone else", async (t) => {
  const { store } = await fixture(t);
  const before = await fsp.readFile(store.file, "utf8");
  let foreign = "";
  t.mock.method(fsp, "open", async (file: Parameters<typeof fsp.open>[0]) => {
    foreign = String(file);
    await fsp.writeFile(foreign, "unowned synthetic bytes");
    throw Object.assign(Error("synthetic EEXIST"), { code: "EEXIST" });
  });
  await assert.rejects(store.update({ theme: "paper" }), /EEXIST/);
  assert.equal(await fsp.readFile(foreign, "utf8"), "unowned synthetic bytes");
  assert.equal(await fsp.readFile(store.file, "utf8"), before);
});

test("corrupt existing settings fail closed without overwriting data", async (t) => {
  const { store } = await fixture(t);
  await fsp.writeFile(store.file, "{synthetic malformed JSON");
  const fresh = new Store();
  await assert.rejects(fresh.load(), /could not be loaded/);
  assert.equal(await fsp.readFile(store.file, "utf8"), "{synthetic malformed JSON");
});

test("duplicate-label endpoints bind keys to exact IDs and deleting last custom retains fallback", async (t) => {
  const { store } = await fixture(t);
  const a = await store.saveCustomProvider({ label: " Same ", baseUrl: "https://a.example/v1" }, "synthetic-key-a");
  const b = await store.saveCustomProvider({ label: "Same", baseUrl: "https://b.example/v1" }, "synthetic-key-b");
  assert.notEqual(a, b);
  assert.equal(store.getApiKey(a), "synthetic-key-a");
  assert.equal(store.getApiKey(b), "synthetic-key-b");
  await store.removeProvider("aipass");
  await store.deleteCustomProvider(a);
  await store.deleteCustomProvider(b);
  assert.deepEqual(store.data.enabledProviders, ["aipass"]);
  assert.equal(store.data.provider, "aipass");
});

test("key failure after settings commit has a stable saved ID and does not roll back endpoint", async (t) => {
  const { store } = await fixture(t);
  const write = fsp.writeFile.bind(fsp);
  t.mock.method(fsp, "writeFile", async (...args: Parameters<typeof fsp.writeFile>) => {
    if (String(args[0]).endsWith("secrets.env")) throw Error("synthetic key save failure");
    return write(...args);
  });
  let savedId = "";
  await assert.rejects(store.saveCustomProvider({ label: "Test", baseUrl: "https://endpoint.example/v1" }, "synthetic-key"), (error: unknown) => {
    assert.ok(error instanceof CustomProviderKeySaveError);
    savedId = error.providerId;
    assert.ok(!error.message.includes("synthetic-key"));
    return true;
  });
  assert.ok(store.data.customProviders.some((entry) => entry.id === savedId));
  assert.ok(JSON.parse(await fsp.readFile(store.file, "utf8")).customProviders.some((entry: { id: string }) => entry.id === savedId));
});

test("held and stale clients cannot send a new key to an old endpoint", async (t) => {
  const { store } = await fixture(t);
  const id = await store.saveCustomProvider({ label: "Test", baseUrl: "https://a.example/v1" }, "synthetic-key-a");
  const oldMeta = store.providerMeta(id)!;
  const held = getClient(id, store, oldMeta);
  const sent: { url: string; authorization: string | null }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  await held.testKey();
  await store.saveCustomProvider({ id, label: "Test", baseUrl: "https://b.example/v1" }, "synthetic-key-b");
  await assert.rejects(held.testKey(), (error: unknown) => error instanceof ProviderError && error.status === 409);
  dropClient(id);
  await assert.rejects(getClient(id, store, oldMeta).testKey(), (error: unknown) => error instanceof ProviderError && error.status === 409);
  const current = getClient(id, store, store.providerMeta(id)!);
  await current.testKey();
  assert.deepEqual(sent, [
    { url: "https://a.example/v1/models", authorization: "Bearer synthetic-key-a" },
    { url: "https://b.example/v1/models", authorization: "Bearer synthetic-key-b" },
  ]);
});

test("post-write key permission failure reports uncertainty without false rollback", async (t) => {
  const { store } = await fixture(t);
  const chmod = fsp.chmod.bind(fsp);
  t.mock.method(fsp, "chmod", async (...args: Parameters<typeof fsp.chmod>) => {
    if (String(args[0]).endsWith("secrets.env")) throw Error("synthetic post-write chmod fault");
    return chmod(...args);
  });
  let id = "";
  await assert.rejects(store.saveCustomProvider({ label: "Test", baseUrl: "https://a.example/v1" }, "synthetic-confirmation-key"), (error: unknown) => {
    assert.ok(error instanceof CustomProviderKeySaveError);
    id = error.providerId;
    assert.match(error.message, /could not be confirmed/);
    return true;
  });
  assert.ok(store.providerMeta(id));
  assert.equal(store.getApiKey(id), "synthetic-confirmation-key");
});

test("unreadable plaintext credentials do not erase retained keys on upsert", async (t) => {
  const { store, dir } = await fixture(t);
  const id = await store.saveCustomProvider({ label: "Test", baseUrl: "https://a.example/v1" }, "synthetic-retained");
  const secretFile = path.join(dir, "secrets.env");
  const before = await fsp.readFile(secretFile, "utf8");
  const read = t.mock.method(fs, "readFileSync", () => { throw Object.assign(Error("synthetic read fault"), { code: "EACCES" }); });
  await assert.rejects(store.setApiKey(id, "synthetic-replacement"), /Credential storage could not be read/);
  read.mock.restore();
  assert.equal(await fsp.readFile(secretFile, "utf8"), before);
});

test("credential upsert rejects line injection before modifying files", async (t) => {
  const { dir } = await fixture(t);
  await upsertSecret("SUN_KEY_TEST", "synthetic-retained");
  const file = path.join(dir, "secrets.env");
  const before = await fsp.readFile(file, "utf8");
  await assert.rejects(upsertSecret("SUN_KEY_TEST", "synthetic\nSUN_KEY_OTHER=synthetic-injected"), /invalid/);
  assert.equal(await fsp.readFile(file, "utf8"), before);
});