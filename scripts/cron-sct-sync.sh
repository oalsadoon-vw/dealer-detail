#!/usr/bin/env bash
# Nightly DealerDetail ALL-STORES sync (collect + aggregate, 7 AMG stores).
# Default 3-day window per store + inter-store cooldown keeps us inside the
# Tekion OVERALL_RATELIMIT budget (~1,500 calls/15min, shared app-wide).
# Mirrors the Caliber nightly pattern: flock lock + append log.
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
npm run sync:all
echo "===== $(date -Is) all-stores nightly sync DONE ====="
