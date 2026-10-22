#!/usr/bin/env bash
# Local end-to-end test for sodax-backend#1372: sodax-backend PR #1380 + sodax-unified-api PR #136.
#
#   Postgres (docker) -> api-auth (host, from the backend checkout)
#   -> keyset-sync.py --once (host, from the gateway checkout)
#   -> the real gateway haproxy.cfg in haproxy:2.8 (docker), probed with curl.
#
# Both checkouts must be on the PR branches. Setup and its local-only cfg changes: e2e-lib.sh.
#
# Usage: ./e2e-local.sh            (KEEP=1 leaves the containers and api-auth running for manual pokes)
set -euo pipefail

WORK=$(mktemp -d -t e2e1372)
NAME=e2e1372 PG_PORT=55440 API_PORT=3112 EDGE_PORT=18080 SOCK_PORT=19999
VERIFIER=$(openssl rand -hex 24)
PROVISIONER=$(openssl rand -hex 24)
. "$(dirname "$0")/e2e-lib.sh"
FAILS=0

cleanup() {
  if [ -n "${KEEP:-}" ]; then # throwaway local tokens, safe to print
    echo "KEEP=1 — still running. Paste to poke by hand, then: kill $API_PID; docker rm -f $NAME-pg $NAME-haproxy"
    echo "  export API=$API EDGE=$EDGE PROV=$PROVISIONER VERIFIER=$VERIFIER A1=${A1:-} B1=${B1:-} WORK=$WORK"
    return
  fi
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  docker rm -f "$NAME-pg" "$NAME-haproxy" >/dev/null 2>&1 || true
}
trap cleanup EXIT

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  \033[32mPASS\033[0m %s (%s)\n' "$1" "$2"
  else printf '  \033[31mFAIL\033[0m %s: got %s, want %s\n' "$1" "$2" "$3"; FAILS=$((FAILS + 1)); fi
}

step "Checkouts"
echo "  backend $(git -C "$BE" branch --show-current)@$(git -C "$BE" rev-parse --short HEAD)"
echo "  gateway $(git -C "$GW" branch --show-current)@$(git -C "$GW" rev-parse --short HEAD)"
echo "  work dir $WORK"

step "Postgres + migrations"
start_pg
echo "  migrated (log: $WORK/migrate.log)"

step "api-auth on :$API_PORT"
build_api
start_api
echo "  up (log: $WORK/api-auth.log)"

step "HAProxy 2.8 with the PR's haproxy.cfg on :$EDGE_PORT"
start_haproxy
check "edge answers a keyless probe" "$(curl -s -o /dev/null -w '%{http_code}' "$EDGE/v1/e2e-probe")" 404

step "Mint keys: org_a x2, org_b, org_c (new orgs land on tier base)"
A1=$(mint org_a a1) A2=$(mint org_a a2) B1=$(mint org_b b1) C1=$(mint org_c c1)
check "tier of a new org" "$(prov GET /v1/tenants/org_a | jq -r .tier)" base
check "tiers listed" "$(prov GET /v1/tiers | jq -c '[.[] | {tier, limits}]')" \
  '[{"tier":"base","limits":{}},{"tier":"pro","limits":{}}]'

step "1. No tier limit yet: maps stay empty, keyed traffic keeps the per-IP cap (300/10s)"
sync_once
check "apikey_org.map rows" "$(map_rows apikey_org.map)" 0
check "310 keyed requests, one IP" "$(burst 310 10.0.0.1 "$A1")" "pass=300 org=0 ip=10 jail=0"

step "Set limits: tier base = 40/min, org_b override = 350/min, org_c suspended"
prov PATCH /v1/tiers/base '{"limits":{"rateLimitPerMinute":40}}' >/dev/null
prov PATCH /v1/tenants/org_b '{"limits":{"rateLimitPerMinute":350}}' >/dev/null
prov PATCH /v1/tenants/org_c '{"status":"suspended"}' >/dev/null
KEYSET=$(curl -sf "$API/v1/keyset" -H "Authorization: Bearer $VERIFIER")
check "keyset effective limits" \
  "$(echo "$KEYSET" | jq -c '[.keys[] | {orgId, orgStatus, l: .limits.rateLimitPerMinute}] | unique_by(.orgId)')" \
  '[{"orgId":"org_a","orgStatus":"active","l":40},{"orgId":"org_b","orgStatus":"active","l":350},{"orgId":"org_c","orgStatus":"suspended","l":40}]'
check "verifier token cannot PATCH tiers (guard answers 401)" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/v1/tiers/base" -H "Authorization: Bearer $VERIFIER" \
    -H 'Content-Type: application/json' -d '{"limits":{}}')" 401
check "limit 0 rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/v1/tiers/base" \
  -H "Authorization: Bearer $PROVISIONER" -H 'Content-Type: application/json' \
  -d '{"limits":{"rateLimitPerMinute":0}}')" 400
sync_once
check "org_limit.map" "$(grep -v '^#' "$WORK/maps/org_limit.map" | tr '\n' ' ')" "org_a 40 org_b 350 "
check "apikey_org.map rows (org_c excluded)" "$(map_rows apikey_org.map)" 3
check "HAProxy runtime maps match" "$(cli 'show map' | grep -o 'entry_cnt=[0-9]*' | tr '\n' ' ')" "entry_cnt=3 entry_cnt=2 "

step "2. Two keys of org_a share one 40/min budget, from two IPs"
r1=$(burst 25 10.0.1.1 "$A1")
r2=$(burst 25 10.0.1.2 "$A2")
check "a1 then a2, 25 each" "$r1 | $r2" "pass=25 org=0 ip=0 jail=0 | pass=15 org=10 ip=0 jail=0"
check "429 headers" "$(curl -s -D - -o /dev/null -H "x-api-key: $A1" -H 'CF-Connecting-IP: 10.0.1.3' "$EDGE/v1/e2e-probe" \
  | tr -d '\r' | tr 'A-Z' 'a-z' | grep '^retry-after:')" "retry-after: 60"
check "refusals are not charged to the org (51 sent, 40 let through)" \
  "$(cli 'show table st_rl_org key org_a' | grep -o 'http_req_rate(60000)=[0-9]*')" "http_req_rate(60000)=40"

step "3. A keyed org is not held to the per-IP cap: org_b sends 340 from one IP"
check "340 keyed, limit 350" "$(burst 340 10.0.2.1 "$B1")" "pass=340 org=0 ip=0 jail=0"
check "a keyless caller on that IP is not held back by it" "$(burst 1 10.0.2.1)" "pass=1 org=0 ip=0 jail=0"

step "4. Unknown key and suspended org fall back to the per-IP cap"
check "unknown key, 310" "$(burst 310 10.0.3.1 "sodax_not_a_real_key")" "pass=300 org=0 ip=10 jail=0"
check "suspended org_c, 310" "$(burst 310 10.0.4.1 "$C1")" "pass=300 org=0 ip=10 jail=0"

step "5. Only a request with exactly one x-api-key header is attributed (org_a is spent)"
check "one header: a1" "$(burst 1 10.0.5.1 "$A1")" "pass=0 org=1 ip=0 jail=0"
check "two headers, a1 first -> keyless" "$(burst 1 10.0.5.2 "$A1" "sodax_not_a_real_key")" "pass=1 org=0 ip=0 jail=0"
check "one header holding two keys -> keyless" "$(burst 1 10.0.5.3 "$A1, sodax_not_a_real_key")" "pass=1 org=0 ip=0 jail=0"

step "6. A reload keeps the maps (loaded from the files the sidecar wrote)"
sleep 2 # Docker Desktop bind mounts can lag a freshly written file
docker kill -s USR2 "$NAME-haproxy" >/dev/null
sleep 3
check "runtime maps after reload" "$(cli 'show map' | grep -o 'entry_cnt=[0-9]*' | tr '\n' ' ')" "entry_cnt=3 entry_cnt=2 "

step "6b. A cold restart (no sidecar running, a crash-leftover tmp file) loads the maps from disk"
printf 'garbage from a crashed write\n' >"$WORK/maps/.org_limit.map.tmp"
docker restart "$NAME-haproxy" >/dev/null
for _ in $(seq 30); do curl -s -o /dev/null "$EDGE/" && break; sleep 1; done
check "runtime maps after a cold restart" "$(cli 'show map' | grep -o 'entry_cnt=[0-9]*' | tr '\n' ' ')" "entry_cnt=3 entry_cnt=2 "
check "org_b's key is still recognised" "$(burst 310 10.0.8.1 "$B1")" "pass=310 org=0 ip=0 jail=0"

step "7. api-auth down: the sync fails and the edge keeps the last maps"
kill "$API_PID"; wait "$API_PID" 2>/dev/null || true
if sync_once; then check "sync exit code" 0 1; else check "sync exit code" 1 1; fi
check "runtime maps kept" "$(cli 'show map' | grep -o 'entry_cnt=[0-9]*' | tr '\n' ' ')" "entry_cnt=3 entry_cnt=2 "

step "8. Clearing the tier limit turns the cap off for org_a (org_b keeps its override)"
start_api
prov PATCH /v1/tiers/base '{"limits":{}}' >/dev/null
sync_once
check "org_limit.map" "$(grep -v '^#' "$WORK/maps/org_limit.map" | tr '\n' ' ')" "org_b 350 "
check "a1 is keyless again" "$(burst 1 10.0.6.1 "$A1")" "pass=1 org=0 ip=0 jail=0"

step "9. A keyed flood still trips the per-IP jail (keyed requests feed sc0 too)"
D1=$(mint org_d d1)
prov PATCH /v1/tenants/org_d '{"limits":{"rateLimitPerMinute":100}}' >/dev/null
sync_once
r=$(P=16 burst 1600 10.0.7.1 "$D1")
check "1600 parallel keyed from one IP, limit 100 ($r)" \
  "$(echo "$r" | awk -F'[ =]' '{ print ($2 <= 116 && $4 >= 1000 && $8 >= 50) ? "ok" : "bad" }')" ok
check "the same IP without a key is jailed" "$(burst 1 10.0.7.1)" "pass=0 org=0 ip=0 jail=1"

step "10. A request refused by the write cap is not charged to its org"
E1=$(mint org_e e1)
prov PATCH /v1/tenants/org_e '{"limits":{"rateLimitPerMinute":10}}' >/dev/null
sync_once
for _ in $(seq 120); do curl -s -o /dev/null -X POST -H 'CF-Connecting-IP: 10.0.10.1' "$EDGE/v1/swaps/submit-tx"; done
codes=$(for _ in $(seq 10); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H "x-api-key: $E1" \
  -H 'CF-Connecting-IP: 10.0.10.1' "$EDGE/v1/swaps/submit-tx"; done)
check "10 keyed POSTs past the IP's write cap are refused" "$codes" "429 429 429 429 429 429 429 429 429 429 "
check "org_e has nothing charged" "$(cli 'show table st_rl_org key org_e' | grep -c 'http_req_rate' || true)" 0
check "org_e's key still passes from another IP" "$(burst 1 10.0.10.2 "$E1")" "pass=1 org=0 ip=0 jail=0"

step "Result"
if [ "$FAILS" -eq 0 ]; then echo "  all checks passed"; else echo "  $FAILS check(s) failed — work dir $WORK"; exit 1; fi
