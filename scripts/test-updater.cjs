/**
 * Updater wiring tests — plain node with mocked `electron` / `electron-updater`
 * modules (no Electron runtime needed). Regression guards for the v0.0.12 fix:
 *   1. main.cjs passes `win: () => win` (a getter) — every update event must
 *      reach the renderer without a TypeError.
 *   2. Installers built before v0.0.12 have no app-update.yml → the GitHub
 *      feed must be set at runtime (setFeedURL) or checkForUpdates() dies.
 *   3. A baked-in app-update.yml → no runtime override.
 *   4. All four IPC channels registered; open-releases opens the releases URL.
 *   5. Background auto-check runs only in packaged builds.
 *
 * Run: npm run test:updater
 */
const Module = require("module");
const path = require("path");
const fs = require("fs");
const os = require("os");
const assert = require("assert");

// ---- mock infrastructure -------------------------------------------------
const listeners = {};
const handlers = {};
const sent = [];
let feedURLCalls = [];
let checkCalls = 0;
let openedUrl = null;
let IS_PACKAGED = true;
let APP_DIR = path.join(os.tmpdir(), "sun-updater-mock", "resources", "app");

const fakeAutoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: true,
  logger: null,
  setFeedURL(cfg) { feedURLCalls.push(JSON.parse(JSON.stringify(cfg))); },
  checkForUpdates() { checkCalls++; return Promise.resolve({ updateInfo: { version: "0.0.12" } }); },
  quitAndInstall() { /* not exercised */ },
  on(ev, fn) { listeners[ev] = fn; },
};

const electronMock = {
  app: {
    getAppPath: () => APP_DIR,
    isPackaged: () => IS_PACKAGED,
    get isPackaged() { return IS_PACKAGED; },
  },
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
  shell: { openExternal: (u) => { openedUrl = u; } },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return electronMock;
  if (request === "electron-updater") return { autoUpdater: fakeAutoUpdater };
  return origLoad.call(this, request, parent, isMain);
};

// ---- run -------------------------------------------------------------------
const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push("PASS  " + name);
  } catch (e) {
    results.push("FAIL  " + name + " — " + e.message);
  }
};

process.env.SUN_UPDATE_CHECK_DELAY = "40"; // keep the auto-check test fast

function freshRequire() {
  delete require.cache[require.resolve("../electron/updater.cjs")];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../electron/updater.cjs");
}

const fakeWin = () => ({
  isDestroyed: () => false,
  webContents: { send: (ch, s) => sent.push({ ch, state: s }) },
});

// 1+2: getter-shaped win, no app-update.yml → fallback feed set
const { initUpdater } = freshRequire();
const u = initUpdater({ win: fakeWin });

test("missing app-update.yml → setFeedURL with the GitHub fallback feed", () => {
  assert.strictEqual(feedURLCalls.length, 1);
  assert.deepStrictEqual(feedURLCalls[0], { provider: "github", owner: "rexteamiran", repo: "Sun-Studio" });
});

test("all four IPC channels registered", () => {
  for (const ch of ["update:check", "update:install", "update:state", "update:open-releases"]) {
    assert.ok(typeof handlers[ch] === "function", "missing handler " + ch);
  }
});

test("update events reach the renderer through the win getter (no TypeError)", () => {
  listeners["checking-for-update"]();
  listeners["update-available"]({ version: "0.0.12" });
  listeners["download-progress"]({ percent: 42.4, transferred: 1, total: 2, BPS: 3000 });
  assert.strictEqual(sent.length, 3);
  assert.strictEqual(sent[0].state.status, "checking");
  assert.strictEqual(sent[1].state.status, "downloading");
  assert.strictEqual(sent[1].state.version, "0.0.12");
  assert.strictEqual(sent[2].state.progress.percent, 42);
});

test("downloaded → ready, error surfaces its message", () => {
  listeners["update-downloaded"]({ version: "0.0.12" });
  assert.strictEqual(sent[3].state.status, "ready");
  listeners["error"](new Error("boom"));
  assert.strictEqual(sent[4].state.status, "error");
  assert.ok(sent[4].state.error.includes("boom"));
});

test("update:state IPC returns the live state object", () => {
  const s = handlers["update:state"]();
  assert.strictEqual(s.status, "error");
  assert.ok(s.error.includes("boom"));
});

test("update:open-releases opens the releases page", () => {
  handlers["update:open-releases"]();
  assert.strictEqual(openedUrl, "https://github.com/rexteamiran/Sun-Studio/releases/latest");
});

// ---- packaged auto-check (delay 40ms via env) -----------------------------
checkCalls = 0;
const t0 = Date.now();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => setTimeout(r, 250));
  test("packaged → background auto-check fires", () => assert.ok(checkCalls >= 1, "auto-check did not run"));

  // dev (not packaged): no auto-check, and no duplicate feed override
  IS_PACKAGED = false;
  feedURLCalls = [];
  checkCalls = 0;
  sent.length = 0;
  const { initUpdater: init2 } = freshRequire();
  init2({ win: fakeWin });
  await new Promise((r) => setTimeout(r, 250));
  test("dev (not packaged) → no background auto-check", () => assert.strictEqual(checkCalls, 0));
  test("dev still gets the runtime feed (no dev-app-update.yml either)", () => assert.strictEqual(feedURLCalls.length, 1));

  // 3: baked-in app-update.yml → no override
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.writeFileSync(path.join(path.dirname(APP_DIR), "app-update.yml"), "provider: github\n");
  IS_PACKAGED = true;
  feedURLCalls = [];
  const { initUpdater: init3 } = freshRequire();
  init3({ win: fakeWin });
  test("baked app-update.yml present → no runtime feed override", () => assert.strictEqual(feedURLCalls.length, 0));

  console.log("\n=== updater tests ===");
  for (const c of results) console.log(c);
  const failed = results.filter((c) => c.startsWith("FAIL")).length;
  if (failed) process.exit(1);
  console.log("ALL " + results.length + " UPDATER TESTS PASSED");
  process.exit(0);
})();
