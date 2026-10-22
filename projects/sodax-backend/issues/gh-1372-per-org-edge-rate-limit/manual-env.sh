#!/usr/bin/env bash
# Long-running local stack for hand-testing sodax-backend#1372 (PR #1380 + sodax-unified-api PR #136):
# Postgres + api-auth + the PR's haproxy.cfg in haproxy:2.8 + keyset-sync.py as a service (5s poll) + the
# dashboard. Same local-only cfg changes as e2e-local.sh (see e2e-lib.sh). Ports differ, so both can run.
#
#   ./manual-env.sh up                         start + seed fake data (no limits set), print how to use it.
#                                              A throwaway Mongo (:27051, db e2e — open it in Compass) holds 3
#                                              fake Better Auth orgs, so the Organisations tab lists them.
#   DASHBOARD_MONGO_URI=... [DASHBOARD_MONGO_DB=...] ./manual-env.sh up
#                                              use your own Mongo instead: its first 3 `auth_organization`
#                                              orgs are read and get the keys. The dashboard then writes each
#                                              admin action to that Mongo's `dashboard_audit_log`.
#   ./manual-env.sh info                       URLs, tokens, keys, log files
#   ./manual-env.sh probe <n> <ip> [key ...]   n requests to the edge as client <ip>; a key is an alias
#                                              (a1 a2 b1 c1) or a raw value; P=16 sends them in parallel
#   ./manual-env.sh maps                       map files + what HAProxy has loaded
#   ./manual-env.sh status                     the sidecar's --status
#   ./manual-env.sh api-down | api-up          stop / restart api-auth (sidecar keeps the last maps)
#   ./manual-env.sh edge-restart               reload haproxy.cfg from the gateway checkout (maps kept)
#   ./manual-env.sh sidecar-kill | sidecar-up  SIGKILL the sidecar (a crash) / start it again
#   ./manual-env.sh down                       stop everything
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${TMPDIR:-/tmp}
WORK=${WORK%/}/e2e1372-manual
NAME=e2e1372m PG_PORT=55450 API_PORT=3122 EDGE_PORT=18090 SOCK_PORT=19990 DASH_PORT=3010 MONGO_PORT=27051
VERIFIER="" PROVISIONER=""
[ -f "$WORK/tokens" ] && . "$WORK/tokens"
. "$HERE/e2e-lib.sh"
DASH=http://127.0.0.1:$DASH_PORT
# Read-only: the first 3 Better Auth orgs (id + name), via the dashboard's own mongoose.
READ_ORGS='const { mongo } = require("mongoose");
(async () => {
  const client = await mongo.MongoClient.connect(process.env.DASHBOARD_MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const docs = await client.db(process.env.DASHBOARD_MONGO_DB || undefined).collection("auth_organization")
    .find({}, { projection: { _id: 1, name: 1 } }).sort({ _id: 1 }).limit(3).toArray();
  for (const d of docs) console.log(`${d._id}\t${d.name ?? ""}`);
  await client.close();
})().catch(err => { console.error(err.message); process.exit(1); });'

key() { # alias -> key, raw values pass through
  local hit
  hit=$(grep "^$1=" "$WORK/keys" 2>/dev/null | cut -d= -f2-) || true
  echo "${hit:-$1}"
}
stop_pidfile() { [ -f "$WORK/$1.pid" ] && kill "$(cat "$WORK/$1.pid")" 2>/dev/null || true; rm -f "$WORK/$1.pid"; }
start_sidecar() { # exec all the way down, so the pid file holds python itself
  (exec env KEYSET_URL="$API/v1/keyset" KEYSET_TOKEN="$VERIFIER" KEYSET_SOCKET="tcp://127.0.0.1:$SOCK_PORT" \
    KEYSET_MAPS_DIR="$WORK/maps" KEYSET_STATUS_FILE="$WORK/status.json" KEYSET_SYNC_ENV_FILE=/dev/null \
    KEYSET_POLL_SECONDS=5 KEYSET_STALE_SECONDS=15 \
    nohup python3 "$GW/scripts/keyset-sync.py" >>"$WORK/sidecar.log" 2>&1) &
  echo $! >"$WORK/sidecar.pid"
}

down() {
  stop_pidfile sidecar
  stop_pidfile api
  stop_pidfile dashboard
  pkill -f "next dev -p $DASH_PORT" 2>/dev/null || true
  pkill -f "scripts/keyset-sync.py$" 2>/dev/null || true # the service only; --once runs end in an argument
  lsof -tiTCP:"$API_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  docker rm -f "$NAME-pg" "$NAME-haproxy" "$NAME-mongo" >/dev/null 2>&1 || true
}

start_fake_mongo() { # Better Auth stores org ids as ObjectIds; the dashboard looks them up that way
  docker run -d --name "$NAME-mongo" -p "$MONGO_PORT:27017" mongo:7 >/dev/null
  until docker exec "$NAME-mongo" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; do
    sleep 1
  done
  docker exec "$NAME-mongo" mongosh --quiet e2e --eval '
    db.auth_organization.insertMany([
      { _id: ObjectId("66000000000000000000000a"), name: "Acme dApp", slug: "acme", createdAt: new Date() },
      { _id: ObjectId("66000000000000000000000b"), name: "Beta Wallet", slug: "beta", createdAt: new Date() },
      { _id: ObjectId("66000000000000000000000c"), name: "Gamma Pro", slug: "gamma", createdAt: new Date() },
    ])' >/dev/null
  export DASHBOARD_MONGO_URI=mongodb://127.0.0.1:$MONGO_PORT DASHBOARD_MONGO_DB=e2e
  echo "fake" >"$WORK/mongo"
}

info() {
  cat <<EOF
Dashboard  $DASH/api-keys        (tabs: Tiers, org drawer -> rate-limit override)
api-auth   $API                  provisioner token: $PROVISIONER
                                        verifier token:    $VERIFIER
Edge       $EDGE/v1/<anything>   404 route_not_found = passed the limiter
Keys       $(tr '\n' ' ' <"$WORK/keys")
Orgs       A (a1 a2)  $(sed -n 1p "$WORK/orgs.tsv" | tr '\t' ' ')
           B (b1)     $(sed -n 2p "$WORK/orgs.tsv" | tr '\t' ' ')
           C (c1)     $(sed -n 3p "$WORK/orgs.tsv" | tr '\t' ' ')   <- tier pro, the others base
Mongo      $([ -f "$WORK/mongo" ] && echo "fake, Compass: mongodb://127.0.0.1:$MONGO_PORT (db e2e)" || echo "your DASHBOARD_MONGO_URI")
Logs       $WORK/{api-auth,sidecar,dashboard}.log
EOF
}

case ${1:-} in
up)
  down
  rm -rf "$WORK"; mkdir -p "$WORK"
  printf 'VERIFIER=%s\nPROVISIONER=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" >"$WORK/tokens"
  . "$WORK/tokens"
  step "Postgres"; start_pg
  step "api-auth :$API_PORT"; build_api; start_api; echo "$API_PID" >"$WORK/api.pid"
  step "HAProxy :$EDGE_PORT"; start_haproxy
  if [ -z "${DASHBOARD_MONGO_URI:-}" ]; then step "Fake Mongo :$MONGO_PORT (3 orgs)"; start_fake_mongo; fi
  if [ -n "${DASHBOARD_MONGO_URI:-}" ]; then
    step "Read 3 orgs from auth_organization (read-only)"
    (cd "$BE/apps/sodax-backend-dashboard" && node -e "$READ_ORGS") >"$WORK/orgs.tsv" ||
      { echo "  cannot read auth_organization from DASHBOARD_MONGO_URI"; exit 1; }
    [ "$(grep -c . "$WORK/orgs.tsv")" -ge 3 ] || { echo "  need at least 3 orgs in auth_organization"; exit 1; }
  else
    printf 'org_a\t(no Mongo)\norg_b\t(no Mongo)\norg_c\t(no Mongo)\n' >"$WORK/orgs.tsv"
  fi
  OA=$(sed -n 1p "$WORK/orgs.tsv" | cut -f1) OB=$(sed -n 2p "$WORK/orgs.tsv" | cut -f1) OC=$(sed -n 3p "$WORK/orgs.tsv" | cut -f1)
  step "Seed keys: A=$OA (a1 a2), B=$OB (b1), C=$OC (c1, moved to tier pro). No limits set."
  { echo "a1=$(mint "$OA" a1)"; echo "a2=$(mint "$OA" a2)"; echo "b1=$(mint "$OB" b1)"; echo "c1=$(mint "$OC" c1)"; } >"$WORK/keys"
  prov PATCH "/v1/tenants/$OC" '{"tier":"pro"}' >/dev/null
  step "keyset-sync service (5s poll)"; start_sidecar
  step "Dashboard :$DASH_PORT (first compile takes a while)"
  (cd "$BE/apps/sodax-backend-dashboard" && DASHBOARD_PORT=$DASH_PORT API_AUTH_URL=$API \
    API_AUTH_PROVISIONER_TOKEN=$PROVISIONER exec nohup pnpm dev >"$WORK/dashboard.log" 2>&1) &
  echo $! >"$WORK/dashboard.pid"
  for _ in $(seq 120); do curl -sf -o /dev/null "$DASH/api-keys" && break; sleep 1; done
  curl -sf -o /dev/null "$DASH/api-keys" || echo "  dashboard not up yet — see $WORK/dashboard.log"
  echo; info
  ;;
info) info ;;
probe)
  n=$2 ip=$3; shift 3
  keys=(); for k in "$@"; do keys+=("$(key "$k")"); done
  burst "$n" "$ip" ${keys[@]+"${keys[@]}"}; echo
  ;;
maps)
  for m in org_limit.map apikey_org.map; do echo "--- $m"; grep -v '^#' "$WORK/maps/$m" || echo "(empty)"; done
  echo "--- loaded in HAProxy"; cli 'show map' | grep -o '/etc/haproxy/maps/[a-z_]*.map.*entry_cnt=[0-9]*' | sed 's/).*entry_cnt=/  entries=/'
  ;;
status) sidecar_env KEYSET_POLL_SECONDS=5 KEYSET_STALE_SECONDS=15 python3 "$GW/scripts/keyset-sync.py" --status ;;
api-down) stop_pidfile api; echo "api-auth stopped; the sidecar goes stale after ~15s" ;;
api-up) start_api; echo "$API_PID" >"$WORK/api.pid"; echo "api-auth up" ;;
sidecar-kill) kill -9 "$(cat "$WORK/sidecar.pid")" && echo "sidecar killed (SIGKILL)" ;;
sidecar-up) start_sidecar; echo "sidecar started (pid $(cat "$WORK/sidecar.pid"))" ;;
edge-restart) start_haproxy; echo "edge restarted on $(git -C "$GW" rev-parse --short HEAD)$(git -C "$GW" diff --quiet || echo '+changes')" ;;
down) down; echo "stopped" ;;
*) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
