# Build & development

## Prerequisites

- Node.js 22 (CI uses 22; 20+ works) + npm
- Python 3 with **Pillow** — only to regenerate installer assets (`scripts/gen_assets.py`)
- Windows (only for producing the NSIS installer; dev runs cross-platform)

## Commands

```bash
npm install          # install deps (electron, electron-builder, electron-updater)
npm start            # run the app in dev mode
npm run dist         # build the Windows NSIS installer into dist/
npm run dist:portable# portable exe variant (no installer)
```

Dev-mode notes:
- The updater intentionally does nothing unpackaged (`update:*` handlers answer `{error:'dev'}`).
- Without `window.sun` (plain browser opening `src/renderer/index.html`) the UI runs on
  `createMockApi()` with fake results — useful for design work only.
- Headless dev/testing: `Xvfb :99` + `DISPLAY=:99` (see the smoke-test recipe in `AGENTS.md`).

## Installer assets

`build/` is **committed** and produced by `scripts/gen_assets.py`:

| output | used for |
|---|---|
| `icon.ico` / `icon.png` | exe/window icon |
| `installerSidebar.bmp` (164×314) | NSIS wizard sidebar — contains the **version text** |
| `installerHeader.bmp` (150×57) | wizard header |
| `license.rtf` | license page (Apache-2.0 text) |

After changing anything in the script (including the version string): `python3 scripts/gen_assets.py`
and commit the regenerated `build/` files.

## Packaging config (`electron-builder.yml`)

- `appId: com.rexteamiran.sunstudio`, `productName: Sun Studio`
- `files: src/**/*` + bundled `package.json`; `asar: true`
- NSIS: assisted installer (not one-click), license page, user-pickable install dir,
  desktop + start-menu shortcuts, custom art from `build/`
- `publish: { provider: github, owner: rexteamiran, repo: Sun-Studio }` — this is what puts the
  correct GitHub URLs into `latest.yml`; don't remove it.
- Runtime deps (`dependencies`) ship inside the asar — `electron-updater` must stay there.

## CI (`.github/workflows/build.yml`)

Trigger: tag `v*` push (or manual dispatch). Steps: checkout → setup-node 22 (npm cache) →
`npm ci` → `npx electron-builder --win nsis --x64 --publish never`
(`CSC_IDENTITY_AUTO_DISCOVERY=false`, no signing) → upload artifact → on tags,
`softprops/action-gh-release@v2` publishes the release with
`SunStudio-Setup-*.exe`, `latest.yml`, `*.blockmap`.

Those three files together are what makes the in-app updater work; the release step must never
drop `latest.yml` or the `.blockmap` (differential updates).
