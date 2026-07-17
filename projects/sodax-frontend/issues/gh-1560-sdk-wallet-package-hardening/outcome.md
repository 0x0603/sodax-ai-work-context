---
type: outcome
repo: sodax-frontend
github: 1560
status: In progress
updated: 2026-07-16
---

# Outcome

- PR: sodax-sdks branch `fix/security-audit-1560` (not yet pushed) — WALLET-L-1 only
- Commits: (pending)
- Tests: wallet-sdk-core icon 17/17, sdk HanaWalletConnector 8/8 — pass

## Summary

Six #1560 findings dispositioned against current sodax-sdks v2 source. Only
**WALLET-L-1** was open in code and is now fixed in both copies. The three High/Med
findings that carry over from #1448 stay **accepted-risk** (verified basis, no
code); the remaining two are effectively closed by v2 refactors.

## Disposition table

| #1560 | Sev | ↔ #1448 | Disposition | Basis |
| --- | --- | --- | --- | --- |
| SDK-H-1 autoswap `minOutputAmount=0n` | High | `#8` (+`#17`) | accepted-risk | `Intents.fillIntent` reverts `InvalidSolver` unless `msg.sender == intent.solver` (designated SODAX solver) → no third-party MEV. Residual = solver operator trust. Min-output floor = defense-in-depth, not a fix for an open hole. |
| SDK-M-1 unsigned remote config | Med | `#2` | accepted-risk | Trusting the backend is architectural; `version` is a compat check, not a security control; apply path is inert today (dynamic fetch disabled / live API `version 27 < CONFIG_VERSION 100`). |
| WALLET-M-1 raw BTC ECDSA | Med | `#1` | accepted-risk | The `keccak256` timestamp format is required by the external Radfi/Bound verifier (not SDK-chosen); malleability refuted (low-S canonical); replay bounded by Bound token expiry, off-repo. |
| WALLET-M-2 Solana burner default | Med | — | resolved-in-v2 | wallet-react v2: `UnsafeBurnerWalletAdapter` removed (0 repo matches), `SolanaProvider` mounts `emptyWallets`, SOLANA slot opt-in. Cited lines are pre-v2. Optional: flip default `autoConnect` to `false`. |
| WALLET-L-1 ICON correlation | Low | — | **fixed (code)** | Serialize ICONEX requests (at most one in flight) + timeout & listener cleanup. Fixed in both copies. JSON-RPC `id`-match was tried then **dropped** after an adversarial review round — with the fixed `id=99999` it added a 300s-hang regression (error/malformed responses, or a wallet that doesn't echo the id) without fixing the stale-response case, so serialization carries the guarantee. |
| WALLET-L-2 Stacks forces mainnet | Low | — | mostly-resolved | `resolveNetwork()` + `this.network` used on PK/read/balance paths; residual: `sendTransactionWithAdapter` passes `this.defaults.network ?? 'mainnet'`, and a custom `endpoint` can't be forced onto a browser extension anyway. Optional 1-line consistency nit. |

## What Changed (WALLET-L-1, code)

Repo: **sodax-sdks**, branch `fix/security-audit-1560`.

- `packages/wallet-sdk-core/src/wallet-providers/icon/IconWalletProvider.ts`
  — `sendIconexRequest` helper: module-level serialization queue (one in flight),
  per-request response listener, timeout (`ICONEX_REQUEST_TIMEOUT_MS = 300_000`)
  with guaranteed cleanup. `requestJsonRpc` keeps the original fast-reject on a
  malformed RESPONSE_JSON-RPC (no id-match — see the WALLET-L-1 row).
- `packages/sdk/src/shared/entities/icon/HanaWalletConnector.ts`
  — same hardening, preserving the `Result<T>` / throw-on-cancel contract.
- Tests: `IconWalletProvider.test.ts` (+7), `HanaWalletConnector.test.ts` (new, 8)
  — serialization (deferred-mock, **fails against reverted code** — empirically
  verified), malformed→fast-reject, cancel, SSR guard (no queue wedge),
  `sendTransaction` browser path, timeout removes the exact listener. Fake `window`
  via node `EventTarget`.
- Docs: `sodax-wallet-sdk-core/icon/SKILL.md` and
  `integration/knowledge/features/icon.md` concurrency notes updated.

### Adversarial review round (self-review, ultracode workflow)

A multi-agent review flagged (verified by hand against real source): (1) the JSON-RPC
`id`-match introduced a **300s-hang regression** and, with the fixed `id`, didn't fix
the case it targeted → **dropped, fast-reject restored**; (2) the `.then(run, run)`
queue tail had a dead `onRejected` arm → simplified to `.then(run)`; (3) the original
"serializes concurrent requests" test was **false assurance** (a synchronous mock let
request A finish before B started, so it passed even with the queue removed) → replaced
with a deferred-mock test that fails against non-serialized code. Residual (documented,
not fixed): the two per-package `iconexQueue` singletons don't coordinate across packages;
a post-timeout late response could resolve the next queued request (rare).

Note: the review workflow's *automated verify phase* read a stale/clean checkout and
wrongly reported "no source changes" — findings were re-verified manually against the
real working tree.

Verification: `checkTs` clean for wallet-sdk-core (sdk only pre-existing
backendApi/swaps-api errors, none in the touched file); `biome check` clean (1
pre-existing unrelated warning). Full `pnpm build` / `check:ai` blocked by a
pre-existing `@sodax/swaps-api` DTS-resolution failure in this checkout.

## Follow-ups

- Push branch, open PR against sodax-sdks; commit + push when the user asks.
- Record the accepted-risk / resolved-in-v2 dispositions on the #1560 GitHub
  issue (cross-link #1448 `#1`/`#2`/`#8`/`#17`).
- Optional cleanups: WALLET-L-2 one-line network consistency; WALLET-M-2 default
  `autoConnect: false`.
- Before sign-off, confirm the accepted-risk trio and WALLET-M-2 against the
  **published 1.5.7-beta** the web app actually ships.
