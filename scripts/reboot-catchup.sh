#!/usr/bin/env bash
# Reboot catch-up (fix #3, 2026-10-26). Runs from `@reboot` cron (sleep 90s
# first so network/systemd are up). Steps:
#   1. Start the :9225 persistent Tekion browser if nothing is listening
#      (it was hand-launched after the 10/26 07:21 reboot — nothing brought it back).
#   2. Re-auth it (real probe -> restore/OTP login).
#   3. For each nightly job, if today's (or last night's) run has no DONE line
#      in its log, run it now, in pipeline order, under the same flocks cron uses.
# Idempotent: safe to run by hand at any time.
export PATH="/home/itadmin/.local/bin:/home/itadmin/.cargo/bin:/home/itadmin/.hermes/node/bin:/usr/local/bin:/usr/bin:/bin"
D=/home/itadmin/dealer-detail; S=$D/scripts; L=$D/logs; mkdir -p "$L"
B="${TEKION_BROWSER:-http://127.0.0.1:9225}"
echo "===== $(date -Is) reboot-catchup START (uptime since $(uptime -s)) ====="

# 1. browser
if [ -z "$DRY" ] && ! curl -sf -m 5 -X POST "$B/eval" -H 'Content-Type: application/json' -d '{"js":"1"}' >/dev/null 2>&1; then
  echo "===== $(date -Is) :9225 not listening — starting persistent-browser-2 ====="
  cd /home/itadmin/persistent-browser-2 && rm -f browser-data/Singleton* \
    && HOME=/home/itadmin nohup xvfb-run -a node server.js >> "$L/persistent-browser-2.log" 2>&1 &
  for i in $(seq 1 30); do
    sleep 3
    curl -sf -m 5 -X POST "$B/eval" -H 'Content-Type: application/json' -d '{"js":"1"}' >/dev/null 2>&1 && break
  done
  curl -sf -m 5 -X POST "$B/eval" -H 'Content-Type: application/json' -d '{"js":"location.href"}' 2>/dev/null \
    || echo "===== $(date -Is) :9225 FAILED to come up ====="
  echo
fi

# 2. auth
[ -z "$DRY" ] && bash "$S/ensure-tekion-browser-auth.sh" "$B" || true

# 3. missed jobs. "Expected run" = the most recent scheduled time that is in
# the past; a job is missed if its log has no DONE line after that time.
missed() { # $1=log $2=cron-hour $3=cron-minute $4=DONE-regex
  local log=$1 h=$2 m=$3 pat=$4 exp
  exp=$(date -d "today $h:$m" +%s); [ "$exp" -gt "$(date +%s)" ] && exp=$(date -d "yesterday $h:$m" +%s)
  [ -f "$log" ] || return 0
  while IFS= read -r line; do
    ts=$(sed -n 's/^===== \([0-9T:+-]*\) .*/\1/p' <<<"$line"); [ -z "$ts" ] && continue
    [ "$(date -d "$ts" +%s 2>/dev/null || echo 0)" -ge "$exp" ] && return 1
  done < <(grep -E "$pat" "$log" | tail -5)
  return 0
}
run() { echo "===== $(date -Is) reboot-catchup: re-running $1 ====="; [ -n "$DRY" ] && return 1; return 0; }

if missed "$L/ro-sync-internal.log" 23 00 'nightly sync DONE'; then
  run ro-sync && /usr/bin/flock -w 7200 /tmp/dealerdetail-ro-sync.lock bash "$S/cron-ro-sync-internal.sh" >> "$L/ro-sync-internal.log" 2>&1
fi
if missed "$L/gl-snapshot-nightly.log" 5 30 'GL snapshot DONE'; then
  run gl-snapshot && /usr/bin/flock -w 3600 /tmp/dealerdetail-gl-snapshot.lock bash "$S/cron-gl-snapshot.sh" >> "$L/gl-snapshot-nightly.log" 2>&1
fi
if missed "$L/check-stale-stores.log" 6 00 'stale-store check'; then
  run stale-check && bash "$S/check-stale-stores.sh" >> "$L/check-stale-stores.log" 2>&1
fi
if missed "$L/reconcile-ro-coverage.log" 6 30 'tieout-dollars DONE'; then
  months=3; [ "$(date +%u)" = 7 ] && months=12
  run "reconcile($months mo)" && /usr/bin/flock -w 7200 /tmp/dealerdetail-ro-sync.lock bash "$S/reconcile-ro-coverage.sh" $months >> "$L/reconcile-ro-coverage.log" 2>&1
fi
echo "===== $(date -Is) reboot-catchup DONE ====="
