#!/usr/bin/env bash
# Nightly DealerDetail ALL-STORES sync (collect + aggregate, 7 AMG stores).
# Default 3-day window per store + inter-store cooldown keeps us inside the
# Tekion OVERALL_RATELIMIT budget (~1,500 calls/15min, shared app-wide).
# Mirrors the Caliber nightly pattern: flock lock + append log.
#
# SCHEDULE (2026-07-08): runs at 11:00 PM so it never collides with the 2 AM
# VI inventory pull — both burn the SAME app-wide Tekion OpenAPI quota, and
# overlapping runs starved each other into all-stores-0-ROs nights.
set -euo pipefail

APP_DIR="/home/itadmin/dealer-detail/apps/web"
LOG_DIR="/home/itadmin/dealer-detail/logs"
mkdir -p "$LOG_DIR"

export PATH="/home/itadmin/.hermes/node/bin:$PATH"

cd "$APP_DIR"
# Load env (DATABASE_URL, DIRECT_URL, TEKION_* secrets)
set -a
# shellcheck disable=SC1091
[ -f ./.env ] && . ./.env
set +a

# Ensure default (small) window — never set a large SYNC_WINDOW_DAYS here.
unset SYNC_WINDOW_DAYS || true
unset COLLECT_ST_WINDOW_DAYS || true

echo "===== $(date -Is) all-stores nightly sync START ====="

# ---- QUOTA PROBE ------------------------------------------------------------
# One cheap search call against SCT. If the app-wide OVERALL_QUOTA is already
# exhausted (e.g. another consumer burned it), retrying 7 stores just digs the
# hole deeper. Probe up to 6 times, 20 min apart (2h max), then give up loudly.
PROBE="/home/itadmin/dealer-detail/scripts/tekion-quota-probe.py"
if [ -f "$PROBE" ]; then
  ok=0
  for attempt in 1 2 3 4 5 6; do
    if python3 "$PROBE"; then
      ok=1
      break
    fi
    echo "quota probe: OVERALL_QUOTA exhausted (attempt $attempt/6) — sleeping 20m"
    sleep 1200
  done
  if [ "$ok" != "1" ]; then
    echo "===== $(date -Is) SKIPPED: Tekion quota exhausted for 2h — no sync tonight ====="
    exit 0
  fi
fi
# -----------------------------------------------------------------------------

npm run sync:all
echo "===== $(date -Is) all-stores nightly sync DONE ====="
