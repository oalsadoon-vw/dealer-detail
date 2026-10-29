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

PROBE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tekion-browser-probe.sh"

# REAL probe (2026-10-26): a 1-row internal ro-search must return 200. Token
# presence alone passed on 10/25 while Tekion said "Login user session is
# expired" — that is the failure mode this now catches.
_probe() {
  local r
  r=$(bash "$PROBE" "$BROWSER_URL" 2>/dev/null)
  _PROBE_LAST="$r"
  [ "$r" = "OK" ]
}

# 2026-10-28: Chromium inside the :9225 server can die while node keeps
# listening (/eval -> "browserContext.newPage: Target page, context or browser
# has been closed"). Probe = NORESP for 14h, re-auth can't fix it — only a
# server restart can. Detect + restart (only for :9225 = persistent-browser-2).
_eval_err() {
  curl -s -m 15 -X POST "$BROWSER_URL/eval" -H 'Content-Type: application/json' -d '{"js":"1"}' 2>/dev/null
}
_restart_browser_if_dead() {
  [ "$PORT" = "9225" ] || return 0
  local r; r=$(_eval_err)
  if [ -z "$r" ] || printf '%s' "$r" | grep -qiE 'has been closed|Target closed|browser.*closed|ECONNREFUSED'; then
    echo "===== $(date -Is) :9225 browser DEAD (eval: ${r:-no response}) — restarting persistent-browser-2 ====="
    local pid; pid=$(ss -ltnp 2>/dev/null | grep ':9225 ' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
    [ -n "$pid" ] && kill "$pid" 2>/dev/null; sleep 2
    pkill -f 'persistent-browser-2/browser-data' 2>/dev/null; sleep 2
    mkdir -p /home/itadmin/dealer-detail/logs
    cd /home/itadmin/persistent-browser-2 && rm -f browser-data/Singleton* \
      && HOME=/home/itadmin nohup xvfb-run -a node server.js >> /home/itadmin/dealer-detail/logs/persistent-browser-2.log 2>&1 &
    local i; for i in $(seq 1 30); do sleep 3; r=$(_eval_err); printf '%s' "$r" | grep -q '"result"' && break; done
    echo "===== $(date -Is) :9225 restarted (eval: ${r:-no response}) ====="
  fi
}

_restart_browser_if_dead

if _probe; then
  echo "===== $(date -Is) browser auth OK ($BROWSER_URL, live ro-search 200) ====="
else
  echo "===== $(date -Is) browser $BROWSER_URL logged out [$_PROBE_LAST] — attempting auto re-auth ====="
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
