---
type: process
repo: sodax-sdks
github: 603
updated: 2026-11-08
tags: review, types, execution-mode
---

# PR 603 · process

## 2026-11-08: body refresh, full-feature audit, regression guard

- PR body was stale against `aa3a72df` ("type-only, no runtime change", "changeset: minor",
  "18 helpers, each cast now commented"). Rewrote it; template kept, `Closes #601` kept.
- Release notes come from the squash commit subject (`CONTRIBUTING.md`, `RELEASE_INSTRUCTIONS.md`),
  so the Bitcoin fix ships under the `feat` title. Disclosed in the body instead of splitting.
- Audit: an AST inventory of public class methods with a boolean type param (sdk, dapp-kit,
  wallet-sdk-core) found 88, all `Raw`/`R`, all `= false` on `aa3a72df`. Remaining mode checks
  are `=== true` or `!x.raw`; all four `ensureRadfiAccessToken` call sites use `!raw`.
- Gap found: `partners.feeClaim.setSwapPreference<K extends SpokeChainKey, Raw>` has no inference
  site for `K` (`SetSwapPreferenceParams.srcChainKey` is `HubChainKey`, not `K`), so `K` fell back
  to `SpokeChainKey`: signed result `string`, raw result every chain's raw tx. tsc on the new row:
  `signed?: "Expected: never, Actual: string"`. Fix: `K extends SpokeChainKey = HubChainKey`. Keeps
  explicit type args and the dapp-kit hook (it passes its own `K`) compiling; repo `checkTs` green.
- Type-test rows added for `setSwapPreference` and BALN `stake` / `unstake` / `cancelUnstake` /
  `claim` / `claimUnstaked` / `call` (positional slot, no `Result`; `Ok<P>` now passes a bare value through).
  Skipped on purpose: `isAllowanceValid` (boolean result), `Erc4626Service` / `Permit2Service`
  static helpers (positional `raw?: R`, already defaulted on `main`, not the slot).
- Dead end: `const baln = sodax.migration.balnSwapService` at module top level throws at vitest
  import, because `sodax` is only `declare`d in that file. Use `declare const baln: Sodax['migration']['balnSwapService']`.
- Guard: `scripts/check-execution-mode.mjs`, TypeScript AST (comments and strings ignored), resolves
  `typescript` from the package dir because the repo root has no `typescript` dependency. Run on
  `main` it reports the two `raw === false` sites (swap, bridge) and dozens of missing defaults.
- zsh gotcha while scripting: `$R:path` applies zsh modifiers (`:A`, `:s`…). Write `"${R}:path"`.
- Self-review: moved the `setSwapPreference` note from a `//` between JSDoc and signature into
  the JSDoc. Known limits: the check matches only `raw` / `.raw` and type params named `Raw` / `R`
  (a renamed destructure would slip; none today), and it cannot see a chain generic with nothing to
  infer from; only hand-kept type-test rows catch that. Cleaner `setSwapPreference` fix is to drop
  `K` like its three siblings, but that cascades into dapp-kit `useSetSwapPreference<K>`; follow-up.
- /simplify pass (4 agents): applied `Ok<P>` one-liner via `Result<infer V>`, rows call
  `sodax.migration.balnSwapService.*` directly (no `baln` handle), script drops the redundant
  `ScriptKind` arg, uses recursive `readdirSync`, and keys rule 2 on any `extends boolean` param
  (not the names `Raw`/`R`; still 2 + 60 hits on `main`, 0 on the branch). dapp-kit
  `useSetSwapPreference` / `UseSetSwapPreferenceVars` now default `K = HubChainKey` too (the demo
  calls the hook without type args). Skipped: dropping `K` (breaks explicit type args, which the
  PR promises still work) and the perf nits (script adds ~0.19 s to a ~6.6 s sdk `checkTs`).
- /code-review medium (7 findings) applied: rule 2 now requires the literal `= false` default and
  only checks class methods; rule 1 unwraps parentheses and catches `x['raw']` (`useLiteralKeys` is
  off in biome.json). `Ok<P>` is strict again (`: never`), BALN rows moved to `balnRows` with a direct
  `Awaited` assertion (mutation `EvmRawTransaction`→`Hex` fails tsc). `setSwapPreference` and
  `SetSwapPreferenceAction` now constrain `K extends HubChainKey` (no default); the dapp-kit hook and
  `UseSetSwapPreferenceVars` match. Skipped: checking functions / arrow props / interfaces (actions
  are class methods; `shared/guards.ts` type guards would be false positives). No changeset machinery;
  the hub-only `K` constraint goes in the PR body's Merge Danger.
- Pasted review finding (same contract in two places): the swap / bridge / money-market service
  tests repeated the central table's result-type assertions. Dropped the copies (and the imports
  only they used) in `9c41017c`; the Bitcoin omitted-raw runtime tests and the moved
  `@ts-expect-error` lines stay. MoneyMarketService.test.ts now has no diff against `main`.
  CI on `f69552c3` was green (19 pass, 1 skipping) before this push.
