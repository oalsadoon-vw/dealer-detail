#!/usr/bin/bash
# Daily RO coverage reconcile: db closed-RO count per store-month vs Tekion's own
# count (internal ro-search closedTime, via :9225). Gaps → Slack + auto re-sync.
# Runs under the nightly-sync flock so it never overlaps a sync on the same store.
set -uo pipefail
export PATH="/home/itadmin/.hermes/node/bin:$PATH"
export TEKION_BROWSER="${TEKION_BROWSER:-http://127.0.0.1:9225}"
export SYNC_SOURCE=internal
MONTHS="${1:-3}"
cd /home/itadmin/dealer-detail/apps/web
set -a; [ -f ./.env ] && . ./.env; set +a
echo "===== $(date -Is) reconcile-ro-coverage months=$MONTHS START ====="
bash /home/itadmin/dealer-detail/scripts/ensure-tekion-browser-auth.sh "$TEKION_BROWSER" || true
timeout -k 30 10800 npx tsx --conditions=react-server scripts/reconcile-ro-coverage.ts --months "$MONTHS" 2>&1 | grep -v TS18028
echo "===== $(date -Is) reconcile-ro-coverage DONE (rc=${PIPESTATUS[0]}) ====="
