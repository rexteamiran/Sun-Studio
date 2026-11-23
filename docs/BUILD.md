# Build & development

## Prerequisites

- Node.js 20.9+ (CI uses 24) + npm
- Python 3 with **Pillow** — only to regenerate the favicon (`scripts/gen_logo.py`)
- A browser for manual checks (the agent uses `agent-browser` headless Chrome)

## Commands

```bash
npm install          # install deps (next, react, tailwind, tsx)
npm run dev          # dev server on http://127.0.0.1:3570 (hot reload)
npm run build        # production build (standalone output in .next/standalone)
npm start            # run the production server (127.0.0.1:3570)
npm run serve        # run the standalone bundle directly (after build)
npm run test:clients # provider client integration tests (local mock, no network)
node scripts/e2e-mock-openai.js   # tiny OpenAI-compatible mock for full-flow e2e
python3 scripts/gen_logo.py       # regenerate app/icon.png (black-and-white logomark)
```

Dev-mode notes:
- The dev server uses the same `data/` folder as production — use `SUN_STUDIO_DATA=/tmp/sun-data`
  if you want scratch data while developing.
- The UI is plain React served by Next; there is no mock-api shim — with the server running,
  every view works for real (add the e2e mock as a custom provider to generate without a real key).

## Favicon / logomark

`app/icon.png` is committed and produced by `scripts/gen_logo.py` (white sun mark on a black
rounded square — matches the inline `components/Logo.tsx` SVG). After changing the script:
`python3 scripts/gen_logo.py` and commit the regenerated file.

## Packaging

`next.config.ts` sets `output: "standalone"`. The release bundle is assembled in CI:
`.next/standalone` (server.js + minimal node_modules) + `.next/static` + `public` +
`start-web.sh` / `start-web.bat` + `WEB.md` + an empty `data/`. See `docs/RELEASE.md`.

## CI (`.github/workflows/build.yml`)

Trigger: tag `v*` push (or manual dispatch). Steps: checkout → setup-node 24 (npm cache) →
`npm ci` → `npm run build` → assemble bundle → zip `SunStudio-Web-<tag>.zip` → upload artifact →
on tags, `softprops/action-gh-release@v2` publishes the release with the zip.
