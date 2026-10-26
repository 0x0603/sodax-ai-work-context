#!/bin/sh
# Compare @sodax/libs stacks/core in its Node build with a browser build whose Node `crypto` is a shim
# that throws when called. Run in an empty scratch dir with this folder's files copied in.
set -e
npm pack @sodax/libs@2.2.0 --silent && tar -xzf sodax-libs-2.2.0.tgz
npm i esbuild@0.25.10 --ignore-scripts --before="$(date -v-14d +%F 2>/dev/null || date -d '-14 days' +%F)" --no-audit --no-fund --silent
npx esbuild ops.mjs --bundle --format=esm --platform=browser --alias:crypto=./crypto-browser-shim.mjs \
  --alias:node:crypto=./crypto-browser-shim.mjs --outfile=ops.browser.mjs --log-level=error
node ops.mjs > node.json
node --input-type=module -e "globalThis.self = globalThis; await import('./ops.browser.mjs');" > browser.json
cmp node.json browser.json && echo "identical"
