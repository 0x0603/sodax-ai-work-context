#!/usr/bin/env bash
# Probe which Bound host serves which route, before migrating off api.bound.exchange.
#
# WHY THIS EXISTS
#   Bound completed the mapping on 2026-09-08. FOUR hosts now, not two:
#       /api/sodax/*        -> svc.bound.exchange
#       /api/auth/*         -> auth.bound.exchange
#       /api/wallets/*      -> auth.bound.exchange
#       /api/transactions/* -> api.radfi.co          <- the surprise: a different domain
#       /api/wallets/balance, /api/utxos -> api.ums.bound.exchange (unchanged)
#   api.bound.exchange is the only host being deprecated.
#
#   DNS shows api / svc / auth / api.radfi.co all on one ALB, but a Host-header probe of
#   /.well-known/jwks.json proves auth.bound.exchange is a DIFFERENT backend (it serves a
#   live ES256 key set; the others return radfi-be's NestJS 404). So "only the domain
#   changes" is an assertion, not an observation, for the routes we actually call.
#
# HOW IT ANSWERS THAT WITHOUT CREDENTIALS
#   Every request below carries a deliberately INVALID body / no token. The reply then
#   discriminates cleanly:
#       404 "Cannot POST /api/..."   -> the route is NOT served on this host
#       400 / 401 / a JSON app error -> the route IS served (it got far enough to validate)
#       403 text/html                -> you are not whitelisted; run this from a whitelisted env
#   No valid payload is ever sent, so nothing is created, signed or broadcast.
#
# WHERE TO RUN IT
#   From a whitelisted environment — canary swaps-api's host or wherever the Bound
#   credential normally egresses. From a laptop every /api/* path returns the gate's 403
#   and the script can tell you nothing.
#
# USAGE
#   BOUND_API_SECRET_KEY=... BOUND_API_SECRET_WORD=... ./probe-bound-hosts.sh
#   ./probe-bound-hosts.sh            # unsigned; still valid — the signature is optional
#                                     # on every route (SodaxApiKeyGuard treats a missing
#                                     # x-api-signature as "not a partner, proceed")
set -uo pipefail

SVC="${SVC_HOST:-https://svc.bound.exchange/api}"
AUTH="${AUTH_HOST:-https://auth.bound.exchange/api}"
RADFI="${RADFI_HOST:-https://api.radfi.co/api}"
OLD="${OLD_HOST:-https://api.bound.exchange/api}"
UMS="${UMS_HOST:-https://api.ums.bound.exchange/api}"
TIMEOUT="${TIMEOUT:-10}"

# Mirrors sodax.provider.ts: HMAC_SHA256(secretKey, "<secretWord>_<epochMs>") + "_<epochMs>".
sign_header() {
  [ -z "${BOUND_API_SECRET_KEY:-}" ] && return 0
  [ -z "${BOUND_API_SECRET_WORD:-}" ] && return 0
  local ts sig
  ts="$(date +%s)000"
  sig="$(printf '%s' "${BOUND_API_SECRET_WORD}_${ts}" \
        | openssl dgst -sha256 -hmac "$BOUND_API_SECRET_KEY" -binary | xxd -p -c 256)"
  printf 'x-api-signature: %s_%s' "$sig" "$ts"
}
SIG="$(sign_header)"

# classify <http_code> <body>
#
# Only Nest's own "Cannot POST /path" proves a route is absent. A LIVE route can answer a
# JSON 404 for its own reasons — RadfiProvider.getTradingWallet has an explicit
# "Trading wallet not found" branch for exactly that (RadfiProvider.ts:287-299) — so a
# bare 404 is reported as AMBIGUOUS, never as absent. Treating it as absent would make the
# probe withhold a host that actually works.
classify() {
  local code="$1" body="$2"
  case "$body" in
    *'Cannot POST'*|*'Cannot GET'*) echo "ROUTE ABSENT" ; return ;;
    *'<html>'*|*'<HTML>'*)          echo "GATE (not whitelisted)" ; return ;;
  esac
  case "$code" in
    400|401|403|422) echo "route present" ;;
    200|201)         echo "route present (2xx!)" ;;
    404)             echo "AMBIGUOUS json-404" ;;
    000)             echo "no response / DNS" ;;
    *)               echo "http $code" ;;
  esac
}

probe() { # probe <label> <method> <base> <path>
  local label="$1" method="$2" base="$3" path="$4" out code body
  if [ "$method" = GET ]; then
    out="$(curl -s --max-time "$TIMEOUT" -w '\n%{http_code}' \
           ${SIG:+-H "$SIG"} "$base$path" 2>&1)"
  else
    out="$(curl -s --max-time "$TIMEOUT" -w '\n%{http_code}' -X "$method" \
           -H 'Content-Type: application/json' ${SIG:+-H "$SIG"} \
           --data '{"__probe":"invalid-on-purpose"}' "$base$path" 2>&1)"
  fi
  code="${out##*$'\n'}"; body="${out%$'\n'*}"
  printf '  %-34s %-3s %-30s %s\n' "$label" "$code" "$(classify "$code" "$body")" \
         "$(printf '%s' "$body" | tr -d '\n' | cut -c1-70)"
}

echo "Bound host probe — $(date -u +%FT%TZ)"
echo "signature: $([ -n "$SIG" ] && echo present || echo 'absent (fine)')"

# The four routes Bound says move to the auth host. This block is the decision:
# if they are ABSENT on auth, do not point the SDK there.
echo
echo "== /auth/* and /wallets/* =="
for pair in "AUTH:$AUTH" "SVC:$SVC" "OLD:$OLD"; do
  name="${pair%%:*}"; base="${pair#*:}"
  echo " [$name] $base"
  probe "POST /auth/authenticate"      POST "$base" "/auth/authenticate"
  probe "POST /auth/refresh-token"     POST "$base" "/auth/refresh-token"
  probe "POST /wallets"               POST "$base" "/wallets"
  probe "GET  /wallets/details/:addr"  GET  "$base" "/wallets/details/bc1qprobe"
done

# Bound says these belong on svc. Confirms the other half of the split.
echo
echo "== /sodax/* =="
for pair in "SVC:$SVC" "AUTH:$AUTH" "OLD:$OLD"; do
  name="${pair%%:*}"; base="${pair#*:}"
  echo " [$name] $base"
  probe "POST /sodax/transaction"      POST "$base" "/sodax/transaction"
  probe "POST /sodax/transaction/sign" POST "$base" "/sodax/transaction/sign"
done

# Bound says these live on api.radfi.co — a different registrable domain. RADFI is listed
# first because its rows are the ones that decide whether transactionsUrl gets defaulted.
echo
echo "== /transactions/*  (Bound: api.radfi.co) =="
for pair in "RADFI:$RADFI" "SVC:$SVC" "AUTH:$AUTH" "OLD:$OLD"; do
  name="${pair%%:*}"; base="${pair#*:}"
  echo " [$name] $base"
  probe "POST /transactions"           POST "$base" "/transactions"
  probe "POST /transactions/sign"      POST "$base" "/transactions/sign"
  probe "POST /transactions/max-spent" POST "$base" "/transactions/max-spent"
done

# Also unmentioned. Expected: unchanged, and reachable without a credential.
echo
echo "== UMS  (also absent from Bound's mapping) =="
echo " [UMS] $UMS"
probe "GET  /wallets/balance"          GET "$UMS" "/wallets/balance?address=bc1qprobe"
probe "GET  /utxos"                    GET "$UMS" "/utxos?address_eq=bc1qprobe&isSpent_eq=false&isExpired_eq=true&page=1&pageSize=1"

cat <<'NOTE'

How to read this
  Each new host must serve its own family:
    [AUTH]  /auth/* and /wallets/*      -> all four must say "route present"
    [RADFI] /transactions/*             -> all three must say "route present"
    [SVC]   /sodax/*                    -> both must say "route present"

  If a companion host returns ROUTE ABSENT for its family, use the [SVC] rows as
  the fallback proof before editing BOUND_HOSTS:
    - if that same family is route present on [SVC], point that BOUND_HOSTS entry at .api;
      the family resolves to apiUrl.
    - if [SVC] is absent too, do not silently point the family at svc. Block and
      ask Bound, or consciously keep the old host if product accepts that
      temporary dependency.

  AMBIGUOUS json-404 is NOT absence. Only Nest's "Cannot POST /path" proves a route
  is missing; a live route may answer 404 for its own reasons (a wallet that does
  not exist, for instance). Read the body before concluding anything.

  The [OLD] rows are the fallback check: while api.bound.exchange still answers
  everything, shipping with a field withheld is safe.

  Every row saying "GATE (not whitelisted)" means you are running this from the
  wrong place. Re-run from a whitelisted environment.

  NOT COVERED BY THIS SCRIPT: CORS. All three /transactions/* calls run from a
  browser, and api.radfi.co is a different registrable domain. curl cannot test a
  preflight the ALB rejects at 403. Verify a real BTC withdraw from a browser on
  canary before trusting this migration.
NOTE
