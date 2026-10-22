#!/usr/bin/env bash
# Morning freshness guard for fixedopsreports.com (T9 §8). See
# apps/web/scripts/check-stale-stores.ts. Silent when fresh; Slack alert when
# any store is >30h stale or the browser session died.
set -uo pipefail
export PATH="/home/itadmin/.hermes/node/bin:$PATH"
cd /home/itadmin/dealer-detail/apps/web
set -a; [ -f ./.env ] && . ./.env; set +a
echo "===== $(date -Is) stale-store check ====="
npx tsx --conditions=react-server scripts/check-stale-stores.ts 2>&1 | grep -v TS18028
