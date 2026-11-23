# Build & development

## Prerequisites

- Node.js 20.9+ (CI uses 22 on windows-latest) + npm
- Python 3 with **Pillow** — to regenerate the icon + NSIS installer art (`scripts/gen_assets.py`, `scripts/gen_logo.py`)
- A browser for manual checks (the agent uses `agent-browser` headless Chrome); Xvfb for the
  headless Electron smoke on Linux

## Commands

```bash
npm install          # install deps (next, react, tailwind, electron, electron-updater, tsx)
npm run dev          # studio in a browser on http://127.0.0.1:3570 (hot reload)
npm run build        # production build (standalone output in .next/standalone)
npm start            # run the production server (127.0.0.1:3570)
npm run prepare:electron   # assemble server/ from .next/standalone (+ static) for the shell
npm run dist         # full Windows installer: next build → prepare:electron → NSIS exe in dist/
npm run test:clients             # provider client integration tests (local mock, no network)
node scripts/test-migration.cjs  # v0.0.6 → v0.0.8 data migration unit tests
node scripts/e2e-mock-openai.js  # tiny OpenAI-compatible mock for full-flow e2e
python3 scripts/gen_logo.py      # regenerate app/icon.png + electron/icon.png source
python3 scripts/gen_assets.py    # regenerate build/ NSIS art (icon.ico, BMPs, license.rtf)
```

## Packaging (`electron-builder.yml`)

- appId `com.rexteamiran.sunstudio`, productName `Sun Studio` — same as v0.0.6 so NSIS over-installs
  and the updater path keeps working.
- `files: electron/**/* + server/**/* + package.json`, **`asar: false`** — the server runs as a
  plain node child (`ELECTRON_RUN_AS_NODE`) and cannot read inside an asar.
- NSIS: assisted installer (not one-click), license page, user-pickable install dir, desktop +
  start-menu shortcuts, custom art from `build/` (version text lives in the sidebar BMP —
  regenerate after a version bump), `artifactName: SunStudio-Setup-${version}.${ext}`,
  `deleteAppDataOnUninstall: false`, `runAfterFinish: true`.
- `publish: { provider: github, owner: rexteamiran, repo: Sun-Studio }` — this is what puts the
  correct GitHub URLs into `latest.yml`; don't remove it.
- `electron-updater` must stay in **`dependencies`** (it ships inside the app).

## CI (`.github/workflows/build.yml`)

Trigger: tag `v*` push (or manual dispatch). Runner windows-latest, Node 22: checkout → `npm ci`
→ `npm run build` → `npm run prepare:electron` → `npx electron-builder --win nsis --x64 --publish
never` (`CSC_IDENTITY_AUTO_DISCOVERY=false`, no signing) → upload artifact → on tags,
`softprops/action-gh-release@v2` publishes `SunStudio-Setup-*.exe`, `latest.yml`, `*.blockmap`.

Those three files together are what makes the in-app updater work; the release step must never
drop `latest.yml` or the `.blockmap` (differential updates).
