#!/usr/bin/bash
# Full-year RO backfill via the internal (browser :9225) path. Zero OpenAPI quota.
# Window = modifiedTime >= now-300d, so every RO touched in 2026 is (re)captured —
# this also closes any partial-month sync gaps (VWC Aug 2026 etc.).
set -uo pipefail
APP_DIR=/home/itadmin/dealer-detail/apps/web
LOG=/home/itadmin/dealer-detail/logs/backfill-2026-$(date +%Y%m%d-%H%M).log
export PATH="/home/itadmin/.hermes/node/bin:$PATH"
export TEKION_BROWSER="${TEKION_BROWSER:-http://127.0.0.1:9225}"
export SYNC_SOURCE=internal
cd "$APP_DIR"
set -a; [ -f ./.env ] && . ./.env; set +a
exec > >(tee -a "$LOG") 2>&1
echo "===== $(date -Is) backfill-2026 START (window ${WINDOW_DAYS:-300}d, stores: ${*:-ALL}, internal) ====="
bash /home/itadmin/dealer-detail/scripts/ensure-tekion-browser-auth.sh "$TEKION_BROWSER" || true
STORES="${*:-VWC SCVW ARSJ BC TOL BST SCT}"
for s in $STORES; do
  echo "----- $(date -Is) $s -----"
  timeout -k 30 10800 npm run -s sync:store -- "$s" "${WINDOW_DAYS:-300}"
  echo "----- $(date -Is) $s rc=$? -----"
  sleep 20
done
echo "===== $(date -Is) backfill-2026 DONE ====="
