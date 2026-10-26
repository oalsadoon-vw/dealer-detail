#!/usr/bin/env bash
# Best-effort: make sure the persistent Tekion browser (:9225 by default) is
# logged in before a cron that depends on it runs. Added 2026-10-23 after the
# 05:30 GL snapshot SKIPPED three nights running because the :9225 session had
# logged itself out between the 23:00 RO sync and 05:30.
#
# Flow: probe -> if logged out, run restore_9223_session.py <port> (login.py
# reuse-if-alive else full headless OTP login, then inject cookies+localStorage
# into the browser) -> re-probe. Never fails the caller; the caller still does
# its own hard login check and exits 2 if we couldn't recover.
#
# Usage: . scripts/ensure-tekion-browser-auth.sh [http://127.0.0.1:9225]
# login.py reads the OTP via `himalaya` (~/.local/bin) — cron's PATH lacks it
# (10/25 06:30: "count_otp_emails error: No such file or directory: 'himalaya'").
export PATH="/home/itadmin/.local/bin:/home/itadmin/.cargo/bin:$PATH"
BROWSER_URL="${1:-${TEKION_BROWSER:-${GL_BROWSER:-http://127.0.0.1:9225}}}"
PORT="${BROWSER_URL##*:}"
VPY="/home/itadmin/.hermes/hermes-agent/venv/bin/python3.11"
RESTORE="/home/itadmin/tekion-reports/restore_9223_session.py"

_probe() {
  curl -sf -m 10 -X POST "$BROWSER_URL/eval" -H 'Content-Type: application/json' \
    -d '{"js":"(()=>String(!!localStorage.t_token && document.cookie.indexOf(\"tcookie=\")>=0 && location.hostname===\"app.tekioncloud.com\"))()"}' 2>/dev/null | grep -q '"true"'
}

if _probe; then
  echo "===== $(date -Is) browser auth OK ($BROWSER_URL) ====="
else
  echo "===== $(date -Is) browser $BROWSER_URL logged out — attempting auto re-auth ====="
  if [ -x "$VPY" ] && [ -f "$RESTORE" ]; then
    HOME=/home/itadmin timeout 420 "$VPY" "$RESTORE" "$PORT" 2>&1 | grep -Ei "LOGGED_IN|REUSED|FAIL|Error|url:|rc=" | tail -6 || true
    if ! _probe; then
      # Saved session may be stale (login.py REUSED a dead token) — force a fresh OTP login once.
      echo "===== $(date -Is) restore left browser logged out — forcing fresh login ====="
      HOME=/home/itadmin timeout 420 "$VPY" /home/itadmin/tekion-auth/login.py --force 2>&1 | grep -Ei "LOGGED_IN|FAIL|Error" | tail -3 || true
      HOME=/home/itadmin timeout 420 "$VPY" "$RESTORE" "$PORT" 2>&1 | grep -Ei "url:|rc=" | tail -2 || true
    fi
  else
    echo "===== $(date -Is) auto re-auth unavailable (missing $VPY or $RESTORE) ====="
  fi
  if _probe; then
    echo "===== $(date -Is) browser auth RESTORED ($BROWSER_URL) ====="
  else
    echo "===== $(date -Is) browser auth STILL DOWN ($BROWSER_URL) ====="
  fi
fi
