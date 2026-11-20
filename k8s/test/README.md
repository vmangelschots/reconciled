# The demo environment

A permanent, publicly reachable copy of the app at
**https://reconciled-test.mangelschots.org**, filled with disposable demo data:

| | |
|---|---|
| Login | `demo` / `demo-pass-123` |
| Data | a demo household, replaced every night at 04:00 UTC |
| Namespace | `reconciled-test` on the home cluster |
| Images | `ghcr.io/vmangelschots/reconciled-{backend,frontend}:latest` |
| Bank sync | none, and no Enable Banking or OpenAI keys |

It shares nothing with the production namespace. The data is public and
throwaway: never put anything real in it.

## How it differs from production

- The backend's init container runs `migrate` and then `seed_demo --if-empty`;
  it does not run `bootstrap_user`. The demo login comes from the seed.
- A `reset-demo` CronJob runs `seed_demo --reset` daily at 04:00 UTC, so the
  seed's dates stay current and anything a visitor entered disappears.
- `AI_CATEGORIZATION_ENABLED` is `false`, `BANK_SYNC_TIMES` is unset and no
  bank-sync CronJob exists.
- `update.sh` rolls the environment onto a newly published `latest` image every
  5 minutes; production is still rolled out by hand.

## First deployment

The files here are the source of truth; the jumpbox holds the copy and its
Secret, like production.

1. **DNS.** In Cloudflare, add `reconciled-test` as a CNAME to `olympus.mangelschots.org`,
   proxied **off** (DNS only), so cert-manager can answer the DNS-01 challenge.
2. **Secret.** Create `secret.yaml` on the jumpbox with only these keys — no
   `BUDGET_APP_USERNAME`, `BUDGET_APP_PASSWORD` or `OPENAI_API_KEY`:

   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: reconciled-secrets
     namespace: reconciled-test
   type: Opaque
   stringData:
     DJANGO_SECRET_KEY: <a new value, not production's>
     DB_USER: reconciled
     DB_PASSWORD: <a new value>
   ```

   Generate the key with
   `python -c "import secrets; print(secrets.token_urlsafe(50))"`.
3. **Copy and apply.**

   ```sh
   scp k8s/test/* root@172.21.2.163:/root/cluster/argo/reconciled-test/
   ssh root@172.21.2.163 'cd /root/cluster/argo/reconciled-test && ./deploy.sh'
   ```

   `deploy.sh` applies the namespace, Secret, config, Postgres and volume, waits
   for Postgres, then the backend (which seeds the demo household), the
   frontend, the ingress and the reset CronJob.
4. **Automatic updates.** Add the crontab entry on the jumpbox:

   ```
   */5 * * * * /root/cluster/argo/reconciled-test/update.sh >> /var/log/reconciled-test-update.log 2>&1
   ```

   The first run records the digest it is already running; later runs only roll
   out when `latest` changed. Check it with `--dry-run`, which changes nothing:

   ```sh
   /root/cluster/argo/reconciled-test/update.sh --dry-run
   ```

## Day-to-day

Check the version (the pods log it at startup, and Settings → About shows it):

```sh
kubectl -n reconciled-test logs deploy/reconciled-backend | grep version
kubectl -n reconciled-test logs deploy/reconciled-frontend | grep version
```

Reset the demo data now instead of waiting for 04:00 UTC:

```sh
kubectl -n reconciled-test create job --from=cronjob/reset-demo reset-demo-manual
kubectl -n reconciled-test logs -f job/reset-demo-manual
```

Log in as `demo` / `demo-pass-123` and confirm the Overview, Budgets and
Forecast pages show current data.

## Notes

- The GHCR packages must stay public; `update.sh` uses an anonymous pull token.
  If they become private, give the script a token.
- A bad migration on `main` can leave the environment unready until a newer
  image lands or you roll the previous digest back. The reset job fails too
  while the backend cannot start. Nothing here is worth recovering: deleting
  the namespace and applying again from an empty volume gives a clean demo.
- To remove the environment: delete the DNS record and
  `kubectl delete namespace reconciled-test`.
