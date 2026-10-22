#!/usr/bin/env bash
# One-shot recovery for stores starved by the 45m-timeout bug (2026-08-11 .. 2026-09-01).
#
# Waits for the nightly sync to release its lock (NEVER runs concurrently — two
# sync processes share the app-wide Tekion quota and re-drain each other), then
# probes quota, then backfills the named stores with a wide window.
#
# Usage: RECOVER_STORES=SCVW,TOL RECOVER_WINDOW=24 ./recover-stale-stores.sh
set -uo pipefail

APP_DIR="/home/itadmin/dealer-detail/apps/web"
LOCK="/tmp/dealerdetail-sct-sync.lock"
STORES="${RECOVER_STORES:-SCVW,TOL}"
WINDOW="${RECOVER_WINDOW:-24}"

export PATH="/home/itadmin/.hermes/node/bin:$PATH"
cd "$APP_DIR"
set -a; [ -f ./.env ] && . ./.env; set +a

echo "===== $(date -Is) recovery START stores=$STORES window=${WINDOW}d ====="
echo "waiting for nightly sync lock (up to 4h)..."

# Blocking flock: queue behind the nightly run instead of competing with it.
exec 9>"$LOCK"
if ! flock -w 14400 9; then
  echo "===== $(date -Is) ABORT: lock not released within 4h ====="
  exit 1
fi
echo "lock acquired at $(date -Is)"

# Quota may be drained by the run we just waited on. Probe before spending.
PROBE="/home/itadmin/dealer-detail/scripts/tekion-quota-probe.py"
if [ -f "$PROBE" ]; then
  ok=0
  for attempt in 1 2 3 4 5 6; do
    if python3 "$PROBE"; then ok=1; break; fi
    echo "quota probe: exhausted (attempt $attempt/6) — sleeping 20m"
    sleep 1200
  done
  if [ "$ok" != "1" ]; then
    echo "===== $(date -Is) SKIPPED: quota exhausted 2h ====="
    exit 0
  fi
fi

# NOTE: no `| tail` here. Piping npm to tail returns TAIL's exit status and
# masks a failed sync as success — that is exactly how the 19-night outage
# stayed invisible. Capture rc directly.
SYNC_STORES="$STORES" \
SYNC_WINDOW_DAYS="$WINDOW" \
SYNC_COOLDOWN_SECONDS=150 \
SYNC_NO_ROTATE=1 \
  npm run sync:all
rc=$?

echo "===== $(date -Is) recovery DONE rc=$rc ====="
exit $rc
