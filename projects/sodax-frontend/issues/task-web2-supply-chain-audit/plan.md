---
type: plan
repo: sodax-frontend
github:
updated: 2026-07-21
---

# Plan

## Goal
Turn the generic Web2/supply-chain checklist into concrete, evidence-backed findings on
sodax-frontend, without duplicating #700.

## Approach
6-dimension multi-agent audit (csp-headers, third-party-scripts-sri, supply-chain, cicd,
wallet-tx-safety, infra-advisory). Each agent reads real files, marks anything already in
#700 as "known", returns file:line evidence. Adversarial verify per finding (+ confirm it is
genuinely new). Synthesize.

## Verification
40 agents, 0 errors. 3 top findings hand-verified verbatim: `claude.yml` env/curl/PAT,
Alchemy key in the client bundle, CSP `connect-src` absent.
