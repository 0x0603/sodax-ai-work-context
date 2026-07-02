---
type: process
repo: sodax-sdks
github: 265
updated: 2026-07-02
---

# Process

## Log

### 2026-07-02 — publication workflow confirmed

The user confirmed the operational ownership and publication flow:

- `sodax-sdks` and `sodax-document` are separate repositories. Merging an SDK
  PR does not update `docs.sodax.com` automatically.
- Runtime SDK changes and canonical package/detail Markdown are merged to
  `sodax-sdks/main` first.
- After the SDK PR merges, create a branch in `sodax-document`, run
  `sync-sodax-sdks.sh`, commit both generated/copied files and the updated
  submodule pointer, then open a PR to `sodax-document/main`.
- GitBook Preview is reviewed before approval/merge. GitBook publishes
  `docs.sodax.com` from `sodax-document/main` after that merge.
- The `/developers/packages` overview is not copied by the sync script. Its
  source is `sodax-document/developers/packages/README.md` and it must be edited
  directly in the downstream docs PR.
- The current local `sodax-sdks` checkout is on the deleted remote branch
  `docs/ai-integration-guide` with untracked files. Future implementation must
  not switch/reset that checkout; use a clean branch/worktree from
  `origin/main`.

The npm release flow is separate from docs publication:

- Feature work merges to `sodax-sdks/main`.
- For a release, `main` is merged into `release`, versions are bumped, and an
  `@sdks@<version>` tag triggers the npm publishing workflow.
- The latest observed release, `2.0.0-rc.19`, targets `release`.
- `packages/RELEASE_INSTRUCTIONS.md` still refers to the removed
  `release/sdk` branch. This is confirmed stale documentation and should be
  corrected as part of the documentation audit or a clearly linked follow-up.

### 2026-07-02 — issue intake and source audit

- Read issue #265 directly from GitHub. It has no comments or linked PRs yet.
- Read the workspace context index and the `sodax-sdks` repository/package
  guidance.
- Anchored the analysis to `origin/main` at `c5953c827d5523593dc23bb13bf56f9b925a92f2`
  because the shared working tree changed branches during the investigation.
- Inspected `icon-project/sodax-document` at
  `f348e35be842b3821adcdb7ee41a3bcc067c1b91`, including `SUMMARY.md`,
  `CLAUDE.md`, `developers/faq.md`, and `sync-sodax-sdks.sh`.
- Inspected the live `docs.sodax.com/developers/packages` and
  `/developers/how-to` pages.
- Compared the current SDK facade, package manifests, public barrels, hook
  indexes, docs, and the downstream sync map.

## Findings

### 1. Publication pipeline and revision lag

The current public pipeline is:

```text
sodax-sdks source Markdown
  -> sodax-document linked-repositories/sodax-sdks submodule
  -> sync-sodax-sdks.sh copy/frontmatter/link rewrite
  -> sodax-document SUMMARY.md
  -> docs.sodax.com (GitBook)
```

The `sodax-document` submodule pointer is `ff3ef17f` (2026-06-10), while the
audited SDK main revision is `c5953c82` (2026-07-02). The public docs therefore
predate major additions including leverage yield, Swaps API v2, analytics,
recovery work, assets, and subsequent correctness fixes.

`sodax-sdks/docs/docs.json` and `docs/index.mdx` are a separate minimal Mintlify
site introduced by PR #262. The PR explicitly records that `index.mdx` duplicates
`docs/ai-integration-guide.md` and can drift.

### 2. Current code/package surface

`Sodax` currently exposes these public services/properties:

- `swaps`, `moneyMarket`, `bridge`, `staking`, `migration`, `dex`
- `leverageYield`, `partners`, `recovery`
- `backendApi` and its alias `api` (`api.swaps` is Swaps API v2)
- `config`, `hubProvider`, `spoke`, and `instanceConfig`

The consumer-facing package stack is:

- Foundation: `@sodax/sdk`
- Connection: `@sodax/wallet-sdk-core`, `@sodax/wallet-sdk-react`
- Experience: `@sodax/dapp-kit`, plus `@sodax/skills` as the agent experience

Supporting packages should not be promoted as normal integration entry points:

- `@sodax/types` is re-exported through `@sodax/sdk`; consumers should not need
  an additional direct dependency for normal SDK use.
- `@sodax/libs` explicitly describes itself as internal dependency isolation.
- `@sodax/assets` is private and exists to host static logo URLs.

### 3. Downstream sync coverage gaps

The current sync copies the five older SDK functional modules (`SWAPS`,
`MONEY_MARKET`, `BRIDGE`, `STAKING`, `MIGRATION`) and two tooling modules
(`BACKEND_API`, `INTENT_RELAY_API`). It does not copy or navigate:

- `DEX.md`
- `LEVERAGE_YIELD.md`
- `LEVERAGE_YIELD_APR.md`
- `SWAPS_API.md`
- `LOGGING.md`
- a recovery page (none exists yet)
- an analytics page (none exists yet)
- `packages/skills/README.md` as an Experience-layer package page

Partner fees are represented by the existing `MONETIZE_SDK.md` How-to and do
not require a duplicate functional-module page unless product navigation calls
for one.

### 4. Confirmed source documentation drift

These are verified examples, not speculative audit items:

- `packages/sdk/docs/BITCOIN_INTEGRATION.md` says Bitcoin `raw: true` is not
  supported. Current `SwapService.createIntent` supports raw Bitcoin and accepts
  a Bound access token through `extras.bound.accessToken`; the current skills
  docs already describe that behavior.
- The same Bitcoin guide shows `<SodaxProvider testnet={false}>`, but
  `SodaxProviderProps` only contains `children` and `config?: SodaxOptions`.
- `packages/sdk/README.md` says Node.js 18+, while `packages/sdk/package.json`
  requires Node.js `>=20.12.0`.
- `packages/sdk/README.md` documents only the older five functional modules and
  two tooling modules; it omits public `dex`, `leverageYield`, `partners`,
  `recovery`, and `api.swaps` surfaces.
- `packages/sdk/docs/CONFIGURE_SDK.md` omits the public `analytics` constructor
  option and omits `sodax.leverageYield` / `sodax.api` from its service table.
- `packages/dapp-kit/README.md` omits the entire exported leverage-yield hook
  family and newer partner hooks (`useFeeClaimWithdraw`, `useGetIntentDetails`,
  `useGetUserIntent`, `usePartnerCancelIntent`). It also omits newer Bitcoin
  setup/access-token hooks from its feature summary.
- The public package overview says dapp-kit offers UI components, but the package
  is a hook/context/utility package and its source does not export a general UI
  component library.
- Current CI `pnpm check:ai` validates `packages/skills`, but the older guards
  that scanned package READMEs and `packages/sdk/docs/` are no longer present in
  the main package scripts. This reopens the drift class previously addressed by
  PR #84.

### 5. Testnet truth from code

- `packages/types/src/chains/chain-keys.ts` exports only `*_MAINNET` SODAX chain
  keys.
- Every `baseChainInfo` entry is marked `mainnet: true`.
- `SodaxOptions` has no protocol-level `testnet` selector.
- Some lower-level wallet/provider types accept testnet/devnet networks, and a
  testnet relayer endpoint is documented. Those capabilities do not constitute
  an end-to-end SODAX testnet: the SDK's protocol config, deployed contracts,
  backend/solver, liquidity, and supported-token routes remain mainnet-oriented.

The How-to copy must state this distinction explicitly. The business/product
reason for not operating a full testnet is not derivable from source alone and
requires approval from the issue stakeholders; it must not be invented as a
technical fact.

### 6. Scope boundaries

- Issue #182 owns research/implementation of a standalone rich Mintlify swaps
  docs application. Issue #265 should not redesign the docs platform.
- Issue #212 owns generated staging/production solver-compatible asset lists.
  Issue #265 should link to or preserve that work, not duplicate a manually
  maintained token matrix.
- This issue can make the existing Mintlify AI page single-source or guarded,
  but expanding the full Mintlify navigation should wait for #182/platform
  confirmation.

## Changes During Work

- Created this issue context and the implementation plan.
- Updated the plan with the confirmed two-repository manual publication flow,
  direct ownership of `/developers/packages`, and the actual npm release branch.
- No files in `sodax-sdks` or `sodax-document` were changed.
