---
name: check-deployment
description: Check the reconciled production deployment on the home Kubernetes cluster. Use when asked to check the deployment, check prod, see if reconciled is up or down, get deployment status, find what version is deployed, verify a deploy or rollout, or diagnose the live app. Covers pods, rollouts, the public HTTPS endpoint, TLS, running commit, Postgres, the bank-sync CronJob and drift from the manifests on the jumpbox.
---

# Check the reconciled deployment

Production runs in the `reconciled` namespace on Vincent's home Kubernetes
cluster. The cluster is only reachable through the jumpbox
`root@172.21.2.163` (`charon.olympus.internal`), which has `kubectl`, and
only from Vincent's local network or VPN. If SSH cannot connect, say so and
stop; the cluster is not reachable from outside that network and no other
host is a substitute.

The check is read-only unless the user asks you to change something.

## Run the check

```bash
.claude/skills/check-deployment/check.sh
```

It exits `0` when healthy (warnings allowed), `1` when it finds problems and
`2` when the jumpbox is unreachable. It prints these sections:

| Section | What it proves |
|---|---|
| Workloads | every Deployment has its desired replicas ready, rollouts are complete, no pod is failed or unready |
| Public endpoints | `/` is 200, `/api/auth/me/` is 401 (backend reached), `/mcp` is 405 (routed to backend), HTTP redirects to HTTPS |
| TLS certificate | cert-manager `Certificate` is Ready and the certificate has more than 14 days left |
| Running versions | the commit the backend and frontend logged at startup, and whether they match |
| Database | `pg_isready` succeeds and the PVC is Bound |
| Bank-sync CronJob | not suspended and it succeeded in the last 48 hours |
| Recent warning events | the last five `type=Warning` events in the namespace |
| Manifest drift | live resources match the YAML in `/root/cluster/argo/reconciled` (secret excluded) |

Override defaults when something moves:

```bash
RECONCILED_JUMPBOX=root@host RECONCILED_HOST=other.example \
  .claude/skills/check-deployment/check.sh
```

## Live layout

These are the names that exist on the cluster. Do not infer them from this
repo's `k8s/` directory, which is a generic template (see gotchas).

| Thing | Value |
|---|---|
| Namespace | `reconciled` |
| URL | https://reconciled.mangelschots.org |
| Ingress | `reconciled` (class `traefik`), plus `reconciled-http` for the HTTPS redirect |
| Deployments | `reconciled-backend`, `reconciled-frontend`, `postgres` (a Deployment, not a StatefulSet) |
| Services | `reconciled-backend-svc:8000`, `reconciled-frontend-svc:80`, `postgres-svc:5432` |
| PVC | `postgres-data`, 5Gi, `truenas-iscsi` |
| CronJob | `bank-sync`, `30 11 * * *` UTC (daily) |
| Manifests | `/root/cluster/argo/reconciled/*.yaml`, applied by `deploy.sh` |
| Images | `ghcr.io/vmangelschots/reconciled-{backend,frontend}:latest` |

The `argocd` namespace still runs other apps, but there is no ArgoCD
`Application` for reconciled anymore. It is deployed with plain
`kubectl apply`, so drift is real drift, not an ArgoCD sync waiting to happen.

Expected healthy state: three pods `Running` and `1/1` (`reconciled-backend-*`,
`reconciled-frontend-*`, `postgres-*`), plus old `bank-sync-*` pods in
`Completed`. The backend and frontend log the same version at startup.

## Gotchas

- **Public `/health` is not the backend health check.** The ingress sends
  everything that is not `/api`, `/mcp`, `/admin` or `/static` to the
  frontend, and nginx answers `/health` with `index.html` and a 200. The
  backend's real `/health` is only used by the in-cluster probes. Test the
  backend through `/api/auth/me/` (401) instead.
- **The bank-sync schedule has drifted before.** The live CronJob runs daily
  at 11:30 UTC and the manifest on the jumpbox says `11:30`, but the live
  `BANK_SYNC_TIMES` ConfigMap value has said `06:30,18:30`. The app only uses
  that value to tell members when the next sync is, so trust the CronJob's
  actual status. If the drift check shows it, report it; don't change it
  without being asked. The jumpbox copy has also had `BANK_SYNC_TIMES` at the
  wrong indentation (top level, outside `data`), which makes `kubectl diff`
  show the key as a removal; fix the indentation before applying that file.
- **Read the version from the start of the logs.** It is one line printed
  when the container starts, so `--tail=50` often misses it. The check uses
  the whole log.
- **`Completed` bank-sync pods are normal.** `successfulJobsHistoryLimit: 1`
  keeps one around. A completed pod is not a crash.
- **Restart counts are cumulative.** An old restart is not an outage; look at
  the pod's age and `--previous` logs before calling it one.
- **The repo's `k8s/` is not what runs here.** It uses an nginx ingress,
  `budget.example.com`, and resources named `backend`, `frontend` and `db`.
  Applying it to this cluster would create a second, broken copy. The live
  manifests live on the jumpbox.
- **Never print or diff the real secret.** `/root/cluster/argo/reconciled/secret.yaml`
  holds live credentials. The check deliberately excludes it from the drift
  diff. Do not `cat` it or paste its contents into the chat.
- **Ahead of production is normal.** The deployed commit is whatever
  `origin/main` was when the images were last built. A feature branch can be
  ahead; compare with `git rev-parse --short origin/main` (fetch first when
  verifying a fresh deploy). A mismatch between backend and frontend versions
  is the real problem.

## Dig deeper

All read-only:

```bash
ssh root@172.21.2.163
kubectl -n reconciled get pods -o wide
kubectl -n reconciled describe pod <pod>
kubectl -n reconciled logs deploy/reconciled-backend --tail=200
kubectl -n reconciled logs deploy/reconciled-backend -c migrate
kubectl -n reconciled logs deploy/reconciled-backend --previous
kubectl -n reconciled get events --sort-by=.lastTimestamp
kubectl -n reconciled get endpoints
kubectl -n reconciled describe certificate reconciled-mangelschots-org-tls
```

| Symptom | Look at |
|---|---|
| `ImagePullBackOff` / `ErrImagePull` | `kubectl describe pod`; the GHCR image or tag, or a pull secret |
| Backend stuck in `Init` | `logs deploy/reconciled-backend -c migrate`, then `-c wait-for-postgres`; usually DB config or the database not ready |
| `CrashLoopBackOff` | current and `--previous` logs; often a missing secret key or bad config |
| 502/504 from the hostname | `get endpoints`: no endpoints means the pods are not Ready or the Service selector is wrong |
| Certificate not Ready | `describe certificate`; then cert-manager and the DNS01 challenge |
| CronJob failed | `kubectl -n reconciled get jobs` and the failed job pod's logs |
| Frontend loads but the app misbehaves | compare backend and frontend versions; reload the page, then check the browser console |

## Deploying or updating (only when asked)

The files on the jumpbox are the source of truth:

```bash
ssh root@172.21.2.163 'cd /root/cluster/argo/reconciled && ./deploy.sh'
```

Before pulling a new image, check that CI has actually built one:

```bash
gh run list --workflow CI --limit 3
```

CI pushes `sha-<commit>` and `latest` for every green push to `main`, so the
deployed commit should match the newest successful `main` build.

`deploy.sh` applies namespace, secret, configmap, PVC, Postgres, then
`reconciled.yaml` and `bank-sync.yaml`, waiting for the rollouts in between.

Because the images use `:latest` and an unchanged Deployment does not restart,
pulling a newly built image needs a rollout restart:

```bash
ssh root@172.21.2.163 'kubectl -n reconciled rollout restart deploy/reconciled-backend deploy/reconciled-frontend'
ssh root@172.21.2.163 'kubectl -n reconciled rollout status deploy/reconciled-backend --timeout=300s'
```

A changed ConfigMap also needs an `apply` followed by a restart. After any
change, rerun the check.

## Reporting

Answer the user's actual question first: is it up, and what is running?
Mention the deployed commit, any warnings from the check, and the one next
step that matters. Summarize; do not paste the whole script output unless it
is short or the user asked for it.
