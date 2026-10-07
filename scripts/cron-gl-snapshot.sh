#!/usr/bin/env bash
# Nightly DealerDetail GL / financial-statement snapshot (all 7 stores).
#
# Pulls each store's financial-statement cell values for YESTERDAY and TODAY
# from Tekion's internal financial-statements API via the persistent browser
# on :9225 (SuperAdmin session; cross-dealer by header, no UI switching).
# Zero OpenAPI quota, so it does NOT need the quota probe and can run at any
# time. Re-snapshotting today+yesterday keeps late postings (reopened ROs,
# warranty settles) accurate — each snapshot REPLACES that day's rows.
#
# Schedule: 05:30 PT — after the 23:00 RO sync + 02:00 VI pull, before Joe's
# 6 AM reports. ~1 min per store.
set -euo pipefail

APP_DIR="/home/itadmin/dealer-detail/apps/web"
LOG_DIR="/home/itadmin/dealer-detail/logs"
mkdir -p "$LOG_DIR"
export PATH="/home/itadmin/.hermes/node/bin:$PATH"
export GL_BROWSER="${GL_BROWSER:-http://127.0.0.1:9225}"

cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
[ -f ./.env ] && . ./.env
set +a

echo "===== $(date -Is) GL snapshot START ====="
# Browser must be logged in; if not, say so loudly and exit non-zero so the
# gap shows in the log (Jay re-auths :9225 via restore_9223_session-style flow).
if ! curl -sf -m 10 -X POST "$GL_BROWSER/eval" -H 'Content-Type: application/json' \
     -d '{"js":"(()=>String(!!localStorage.t_token && /tekioncloud\\.com/.test(location.href)))()"}' | grep -q '"true"'; then
  echo "===== $(date -Is) GL snapshot SKIPPED: $GL_BROWSER not logged into Tekion ====="
  exit 2
fi

set +e
timeout -k 30 1800 npm run -s gl:snapshot -- ALL
rc=$?
set -e
echo "===== $(date -Is) GL snapshot DONE (rc=$rc) ====="
exit $rc
