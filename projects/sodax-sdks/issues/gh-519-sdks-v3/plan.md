---
type: plan
repo: sodax-sdks
github: 519
updated: 2026-10-14
---

# Plan

## Goal

Give the user a ranked, evidence-backed list of v3 ideas per package to post on #519 themselves,
with "lightweight" first.

## Approach

1. Measure the published packages instead of guessing: bundle per consumer scenario, install
   footprint, Node import cost, tsc cost, consumer-side `npm audit` (`measurements.md`).
2. Find why tree-shaking fails in source and dist, with `file:line`.
3. Review the React / wallet / API / skills layers for weight, DX and robustness issues; verify the
   load-bearing claims by hand.
4. Compare with peer SDKs (LI.FI, Relay, CoW, Wormhole, Solana Kit, thirdweb, viem/wagmi, Aave,
   Morpho, intent/bridge APIs) for transferable patterns (`competitors.md`).
5. Write the paste-ready block in the issue's format (`ideas.md` §1).
6. Measure what v3 would gain rather than estimating it: dependency-group installs (core, each chain,
   wagmi v2 / v3, the v3 dapp set) and esbuild what-ifs over the source with per-feature entries
   (`measurements.md` § Projected v3 gains).

## Verification

- Every number in `measurements.md` comes from a command in `artifacts/bundle-baseline/`.
- Agent findings are leads; only re-verified ones are in `ideas.md` (re-check list in `process.md`).

## Risks

- Bundle figures are a floor (Node builtins external, no polyfills counted).
- Every what-if is an upper bound: stubbed code disappears and replacement code for opt-in chains
  (plugin registry, vendored CL math, JSON-RPC client) is not counted.
