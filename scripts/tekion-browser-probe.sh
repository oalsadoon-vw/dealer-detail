#!/usr/bin/env bash
# REAL Tekion browser session probe. Exit 0 only if the persistent browser
# (default :9225) is on app.tekioncloud.com, has a token+tcookie, AND a live
# 1-row internal ro-search returns HTTP 200. A token can be present in
# localStorage for 30 days while Tekion has already expired the server-side
# session — the old "token exists" check passed in that state and let the
# 10/25 06:30 reconcile run 7 stores against a dead session.
# Usage: tekion-browser-probe.sh [http://127.0.0.1:9225] [dealerIdNumeric]
BROWSER_URL="${1:-${TEKION_BROWSER:-http://127.0.0.1:9225}}"
DEALER="${2:-1251}"
JS=$(cat <<EOF
(async()=>{try{
  if(location.hostname!=="app.tekioncloud.com") return "NOHOST:"+location.hostname;
  var t=localStorage.getItem("t_token"); if(!t) return "NOTOKEN";
  var m=document.cookie.split("tcookie=")[1]; if(!m) return "NOCOOKIE";
  var tc=JSON.parse(decodeURIComponent(m.split(";")[0]));
  var H={"tekion-api-token":t,roleid:tc.roleId||"",tenantname:tc.tenantname||"americanmotorscorporation",dealerid:"$DEALER",clientId:"web","tek-siteId":"-1_$DEALER",correlationId:"probe-"+Date.now(),"Content-Type":"application/json",userId:localStorage.getItem("__user_id")||""};
  var r=await fetch("/api/service-module/u/ro/v1/ro-search",{method:"POST",headers:H,credentials:"include",body:JSON.stringify({pageInfo:{start:0,rows:1},filters:[],searchText:null})});
  if(r.status===200) return "OK";
  return "HTTP"+r.status+":"+(await r.text()).slice(0,80);
}catch(e){return "ERR:"+String(e).slice(0,80)}})()
EOF
)
out=$(curl -sf -m 25 -X POST "$BROWSER_URL/eval" -H 'Content-Type: application/json' \
  --data-binary "$(python3 -c 'import json,sys;print(json.dumps({"js":sys.stdin.read()}))' <<<"$JS")" 2>/dev/null)
[ -z "$out" ] && out='{}'
res=$(printf '%s' "$out" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("result") or "NORESP")
except Exception: print("NORESP")')
echo "$res"
[ "$res" = "OK" ]
