# Tasks

## 1. Same-origin frontend build

- [x] 1.1 Change `frontend/src/api/client.js` to `import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"`. Verify with a `client.test.js` case that an empty base URL requests `/api/...` relative to the page origin, and that the full frontend suite still passes.
- [x] 1.2 Add `ARG VITE_API_BASE_URL=http://localhost:8000` to `frontend/Dockerfile`, passed into `npm run build`. Verify that `docker build --build-arg VITE_API_BASE_URL= frontend` produces a bundle with no `localhost:8000` (grep the built JS in the image), and that a default build still contains it, so `docker compose` is unchanged.

## 2. GitHub Actions pipeline

- [x] 2.1 Write `.github/workflows/ci.yml` with the `frontend`, `backend` (Postgres 16 service) and `manifests` (kubeconform) jobs, triggered on `pull_request` and on `push` to `main` and `v*` tags, with read-only default permissions. Verify the workflow parses with `actionlint`, and that the backend job's commands pass locally against a Postgres container with the same env.
- [x] 2.2 Add the `images` matrix job (`needs: [frontend, backend, manifests]`): buildx, `metadata-action` tags (`sha`, `latest` on main, semver on tags), GHCR login and push only when `github.event_name != 'pull_request'`, `packages: write` on this job only, the GHA cache, and the empty `VITE_API_BASE_URL` build arg for the frontend. Verify with `actionlint`, and by checking the tag rules against the spec's main / tag / PR scenarios.

## 3. Kubernetes manifests

- [x] 3.1 Write `k8s/00-namespace.yaml`, `k8s/10-config.yaml` (ConfigMap) and `k8s/examples/secret.example.yaml` (placeholders), and add `k8s/15-secret.yaml` to `.gitignore`. Verify with `kubeconform -strict` and that `git check-ignore k8s/15-secret.yaml` matches.
- [x] 3.2 Write `k8s/20-postgres.yaml` (headless Service `db`, StatefulSet, PVC template, `pg_isready` probe) and `k8s/30-backend.yaml` (Deployment with `strategy: Recreate`, migrate + bootstrap initContainer, gunicorn `command`, `/health` probes with `Host: localhost`, env from the ConfigMap and Secret, commented `imagePullSecrets`, Service). Verify with `kubeconform -strict`.
- [x] 3.3 Write `k8s/40-frontend.yaml` (Deployment and Service, `/` probes) and `k8s/50-ingress.yaml` (nginx class, cert-manager annotation, TLS, `/api`, `/admin` and `/static` to the backend, `/` to the frontend). Verify with `kubeconform -strict`.
- [x] 3.4 Write `k8s/README.md`: prerequisites (nginx ingress, cert-manager, default StorageClass), an "edit these" table (hostname in the ConfigMap and Ingress, issuer, image tag, secret), GHCR pull access (public packages or `imagePullSecret`), the apply order, how to log in, and a backup note with a `pg_dump` example. Verify that every placeholder in the manifests is listed in the table (grep for `example.com`, `change-me` and `letsencrypt`).

## 4. Integration check

- [ ] 4.1 Apply the manifests to a throwaway local cluster (kind or k3d with ingress-nginx, TLS skipped via a local override), using images built locally the way CI builds them. Verify that the pods become ready, that the backend initContainer created the user, that login works and an API call succeeds through the Ingress, and that data survives deleting the db and backend pods. Tear the cluster down afterwards.

## Workflow follow-up

- After merging to `main`, check the first real pipeline run on GitHub and confirm both packages appear in GHCR.
