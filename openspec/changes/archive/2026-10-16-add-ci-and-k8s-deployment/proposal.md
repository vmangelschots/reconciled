# Proposal

## Why

The app only runs from `docker compose` on a machine that has the source
checked out. Nothing checks pull requests, nothing publishes images, and
there's no way to run it on a Kubernetes cluster. Publishing tested
images and providing manifests makes self-hosting a matter of `kubectl
apply`, in the spirit of Firefly III's container deployments.

## What Changes

- **GitHub Actions pipeline** (`.github/workflows/ci.yml`):
  - On every pull request and push: run the frontend's tests, lint and
    build, and the backend's test suite against a Postgres service, then
    build both Docker images.
  - On pushes to `main`: also push both images to GHCR
    (`ghcr.io/vmangelschots/reconciled-frontend` and `-backend`), tagged
    with the commit SHA and `latest`.
  - On `v*` tags: push semver-tagged images (`1.2.3`, `1.2`).
  - Pull requests never push.
- **Kubernetes manifests** (plain YAML in `k8s/`, applied with
  `kubectl apply -f k8s/`):
  - a Namespace
  - a Postgres StatefulSet with a PersistentVolumeClaim and a headless
    Service
  - Backend and frontend Deployments and Services, with readiness and
    liveness probes
  - an example Secret and ConfigMap
  - an Ingress on one hostname with cert-manager TLS: `/` goes to the
    frontend, and `/api`, `/admin` and `/static` go to the backend
- On startup, the backend runs migrations and creates the app user once,
  before gunicorn starts. Today the user has to be created by hand.
- **Same-origin frontend:** an image built once in CI can't have a
  deployment's API address baked in. The frontend learns to call the API
  on its own origin when `VITE_API_BASE_URL` is set to an empty string,
  and the CI image is built that way. Local `docker compose` and
  `npm run dev` keep using `http://localhost:8000`.
- A short `k8s/README.md` covers what to edit (hostname, image tag,
  secrets) and the apply order.

Not in scope: Helm or Kustomize, automatic deployment from CI to a
cluster, database backups, running more than one backend replica, and
other registries.

## Capabilities

### New Capabilities
- `deployment`: how the app is built, published and run outside a
  developer machine, covering CI checks, published images, the
  Kubernetes deployment and same-origin API access.

### Modified Capabilities
<!-- none -->

## Impact

- New files: `.github/workflows/ci.yml`, `k8s/*.yaml`, `k8s/README.md`.
- `frontend/src/api/client.js`: treat an empty `VITE_API_BASE_URL` as
  same-origin instead of falling back to `localhost:8000`.
- `frontend/Dockerfile`: a `VITE_API_BASE_URL` build arg (default
  `http://localhost:8000`, so `docker compose` behaves as before).
- Docker image builds are unchanged otherwise. The backend's existing
  `entrypoint.sh` keeps working for `docker compose`.
- Needs no repository secrets: GHCR pushes use the workflow's own
  `GITHUB_TOKEN` with `packages: write`.
