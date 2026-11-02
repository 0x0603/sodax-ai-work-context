<!-- sodax-sdks coding standards. The console writes them to plans/coding-standards.md before each step; the Standards step
fixes the diff to them, reviews check against them, and the retro proposes changes you adopt at "You approve the
standards change". Mined from review comments (people, Codex, Copilot) on merged PRs, 2026-11-02. Edit from the console
(⋯ → Edit coding standards); run scripts/setup-team-ui.sh --export after, to sync. -->
# Coding standards: sodax-sdks

Apply the repo's rules first: `AGENTS.md` (Dependency Direction, Repo-Wide Rules, Working Rules); the touched package's `AGENTS.md` (sdk: Service Pattern, Errors And Results; types: Rules; dapp-kit: Hook Shapes, Query And Mutation Keys; wallet-sdk-*: Provider Pattern); `docs/AGENTS.md` Non-negotiables; `packages/skills/AGENTS.md` Editing rules; `review-core-sdk` §3. Below is only what reviews keep repeating and no gate catches. `#N` = gosodax/sodax-sdks PR.

## Rules

1. Chain-specific logic goes in the spoke service or wallet provider, not a feature service. Why: R0bi7 changes-requested #167, #372, #214. Spot: `chainKey === ChainKeys.X` added to `packages/sdk/src/<feature>/*Service.ts`.
2. No literals for values a caller may change (URL, timeout, retries, wait ms). Name them `DEFAULT_*` / `<CHAIN>_DEFAULT_*` and take an override; never replace a configured value with a literal. Why: #72, #167, #372; #371.
3. Each wait has one elapsed-time budget and honours the caller's timeout or AbortSignal. A timed-out queued request frees its slot. Why: #586 (10 tries took 313 s, not 15 s), #261, #299, #371, #405. Spot: attempt loops with sleep, fetch with no signal.
4. Fail closed: an error never becomes `0n`, `[]`, "unavailable", ready or `ok: true`, and 401/403 stays terminal. Why: #480 (rejected RPC batch reported 0n), #455, #504, #586, #405, #468. Spot: a `catch` that returns a default, an ignored query `error`.
5. Report success only from a known on-chain result: check the receipt `status`, not just that it arrived. Why: #374, #301, #490, #504.
6. Keep wallet roles apart: personal vs Bitcoin trading wallet, user vs derived hub wallet, sender vs recipient, hub vs spoke token address. Why: #374, #442, #402, #405 (this bug left funds stuck in production).
7. Amounts stay bigint in one decimals base: no float math, no `BigInt()` on decimal strings, no rescale to 0n, and fee bps checked against the documented cap. Why: #374 (10,000 accepted vs 100 bps cap), #513, #461, #402.
8. Address lookups compare EVM addresses case-insensitively and also match `chainKey`, because one EVM address exists on several chains. Why: #280, #438, #402.
9. Validate or type-guard untrusted data (API body, postMessage, storage, env, argv); never cast it with `as T`. Why: #257, #301, #474, #364.
10. No new `any`, `!` or `@ts-ignore` in sdk, dapp-kit or wallet-sdk-*. Lint is off there (`packages/sdk/biome.json:12,15`), though `AGENTS.md:120` forbids them.
11. A removed or renamed export or field, a changed signature or a flipped default needs `type(scope)!:` in the PR title (release notes read only that, `scripts/release.mjs:23-24`) and a migration line. Prefer additive: append to registries, keep a deprecated alias. Anything docs name must be exported from `src/index.ts`. Why: #432 (fields removed, no `!`), #367, #374 (mid-list insert), #369, #360.
12. Docs, skills and JSDoc change with the code and match it. No exact counts, no hand-written chain or token lists. Why: mismatches in about 27 PRs (#391, #370, #374, #432); counts in #162, #326, #421, #449.
13. Comments are 1-2 lines and give only the non-obvious why. Delete stale or orphaned JSDoc. Why: #372 ("shorten those insanely long comments made by AI"), #459, #374, #259.
14. Reuse, don't copy. No second implementation of an existing flow, no single-use wrapper; use the feature's invariant (`swapInvariant`). Why: #512 (about 110 lines copied from SwapService), #145, #259, #72.
15. Revert files outside the task (personal configs, task checklists, drive-by formatting). Why: #412, #442, #473, #490.

## Tests

- Vitest, with tests beside the code in `src/**/*.test.ts`. The live e2e suite is advisory. Tests are typechecked, and every `as unknown as` needs a why-comment.
- Test through the public interface:
  - `new Sodax(opts)`, then `sodax.<feature>.<method>()`, which returns `Result`.
  - The `SpokeService` for spoke code.
  - The package barrel for types.
  - The client with a fake `fetch` for the API packages.
  - Hooks or `get*QueryOptions` with a fake `sodax` for dapp-kit.
  - Mock only I/O seams: wallet providers, HTTP services, RPC.
- Tautological: a test that asserts a constant equals its own literal. Examples: `NearSpokeService.test.ts:704-708` (the same pattern is in five other spoke tests) and `hubChainBinding.test.ts:102`. Test the behaviour instead: with fake timers, check that polling stops at the timeout.
- Structure-sensitive: a test that reads source text or pins wiring. Examples: `useActivateStellarAccount.test.ts:9-29` counts `invalidateQueries` with a regex, and `Sodax.test.ts:278-300` checks constructor arguments. Test the effect instead. `_mutationContract.test.ts` is the one documented exception.
- Over-mocked: `Sodax.test.ts:68-125` fakes all 12 services, and `SwapService.test.ts:2995-3007` stubs `createIntent` on the service under test. Never stub the SUT's own methods. When a path has a silent fallback (`swap()` falls back to the client relay), assert the captured request, not the outcome.
- New behaviour needs its failing edge: rejection, timeout, partial fill, boundary ±1 (`tasks/lessons.md` L3, L10).

## Merge danger

One-way (read closely):
- `packages/*/src/index.ts`, `exports`, and exported types, fields and defaults: the published API, used by the backend, the frontend and partners.
- `packages/types/src/chains/{chains,tokens,chain-keys}.ts`, `swap/swap.ts`, `hooks/hooks.ts`, `common/constants.ts`, money-market lists: addresses, routing and endpoints. Registry order is a compatibility contract.
- Funds and signing:
  - `packages/sdk/src/shared/services/{spoke,erc-20}/**`, `Permit2Service.ts`, `shared/utils/shared-utils.ts`
  - The approve, intent and withdraw paths under `packages/sdk/src/<feature>/`
  - `packages/wallet-sdk-core/src/wallet-providers/**`
- `packages/sdk/src/shared/config/ConfigService.ts`: defaults.
- Release and gates:
  - `scripts/{release,config-version,publish-dist-tag}.mjs`, `bump-versions.sh`, `CONFIG_VERSION`
  - `.github/{workflows,scripts}/**`, `scripts/check-*.mjs`, `docs-pages-map.json`
  - `biome.json` overrides, cast baselines, `.gitleaks*.toml`, `osv-scanner.toml`
- `docs/docs.json`: public URLs.
- `pnpm-workspace.yaml`, the lockfile and `patches/**`: supply chain.
- `apps/playground/src/lib/activity.ts`: the widget's storage keys. #459 orphaned unsettled swaps.

Two-way (skim): `apps/demo`, `apps/*-example`, tests, doc page edits (not renames), `packages/skills/**` (still fact-check them), `AGENTS.md`, `.claude/skills/**`, refactors with no change to exports or behaviour. Read `apps/node` only for secrets.
