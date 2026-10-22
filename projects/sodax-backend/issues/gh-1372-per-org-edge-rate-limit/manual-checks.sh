#!/usr/bin/env bash
# The hand-test checklist for sodax-backend#1372, run against a live `./manual-env.sh up` stack.
# Dashboard actions go through the same BFF routes the UI calls (/api/api-keys/...); the clicks themselves
# are not covered. Takes ~3 min (one 70s wait) and leaves no limit set at the end.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
GW=${GW:-$HOME/Documents/GitHub/sodax/sodax-unified-api}
WORK=${TMPDIR:-/tmp}
WORK=${WORK%/}/e2e1372-manual
. "$WORK/tokens"
DASH=http://127.0.0.1:3010/api/api-keys
API=http://127.0.0.1:3122
EDGE=http://127.0.0.1:18090
A=66000000000000000000000a B=66000000000000000000000b C=66000000000000000000000c D=66000000000000000000000d
FAILS=0

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  \033[32mPASS\033[0m %s (%s)\n' "$1" "$2"
  else printf '  \033[31mFAIL\033[0m %s: got %s, want %s\n' "$1" "$2" "$3"; FAILS=$((FAILS + 1)); fi
}
ui() { curl -s -o /dev/null -w '%{http_code}' -X PATCH "$DASH/$1" -H 'Content-Type: application/json' -d "$2"; }
limits() { grep -v '^#' "$WORK/maps/org_limit.map" | sort | tr '\n' ' ' || true; }
loaded() { printf 'show map\n' | nc -w 2 127.0.0.1 19990 | grep -o 'entry_cnt=[0-9]*' | tr '\n' ' '; }
org_rate() { printf 'show table st_rl_org key %s\n' "$1" | nc -w 2 127.0.0.1 19990 | grep -o 'http_req_rate(60000)=[0-9]*' | cut -d= -f2; }
probe() { "$HERE/manual-env.sh" probe "$@"; }
poll() { sleep 7; } # one sidecar poll (5s) plus slack
drop_d_keys() { # org D is minted by step 12; revoking its keys keeps a rerun from finding it on tier base
  local id
  for id in $(curl -s "$API/v1/keys?orgId=$D" -H "Authorization: Bearer $PROVISIONER" | jq -r '.[]?.id'); do
    curl -s -o /dev/null -X DELETE "$API/v1/keys/$id" -H "Authorization: Bearer $PROVISIONER"
  done
}
watchdog() {
  env KEYSET_SYNC_ENV_FILE=/dev/null KEYSET_STATUS_FILE="$WORK/status.json" KEYSET_POLL_SECONDS=5 KEYSET_STALE_SECONDS=15 \
    python3 "$GW/scripts/keyset-sync.py" --watchdog >"$WORK/watchdog.log" 2>&1 && echo 0 || echo 1
}

step "0. Starting point"
drop_d_keys
poll
check "Organisations tab lists the 3 orgs" \
  "$(curl -s "$DASH/orgs?hours=24" | jq -c '[.rows[].name] | sort')" '["Acme dApp","Beta Wallet","Gamma Pro"]'
check "Gamma Pro is on tier pro" "$(curl -s "$DASH/orgs/$C" | jq -r .tenant.tier)" pro
check "no limit anywhere" "$(limits)" ""

step "1. Tiers tab: base = 40/min; Acme's two keys share it"
check "save" "$(ui tiers/base '{"limits":{"rateLimitPerMinute":40}}')" 200
poll
check "org_limit.map" "$(limits)" "$A 40 $B 40 "
check "a1 x25 then a2 x25 from two IPs" "$(probe 25 10.51.0.1 a1) | $(probe 25 10.51.0.2 a2)" \
  "pass=25 org=0 ip=0 jail=0 | pass=15 org=10 ip=0 jail=0"

step "2. Beta's drawer: override 100, then clear it"
check "save override" "$(ui "orgs/$B" '{"limits":{"rateLimitPerMinute":100}}')" 200
poll
check "org_limit.map" "$(limits)" "$A 40 $B 100 "
check "b1 x105" "$(probe 105 10.52.0.1 b1)" "pass=100 org=5 ip=0 jail=0"
check "clear override" "$(ui "orgs/$B" '{"limits":{}}')" 200
poll
check "back on the tier default" "$(limits)" "$A 40 $B 40 "

step "3. Bad input is refused by both editors"
codes=""
for body in '{"limits":{"rateLimitPerMinute":0}}' '{"limits":{"rateLimitPerMinute":-1}}' \
  '{"limits":{"rateLimitPerMinute":1.5}}' '{"limits":{"rateLimitPerMinute":2000000}}' \
  '{"limits":{"rateLimitPerMinute":"x"}}' '{"limits":{"rps":5}}' 'null'; do
  codes+="$(ui tiers/base "$body")/$(ui "orgs/$B" "$body") "
done
check "0, -1, 1.5, 2000000, \"x\", unknown key, null" "$codes" "400/400 400/400 400/400 400/400 400/400 400/400 400/400 "
check "nothing changed" "$(limits)" "$A 40 $B 40 "

step "4. Gamma's drawer: tier pro -> base puts it under the base limit"
check "switch to base" "$(ui "orgs/$C" '{"tier":"base"}')" 200
poll
check "org_limit.map" "$(limits)" "$A 40 $B 40 $C 40 "
check "c1 x45" "$(probe 45 10.54.0.1 c1)" "pass=40 org=5 ip=0 jail=0"
check "back to pro" "$(ui "orgs/$C" '{"tier":"pro"}')" 200
poll
check "Gamma left the map" "$(limits)" "$A 40 $B 40 "

step "5. Suspending Acme drops it to the per-IP limit"
check "suspend" "$(ui "orgs/$A" '{"status":"suspended"}')" 200
poll
check "org_limit.map" "$(limits)" "$B 40 "
check "a1 x310 from one IP" "$(probe 310 10.55.0.1 a1)" "pass=300 org=0 ip=10 jail=0"
check "reactivate" "$(ui "orgs/$A" '{"status":"active"}')" 200
poll
check "Acme is back" "$(limits)" "$A 40 $B 40 "

step "6. Keyed traffic does not use up the IP's budget for keyless callers"
check "Beta override 1000" "$(ui "orgs/$B" '{"limits":{"rateLimitPerMinute":1000}}')" 200
poll
check "b1 x320 from one IP" "$(probe 320 10.56.0.1 b1)" "pass=320 org=0 ip=0 jail=0"
check "a keyless request from that IP" "$(probe 1 10.56.0.1)" "pass=1 org=0 ip=0 jail=0"

step "7. A request the write cap refuses costs the org nothing"
for _ in $(seq 120); do curl -s -o /dev/null -X POST -H 'CF-Connecting-IP: 10.57.0.1' "$EDGE/v1/swaps/submit-tx"; done
before=$(org_rate "$B")
codes=$(for _ in $(seq 10); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H "x-api-key: $(grep '^b1=' "$WORK/keys" | cut -d= -f2-)" \
  -H 'CF-Connecting-IP: 10.57.0.1' "$EDGE/v1/swaps/submit-tx"; done)
after=$(org_rate "$B")
check "10 keyed POSTs past the write cap" "$codes" "429 429 429 429 429 429 429 429 429 429 "
check "Beta's counter did not grow ($before -> $after)" "$([ "$after" -le "$before" ] && echo ok || echo grew)" ok

step "8. A key padded with NBSP is not attributed at the edge (the app guard rejects it too)"
check "0xA0 + a1 + 0xA0 x310" "$(probe 310 10.58.0.1 $'\xa0'"$(grep '^a1=' "$WORK/keys" | cut -d= -f2-)"$'\xa0')" "pass=300 org=0 ip=10 jail=0"

step "9. api-auth down: the edge keeps its maps, the sidecar reports stale, then recovers"
maps_before=$(limits)
"$HERE/manual-env.sh" api-down >/dev/null
sleep 20
check "status" "$("$HERE/manual-env.sh" status 2>/dev/null | grep -c '^STALE' || true)" 1
check "maps kept" "$(limits)" "$maps_before"
"$HERE/manual-env.sh" api-up >/dev/null
poll
check "healthy again" "$("$HERE/manual-env.sh" status | grep -c '"healthy": true' || true)" 1

step "10. Sidecar crash: the edge keeps enforcing; the watchdog alerts, then sees it back"
"$HERE/manual-env.sh" sidecar-kill >/dev/null
sleep 20
check "watchdog exit while it is down" "$(watchdog)" 1
check "watchdog says" "$(grep -c 'not running' "$WORK/watchdog.log" || true)" 1
check "a1 is still attributed to Acme" "$(probe 1 10.60.0.1 a1 | grep -c 'ip=0' || true)" 1
"$HERE/manual-env.sh" sidecar-up >/dev/null
poll
check "watchdog exit once it is back" "$(watchdog)" 0
check "watchdog says" "$(grep -c 'running again' "$WORK/watchdog.log" || true)" 1

step "11. HAProxy cold restart loads the maps from disk"
entries=$(loaded)
docker restart e2e1372m-haproxy >/dev/null
for _ in $(seq 30); do curl -s -o /dev/null "$EDGE/" && break; sleep 1; done
check "loaded maps" "$(loaded)" "$entries"

step "12. An org that keeps sending too much is held at its limit, not locked out (70s)"
D1=$(curl -sf -X POST "$API/v1/keys" -H "Authorization: Bearer $PROVISIONER" -H 'Content-Type: application/json' \
  -d "{\"orgId\":\"$D\",\"name\":\"d1\"}" | jq -r .key)
curl -sf -X PATCH "$API/v1/tenants/$D" -H "Authorization: Bearer $PROVISIONER" -H 'Content-Type: application/json' \
  -d '{"limits":{"rateLimitPerMinute":40}}' >/dev/null
poll
check "d1 x60" "$(probe 60 10.62.0.1 "$D1")" "pass=40 org=20 ip=0 jail=0"
sleep 70
r=$(probe 10 10.62.0.2 "$D1")
check "70s later, d1 x10 gets some through ($r)" "$(echo "$r" | awk -F'[ =]' '{ print ($2 >= 5) ? "ok" : "locked out" }')" ok

step "Clean up: no limit left anywhere"
ui tiers/base '{"limits":{}}' >/dev/null
ui "orgs/$B" '{"limits":{}}' >/dev/null
curl -sf -X PATCH "$API/v1/tenants/$D" -H "Authorization: Bearer $PROVISIONER" -H 'Content-Type: application/json' -d '{"limits":{}}' >/dev/null
drop_d_keys
poll
check "org_limit.map" "$(limits)" ""

step "Result"
if [ "$FAILS" -eq 0 ]; then echo "  all checks passed"; else echo "  $FAILS check(s) failed"; exit 1; fi
