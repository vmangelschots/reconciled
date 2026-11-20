#!/bin/sh
# Roll the demo environment onto newly published images. Run from the
# jumpbox's crontab every 5 minutes, or by hand. It compares the digest that
# `latest` resolves to with the digest recorded on each Deployment, so an
# unchanged image costs one registry lookup and no restart.
#
#   ./update.sh            # check and roll out when changed
#   ./update.sh --dry-run  # report what would happen, change nothing
set -eu

NAMESPACE=${NAMESPACE:-reconciled-test}
REGISTRY=${REGISTRY:-ghcr.io}
OWNER=${OWNER:-vmangelschots}
TIMEOUT=${TIMEOUT:-300}
LOCKFILE=${LOCKFILE:-/var/lock/reconciled-test-update.lock}
DRY_RUN=false

case "${1:-}" in
  --dry-run) DRY_RUN=true ;;
  "") ;;
  *) echo "usage: $0 [--dry-run]" >&2; exit 2 ;;
esac

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# One run at a time: a slow rollout must not overlap with the next check.
if command -v flock >/dev/null 2>&1; then
  exec 9>"${LOCKFILE}"
  flock -n 9 || { log "another run is in progress; skipping"; exit 0; }
fi

# The digest the tag points at. Public packages need only an anonymous token.
latest_digest() {
  image=$1
  token=$(curl -fsS "https://${REGISTRY}/token?scope=repository:${OWNER}/${image}:pull&service=${REGISTRY}" | jq -r .token)
  curl -fsSI \
    -H "Authorization: Bearer ${token}" \
    -H "Accept: application/vnd.oci.image.index.v1+json" \
    -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
    "https://${REGISTRY}/v2/${OWNER}/${image}/manifests/latest" \
    | tr -d '\r' | awk 'tolower($1) == "docker-content-digest:" { print $2 }'
}

annotation() {
  kubectl -n "${NAMESPACE}" get deployment "$1" \
    -o jsonpath="{.metadata.annotations.reconciled\.dev/$2}" 2>/dev/null || true
}

failed=false
for image in reconciled-backend reconciled-frontend; do
  digest=$(latest_digest "${image}")
  if [ -z "${digest}" ]; then
    log "ERROR could not resolve ${image}:latest"; failed=true; continue
  fi

  rolled=$(annotation "${image}" rolled-digest)
  if [ "${digest}" = "${rolled}" ]; then
    log "no change for ${image} (${digest})"; continue
  fi

  if [ "${digest}" = "$(annotation "${image}" failed-digest)" ]; then
    log "skipping ${image}: ${digest} failed before, waiting for a newer image"; continue
  fi

  if ${DRY_RUN}; then
    log "would roll ${image} to ${digest}"; continue
  fi

  log "rolling ${image} to ${digest}"
  kubectl -n "${NAMESPACE}" rollout restart "deploy/${image}"
  if kubectl -n "${NAMESPACE}" rollout status "deploy/${image}" --timeout="${TIMEOUT}s"; then
    kubectl -n "${NAMESPACE}" annotate deployment "${image}" \
      "reconciled.dev/rolled-digest=${digest}" "reconciled.dev/failed-digest-" --overwrite >/dev/null
    log "rolled ${image} to ${digest}"
  else
    kubectl -n "${NAMESPACE}" annotate deployment "${image}" \
      "reconciled.dev/failed-digest=${digest}" --overwrite >/dev/null
    log "ERROR ${image} did not become ready with ${digest}; a newer image will be tried"
    failed=true
  fi
done

if ${failed}; then exit 1; fi
exit 0
