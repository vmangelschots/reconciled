#!/bin/sh
# Apply the demo environment. Run from this directory on the jumpbox, after
# creating secret.yaml from k8s/examples/secret.example.yaml.
set -e
cd "$(dirname "$0")"

[ -f secret.yaml ] || { echo "secret.yaml missing - see README.md for the three keys it needs"; exit 1; }

kubectl apply -f 00-namespace.yaml
kubectl apply -f secret.yaml -f 10-config.yaml -f 20-postgres.yaml
kubectl -n reconciled-test rollout status deploy/postgres --timeout=180s
kubectl apply -f 30-backend.yaml
kubectl -n reconciled-test rollout status deploy/reconciled-backend --timeout=300s
kubectl apply -f 40-frontend.yaml
kubectl -n reconciled-test rollout status deploy/reconciled-frontend --timeout=120s
kubectl apply -f 50-ingress.yaml -f 60-reset.yaml
