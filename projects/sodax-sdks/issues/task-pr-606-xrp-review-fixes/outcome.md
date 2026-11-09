---
type: outcome
repo: sodax-sdks
github: 606
status: Pushed, awaiting re-review
updated: 2026-11-09
---

# Outcome

- PR: gosodax/sodax-sdks#606, branch `feat/xrp-mpc-integration` (gcranju's). Pushed by 0x0603 on 2026-11-09.
- Tests on `71954503`:
  - unit tests: types 1702, wallet-sdk-core 235, wallet-sdk-react 419, sdk 3521, dapp-kit 952;
  - checks: checkTs 16/16, build, circular-deps, knip, doc-links, check:ai;
  - CI: green except `Issue linked`.

## What Changed

| Commit | Change |
| ------ | ------ |
| `14e5503f` build | Patches tsup's bundled rollup-plugin-dts so a `.d.ts` build makes one TypeScript program. This fixes the Vercel OOM. |
| `f8121543` fix(sdk) | `checkDestination` refuses destinations that need a destination tag or have DepositAuth. Amounts in exponent form now parse, `terQUEUED` counts as accepted, and tx hashes are normalised before they go to the relay. |
| `5c523ffb` merge | Merges the base branch and fixes one lockfile line. The PR's `@types/react` override clashed with base's `catalog:` specifier, so the merge ref failed with `ERR_PNPM_OUTDATED_LOCKFILE`. |
| `e956dd89` build | The patch comment states when the patch can be dropped. |
| `e17c65ff` fix(wallet-sdk-core) | An XRPL secret must be a family seed (read with `deriveKeypair`, not `Wallet.fromSeed`) or 16 bytes of entropy; other lengths are refused. A secp256k1 key is refused. The `as never` cast is replaced by `ECDSA.ed25519`. |
| `fdcfd577` fix(sdk) | Adds the shared guard `SpokeService.assertReleaseRecipientReady` and calls it before every XRPL release (details below). |
| `b183f2f5` feat(sdk) | Raw mode for XRPL (details below). `checkDestination` now matches the relay's own preflight. |
| `71954503` fix(wallet-sdk-react, wallet-sdk-core) | The GemWallet connector detects the wallet up front (`XrpXConnector.detect`). A submit is refused unless the wallet is on the XRPL Mainnet. |

`fdcfd577` in more detail:

- The guard runs in money market, swap (both the source refund and the destination), bridge, dex, recovery and leverageYield.
- A deposit's memo is checked against `computePayloadHash` before signing, as Tron does.
- A non-raw deposit checks first that the signer can withdraw later.
- An account that doesn't exist reads as a balance of `0n`.

`b183f2f5` in more detail:

- Withdrawals can be built raw: the call returns `XrpRawWithdraw`, which the caller later submits with `submitSignedWithdraw`.
- A raw deposit also returns the unsigned Payment.
- `checkDestination` gains these checks:
  - account creation for native XRP;
  - issuer global freeze;
  - issuer transfer fee;
  - RequireAuth;
  - deep freeze;
  - room under the trustline limit.
- A money market borrow is checked on the amount left after the partner fee.

## Follow-ups

The open items are listed in `brief.md`.
