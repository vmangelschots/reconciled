# Design

## Context

See `proposal.md` for why. Current state that shapes the approach:

- Production runs in namespace `reconciled` on the home cluster, exposed publicly
  through traefik behind Cloudflare DNS. Its manifests live on the jumpbox
  (`charon`, `/root/cluster/argo/reconciled/`) and are applied with
  `deploy.sh` — the repo's `k8s/` is a generic template for other self-hosters.
- The cluster has traefik, a `letsencrypt-dns01` ClusterIssuer, and
  `truenas-iscsi` storage; three nodes with spare capacity.
- Images are `:latest` with `imagePullPolicy: Always`; production is rolled out
  by hand with `rollout restart`.
- GHCR packages are public, and an anonymous pull token is enough to resolve the
  `latest` digest (verified: it matches the running container's `imageID`).
- The jumpbox has `kubectl`, `curl` and `jq`, and runs busybox cron.
- Demo data exists only as `.claude/skills/run-reconciled/seed.py`, run with
  `manage.py shell` against a local database.

## Goals / Non-Goals

**Goals**

- The test environment is reproducible from the repository, with the jumpbox
  holding only the Secret — the same split production uses.
- Demo data is produced by application code that is covered by tests, so it
  stays valid as models change.
- Tracking `main` needs no inbound access to the home network and no new GitHub
  secret.

**Non-Goals**

- Per-pull-request environments, a staging branch, or staging image builds.
- Any change to production's manifests, rollout or data.
- High availability for the test environment: brief downtime during a rollout
  or reset is acceptable.

## Decisions

### A separate namespace on the same cluster

`reconciled-test` gets its own namespace, Postgres, 2Gi volume and Secret. This
reuses traefik, cert-manager and storage, costs about 0.3 CPU and 250Mi, and
keeps production untouched. A separate cloud host would need its own ingress,
certificates and backups for no benefit, since the app is already reachable
publicly from this cluster.

### Demo data as a `seed_demo` management command

Move the seed logic into `backend/` as `manage.py seed_demo`, with three modes:

- default — create the demo household and user only if they don't exist
  (idempotent, safe on every start);
- `--if-empty` — seed only when there are no households (used by the init
  container);
- `--reset` — delete every household and the demo user, then seed, all inside
  one transaction so readers see either the old or the new demo data.

A management command (not a mounted script) keeps the seed under the backend's
tests, ships in the image, and replaces the skill's copy: the `run-reconciled`
skill calls the command instead of `shell < seed.py`.

### Seed on first start, reset nightly

The backend's init container runs `migrate` and then `seed_demo --if-empty`
instead of `bootstrap_user`. `bootstrap_user` would create a second, empty
household next to the seeded one, and the demo login comes from the seed rather
than a Secret. A CronJob in the namespace runs `seed_demo --reset` daily at
04:00 UTC. In-cluster because it needs the database and app models; the jumpbox
only needs to know about image updates.

### Auto-rollout from the jumpbox, not from CI

CI runners cannot reach the home network, so `k8s/test/update.sh` runs from the
jumpbox's crontab every 5 minutes:

1. Resolve the `latest` digest for both images with an anonymous GHCR token.
2. Compare it with the `reconciled.dev/rolled-digest` annotation on the
   Deployments.
3. If it differs and is not the last failed digest, `rollout restart` the
   backend (and frontend), wait for readiness with a timeout, then record the
   digest — or record it as `reconciled.dev/failed-digest` on failure, so a
   broken build is retried once, reported, and a newer digest is still picked up.

Comparing digests through annotations rather than the pod's `imageID` avoids a
false "changed" when a runtime reports the platform digest instead of the
multi-arch index digest. This also satisfies the 15-minute bound with room to
spare, and needs no in-cluster RBAC or new image.

Alternative rejected: a Kubernetes CronJob with a ServiceAccount and a Python
script talking to the registry and API — self-contained, but more code and no
`kubectl` in the app image. Alternative rejected: a GitHub Actions deploy job
over SSH, which needs a deploy key and an inbound path to the jumpbox.

### Test-specific configuration

- No bank-sync CronJob; no Enable Banking or OpenAI values in its Secret.
- `AI_CATEGORIZATION_ENABLED=false`, so no outbound call is attempted.
- `BANK_SYNC_TIMES` empty, so the app doesn't advertise a next sync.
- Same traefik ingress paths as production, plus the HTTP→HTTPS redirect
  middleware.
- `Recreate` strategy for the backend, as in production, because migrations run
  before the new version serves.
- Ingress body size 50m, as production, for backup restores.

## Risks / Trade-offs

- **A bad migration on `main` breaks the demo environment, including the reset
  job.** Mitigation: an operator can pin the previous digest, `rollout undo`, or
  recreate from an empty volume; the environment holds nothing worth keeping.
- **Public demo credentials invite abuse** (password changes, bulk imports,
  storage fill). Mitigation: nightly reset, 2Gi volume, no real data — this is
  the accepted cost of a public demo.
- **A visitor changes the demo password**, locking everyone out until 04:00 UTC.
  Mitigation: the daily reset restores it; an operator can run the reset job on
  demand.
- **GHCR packages must stay public**, or `update.sh` needs a pull token.
  Documented in the test README.
- **The jumpbox crontab is host-level state.** It is documented in
  `k8s/test/README.md` and in the homelab repository, next to the existing
  `deploy.sh` invocation.
- **Reset while someone is mid-edit** makes that request fail. Acceptable for a
  demo environment.

## Migration Plan

1. Add `seed_demo` and its tests; let CI publish an image that contains it.
2. Add the Cloudflare record `reconciled-test` → `olympus` (proxied off, like
   production, so cert-manager DNS-01 works).
3. Create `/root/cluster/argo/reconciled-test/` on the jumpbox from `k8s/test/`
   plus its own `secret.yaml`; run `deploy.sh`; confirm the seeded demo login.
4. Install the crontab line for `update.sh`; confirm one no-op run and one
   rollout after the next `main` build.
5. Confirm the reset CronJob by creating a job from it by hand.

Rollback: delete the namespace and the DNS record. Production is unaffected
throughout.
