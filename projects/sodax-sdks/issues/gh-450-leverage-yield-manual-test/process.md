---
type: process
repo: sodax-sdks
github: 450
updated: 2026-09-16
---

# Process

## Session 1 — 2026-09-16 · scoping, harness, tiers 1 & 2

### Scoping

Issue body is one line. The real acceptance bar came from
`sodax-backend/docs/leverage-yield-api-sdk-mapping.md` §Open items — three named end-to-end
cases. That doc is the single most useful artefact for this issue and is easy to miss because
it lives in the *other* repo.

Sibling issues filed the same day (2026-09-14): #451 bridge manual test, #452 LY submit-tx
default + api key, #453 bridge submit-tx. #450 is the hindsight check on #256 (closed
2026-09-14) and the input to #452.

User scoped it to the two vault pages; `/leverage-positions` (added by #374, merged 2026-09-15,
*after* #450 was filed) is out.

### Repo state

Started on `fix/swap-speed-tier-vault-lookup`, 7 commits behind `origin/main` and without #374 —
wrong base for testing shipped code. Created `test/450-leverage-yield-manual` off `origin/main`
(`a10e50b4`). Working tree was clean (0 changes) before the switch, so nothing was disturbed.

`pnpm i` (1.4s) + `TURBO_CONCURRENCY=2 pnpm build:packages` (32.8s, 7/7 tasks) clean.

### Automated suites

```
packages/sdk    npx vitest run src/leverageYield src/backendApi/LeverageYieldApiService.test.ts
                → 9 files, 306 tests, all pass, 2.87s
packages/dapp-kit  npx vitest run src/hooks/leverageYield src/hooks/leverageYieldApi
                → 2 files, 22 tests, all pass, 2.44s
```

All mocked; none touch a real network. There is still no leverage-yield e2e test in
`packages/sdk/src/e2e-tests/` — that directory is swaps/relay/backend-status only.

### Building `probe.mjs`

Three of my own assertions were wrong before the harness was right. Worth recording because each
mistake taught something real about the API:

1. **`netAprRay` is signed.** My `^\d+$` check rejected `-43691510613600512373968885`. Chasing
   it produced the whole APR-model finding (raw negative vs effective positive) and test cases
   A24/A25, which are now the most valuable cases in tier 1. A failing assertion was worth more
   than a passing one.
2. **`allowance/check` takes `CreateDepositIntentParamsV2`**, not a flat
   `{chainKey, token, owner, amount}`. The 400 enumerated every rejected property, which is good
   API behaviour and became D05.
3. **`effectiveSupplyAprRay !== lsdApr.aprRay`.** The gap was exactly `supplyAprRay`, revealing
   the composition `effective = lsd + aaveSupply`. Pinning the identity exactly (A25) is a
   stronger test than the near-equality I first wrote.

Also: the gateway 403s python-urllib's User-Agent. Use curl/fetch.

Final: **112/112 pass** against production.

### Chain-key tripwire

`tokenSrcChainKey: 'arbitrum'` → `400 Invariant failed: unsupported token_src for src chain`.
The correct value is `0xa4b1.arbitrum` (`packages/types/src/chains/chain-keys.ts:18`). Only
Sonic is a bare string. Pinned as D04 so the next person loses minutes, not an hour.

### Demo, read mode

`pnpm dev:demo` fails — `x No package found with name 'demo' in workspace`. Used
`pnpm --filter sodax-demo-v2 dev`; Vite up on :3000 in 384ms.

**`/leverage-yield` (SDK)** — 0 console errors. Preselects `lsodaWEETH`, renders the full panel
with no wallet: Net APR 8.53%, LSD staking +2.32%, AAVE supply 0.00%, AAVE borrow 0.96%,
target leverage 4.56×, AAVE-only net −4.37%, TVL 0.790409, share price 0.92012643,
current LTV 81.72% (82.00%), health factor 1.19, idle asset 0.000000.
Every figure matches `probe.mjs`. Screenshot: `evidence/sdk-page-readmode.png`.

**`/leverage-yield-api` (API)** — 0 console errors, but opens with **no vault selected** and an
empty panel. After picking `lsodaWEETH`: Effective APR 8.53%, Total Assets 0.7904, LTV 81.72%,
Health Factor 1.19, Your Shares —. Identical to the SDK page and to the probe → **E09 parity
passes across three independent sources**. Screenshots: `evidence/api-page-readmode.png`,
`evidence/api-page-vault-selected.png`.

Live quote through the UI: weETH on Arbitrum, amount `0.01` → "Quoted shares: 0.010866", matching
`POST /quote/deposit` (`10866002227255203`) exactly. The API page's quote path is proven live.

### Chasing the slippage crash

A prior analysis claimed the white-screen was "confirmed end-to-end". It is not reproducible in
read mode: typed `abc` (field became `abc0.5`), then cleared the field entirely — page kept
rendering and the quote kept updating.

Reason, from source: `depositIntentParams` (`LeverageCard.tsx:209-210`) returns `undefined`
unless `depositAccount.address` is set, so `applySlippageMinOut` never runs without a wallet.

Extracted the function and drove it directly — which found **two defects nobody had reported**:
`-5` yields a `minOutputAmount` *above* the quote (unfillable), and `1e9` yields `0`
(all slippage protection silently removed). Full table in `outcome.md` §Defects 1.

Lesson matching `[[verify-in-code-not-docs]]`: an agent's "confirmed" was an inference. The
throw was real, the reachability claim was not — and re-deriving it surfaced worse bugs than
the one originally reported.

### The branch moved underneath the session

At the end of the session `git branch --show-current` read `main`, not the test branch I had
checked out. Reconstructed from `.git/HEAD` mtime and the reflog:

```
12:20:16  packages/sdk/dist built          (on test/450… @ a10e50b4)
12:20:48  vitest 306 pass                  (on test/450… @ a10e50b4)
12:33:18  .git/HEAD rewritten -> main      (bdc5a0b8 — local main is STALE, behind origin/main)
12:33:26  vite started                     (serving bdc5a0b8)
12:33:46  SDK page screenshot              (bdc5a0b8)
12:34:22  API page screenshots             (bdc5a0b8)
```

Not done by me — my only checkout was at HEAD@{1}. Vite logged no reload, so the switch landed
between my last command and the dev-server start.

Impact, checked rather than assumed:

- `apps/demo/{pages,components}/leverage-yield-api` and `packages/sdk/src/backendApi` —
  `git diff --name-only a10e50b4 bdc5a0b8` returns **0 files**. Every API-page result is valid
  either way.
- `packages/sdk/dist` is gitignored, so the checkout did not rebuild it. The unit tests and
  `probe.mjs` ran against the a10e50b4 build. Valid.
- `apps/demo/src/pages/leverage-yield/page.tsx` differs by 20 lines — a pure code-move of
  `fmtBps` / `fmtHealthFactor` out of `@/lib/utils` into the page. No behavioural change.

Re-checked out `test/450-leverage-yield-manual` and re-took the SDK screenshot: identical
rendering (8.53% / 0.790409 / 81.72% / 1.19; share price 0.92012593 vs 0.92012643, which just
moves). `evidence/sdk-page-readmode.png` is now from a10e50b4.

Generalises `[[workflow-verify-stale-checkout]]`: the git state can move *during* a session, not
just inside a subagent. Stamp the commit next to every result rather than trusting the checkout
you performed an hour earlier.

### Local env

Ports 3008 (LY API), 3108 (swaps-api), 3109 (bridge-api), 3000 all down at session start.
`apps/demo/.env` pins swaps and bridge at 3108/3109, so the SDK page's "Submit tx to API"
checkbox is broken on this machine — and that path has no relay fallback. Blocker for tier 3,
recorded as F00. Did not edit the user's `.env`.
