#!/bin/bash
# usage: install-groups.sh <workdir> [group...]
# Installs each dependency group into its own empty dir (npm, --ignore-scripts, standard peer handling;
# only the React group needs --legacy-peer-deps) and records packages added, MB on disk, npm audit.
W=$1; shift; OUT=$W/install-results.tsv
run() {
  local name=$1; shift
  [ -n "$ONLY" ] && [[ " $ONLY " != *" $name "* ]] && return
  local dir=$W/groups/$name flags="--ignore-scripts --no-fund"
  [ "$name" = react ] && flags="$flags --legacy-peer-deps"
  rm -rf $dir && mkdir -p $dir && cd $dir && echo '{"name":"probe","private":true}' > package.json
  local log; log=$(npm i $flags "$@" 2>&1)
  local added; added=$(echo "$log" | grep -oE 'added [0-9]+ packages?' | grep -oE '[0-9]+')
  local mb; mb=$(du -sk node_modules 2>/dev/null | awk '{printf "%.0f", $1/1024}')
  local audit; audit=$(npm audit --omit=dev --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).metadata.vulnerabilities;console.log(`${v.total}\t${v.critical}c/${v.high}h/${v.moderate}m/${v.low}l`)}catch{console.log("?\t?")}})')
  printf "%s\t%s\t%s\t%s\t%s\n" "$name" "$added" "$mb" "$audit" "$*" >> $OUT
}
ONLY="$*"; [ -z "$ONLY" ] && : > $OUT
run tools esbuild@0.25.10 typescript@6.0.3
# today
run sdk @sodax/sdk@2.2.0
run react @sodax/dapp-kit@2.2.0 @sodax/wallet-sdk-react@2.2.0 react@19 react-dom@19 @tanstack/react-query@5
# v3 core (hub + EVM): today's pins, then viem from a range
run core viem@2.29.2 valibot@1.4.2 @sodax/types@2.2.0 @sodax/swaps-api@2.2.0 @sodax/bridge-api@2.2.0 rlp@3.0.0 bignumber.js@9.3.1
run core-viem-range viem@2 valibot@1.4.2 @sodax/types@2.2.0 @sodax/swaps-api@2.2.0 @sodax/bridge-api@2.2.0 rlp@3.0.0
run core-no-viem valibot@1.4.2 @sodax/types@2.2.0 @sodax/swaps-api@2.2.0 @sodax/bridge-api@2.2.0 rlp@3.0.0
# what each opt-in chain would cost (today's libs, same versions as @sodax/sdk@2.2.0)
run pancake @pancakeswap/v3-sdk@3.10.0 @pancakeswap/infinity-sdk@1.0.8 @pancakeswap/swap-sdk-core@1.6.0
run solana @solana/web3.js@1.98.0 @solana/spl-token@0.4.9 @coral-xyz/anchor@0.30.1 bn.js@5
run solana-kit @solana/kit @solana-program/token
run sui @mysten/sui@2.23.2
run stellar @stellar/stellar-sdk@15.1.0
run icon icon-sdk-js@1.5.3
run injective @injectivelabs/sdk-ts@1.18.14 @injectivelabs/networks@1.18.14 cosmjs-types@0.9.0
run bitcoin bitcoinjs-lib@6 @bitcoinerlab/secp256k1@1
run near near-api-js@7.2.0
run stacks-libs @sodax/libs@2.2.0
# React layer: wagmi v2 (pinned today) vs v3, and the v3 EVM dapp dependency set
run wagmi2 wagmi@2.16.9 viem@2.29.2 @tanstack/react-query@5 react@19 react-dom@19
run wagmi3 wagmi@3 viem@2 @tanstack/react-query@5 react@19 react-dom@19
run dapp-after wagmi@3 viem@2 @tanstack/react-query@5 react@19 react-dom@19 valibot@1.4.2 @sodax/types@2.2.0 @sodax/swaps-api@2.2.0 @sodax/bridge-api@2.2.0 rlp@3.0.0
run dapp-after-wc wagmi@3 viem@2 @tanstack/react-query@5 react@19 react-dom@19 valibot@1.4.2 @sodax/types@2.2.0 @sodax/swaps-api@2.2.0 @sodax/bridge-api@2.2.0 rlp@3.0.0 @walletconnect/ethereum-provider
echo DONE >> $OUT
