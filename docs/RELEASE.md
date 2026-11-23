# Release routine

The whole pipeline is tag-driven: a pushed tag `vX.Y.Z` triggers GitHub Actions (windows-latest)
to build the NSIS installer and publish the GitHub Release that the in-app updater reads.
**Required assets on every release: `SunStudio-Setup-X.Y.Z.exe` + `latest.yml` + the
`.blockmap`** — installed apps (including v0.0.6 ones) update through these.

## Version locations (bump all together)

| file | what |
|---|---|
| `package.json` | `"version": "0.0.x"` (app version + installer filename) |
| `scripts/gen_assets.py` | `center("v0.0.x", f_ver, 276, MUTED)` — sidebar art text |
| `src/server/service.ts` | `APP_VERSION = "0.0.x"` |
| `CHANGELOG.md` | new section `[0.0.x] — date` |
| `README.md` | only when features/providers changed |

## Step by step

```bash
cd /home/z/my-project/sun-studio
TOK=$(cat /home/z/my-project/.secrets/ghtoken)   # never echo this

# 1) verify clean sync with origin
git fetch "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" refs/heads/main:refs/remotes/origin/main
git status --short --branch

# 2) bump versions (package.json, gen_assets.py, APP_VERSION, CHANGELOG) + implement the change

# 3) checks
python3 scripts/gen_assets.py                       # regenerate sidebar art with the new version
npx tsc --noEmit
npm run test:clients
node scripts/test-migration.cjs
npm run build && npm run prepare:electron

# 4) run + walk every view with agent-browser, LOOK at each screenshot (AGENTS.md → Smoke tests)
#    + the Electron shell smoke under Xvfb (window, server spawn, migration)

# 5) commit main
git add -A
git commit -m "v0.0.x — one-line summary"
git push "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" main

# 6) tag + push the tag (this starts the build)
git tag -a v0.0.x -m "Sun Studio v0.0.x"
git push "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" v0.0.x

# 7) watch the run (≈5–6 min on windows-latest)
curl -sS -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/actions/runs?per_page=3"
# …poll until the newest run reports status: completed, conclusion: success

# 8) verify the release has ALL THREE updater files
curl -sS -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/releases/tags/v0.0.x"
# required assets: SunStudio-Setup-0.0.x.exe · latest.yml · SunStudio-Setup-0.0.x.exe.blockmap

# 9) download the deliverable and verify it
curl -sSL -o /home/z/my-project/download/SunStudio-Setup-0.0.x.exe \
  "https://github.com/rexteamiran/Sun-Studio/releases/download/v0.0.x/SunStudio-Setup-0.0.x.exe"
file /home/z/my-project/download/SunStudio-Setup-0.0.x.exe     # → "Nullsoft Installer self-extracting archive" / PE32
```

## Post-release checks

- `latest.yml` must contain the new `version:`, a `sha512:` and a `size:` matching the exe —
  that file is what installed clients (v0.0.6 included) poll for updates.
- In-app update path to verify once per major mechanic change: installed older version →
  Settings → Updates → *Check for updates* → chip in top bar → download (progress bar) →
  *Restart & install*. For v0.0.8 specifically: after the NSIS over-install, first launch must
  log the v0.0.6 migration (keys + gallery counts) and keep the legacy files untouched.
- Deliverable for the user goes to `/home/z/my-project/download/` and is linked in the final reply.

## Rollback

```bash
# delete a broken release + tag (remote), fix, re-tag
curl -sS -X DELETE -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/releases/tags/v0.0.x"   # get release id first
curl -sS -X DELETE -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/git/refs/tags/v0.0.x"
git tag -d v0.0.x
```
Never force-push a reused tag over a different commit — users' updaters cache by version number.

## CI notes

- Workflow: `.github/workflows/build.yml` (name *Build Windows Installer*) — triggers:
  `push: tags: v*` + manual `workflow_dispatch`.
- Runner windows-latest, Node 22, `npm ci` → `npm run build` → `npm run prepare:electron` →
  `npx electron-builder --win nsis --x64 --publish never` → artifact + release.
