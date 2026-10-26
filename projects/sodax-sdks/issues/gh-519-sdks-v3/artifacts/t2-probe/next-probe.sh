#!/bin/bash
# usage: next-probe.sh <appDir> <label> [--webpack]
set -u
cd "$1"; label="$2"; shift 2
rm -rf .next
npx next build "$@" > build.log 2>&1 || { echo "$label BUILD FAILED"; tail -30 build.log; exit 1; }
PORT=3177
npx next start --port $PORT > start.log 2>&1 &
pid=$!
for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done
html=$(curl -s "http://localhost:$PORT/")
kill $pid 2>/dev/null; wait $pid 2>/dev/null
ssr=$(echo "$html" | grep -o 'ssr: <!-- -->ok\|ssr: ok' | head -1)
client=$(echo "$html" | grep -c 'data-testid="client"')
total=$(find .next/static/chunks -name '*.js' -exec cat {} + | gzip -c | wc -c)
markers=$(find .next/static/chunks -name '*.js' -exec cat {} + | grep -o -E 'p2wpkh|StrKey|icx_sendTransaction|TransactionInstruction' | sort | uniq -c | tr '\n' ' ')
echo "$label | $(head -1 build.log | tr -d '\n') | SSR new Sodax(): ${ssr:-MISSING} | client marker: $client | client JS total: $((total/1024)) KB gzip | chain-lib markers in client JS: ${markers:-none}"
