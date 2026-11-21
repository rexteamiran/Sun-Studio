# Release routine

The whole pipeline is tag-driven: a pushed tag `vX.Y.Z` triggers GitHub Actions to build the
Windows installer and publish the GitHub Release that the in-app updater reads.

## Version locations (bump all together)

| file | what |
|---|---|
| `package.json` | `"version": "0.0.x"` (app + installer filename) |
| `scripts/gen_assets.py` | `center("v0.0.x", f_ver, 276, MUTED)` — sidebar art text |
| `CHANGELOG.md` | new section `[0.0.x] — date` |
| `README.md` | only when features/providers changed |

## Step by step

```bash
cd /home/z/my-project/sun-studio
TOK=$(cat /home/z/my-project/.secrets/ghtoken)   # never echo this

# 1) verify clean sync with origin (see AGENTS.md gotcha about the tracking ref)
git fetch "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" refs/heads/main:refs/remotes/origin/main
git status --short --branch

# 2) bump versions (package.json, gen_assets.py, CHANGELOG) + implement the change

# 3) regenerate installer art with the new version string
python3 scripts/gen_assets.py

# 4) static check + smoke-test every view, then LOOK at the screenshots
for f in src/main/*.js src/preload/*.js src/renderer/app.js; do node --check "$f"; done
nohup Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp >/tmp/xvfb.log 2>&1 & disown; sleep 1.5
for v in create edit restyle gallery settings; do
  DISPLAY=:99 SUN_SMOKE=1 SUN_VIEW=$v SUN_SHOT=/tmp/render/sun-$v.png \
    ./node_modules/.bin/electron . --no-sandbox 2>/dev/null | grep -E "SMOKE|Error"
done

# 5) commit main
git add -A
git commit -m "v0.0.x — one-line summary"
git push "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" main

# 6) tag + push the tag (this is what starts the build)
git tag -a v0.0.x -m "Sun Studio v0.0.x"
git push "https://x-access-token:$TOK@github.com/rexteamiran/Sun-Studio.git" v0.0.x

# 7) watch the run (≈4–5 min on windows-latest)
curl -sS -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/actions/runs?per_page=3"
# …poll until the newest run reports  status: completed, conclusion: success

# 8) verify the release has ALL THREE updater files
curl -sS -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/rexteamiran/Sun-Studio/releases/tags/v0.0.x"
# required assets: SunStudio-Setup-0.0.x.exe · latest.yml · SunStudio-Setup-0.0.x.exe.blockmap

# 9) download the deliverable and verify it
curl -sSL -o /home/z/my-project/download/SunStudio-Setup-0.0.x.exe \
  "https://github.com/rexteamiran/Sun-Studio/releases/download/v0.0.x/SunStudio-Setup-0.0.x.exe"
file /home/z/my-project/download/SunStudio-Setup-0.0.x.exe     # → "Nullsoft Installer self-extracting archive"
```

## Post-release checks

- `latest.yml` must contain the new `version:`, a `sha512:` and a `size:` matching the exe —
  that file is what installed clients poll for automatic updates.
- In-app update path to verify once per major mechanic change: installed older version →
  Settings → Updates → *Check for updates* → chip in top bar → download (progress bar) →
  *Restart & install*.
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
- Runner `windows-latest`, Node 22, `npm ci`,
  `npx electron-builder --win nsis --x64 --publish never`
  (`CSC_IDENTITY_AUTO_DISCOVERY=false` — no code signing yet).
- `--publish never` is intentional: the release is created by `softprops/action-gh-release@v2`
  which uploads `dist/*.exe`, `dist/*.yml`, `dist/*.blockmap`. electron-builder still writes
  `latest.yml` into `dist/` locally — that is the file the updater needs.
