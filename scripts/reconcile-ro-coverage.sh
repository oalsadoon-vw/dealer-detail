#!/usr/bin/bash
# Daily RO coverage reconcile: db closed-RO count per store-month vs Tekion's own
# count (internal ro-search closedTime, via :9225). Gaps → Slack + auto re-sync.
# Runs under the nightly-sync flock so it never overlaps a sync on the same store.
set -uo pipefail
. /home/itadmin/dealer-detail/scripts/db-retry.sh
export PATH="/home/itadmin/.hermes/node/bin:$PATH"
export TEKION_BROWSER="${TEKION_BROWSER:-http://127.0.0.1:9225}"
export SYNC_SOURCE=internal
MONTHS="${1:-3}"
cd /home/itadmin/dealer-detail/apps/web
set -a; [ -f ./.env ] && . ./.env; set +a
echo "===== $(date -Is) reconcile-ro-coverage months=$MONTHS START ====="
bash /home/itadmin/dealer-detail/scripts/ensure-tekion-browser-auth.sh "$TEKION_BROWSER" || true

# ---- AUTH GATE (same as cron-ro-sync-internal.sh). Without it the 10/25 run
# scanned every store against a logged-out page -> "tekion ERR ... tcookie undefined" x7.
auth=$(bash /home/itadmin/dealer-detail/scripts/tekion-browser-probe.sh "$TEKION_BROWSER" 2>/dev/null || true)
if [ "$auth" != "OK" ]; then
  echo "===== $(date -Is) SKIPPED: $TEKION_BROWSER Tekion session not live (probe: ${auth:-no response}) — re-auth :9225 ====="
  exit 2
fi
db_retry 4 300 -- timeout -k 30 10800 npx tsx --conditions=react-server scripts/reconcile-ro-coverage.ts --months "$MONTHS"
echo "===== $(date -Is) reconcile-ro-coverage DONE (rc=$DB_RETRY_RC) ====="
# Dollar tie-out (count parity != dollar parity): site closed-basis labor/parts
# vs Tekion paySplitTotalsV3, MTD + prior full month, Slack if any store drifts >$100.
# Runs AFTER the coverage heal so a healed gap is re-measured the same morning.
FROM="$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m-%d)"
TO="$(date -d yesterday +%Y-%m-%d)"
echo "===== $(date -Is) tieout-dollars $FROM..$TO START ====="
db_retry 4 300 -- timeout -k 30 3600 npx tsx --conditions=react-server scripts/tieout-dollars.ts --from "$FROM" --to "$TO" --slack
echo "===== $(date -Is) tieout-dollars DONE (rc=$DB_RETRY_RC) ====="
