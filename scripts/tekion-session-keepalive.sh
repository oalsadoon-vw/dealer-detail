#!/usr/bin/env bash
# Keep the :9225 Tekion session alive (fix #2, 2026-10-26). Every 30 min:
# real 1-row ro-search probe; if it fails, run the full auto re-auth
# (restore -> forced OTP login). Logging only on state change / failure so the
# log stays readable. Also acts as the "catch it before 23:00" safety net.
export PATH="/home/itadmin/.local/bin:/home/itadmin/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
B="${TEKION_BROWSER:-http://127.0.0.1:9225}"
S=/home/itadmin/dealer-detail/scripts
STATE=/tmp/tekion-keepalive.state
r=$(bash "$S/tekion-browser-probe.sh" "$B" 2>/dev/null || true)
prev=$(cat "$STATE" 2>/dev/null || echo "")
if [ "$r" = "OK" ]; then
  [ "$prev" != "OK" ] && echo "===== $(date -Is) keepalive: session OK ====="
  echo OK > "$STATE"; exit 0
fi
echo "===== $(date -Is) keepalive: probe=$r — re-auth ====="
bash "$S/ensure-tekion-browser-auth.sh" "$B" || true
r2=$(bash "$S/tekion-browser-probe.sh" "$B" 2>/dev/null || true)
echo "===== $(date -Is) keepalive: after re-auth probe=$r2 ====="
echo "$r2" > "$STATE"
[ "$r2" = "OK" ]
