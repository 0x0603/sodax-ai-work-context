---
type: process
repo: sodax-sdks
github: 330
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Verified the inventory against `origin/main @ 3e7872a3` and traced the
  backend proxy this ticket is gated on. No code written.

## Findings

### The backend proxy does not exist, and nothing tracks it

This is the finding that matters. `sodax-backend#831` **closed 2026-08-07 — but not with a
proxy.** Bound offered HMAC-SHA256 signed requests instead (a dedicated
`SODAX_API_SECRET_KEY` + `SODAX_API_SECRET_WORD` pair, 60-second replay window), and
`sodax-backend#1028` shipped exactly that: `sodax.provider.ts` builds a closure and hands it to
the SDK as `radfi.signRequest`.

That signs **swaps-api's own server-to-server calls**. It does nothing for browser → Bound
traffic, which is what this ticket is about. Searches across sodax-backend for a proxy
follow-up (`bound proxy`, `radfi proxy`, `proxy in:title`) return nothing.

So **only the escape hatch shipped**, and #330's config flip has no trigger. The open
Bound-adjacent backend issues are #807, #740 (EPIC) and #1024 — none of them is the proxy.

### Every line number in the inventory is stale by exactly +11

Uniform shift — the gh-831 `RadfiProviderOptions` type (`:119-125`) plus the `signer` field
(`:131`) landed above line 148. **Every endpoint → method mapping is still correct.** Examples:
`authenticate` :208 → **:219**; `getTradingWallet` :276 → **:287**; `createWithdrawTransaction`
:332 → **:343**; `request()` :639 → **:650**. The file is 666 lines.

`chains.ts:840` / `:842` for `apiUrl` / `umsUrl` is the one reference still exactly right.

### What the inventory missed

1. **`getMaxWithdrawable` does have a first-party caller** — `apps/demo/.../BitcoinSetupPanel.tsx:127`.
   The "public API, no first-party caller" label is correct only for `createTradingWallet`.
2. **A second, independent Bound client**: `apps/node/src/bitcoin-radfi.ts` bypasses
   `RadfiProvider` with raw `fetch` and **hardcoded** base URLs (`:17-23`), hitting `/wallets`,
   `/wallets/details/{addr}`, `/transactions`, `/auth/authenticate`, `/auth/refresh-token`,
   `/transactions/sign` and UMS `/utxos`. Flipping the packaged default has **zero** effect here.
3. **`apps/demo` hardcodes the URLs too** (`providers.tsx:38-42`, `radfiApiUrl` /`radfiUmsUrl`
   with `??` fallbacks to the Bound hosts), so it would not move either.
4. **A second config surface with different key names** — `BitcoinRpcConfig`
   (`packages/types/src/common/common.ts:340-344`: `rpcUrl`, `radfiApiUrl`, `radfiUmsUrl`),
   consumed by `wallet-sdk-react`'s `BitcoinChainEntry`. `git grep radfiApiUrl -- packages/sdk/src`
   returns **nothing** — the SDK never reads it.
5. **A third credential path** — `RadfiProvider.ts:611` falls back to `this.config.apiKey` when
   no access token is supplied.
6. **SDK-internal callers omitted** from the "Called from" column: `BitcoinSpokeService`
   (`getTradingWallet` ×4, `createWithdrawTransaction`, `requestRadfiSignature` ×2) and
   `ensureRadfiAccessToken` from `BridgeService`, `LeverageYieldService`, `MoneyMarketService`
   and `SwapService`.

### `signRequest` threading — confirmed as described

`Sodax.ts:59` reads `options?.radfi?.signRequest` → `ConfigService` holds it as
`radfiSigner` (`:107`, resolved once at construction so `initialize()`'s config swap cannot
clobber it) → `BitcoinSpokeService.ts:90` passes it into `new RadfiProvider(chainConfig.radfi,
{ signer: config.radfiSigner })` → `RadfiProvider.request()` (`:650-665`) merges the signer's
headers **last**. The two UMS calls use bare `fetch` and are deliberately unsigned, as the
ticket says.

### `CONFIG_VERSION` is not hand-edited

`packages/types/src/index.ts:23`. `pnpm version:packages` owns it via
`scripts/bump-config-version.mjs`, which throws if it moved unexpectedly
(`"CONFIG_VERSION changed unexpectedly … expected N or N+1"`) and refuses to bump when no
package versions changed. Worth knowing before someone edits it by hand as part of the flip.

## Changes During Work

None.
