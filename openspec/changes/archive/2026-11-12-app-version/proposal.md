# Proposal

## Why

After pushing a new image and redeploying, there's no way to tell which build is
actually running: the manifests use `:latest`, the pods log nothing about their
build, and the app doesn't show one. An update that silently didn't happen (pod
not restarted, old image cached, browser holding an old bundle) looks the same as
one that worked.

## What Changes

- **A version for every build, stamped automatically by CI.** Nothing is bumped by
  hand. The version is the short commit SHA (`a1b2c3d`), the same 7 characters as
  the `sha-a1b2c3d` image tag CI already publishes. A build from a `vX.Y.Z` release
  tag uses `X.Y.Z` instead, still with its commit. Every build also records when it
  was built. A local build or a build outside CI reports `dev`.
  - Why this format: it needs no version bookkeeping, it maps one-to-one onto a
    published image tag and a commit, and the build time makes it easy to read
    ("built 10 minutes ago" means the update landed). Release tags still get a
    readable number when you cut one.
- **Both images log their version when they start.** The backend logs one line
  when its server starts. The frontend container logs one line before nginx
  starts. So `kubectl logs` on either pod shows what it runs.
- **The backend reports its version** through a signed-in API endpoint, and through
  its existing health check for `curl`/probe use inside the cluster.
- **Settings gets an "About" section** that shows the app (frontend) version and
  the server (backend) version, with commit and build time. When the two differ, it
  says so, because that usually means one of them didn't update.
- **The browser doesn't keep serving an old app.** `index.html` is served
  `no-cache`, so a reload after a deploy picks up the new bundle. The hashed
  assets stay cacheable.
- **The deploy docs change** (k8s README): they recommend deploying by the
  `sha-…` tag so `kubectl apply` actually rolls the pods. They also show how to
  confirm the update from the pod logs or from Settings, and how to force a pull
  for anyone who stays on `latest`.

Out of scope: automatic deployment to the cluster (GitOps, a deploy script),
release notes or a changelog, and a "new version available, reload" prompt.

## Capabilities

### New Capabilities
- `app-version`: how the running frontend and backend identify their build. It
  covers what the version consists of, logging it at startup, reporting it from the
  API, and showing it in Settings.

### Modified Capabilities
- `deployment`: the published images carry the version and build time stamped by
  CI, and the frontend's entry page isn't cached by the browser.

## Impact

- CI: `.github/workflows/ci.yml` (`images` job) passes the version, commit and build
  time to both Docker builds.
- Backend: `Dockerfile` (build args → env), a small version module, a `gunicorn.conf.py`
  startup hook, `GET /api/version/`, version in `/health`.
- Frontend: `Dockerfile` (build args → Vite env), an nginx entrypoint script that
  logs the version, `nginx.conf` cache headers, an About panel on `SettingsPage`.
- Docs: `k8s/README.md` upgrade section, and the image-tag recommendation in
  "Edit these".
- No database changes, no new dependencies.
