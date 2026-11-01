# Running reconciled on Kubernetes

Plain manifests, applied in filename order with `kubectl apply -f k8s/`.
Everything runs in the `reconciled` namespace, behind one HTTPS hostname.

| File | What it creates |
|---|---|
| `00-namespace.yaml` | The `reconciled` namespace |
| `10-config.yaml` | Non-secret settings (hostname, database name) |
| `15-secret.yaml` | **You create this** from `examples/secret.example.yaml` |
| `20-postgres.yaml` | PostgreSQL 16 StatefulSet with a 5Gi volume |
| `30-backend.yaml` | Django API; migrates and creates your user on startup |
| `40-frontend.yaml` | The web app (nginx) |
| `50-ingress.yaml` | HTTPS routing: `/api`, `/admin`, `/static` to the backend, everything else to the frontend |

## Prerequisites

- An [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) controller (ingress class `nginx`).
- [cert-manager](https://cert-manager.io/) with a ClusterIssuer for your certificates.
- A default StorageClass, so the database volume can be provisioned.
- A DNS record for your hostname pointing at the ingress controller.

## 1. Edit these

| What | Where | Placeholder |
|---|---|---|
| Your hostname | `10-config.yaml` (3 places) and `50-ingress.yaml` (2 places) | `budget.example.com` |
| cert-manager issuer name | `50-ingress.yaml` annotation | `letsencrypt` |
| Image version (recommended: pin a release instead of `latest`) | `30-backend.yaml` (2 places), `40-frontend.yaml` | `:latest` |
| Secret key, encryption key, DB password, your login | `15-secret.yaml` (copy of `examples/secret.example.yaml`) | `change-me` |

Create the secret file. It's git-ignored, so it can't be committed by
accident:

```sh
cp k8s/examples/secret.example.yaml k8s/15-secret.yaml
# then replace every change-me; a good secret key:
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### Optional: AI categorization

Add `OPENAI_API_KEY` to `15-secret.yaml` to have OpenAI guess
categories for payees your history doesn't cover yet. Payee names, notes
and amounts are sent to OpenAI; account names, dates and balances never
are. Without the key, only your history is used. Each household turns this
on for itself in Settings, and it uses your OpenAI account; the first household
keeps it on after an upgrade. Three plain settings can
go in `10-config.yaml` if the defaults don't suit you:

| Setting | Default | What it does |
|---|---|---|
| `AI_CATEGORIZATION_ENABLED` | `true` | Set to `false` to stop AI calls while keeping the key |
| `AI_CATEGORIZATION_MODEL` | `gpt-6-luna` | The OpenAI model used for guessing |
| `AI_CATEGORIZATION_DEADLINE` | `20` | Seconds the AI step may take per import or backfill (keep it below gunicorn's 30s timeout) |

Restart the backend after changing any of them:
`kubectl -n reconciled rollout restart deploy/backend`.

### Encryption key

Each household's Enable Banking key is stored encrypted with
`HOUSEHOLD_ENCRYPTION_KEYS` from `15-secret.yaml`. Generate one:

```sh
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Keep a copy somewhere other than the database: a database dump doesn't hold
it, and without it households have to enter their keys again. Their budgets
aren't affected.

To rotate it, put a new key first in the comma-separated list, restart the
backend, run `manage.py rotate_encryption_key`, then remove the old key.

### Households

The login in `15-secret.yaml` gets the first household. For someone else:

```sh
kubectl -n reconciled exec deploy/backend -- \
  python manage.py create_household "The Peeters household" --url https://<your hostname>
```

This prints an invite link for their first member, who chooses their own login
and password. Members can then invite others from Settings, and anyone with a
login can be in several households. Links work once, for 7 days.

Tell people what you can see: whoever runs the server can read every household
in the database. Household budget data isn't in Django admin, which only
manages households, members and logins.

Remove someone from a household in Django admin. To delete a household and all
its data, for good: `manage.py delete_household <id>`. Run
`manage.py check_household_integrity` after an upgrade to confirm nothing links
across households.

### Optional: bank sync

Each household uses its own [Enable Banking](https://enablebanking.com/)
application, set up under Settings, which walks them through it and shows the
redirect URL to add, `https://<your hostname>/settings/banks`. Restricted mode
is for personal use with accounts linked to that application. Whether several
people's applications may run on one server isn't confirmed with Enable
Banking, so ask them before connecting another household's bank. Transactions
pass through Enable Banking.

When upgrading from a single-household version, keep `ENABLE_BANKING_APP_ID`
and `ENABLE_BANKING_PRIVATE_KEY` in the Secret and add the encryption key: the
backend moves them into the first household on its next start, and you can then
remove them. Take a database dump first. Reversing the migrations is only safe
while there is one household; after that, restore the dump.

`35-bank-sync.yaml` syncs every household at 06:30 and 18:30 UTC, one after
another. A household without credentials is skipped. It uses the same image as
the backend, so keep its tag in step when you pin one. Consent lasts about 180
days at most banks; the Overview says when to reconnect.

`BUDGET_APP_USERNAME` / `BUDGET_APP_PASSWORD` is the account you log in
with. It's created on the backend's first start and never changed
afterwards. To change the password later, run
`kubectl -n reconciled exec deploy/backend -- python manage.py changepassword <user>`.

## 2. Let the cluster pull the images

The images are published to GHCR as
`ghcr.io/vmangelschots/reconciled-frontend` and `-backend`. New GHCR
packages are **private** by default. Either:

- make both packages public (GitHub → your profile → Packages → package →
  Package settings → Change visibility), or
- create a pull secret with a token that has `read:packages`, then
  uncomment `imagePullSecrets` in `30-backend.yaml` and `40-frontend.yaml`:

  ```sh
  kubectl create namespace reconciled
  kubectl -n reconciled create secret docker-registry ghcr-pull \
    --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token>
  ```

## 3. Apply

```sh
kubectl apply -f k8s/
kubectl -n reconciled get pods -w   # wait until db, backend and frontend are Ready
```

Then open `https://<your hostname>` and log in with the credentials from
your secret. If the backend pod is stuck in `Init`, its `migrate` init
container logs explain why:
`kubectl -n reconciled logs deploy/backend -c migrate`.

To upgrade, change the image tags and `kubectl apply -f k8s/` again. The
backend is replaced (not rolled), and migrations run before the new
version serves traffic.

## Backups

Nothing backs up the database for you. A logical dump:

```sh
kubectl -n reconciled exec db-0 -- sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > reconciled-$(date +%F).sql
```

Restore into a fresh install with
`kubectl -n reconciled exec -i db-0 -- sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < reconciled-YYYY-MM-DD.sql`.
