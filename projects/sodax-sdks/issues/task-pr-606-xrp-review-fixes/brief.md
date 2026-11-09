---
type: brief
repo: sodax-sdks
github: 606
status: Active, review fixes pushed, CI green except Issue linked
next: ask for a re-review on 71954503 (R0bi7-sodax-worker reviewed 5c523ffb); Issue linked needs a `Closes #` or the `no-issue` label
updated: 2026-11-09
tags: review, xrp, mpc-relay, wallet, gemwallet
---

# PR 606 review fixes (gcranju, XRP Ledger as an MPC-relay spoke) · brief

## State

- gosodax/sodax-sdks#606 `feat/xrp-mpc-integration` @ `71954503`, stacked on `feat/tron-mpc-integration`.
  gcranju (ranju) is busy, so 0x0603 pushes the fixes straight to the branch, from worktree
  `repos/client/sodax-sdks-wt-606` (local branch `pr606-fix`).
- Seven commits pushed 2026-11-09, `14e5503f`..`71954503` plus a merge of the base branch. What each one fixed
  is in `outcome.md`.
- CI on `71954503`: green except `Issue linked` (`Closes #` empty). Adding the issue or the label is up to
  gcranju or a maintainer.
- PR comments by 0x0603:
  - `issuecomment-6733392315` lists the open items for ranju. It is now stale: every item in it was fixed
    afterwards except the e2e scripts and the `XrpXService` items.
  - `issuecomment-6733708689` asks R0bi7-sodax-worker to verify that list. The worker's review ("Request
    changes", on `5c523ffb`) is fully addressed by `e17c65ff`..`71954503`, except its two "worth exploring"
    duplication notes.
- Testing scope from ranju: XRP money market deposit/borrow only. Swap has little liquidity. Don't test bridge.

## Decisions

- **One guard covers every XRPL release:** `SpokeService.assertReleaseRecipientReady`. Money market, swap,
  bridge, dex, recovery and leverageYield all call it, rather than each having its own check.
- **The SDK mirrors the relay's destination preflight.** The relay's executor-xrp `assertRecipientAccepts`
  defines the rules, so a check the SDK passes is one the relay passes too.
- **Native XRP can create an account** if the amount is at least the base reserve. An IOU to a missing account
  is refused.
- **Relay facts this work relies on:**
  - The reserve pays the ledger fee, so XRP payouts arrive in full. No minimum is needed for XRP.
  - A reserve short of funds waits to be refilled and retries; the release is delayed, not lost.
- **Withdrawals need an ed25519 key.** A non-raw deposit is refused unless the signer's key is ed25519 and
  matches `srcAddress`.
- **GemWallet submits only on the XRPL Mainnet.**
- **The tsup patch stays** until Swatinem/rollup-plugin-dts#408 ships in tsup. tsup is a devDependency, so
  users of the published packages are unaffected.

## Open (not fixed in #606)

- `packages/sdk/e2e/tron-*.mjs`: nothing runs these four scripts, and they copy the SDK's base58check.
- `XrpXService` (wallet-sdk-react) copies `xrpCurrencyCode` and cannot parse exponent-form balances.
- The leverage position builders are synchronous, so they cannot check an XRPL origin.
- Long term, migrate from tsup to tsdown, then drop the 8 GB wallet-sdk-react build workaround.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What each pushed commit fixed, and the gates run | `outcome.md` | 0.8k |
