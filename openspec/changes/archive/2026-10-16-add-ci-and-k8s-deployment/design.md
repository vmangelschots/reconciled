# Design

## Context

- **Images:** both Dockerfiles already build working images. The frontend
  is a two-stage `node:22` build served by `nginx:1.27`, with SPA
  fallback in `nginx.conf`. The backend is `python:3.12-slim` with
  gunicorn, and whitenoise serves `/static`.
- **Backend startup:** `entrypoint.sh` runs `migrate` and then `exec "$@"`.
  `bootstrap_user` exists but nothing runs it automatically.
- **Settings:** the backend reads everything from env vars: `DB_*`,
  `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`,
  `CORS_ALLOWED_ORIGINS` and `BUDGET_APP_*`. `DB_HOST` defaults to `db`.
  `GET /health` is an unauthenticated liveness view, but Django still
  rejects any `Host` header not in `ALLOWED_HOSTS`.
- **Frontend API address:** `client.js` uses
  `import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"`, so an
  empty value currently falls back to localhost.
- **Tests:** the backend only runs against PostgreSQL.

## Goals / Non-Goals

**Goals:**
- One workflow file that a reader can follow top to bottom.
- Manifests that a self-hoster can read and edit in one sitting.

**Non-Goals:**
- Hardened pod security (non-root images, read-only filesystems).
  That's a separate change, since both images would need adjusting.
- Horizontal scaling of the backend (it stays at `replicas: 1`).

## Decisions

### Workflow shape: three jobs in `ci.yml`
- `frontend`: checkout, `setup-node` 22 with npm cache, `npm ci`,
  `npm test`, `npm run lint`, `npm run build`, run in `frontend/`.
- `backend`: `setup-python` 3.12 with pip cache, install
  `requirements.txt`, run `python manage.py test` with a `postgres:16`
  service container (`DB_HOST=localhost`, test credentials set as job
  env, never as secrets).
- `images`: `needs: [frontend, backend]`, with a matrix of
  `{frontend, backend}`. It runs `setup-buildx`, `docker/metadata-action`
  for tags (`type=sha`, `type=raw,value=latest` on main,
  `type=semver,pattern={{version}}` and `{{major}}.{{minor}}` on tags),
  and `docker/build-push-action` with
  `push: ${{ github.event_name != 'pull_request' }}` and the GHA layer
  cache. GHCR login happens only when pushing. Permissions are
  `contents: read`, plus `packages: write` on `images` only.
- `manifests`: run `kubeconform -strict` over `k8s/*.yaml` (excluding the
  README) so broken YAML fails the PR.

Triggers: `pull_request`, plus `push` on `main` and `v*` tags. Because
`images` needs the test jobs, failed checks never publish
(`specs/deployment`).

*Alternative considered:* separate workflows for test and release.
Rejected because a single workflow with `needs:` already orders the
steps, and one file is easier to follow for a project this size.

### Same-origin frontend via `??` and a build arg
`client.js` changes to `import.meta.env.VITE_API_BASE_URL ??
"http://localhost:8000"`, so an empty string means same-origin while
`undefined` keeps the localhost default. The frontend Dockerfile gets
`ARG VITE_API_BASE_URL=http://localhost:8000`, exported to `npm run
build`, so `docker compose` keeps its current behavior. CI passes
`VITE_API_BASE_URL=` (empty) as a build arg. Once same-origin, the
browser no longer needs CORS in Kubernetes, but CSRF still needs the
`https://` hostname in `CSRF_TRUSTED_ORIGINS`.

*Alternative considered:* a runtime `config.js` that nginx templates
from an env var. That's more flexible (separate API hostnames) but
needs an entrypoint script in the nginx image. Same-origin behind one
Ingress covers the self-hosting case.

### Kubernetes layout (plain YAML, numbered for apply order)
- `00-namespace.yaml`: the `reconciled` namespace.
- `10-config.yaml`: a ConfigMap (`DJANGO_ALLOWED_HOSTS=<host>,localhost`,
  `CSRF_TRUSTED_ORIGINS=https://<host>`, `DB_HOST=db`, `DB_NAME`,
  `DJANGO_DEBUG=false`).
- `examples/secret.example.yaml`: `DB_USER`, `DB_PASSWORD`,
  `DJANGO_SECRET_KEY`, `BUDGET_APP_USERNAME`, `BUDGET_APP_PASSWORD`, all
  `change-me`. It lives in a subfolder so `kubectl apply -f k8s/` (not
  recursive) never applies the placeholders. The user copies it to
  `k8s/15-secret.yaml`, which `.gitignore` excludes.
- `20-postgres.yaml`: a headless Service `db` and a StatefulSet with
  `postgres:16-alpine`, `PGDATA` in a subdirectory, a 5Gi
  `volumeClaimTemplate` on the default StorageClass, and a `pg_isready`
  readiness probe. The Service name `db` matches the backend's default
  `DB_HOST`, as in docker-compose.
- `30-backend.yaml`: a Deployment (1 replica) and Service on 8000. An
  initContainer from the same image runs
  `python manage.py migrate --noinput && python manage.py bootstrap_user`.
  The main container sets `command: ["gunicorn", ...]`, which overrides
  the image ENTRYPOINT so migrations don't run twice. Probes are an HTTP
  GET to `/health` with an `httpHeaders` `Host: localhost`, because
  kubelet probes otherwise send the pod IP and Django answers 400.
  `localhost` is always in the ConfigMap's `ALLOWED_HOSTS`.
- `40-frontend.yaml`: a Deployment (1 replica) and Service on 80, with
  HTTP probes on `/`.
- `50-ingress.yaml`: `ingressClassName: nginx`, a
  `cert-manager.io/cluster-issuer: letsencrypt` annotation (placeholder
  issuer name), and TLS for `<host>`. Paths are `Prefix /api`,
  `/admin` and `/static` to `backend:8000`, and `/` to `frontend:80`.
  `/health` isn't exposed.
- Images are referenced as `ghcr.io/vmangelschots/reconciled-*:latest`
  with `imagePullPolicy: Always`. The README recommends pinning a
  version tag.
- Every container gets modest requests and limits.

## Risks / Trade-offs

- [GHCR packages are private by default, so the cluster can't pull] →
  the README covers both fixes: make the packages public, or create an
  `imagePullSecret`. A commented `imagePullSecrets` stanza sits in each
  Deployment.
- [The Postgres StatefulSet has no backups] → stated in the README as
  the user's responsibility, with a `pg_dump` one-liner. Out of scope
  here.
- [A rolling update briefly runs the old and new backend against a
  migrated schema] → acceptable at one replica for a personal app.
  The backend uses `strategy: Recreate` to avoid overlap entirely.
- [An empty build arg might not reach Vite as an empty string] → task
  2.1 verifies the built bundle contains no `localhost:8000` when built
  same-origin.
- [The cert-manager issuer name varies per cluster] → it's a single,
  clearly marked placeholder in the Ingress, listed in the README's
  "edit these" table.
