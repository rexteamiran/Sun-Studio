# Release routine

The whole pipeline is tag-driven: a pushed tag `vX.Y.Z` triggers GitHub Actions to build the
Next.js standalone bundle and publish `SunStudio-Web-vX.Y.Z.zip` on the GitHub Release. There is
no in-app updater in the web edition — users re-download the zip (auto-update is a roadmap item).

## Version locations (bump all together)

| file | what |
|---|---|
| `package.json` | `"version": "0.0.x"` (also echoed by `/api/bootstrap`) |
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

# 2) bump versions (package.json + APP_VERSION + CHANGELOG) + implement the change

# 3) checks
npx tsc --noEmit
npm run test:clients
npm run build

# 4) run + walk every view with agent-browser, LOOK at each screenshot
#    (recipe in AGENTS.md → Smoke tests)

# 5) commit main
git add -A
git commit -m "v0.0.x — one-line summary"
git push "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" main

# 6) tag + push the tag (this starts the build)
git tag -a v0.0.x -m "Sun Studio v0.0.x"
git push "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" v0.0.x

# 7) watch the run (≈2–3 min on ubuntu-latest)
curl -sS -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/actions/runs?per_page=3"
# …poll until the newest run reports status: completed, conclusion: success

# 8) verify the release asset
curl -sS -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/releases/tags/v0.0.x"
# required asset: SunStudio-Web-v0.0.x.zip

# 9) download the deliverable and verify it
curl -sSL -o /home/z/my-project/download/SunStudio-Web-v0.0.x.zip \
  "https://github.com/rexteamiran/Sun-Studio/releases/download/v0.0.x/SunStudio-Web-v0.0.x.zip"
unzip -l /home/z/my-project/download/SunStudio-Web-v0.0.x.zip | head   # server.js + .next/static + public
```

## Post-release checks

- Unzip the release zip in a scratch dir, run `start-web.sh`, and open
  `http://127.0.0.1:3570` once — the UI must come up styled (CSS proves the static-copy step
  worked) and `/api/bootstrap` must answer.
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
Never force-push a reused tag over a different commit — release links are cached by version number.

## CI notes

- Workflow: `.github/workflows/build.yml` (name *Build Web Release*) — triggers: `push: tags: v*`
  + manual `workflow_dispatch`.
- Runner `ubuntu-latest`, Node 24, `npm ci` → `npm run build` (Next.js standalone output) →
  assemble bundle (`standalone` + `.next/static` + `public` + `start-web.sh/.bat` + `WEB.md` +
  empty `data/`) → zip → artifact + `softprops/action-gh-release@v2`.
