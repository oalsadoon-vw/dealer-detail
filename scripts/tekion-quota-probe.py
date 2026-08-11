#!/usr/bin/env python3
"""Tekion OpenAPI quota probe.

Exit 0  -> quota available (a 1-result repair-orders:search succeeded)
Exit 1  -> quota exhausted (429) or any other failure

Costs exactly 1 API call. Used by cron-sct-sync.sh to skip/delay the nightly
sync instead of burning the app-wide OVERALL_QUOTA on doomed retries.
"""
import json
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, "/home/itadmin/tekion-api")
from tekion_client import get_token, load_config  # noqa: E402

DEALER = "americanmotorscorporation_876_0"  # SCT


def main() -> int:
    try:
        cfg = load_config()
        token = get_token(cfg)
        now_ms = int(time.time() * 1000)
        body = json.dumps({
            "filters": [{
                "field": "modifiedTime",
                "operator": "BTW",
                "values": [str(now_ms - 6 * 3600 * 1000), str(now_ms)],
            }],
            "pageSize": 1,
        }).encode()
        req = urllib.request.Request(
            cfg["base_url"] + "/openapi/v4.0.0/repair-orders:search",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "app_id": cfg["app_id"],
                "dealer_id": DEALER,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        print("quota probe: OK")
        return 0
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode()[:200]
        except Exception:
            pass
        print(f"quota probe: HTTP {e.code} {detail}")
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"quota probe: {type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
