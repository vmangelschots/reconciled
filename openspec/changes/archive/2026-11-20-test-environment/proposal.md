# Proposal

## Why

The only deployed instance holds real household data, so looking at the app with
realistic content means running it locally or poking at production. There is no
permanent, safe place to click through a change, show the app to someone, or see
what `main` looks like after a merge.

## What Changes

- Run a second, permanent environment at `https://reconciled-test.mangelschots.org`
  on the home cluster: its own namespace, PostgreSQL, volume and Secret, next to
  production and sharing nothing with it.
- Seed it with a demo household — accounts, transactions, bills, budgets, a loan —
  through a `seed_demo` management command, because the demo data currently
  exists only as a local development script.
- Re-seed that demo data nightly, so the seed's dates relative to today keep the
  Overview, Budgets and Forecast pages meaningful, and anything a visitor enters
  disappears.
- Roll out newly published `latest` images to the test environment automatically,
  so it tracks `main` without a manual step. Production keeps its manual rollout.
- Keep the test environment free of real integrations: no bank-sync schedule, no
  Enable Banking or OpenAI credentials, and a documented demo login.
- Commit the test environment's manifests under `k8s/test/` with the real
  hostname but no secrets, so the environment can be recreated; the live copy on
  the jumpbox carries its own Secret, as production's does.

Not in scope: per-pull-request preview environments, a staging branch or staging
images, and any change to how production is deployed.

## Capabilities

### New Capabilities

- `demo-environment`: a public demonstration instance that is isolated from real
  data, runs seeded demo data, resets it on a schedule, and deliberately has no
  external integrations.

### Modified Capabilities

- `deployment`: adds automatic rollout of published `main` images to the demo
  environment, alongside the existing manual production rollout.

## Impact

- `backend/` — new `seed_demo` management command (the logic currently lives in
  `.claude/skills/run-reconciled/seed.py`).
- `k8s/test/` — manifests for the namespace, config, PostgreSQL and volume,
  backend, frontend, ingress and the reset and update CronJobs.
- Cluster — a `reconciled-test` namespace, a namespace-scoped ServiceAccount and
  RBAC for the update job, and a Cloudflare DNS record for the new hostname.
  TLS reuses the existing `letsencrypt-dns01` ClusterIssuer and traefik.
- No change to the CI publish jobs, the production namespace or its Secret.
