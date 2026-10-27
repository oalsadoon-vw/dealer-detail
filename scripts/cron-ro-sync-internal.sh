#!/usr/bin/env bash
# Nightly DealerDetail ALL-STORES RO sync — INTERNAL-API path (T9).
#
# Replaces cron-sct-sync.sh (OpenAPI path) as the nightly driver. Why:
#   OpenAPI costs ~12 calls per RO and shares one app-wide 1,500/15-min quota
#   with the 2 AM inventory pull and the 5:30 GL snapshot. Within a 2h30 cap it
#   starved tail stores night after night (5 breakages since 7/02). The
#   internal path reads the same RO/job documents through the logged-in :9225
#   browser (1 search page + 1 batched job/search per 50 ROs, no quota), with a
#   resumable cursor on SyncRun — a killed run resumes where it stopped.
#
# FALLBACK: SYNC_SOURCE=openapi (or ./cron-sct-sync.sh) is still fully wired.
# If :9225 is not logged into Tekion this script exits 2 WITHOUT touching the
# DB and the stale-store check (check-stale-stores.sh, 06:00) alerts Slack.
set -uo pipefail

APP_DIR="/home/itadmin/dealer-detail/apps/web"
LOG_DIR="/home/itadmin/dealer-detail/logs"
mkdir -p "$LOG_DIR"
export PATH="/home/itadmin/.hermes/node/bin:$PATH"
export TEKION_BROWSER="${TEKION_BROWSER:-http://127.0.0.1:9225}"
export SYNC_SOURCE=internal
# Internal path has no quota; cooldown is just politeness toward the browser.
export SYNC_COOLDOWN_SECONDS="${SYNC_COOLDOWN_SECONDS:-20}"
export SYNC_WINDOW_DAYS="${SYNC_WINDOW_DAYS:-14}"
unset COLLECT_ST_WINDOW_DAYS || true

cd "$APP_DIR"
set -a; [ -f ./.env ] && . ./.env; set +a

echo "===== $(date -Is) all-stores nightly sync [internal] START ====="

# ---- AUTO RE-AUTH (best effort; added 2026-10-23) ----
bash /home/itadmin/dealer-detail/scripts/ensure-tekion-browser-auth.sh "$TEKION_BROWSER" || true

# ---- AUTH GATE (same check gl-snapshot uses; hostname equality, no regex) ----
auth=$(bash /home/itadmin/dealer-detail/scripts/tekion-browser-probe.sh "$TEKION_BROWSER" 2>/dev/null || true)
if [ "$auth" != "OK" ]; then
  echo "===== $(date -Is) SKIPPED: $TEKION_BROWSER Tekion session not live (probe: ${auth:-no response}) — re-auth :9225 ====="
  exit 2
fi

# Generous cap: 7 stores × 3-day window ≈ 15 min on the internal path. The cap
# is a safety net against a hung browser, NOT a budget — and a kill no longer
# loses work: the next run resumes from SyncRun.cursor.
timeout -k 30 5400 npm run -s sync:all
rc=$?
if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
  echo "===== $(date -Is) nightly sync TIMED OUT after 90m (rc=$rc) — will resume from cursor next run ====="
else
  echo "===== $(date -Is) nightly sync DONE (rc=$rc) ====="
fi

# Self-heal pay-type/cost drift: compare every stored RO in the trailing 45 days
# against Tekion's header paySplitTotalsV3 (sale+cost per CP/W/I) and re-pull
# the mismatches. Catches (a) split-pay jobs, (b) part cost posted AFTER the RO's
# modifiedTime (the "unchanged" skip would otherwise freeze $0 cost forever).
# Header-only detection: ~1 browser call per 200 ROs; zero OpenAPI quota.
FROM45=$(date -d '45 days ago' +%F); TO=$(date +%F)
echo "===== $(date -Is) pay-type/cost drift sweep ${FROM45}..${TO} ====="
timeout -k 30 1800 npx tsx --conditions=react-server scripts/refanout-split.ts --from "$FROM45" --to "$TO" 2>&1 | grep -v TS18028 | grep -E "mismatches|fixed=|SUMMARY|Error"
exit "$rc"
