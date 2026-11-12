#!/bin/sh
# The nginx image runs /docker-entrypoint.d/*.sh before starting nginx, so
# this line lands in the pod log. See openspec/specs/app-version.
echo "reconciled-frontend version ${APP_VERSION:-dev} (commit ${APP_COMMIT:--}, built ${APP_BUILT:--})"
