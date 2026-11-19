#!/usr/bin/env bash
# Read-only health check for the reconciled deployment on the home cluster.
#
#   .claude/skills/check-deployment/check.sh
#
# Exit codes: 0 healthy (warnings allowed), 1 problems found, 2 jumpbox
# unreachable. Override the defaults with RECONCILED_JUMPBOX,
# RECONCILED_NAMESPACE, RECONCILED_HOST or RECONCILED_MANIFEST_DIR.
set -uo pipefail

JUMPBOX="${RECONCILED_JUMPBOX:-root@172.21.2.163}"
NAMESPACE="${RECONCILED_NAMESPACE:-reconciled}"
HOST="${RECONCILED_HOST:-reconciled.mangelschots.org}"
MANIFEST_DIR="${RECONCILED_MANIFEST_DIR:-/root/cluster/argo/reconciled}"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)

repo_root=$(cd "$(dirname "$0")/../../.." 2>/dev/null && pwd || echo "")
branch=$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
head=$(git -C "$repo_root" rev-parse --short HEAD 2>/dev/null || echo "?")
main=$(git -C "$repo_root" rev-parse --short origin/main 2>/dev/null || echo "?")

printf 'reconciled deployment check\n'
printf 'jumpbox: %s\n' "$JUMPBOX"
printf 'repo:    %s at %s (origin/main %s)\n' "$branch" "$head" "$main"

if ! ssh "${SSH_OPTS[@]}" "$JUMPBOX" true 2>/dev/null; then
    cat <<EOF

UNREACHABLE: cannot SSH to $JUMPBOX.

The cluster is only reachable through this jumpbox on Vincent's local
network (or VPN). Check that you are on that network, then retry. Do not
substitute another host.
EOF
    exit 2
fi

ssh "${SSH_OPTS[@]}" "$JUMPBOX" \
    "bash -s -- $(printf '%q' "$NAMESPACE") $(printf '%q' "$HOST") $(printf '%q' "$MANIFEST_DIR") $(printf '%q' "$main")" <<'REMOTE'
set -uo pipefail
NS=$1
HOST=$2
MANIFEST_DIR=$3
EXPECTED_MAIN=$4

had_problem=0
had_warning=0

section() { printf '\n== %s ==\n' "$1"; }
problem() { printf 'PROBLEM  %s\n' "$1"; had_problem=1; }
warning() { printf 'WARNING  %s\n' "$1"; had_warning=1; }

if ! kubectl get namespace "$NS" >/dev/null 2>&1; then
    problem "namespace $NS does not exist"
    printf '\nRESULT: PROBLEMS FOUND\n'
    exit 1
fi

# ---------------------------------------------------------------------------
section "Workloads"
kubectl -n "$NS" get deploy -o wide || problem "cannot list deployments"

for deploy in $(kubectl -n "$NS" get deploy -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
    values=$(kubectl -n "$NS" get deploy "$deploy" \
        -o jsonpath='{.spec.replicas} {.status.readyReplicas} {.status.availableReplicas} {.status.updatedReplicas}' 2>/dev/null)
    read -r desired ready available updated <<<"$values"
    desired=${desired:-0}
    ready=${ready:-0}
    available=${available:-0}
    updated=${updated:-0}

    if [ "$desired" -gt 0 ] && { [ "$ready" -ne "$desired" ] || [ "$available" -ne "$desired" ] || [ "$updated" -ne "$desired" ]; }; then
        problem "deploy/$deploy: desired $desired, ready $ready, available $available, updated $updated"
    fi
    if ! kubectl -n "$NS" rollout status "deploy/$deploy" --timeout=5s >/dev/null 2>&1; then
        problem "deploy/$deploy rollout is not complete"
    fi
done

printf '\nImages:\n'
kubectl -n "$NS" get deploy -o jsonpath='{range .items[*]}{"  "}{.metadata.name}{"  "}{.spec.template.spec.containers[*].image}{"\n"}{end}' 2>/dev/null

printf '\nPods:\n'
kubectl -n "$NS" get pods -o wide || problem "cannot list pods"
pods=$(kubectl -n "$NS" get pods --no-headers 2>/dev/null)
while read -r pod ready status restarts rest; do
    [ -z "${pod:-}" ] && continue
    case "$status" in
        Running|Completed|Succeeded) ;;
        *) problem "pod/$pod is $status" ;;
    esac
    case "$status" in
        Completed|Succeeded) ;;
        *) [ "$ready" = "1/1" ] || problem "pod/$pod is not ready ($ready)" ;;
    esac
done <<<"$pods"

# ---------------------------------------------------------------------------
section "Public endpoints (https://$HOST)"
http_code() {
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null) || code=000
    printf '%s' "$code"
}

root_code=$(http_code "https://$HOST/")
if [ "$root_code" = "200" ]; then
    printf '  /               200\n'
else
    problem "GET https://$HOST/ returned $root_code (expected 200)"
fi

api_code=$(http_code "https://$HOST/api/auth/me/")
case "$api_code" in
    401|403) printf '  /api/auth/me/   %s (expected: unauthenticated)\n' "$api_code" ;;
    000) problem "GET https://$HOST/api/auth/me/ failed (ingress, TLS or backend down)" ;;
    *) problem "GET /api/auth/me/ returned $api_code (expected 401/403)" ;;
esac

mcp_code=$(http_code "https://$HOST/mcp")
case "$mcp_code" in
    405) printf '  /mcp            %s (expected for a plain GET)\n' "$mcp_code" ;;
    000) problem "GET https://$HOST/mcp failed (ingress routing broken?)" ;;
    *) warning "GET /mcp returned $mcp_code (expected 405; 404 means it is routed to the frontend)" ;;
esac

admin_code=$(http_code "https://$HOST/admin/")
case "$admin_code" in
    200|302|301) printf '  /admin/         %s\n' "$admin_code" ;;
    *) warning "GET /admin/ returned $admin_code" ;;
esac

redirect=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "http://$HOST/" 2>/dev/null) || redirect="000 "
case "$redirect" in
    "301 https://$HOST/"|"308 https://$HOST/") printf '  http://          redirects to https\n' ;;
    *) warning "plain HTTP does not redirect to HTTPS ($redirect)" ;;
esac

printf '\nNote: public /health is served by the frontend (index.html), not the backend.\n'

# ---------------------------------------------------------------------------
section "TLS certificate"
cert_name=$(kubectl -n "$NS" get ingress reconciled -o jsonpath='{.spec.tls[0].secretName}' 2>/dev/null)
cert_ready=$(kubectl -n "$NS" get certificate "$cert_name" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
if [ "$cert_ready" = "True" ]; then
    printf '  cert-manager Certificate %s: Ready\n' "$cert_name"
else
    problem "cert-manager Certificate $cert_name is not Ready (${cert_ready:-missing})"
fi

end_date=$(kubectl -n "$NS" get secret "$cert_name" -o jsonpath='{.data.tls\.crt}' 2>/dev/null \
    | base64 -d 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | cut -d= -f2)
if [ -n "$end_date" ]; then
    end_epoch=$(date -d "$end_date" +%s 2>/dev/null || echo "")
    if [ -n "$end_epoch" ]; then
        days=$(( (end_epoch - $(date +%s)) / 86400 ))
        printf '  expires %s (%s days)\n' "$end_date" "$days"
        if [ "$days" -lt 0 ]; then
            problem "TLS certificate has expired"
        elif [ "$days" -lt 14 ]; then
            warning "TLS certificate expires in $days days"
        fi
    fi
else
    warning "could not read the TLS certificate from secret $cert_name"
fi

# ---------------------------------------------------------------------------
section "Running versions"
backend_version=$(kubectl -n "$NS" logs deploy/reconciled-backend --tail=-1 2>/dev/null \
    | sed -n 's/.*reconciled-backend version \([^ ]*\).*/\1/p' | head -1)
frontend_version=$(kubectl -n "$NS" logs deploy/reconciled-frontend --tail=-1 2>/dev/null \
    | sed -n 's/.*reconciled-frontend version \([^ ]*\).*/\1/p' | head -1)

printf '  backend:  %s\n' "${backend_version:-unknown}"
printf '  frontend: %s\n' "${frontend_version:-unknown}"

[ -n "$backend_version" ] || problem "no version line in the backend logs"
[ -n "$frontend_version" ] || problem "no version line in the frontend logs"
if [ -n "$backend_version" ] && [ -n "$frontend_version" ] && [ "$backend_version" != "$frontend_version" ]; then
    warning "backend ($backend_version) and frontend ($frontend_version) versions differ"
fi
if [ -n "$backend_version" ] && [ -n "$EXPECTED_MAIN" ] && [ "$EXPECTED_MAIN" != "?" ]; then
    if [ "$backend_version" = "$EXPECTED_MAIN" ]; then
        printf '  matches local origin/main (%s)\n' "$EXPECTED_MAIN"
    else
        printf '  local origin/main is %s (fetch first if verifying a fresh deploy)\n' "$EXPECTED_MAIN"
    fi
fi

# ---------------------------------------------------------------------------
section "Database"
db_deploy=$(kubectl -n "$NS" get deploy -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | grep -m1 postgres)
if [ -z "$db_deploy" ]; then
    warning "no postgres Deployment found"
else
    if output=$(kubectl -n "$NS" exec "deploy/$db_deploy" -- \
        sh -c 'pg_isready -U "${POSTGRES_USER:-reconciled}" -d "${POSTGRES_DB:-reconciled}"' 2>&1); then
        printf '  %s\n' "$output"
    else
        problem "postgres is not accepting connections: $output"
    fi
fi

for pvc in $(kubectl -n "$NS" get pvc -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
    phase=$(kubectl -n "$NS" get pvc "$pvc" -o jsonpath='{.status.phase}' 2>/dev/null)
    if [ "$phase" = "Bound" ]; then
        printf '  pvc/%s: Bound\n' "$pvc"
    else
        problem "pvc/$pvc is ${phase:-missing} (expected Bound)"
    fi
done

# ---------------------------------------------------------------------------
section "Bank-sync CronJob"
cronjobs=$(kubectl -n "$NS" get cronjob -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
if [ -z "$cronjobs" ]; then
    warning "no CronJob found in $NS"
else
    for cj in $cronjobs; do
        schedule=$(kubectl -n "$NS" get cronjob "$cj" -o jsonpath='{.spec.schedule}' 2>/dev/null)
        suspend=$(kubectl -n "$NS" get cronjob "$cj" -o jsonpath='{.spec.suspend}' 2>/dev/null)
        last_success=$(kubectl -n "$NS" get cronjob "$cj" -o jsonpath='{.status.lastSuccessfulTime}' 2>/dev/null)
        active=$(kubectl -n "$NS" get cronjob "$cj" -o jsonpath='{.status.active[*].name}' 2>/dev/null)
        printf '  %s: schedule "%s" (UTC), suspended=%s, active=%s\n' \
            "$cj" "$schedule" "${suspend:-false}" "${active:-none}"
        printf '  last successful: %s\n' "${last_success:-never}"
        if [ "$suspend" = "true" ]; then
            problem "cronjob/$cj is suspended"
        fi
        if [ -z "$last_success" ]; then
            warning "cronjob/$cj has never completed successfully"
        else
            last_epoch=$(date -d "$last_success" +%s 2>/dev/null || echo "")
            if [ -n "$last_epoch" ]; then
                hours=$(( ($(date +%s) - last_epoch) / 3600 ))
                if [ "$hours" -gt 48 ]; then
                    warning "cronjob/$cj last succeeded ${hours}h ago"
                fi
            fi
        fi
    done
    config_times=$(kubectl -n "$NS" get configmap reconciled-config -o jsonpath='{.data.BANK_SYNC_TIMES}' 2>/dev/null)
    printf '  BANK_SYNC_TIMES (app hint): %s\n' "${config_times:-unset}"
fi

# ---------------------------------------------------------------------------
section "Recent warning events"
events=$(kubectl -n "$NS" get events --field-selector type=Warning \
    --sort-by=.lastTimestamp --no-headers 2>/dev/null | tail -5)
if [ -n "$events" ]; then
    printf '%s\n' "$events"
else
    printf '  none\n'
fi

# ---------------------------------------------------------------------------
section "Manifest drift ($MANIFEST_DIR vs live)"
if [ ! -d "$MANIFEST_DIR" ]; then
    warning "manifest directory $MANIFEST_DIR not found on the jumpbox"
else
    diff_files=""
    for f in namespace.yaml configmap.yaml pvc.yaml postgres.yaml reconciled.yaml bank-sync.yaml; do
        [ -f "$MANIFEST_DIR/$f" ] && diff_files="$diff_files $f"
    done
    if [ -z "$diff_files" ]; then
        warning "no known manifest files in $MANIFEST_DIR"
    else
        # Deliberately exclude secret.yaml: its diff would print real secrets.
        # kubectl diff here rejects several -f flags, so run it per file.
        drift_output=""
        drift_found=0
        for f in $diff_files; do
            out=$(cd "$MANIFEST_DIR" && kubectl diff -f "$f" 2>&1)
            rc=$?
            if [ "$rc" -eq 1 ]; then
                drift_found=1
                drift_output="$drift_output
$(printf '%s\n' "$out" | grep -v 'would violate PodSecurity')"
            elif [ "$rc" -gt 1 ]; then
                warning "kubectl diff -f $f failed (rc=$rc)"
                printf '%s\n' "$out" | grep -v 'would violate PodSecurity' || true
            fi
        done
        if [ "$drift_found" -eq 0 ]; then
            printf '  no drift\n'
        else
            warning "live resources differ from the manifests (read-only diff below)"
            printf '%s\n' "$drift_output"
        fi
    fi
fi

# ---------------------------------------------------------------------------
section "Result"
if [ "$had_problem" -eq 1 ]; then
    printf 'PROBLEMS FOUND\n'
    exit 1
elif [ "$had_warning" -eq 1 ]; then
    printf 'HEALTHY (with warnings)\n'
else
    printf 'HEALTHY\n'
fi
REMOTE
