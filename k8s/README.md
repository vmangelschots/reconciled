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
| Secret key, DB password, your login | `15-secret.yaml` (copy of `examples/secret.example.yaml`) | `change-me` |

Create the secret file. It's git-ignored, so it can't be committed by
accident:

```sh
cp k8s/examples/secret.example.yaml k8s/15-secret.yaml
# then replace every change-me; a good secret key:
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

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
