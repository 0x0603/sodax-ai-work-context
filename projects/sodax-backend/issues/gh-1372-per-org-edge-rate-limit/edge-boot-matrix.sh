#!/usr/bin/env bash
# Which states of the two map files stop HAProxy 2.8 from starting with the PR's haproxy.cfg
# (sodax-backend#1372). `haproxy -c` loads the map files exactly as a start or reload does.
# keyset-sync.py only ever writes validated rows via tmp + fsync + rename, so the refusing states
# below need a human: a deleted file or a hand edit.
set -euo pipefail
GW=${GW:-$HOME/Documents/GitHub/sodax/sodax-unified-api}
CFG=$(mktemp -t edge-boot-cfg)
sed 's/<PLACEHOLDER_HOST>/apiv1-1-stateful.coolify.iconblockchain.xyz/g' "$GW/gateway-configs/haproxy/haproxy.cfg" >"$CFG"
run() { # run <label> <shell that prepares /etc/haproxy/maps> <expected: STARTS|REFUSES>
  local out v
  out=$(docker run --rm --user root -v "$CFG:/tmp/haproxy.cfg:ro" --entrypoint sh haproxy:2.8 -c "
    mkdir -p /etc/haproxy/errors /etc/haproxy/certs /etc/haproxy/ca /etc/haproxy/maps && groupadd --system sodax-keyset &&
    for f in 400 403 408 500 502 503 504; do printf 'HTTP/1.0 %s X\r\n\r\nX\n' \$f > /etc/haproxy/errors/\$f.http; done &&
    openssl req -x509 -newkey rsa:2048 -keyout /tmp/k.pem -out /tmp/c.pem -days 1 -nodes -subj /CN=x 2>/dev/null &&
    cat /tmp/c.pem /tmp/k.pem > /etc/haproxy/certs/api.sodax.com.pem && cp /tmp/c.pem /etc/haproxy/ca/cloudflare_aop_ca.pem &&
    cd /etc/haproxy/maps && $2 ; haproxy -c -f /tmp/haproxy.cfg" 2>&1) || true
  if echo "$out" | grep -q "Configuration file is valid"; then v=STARTS; else v=REFUSES; fi
  printf '  %-7s %-46s %s\n' "$([ "$v" = "$3" ] && echo ok || echo UNEXPECTED)" "$1" "$v $(echo "$out" | grep -m1 ALERT | sed 's/.*: //' | cut -c1-90)"
}
H='# managed by keyset-sync.py — do not edit'
run "both maps empty" "touch apikey_org.map org_limit.map" STARTS
run "header line only (an empty sync)" "echo '$H' > apikey_org.map; echo '$H' > org_limit.map" STARTS
run "valid rows" "printf '%064d org_a\n' 1 > apikey_org.map; echo 'org_a 40' > org_limit.map" STARTS
run "50k keys / 2k orgs" "i=0; while [ \$i -lt 50000 ]; do printf '%064x org_%d\n' \$i \$((i%2000)); i=\$((i+1)); done > apikey_org.map; i=0; while [ \$i -lt 2000 ]; do echo \"org_\$i 1800\"; i=\$((i+1)); done > org_limit.map" STARTS
run "org_limit.map missing" "touch apikey_org.map" REFUSES
run "apikey_org.map missing" "touch org_limit.map" REFUSES
run "maps dir missing" "cd / && rmdir /etc/haproxy/maps" REFUSES
run "limit not a number (hand edit)" "touch apikey_org.map; echo 'org_a forty' > org_limit.map" REFUSES
rm -f "$CFG"
