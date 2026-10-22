# Shared setup for e2e-local.sh and manual-env.sh (sodax-backend#1372). Source it after setting:
#   WORK NAME PG_PORT API_PORT EDGE_PORT SOCK_PORT VERIFIER PROVISIONER
#
# Local-only changes to the gateway cfg: the fe_edge TLS bind becomes plain :8080, the keyset-sync unix
# socket becomes TCP :9999 (so the host sidecar can reach it), origin servers get `disabled`. The socket's
# group and mode are therefore NOT covered here — CI's `haproxy -c` covers that. Nothing leaves localhost:
# a request that passes the limiter ends at be_404 (`route_not_found`).

WS=${WS:-$HOME/Documents/GitHub/sodax}
BE=${BE:-$WS/sodax-backend}
GW=${GW:-$WS/sodax-unified-api}
API=http://127.0.0.1:$API_PORT
EDGE=http://127.0.0.1:$EDGE_PORT
DB_URL=postgres://api_auth:localtest@127.0.0.1:$PG_PORT/api_auth
API_PID=""

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
prov() { # prov <METHOD> <path> [json]
  curl -sf -X "$1" "$API$2" -H "Authorization: Bearer $PROVISIONER" -H 'Content-Type: application/json' ${3:+-d "$3"}
}
mint() { prov POST /v1/keys "{\"orgId\":\"$1\",\"name\":\"$2\"}" | jq -r .key; }
sidecar_env() {
  env KEYSET_URL="$API/v1/keyset" KEYSET_TOKEN="$VERIFIER" KEYSET_SOCKET="tcp://127.0.0.1:$SOCK_PORT" \
    KEYSET_MAPS_DIR="$WORK/maps" KEYSET_STATUS_FILE="$WORK/status.json" KEYSET_SYNC_ENV_FILE=/dev/null "$@"
}
sync_once() { sidecar_env python3 "$GW/scripts/keyset-sync.py" --once; }
cli() { printf '%s\n' "$1" | nc -w 2 127.0.0.1 "$SOCK_PORT"; }
map_rows() { grep -vc '^#' "$WORK/maps/$1" || true; }

# burst <count> <client ip> [x-api-key ...] -> "pass=N org=N ip=N jail=N"
# A 429 is told apart by its Retry-After: 60 org cap, 10 per-IP rate cap, 600 jail (the 60s write cap is
# POST-only, never hit here). Bodies are not printed: parallel curls interleave them on one pipe.
# Sequential by default: parallel requests race on HAProxy's per-thread reads of a shared counter, so a
# boundary can refuse one or two extra. P=16 for a flood that must land inside one 10s window.
burst() {
  local n=$1 ip=$2 hdrs=() k
  shift 2
  for k in "$@"; do hdrs+=(-H "x-api-key: $k"); done
  seq "$n" | xargs -P "${P:-1}" -I{} curl -s -o /dev/null -w '%{http_code} %header{retry-after}\n' \
    -H "CF-Connecting-IP: $ip" ${hdrs[@]+"${hdrs[@]}"} "$EDGE/v1/e2e-probe" >"$WORK/burst.out"
  awk '$1 == 404 { p++ } $1 == 429 && $2 == 60 { o++ } $1 == 429 && $2 == 10 { i++ } $1 == 429 && $2 == 600 { j++ }
    END { printf "pass=%d org=%d ip=%d jail=%d", p, o, i, j }' "$WORK/burst.out"
}

start_pg() {
  docker rm -f "$NAME-pg" >/dev/null 2>&1 || true
  docker run -d --name "$NAME-pg" -e POSTGRES_USER=api_auth -e POSTGRES_PASSWORD=localtest \
    -e POSTGRES_DB=api_auth -p "$PG_PORT:5432" postgres:17.6-alpine >/dev/null
  until docker exec "$NAME-pg" pg_isready -U api_auth -d api_auth >/dev/null 2>&1; do sleep 1; done
  sleep 2 # the image restarts postgres once after init
  (cd "$BE/apps/api-auth" && API_AUTH_DATABASE_URL=$DB_URL pnpm -s db:migrate >"$WORK/migrate.log" 2>&1)
}

build_api() { (cd "$BE/apps/api-auth" && pnpm -s exec nest build >"$WORK/build.log" 2>&1); }

start_api() { # exec, so $! is node itself and `kill` really stops it
  (cd "$BE/apps/api-auth" && NODE_ENV=dev LOG_LEVEL=info API_AUTH_PORT=$API_PORT API_AUTH_DATABASE_URL=$DB_URL \
    API_AUTH_VERIFIER_TOKENS=$VERIFIER API_AUTH_PROVISIONER_TOKENS=$PROVISIONER \
    exec nohup node dist/main >>"$WORK/api-auth.log" 2>&1) &
  API_PID=$!
  for _ in $(seq 60); do curl -sf "$API/healthz" >/dev/null && return; sleep 1; done
  echo "api-auth did not start:"; tail -20 "$WORK/api-auth.log"; exit 1
}

start_haproxy() {
  mkdir -p "$WORK/maps"
  touch "$WORK/maps/apikey_org.map" "$WORK/maps/org_limit.map"
  sed -e 's/<PLACEHOLDER_HOST>/apiv1-1-stateful.coolify.iconblockchain.xyz/g' \
    -e 's#^  bind :443 ssl crt .*#  bind :8080#' \
    -e 's#^  stats socket /run/haproxy/keyset-sync.sock .*#  stats socket ipv4@0.0.0.0:9999 level operator#' \
    -e 's#^\(  server .*\)$#\1 disabled#' \
    "$GW/gateway-configs/haproxy/haproxy.cfg" >"$WORK/haproxy.cfg"
  docker rm -f "$NAME-haproxy" >/dev/null 2>&1 || true
  docker run -d --name "$NAME-haproxy" --user root -p "$EDGE_PORT:8080" -p "$SOCK_PORT:9999" \
    -v "$WORK/haproxy.cfg:/tmp/haproxy.cfg:ro" -v "$WORK/maps:/etc/haproxy/maps" \
    --entrypoint sh haproxy:2.8 -c '
      set -e
      mkdir -p /etc/haproxy/errors /etc/haproxy/certs /etc/haproxy/ca /run/haproxy
      for f in 400 403 408 500 502 503 504; do
        printf "HTTP/1.0 %s X\r\nContent-Type: text/plain\r\n\r\nX\n" "$f" > /etc/haproxy/errors/$f.http
      done
      openssl req -x509 -newkey rsa:2048 -keyout /tmp/k.pem -out /tmp/c.pem -days 1 -nodes \
        -subj "/CN=api.sodax.com" 2>/dev/null
      cat /tmp/c.pem /tmp/k.pem > /etc/haproxy/certs/api.sodax.com.pem
      cp /tmp/c.pem /etc/haproxy/ca/cloudflare_aop_ca.pem
      exec haproxy -W -db -f /tmp/haproxy.cfg' >/dev/null
  for _ in $(seq 30); do curl -s -o /dev/null "$EDGE/" && return; sleep 1; done
  echo "haproxy did not start:"; docker logs "$NAME-haproxy" 2>&1 | tail -20; exit 1
}
