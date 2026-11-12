# Design

## Context

- CI (`images` job) already builds both images with `docker/metadata-action`. It
  tags `sha-<7 chars>` and `latest` on `main`, and `X.Y.Z`/`X.Y` on `v*` tags. No
  version information reaches the build itself today.
- The k8s manifests use `:latest` with `imagePullPolicy: Always`. Re-applying an
  unchanged manifest doesn't restart pods, so a "deploy" can quietly do nothing.
  That is a big part of the uncertainty described in the proposal.
- The backend runs `gunicorn` (k8s overrides the entrypoint; docker compose uses the
  image `CMD`). The `migrate` init container and the `bank-sync` CronJob run
  `manage.py` commands from the same image.
- The frontend is a Vite build served by `nginx:1.27-alpine`. `index.html` currently
  gets no cache headers.
- Ingress routes `/api`, `/admin` and `/static` to the backend; `/health` is reachable
  only inside the cluster.

## Goals / Non-Goals

**Goals:**
- Version info gets in at build time only. The image is the source of truth, and
  runtime config can't make it lie.
- One way to compute the version, shared by both images in the same CI run.

**Non-Goals:**
- Logging the version from every `manage.py` command (migrate, sync_banks).
- Detecting a new version while the app is open, or prompting a reload.
- Changing the default `:latest` in the manifests. Only the docs change.

## Decisions

**Version = short SHA, or `X.Y.Z` on a release tag; plus commit and build time.**
A CI step computes three values: `APP_VERSION` (`${GITHUB_REF_NAME#v}` for a `v*`
tag, else the first 7 characters of `GITHUB_SHA`), `APP_COMMIT` (7-char SHA) and
`APP_BUILT` (`date -u +%Y-%m-%dT%H:%M:%SZ`). The step runs in each matrix leg, so
the two build times can differ by a few seconds. That's harmless, because the
mismatch check compares only the version.
- Alternatives: semver bumped by hand (bookkeeping the user doesn't want), a CI run
  number (doesn't map to an image tag), a UUID (meaningless). The SHA maps 1:1 to
  `sha-…` tags and commits.

**Pass values as Docker build args → environment.**
- Backend `Dockerfile`: `ARG APP_VERSION=dev APP_COMMIT= APP_BUILT=` then
  `ENV` of the same, placed *after* `collectstatic` so a changing version doesn't
  bust the pip/collectstatic layer cache.
- Frontend `Dockerfile`: in the build stage, after `npm ci`, the args are exported
  as `VITE_APP_VERSION`, `VITE_APP_COMMIT` and `VITE_APP_BUILT` for `npm run build`.
  The final nginx stage re-declares the args as `ENV`, for the startup log line.
- Missing args default to `dev`/empty, which covers local `docker build`, docker
  compose and `npm run dev`.

**Backend: one read point, a startup hook, an endpoint.**
- `core/version.py` → `version_info()` returns `{version, commit, built}` from the
  environment (`dev`, `null`, `null` when unset).
- `backend/gunicorn.conf.py` with `when_ready(server)` logs
  `reconciled-backend version <v> (commit <c>, built <b>)` once, from the master
  process. Gunicorn loads `./gunicorn.conf.py` from the working directory
  automatically (`/app`), so neither the k8s command nor the image `CMD` changes.
  Alternative: `AppConfig.ready()`. Rejected because it fires in every process,
  including tests and every management command, and once per worker.
- `GET /api/version/` (`core/urls.py`) with `IsAuthenticated`, not the default
  `HasHousehold`, so it works for any signed-in user. It returns `version_info()`.
- `/health` returns `{"status": "ok", "version": "<v>"}`. The existing probes only
  check the status code.

**Frontend: logging from nginx's entrypoint, About panel in Settings.**
- `frontend/docker-entrypoint.d/05-version.sh`, copied into
  `/docker-entrypoint.d/`, echoes
  `reconciled-frontend version <v> (commit <c>, built <b>)`. The official nginx
  image runs those scripts before starting nginx, so the line ends up in the pod log.
- `src/lib/version.js` exports the frontend's `{version, commit, built}` from
  `import.meta.env` (default `dev`). It also has a `versionsDiffer(app, server)`
  helper that returns false when either version is `dev`.
- `src/api/version.js` → `fetchServerVersion()`.
- `src/components/AboutSection.jsx`: a `Panel` titled "About", placed last on
  `SettingsPage`, with two `SettingRow`s ("App" and "Server"). Each shows the
  version, then `commit · built <date>` in secondary text. The date uses the
  browser's locale with date and time. A release version shows the commit next to
  it; a SHA version doesn't repeat it. While loading, the server row shows a muted
  "…". If the request fails, it shows "Couldn't load" (no toast). On a mismatch, a
  warning line under the rows reads: "The app and server are on different versions.
  One of them may not have updated. Reload the page; if it stays, check the pods."

**No caching of `index.html`.** In `nginx.conf`, add
`location = /index.html { add_header Cache-Control "no-cache"; }`. The SPA fallback
`try_files … /index.html` redirects internally to that location, so every route
gets the header. Vite's fingerprinted `/assets/*` are left alone.

**Deploy docs.** `k8s/README.md`:
- "Edit these": recommend pinning `sha-<commit>` (or a release) instead of `latest`.
- "To upgrade": set the new tag in the three image fields (backend, its init
  container, bank-sync), then apply. With `latest`, run
  `kubectl -n reconciled rollout restart deploy/backend deploy/frontend` instead.
- Add "Check what's running":
  `kubectl -n reconciled logs deploy/backend | grep version`, the same for
  `deploy/frontend`, and Settings → About.

## Risks / Trade-offs

- [`docker-entrypoint.d` behavior depends on the nginx base image] → It's the
  documented mechanism of the official image we already use, and it's pinned
  to `1.27-alpine`.
- [The ingress or a CDN could cache `index.html` anyway] → No caching layer is
  configured in the manifests. Out of scope otherwise.
- [A changing build arg busts later Docker layers] → The ARGs go after the expensive
  steps (backend), or only before `npm run build`, which reruns anyway when the
  source changes (frontend).

## Migration Plan

No data migration. The first deploy after merge starts showing versions. Older
images have no log line and no endpoint. If a new frontend talks to an old backend,
the server row shows "Couldn't load", which is itself a sign the backend didn't
update. Rollback is redeploying an older tag.
