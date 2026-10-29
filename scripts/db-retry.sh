#!/usr/bin/bash
# db_retry: run a DB-backed nightly command; if it exits non-zero because Supabase
# was slow (57014 statement timeout / P2028 itx closed / P1001 unreachable — seen
# 05:30–06:40 PT on 10/27, 10/28, 10/29), wait and re-run, up to N attempts.
# Usage: db_retry <attempts> <sleep_sec> -- cmd args...   → sets DB_RETRY_RC
db_retry() {
  local attempts="$1" pause="$2"; shift 2; [ "$1" = "--" ] && shift
  local i out rc
  for i in $(seq 1 "$attempts"); do
    out=$("$@" 2>&1); rc=$?
    printf '%s\n' "$out" | grep -v TS18028
    if [ $rc -eq 0 ]; then DB_RETRY_RC=0; return 0; fi
    if [ "$i" -lt "$attempts" ] && printf '%s' "$out" | grep -qE '57014|statement timeout|Transaction already closed|P2028|P2024|P1001|P1017|Can.t reach database|Timed out fetching a new connection'; then
      echo "===== $(date -Is) db slow (rc=$rc) — retry $i/$((attempts-1)) in ${pause}s ====="
      sleep "$pause"; continue
    fi
    DB_RETRY_RC=$rc; return $rc
  done
  DB_RETRY_RC=$rc; return $rc
}
