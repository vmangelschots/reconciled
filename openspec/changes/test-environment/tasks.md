# Tasks

## 1. Demo data command

- [x] 1.1 Add `backend/*/management/commands/seed_demo.py` with default, `--if-empty` and `--reset` modes as described in design.md, and verify `python manage.py seed_demo --help` lists all three and `manage.py check` passes.
- [x] 1.2 Add tests covering: a fresh seed creates the demo user, accounts, bills, budgets, target and loan with dates relative to today; a second default run creates nothing new; `--reset` deletes a visitor-added transaction and restores the demo password; verify with `python manage.py test`.
- [x] 1.3 Replace `.claude/skills/run-reconciled/seed.py` with the command: delete the script, point the skill's demo-database section at `manage.py seed_demo`, and verify seeding the local `reconciled_demo` database still produces the household the driver logs into.
- [x] 1.4 Make sure the `run-reconciled` skill's demo description still matches what the command creates (accounts, bills, budgets, loan, login); verify by reading the skill against the command output.

## 2. Test environment manifests

- [x] 2.1 Add `k8s/test/00-namespace.yaml`, `10-config.yaml`, `20-postgres.yaml` and a 2Gi PVC for `reconciled-test`, with the hostname, `AI_CATEGORIZATION_ENABLED=false` and no `BANK_SYNC_TIMES`; verify `kubeconform -strict` passes on `k8s/test/`.
- [x] 2.2 Add `k8s/test/30-backend.yaml` and `40-frontend.yaml`: init container runs `migrate` then `seed_demo --if-empty` (no `bootstrap_user`), `Recreate` strategy, same probes and resource requests as production; verify kubeconform and that no manifest references `bootstrap_user`.
- [x] 2.3 Add `k8s/test/50-ingress.yaml` with the traefik ingress class, `letsencrypt-dns01` issuer, the same path split as production and the HTTP→HTTPS redirect; verify kubeconform and that the hostname appears in exactly the TLS, rule and redirect entries.
- [x] 2.4 Add `k8s/test/60-reset.yaml`, a CronJob at `0 4 * * *` UTC running `seed_demo --reset` with the namespace's config and secret, `concurrencyPolicy: Forbid`; verify kubeconform and `kubectl create job --dry-run=client -f k8s/test/60-reset.yaml` renders.
- [x] 2.5 Add `k8s/test/README.md` covering the Secret, the Cloudflare record, `deploy.sh`, the update cron and a manual reset; verify every command in it matches a manifest or script that exists.

## 3. Update script

- [x] 3.1 Add `k8s/test/update.sh`: resolve the `latest` digest anonymously, compare with `reconciled.dev/rolled-digest` and `reconciled.dev/failed-digest`, restart the backend and frontend, wait for readiness, and record the outcome; verify `sh -n` passes and a `--dry-run` run against the current production digest reports no change.
- [ ] 3.2 Document the crontab line in `k8s/test/README.md` and the jumpbox note, then verify on the jumpbox that one scheduled run logs "no change".

## 4. Deploy the environment

- [ ] 4.1 Add the Cloudflare record `reconciled-test` → `olympus` (DNS only) and verify `getent hosts reconciled-test.mangelschots.org` resolves.
- [ ] 4.2 Create `/root/cluster/argo/reconciled-test/` on the jumpbox from `k8s/test/` with its own `secret.yaml` (new Django key and database password, no bank or OpenAI values), run `deploy.sh`, and verify all pods are Ready.
- [ ] 4.3 Verify the certificate is Ready, `https://reconciled-test.mangelschots.org/` is 200, `/api/auth/me/` is 401, and `/mcp` is routed to the backend.
- [ ] 4.4 Sign in as the demo user and verify the Overview, Budgets and Forecast pages show the seeded current-month data; compare the reported version with the newest `main` build.
- [ ] 4.5 Install the `update.sh` crontab entry, verify a no-op run, then verify one automatic rollout after the next image is published to `main`, including the digest annotations.
- [ ] 4.6 Trigger the reset CronJob by hand, verify visitor-added data is gone, the demo login still works and the pages show today-relative data again.

## 5. Integration checks

- [ ] 5.1 Run the CI checks locally (frontend tests/lint/build, backend tests, kubeconform on `k8s/`) and verify all pass.
- [ ] 5.2 Run the `check-deployment` skill and verify production is unchanged and healthy after the test environment is deployed.
- [ ] 5.3 Add a pointer in `k8s/README.md` and the `check-deployment` skill to the demo environment, its URL, login and reset time; verify the linked files and hostnames are correct.

## Workflow follow-up

- Archive the change after the pull request is merged, syncing the `demo-environment` spec and the `deployment` delta.
