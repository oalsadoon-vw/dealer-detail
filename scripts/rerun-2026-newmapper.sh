#!/usr/bin/bash
# FULL 2026 RE-RUN UNDER THE NEW MAPPER (2026-10-23, Omar: "rerun with the new mapper").
# Phase 1: 300d backfill BST + SCT (never ran; they have ~0 rows Jan–Sep).
# Phase 2: refanout-split month-by-month fleet-wide (repairs any RO whose
#          CP/W/I sale OR cost ≠ Tekion paySplitTotalsV3, and ingests any
#          closed RO the site is missing entirely).
# Phase 3: tieout-paytype per month → the deliverable table.
set -u
cd /home/itadmin/dealer-detail/apps/web || exit 1
export PATH=/home/itadmin/.hermes/node/bin:$PATH
export TEKION_BROWSER="${TEKION_BROWSER:-http://127.0.0.1:9225}"
export SYNC_SOURCE=internal
set -a; . ./.env; set +a
mkdir -p /home/itadmin/dealer-detail/logs
LOG=/home/itadmin/dealer-detail/logs/rerun-2026-$(date +%Y%m%d-%H%M).log
exec >>"$LOG" 2>&1
echo "=== START $(date) ==="
exec 9>/tmp/dealerdetail-ro-sync.lock
flock 9 || { echo "lock busy"; exit 1; }
bash /home/itadmin/dealer-detail/scripts/ensure-tekion-browser-auth.sh "$TEKION_BROWSER" || true

echo "=== PHASE 1: backfill BST SCT (300d) $(date) ==="
for s in BST SCT; do
  echo "----- $(date -Is) $s -----"
  timeout -k 30 10800 npm run -s sync:store -- "$s" 300
  echo "----- $(date -Is) $s rc=$? -----"
  sleep 20
done

echo "=== PHASE 2+3: refanout-split + tieout per month $(date) ==="
MONTHS="2026-01-01:2026-01-31 2026-02-01:2026-02-28 2026-03-01:2026-03-31 2026-04-01:2026-04-30 2026-05-01:2026-05-31 2026-06-01:2026-06-30 2026-07-01:2026-07-31 2026-08-01:2026-08-31 2026-09-01:2026-09-30 2026-10-01:2026-10-23"
for m in $MONTHS; do
  F=${m%%:*}; T=${m##*:}
  echo "--- REFANOUT $F..$T $(date) ---"
  for attempt in 1 2 3; do
    timeout -k 30 5400 npx tsx --conditions=react-server scripts/refanout-split.ts --from "$F" --to "$T" 2>&1 | grep -v TS18028
    rc=${PIPESTATUS[0]}
    echo "refanout rc=$rc attempt=$attempt"
    [ "$rc" = "0" ] && break
    sleep 60
  done
  echo "--- TIEOUT $F..$T $(date) ---"
  timeout -k 30 1500 npx tsx --conditions=react-server scripts/tieout-paytype.ts "$F" "$T" 2>&1 | grep -v TS18028
  echo "tieout rc=${PIPESTATUS[0]}"
done
echo "=== DONE $(date) ==="
