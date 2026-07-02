---
type: plan
repo: sodax-sdks
github: 265
updated: 2026-07-02
---

# Plan

## Goal

Make the canonical SDK documentation factually match current `sodax-sdks`
source, expose the complete intended public package/feature surface through the
existing `docs.sodax.com` sync pipeline, and give integrators an accurate,
constructive answer about testnet availability.

The implementation should leave a repeatable verification path. A one-time
manual rewrite without source/docs guards would recreate the same drift after
the next API change.

## Baselines

- SDK analysis baseline: `icon-project/sodax-sdks@c5953c82`
- Public docs analysis baseline: `icon-project/sodax-document@f348e35b`
- Last SDK revision synced downstream: `ff3ef17f` (2026-06-10)

Before implementation, fetch/rebase onto the latest `origin/main`, record the new
baseline in `process.md`, and repeat the inventory/diff steps below. Do not build
the implementation on the shared checkout's current branch if it is unrelated
or dirty.

## Non-goals

- Do not implement the standalone Mintlify/API playground requested by #182.
- Do not manually maintain the environment/token matrices requested by #212.
- Do not change runtime behavior merely to make an existing document true. If
  docs expose a code defect, file or scope a separate code fix and document the
  current behavior accurately here.
- Do not promote `@sodax/libs` or `@sodax/assets` as consumer integration
  packages. The former is internal and the latter is private/static.
- Do not add AI-tool attribution to commits or PR descriptions.

## Source-of-truth hierarchy

Every edited claim must cite or be checked against the owning source:

| Claim | Source of truth |
| --- | --- |
| Package status, engines, peer deps, exports | `packages/*/package.json`, root `package.json` |
| SDK facade/services | `packages/sdk/src/shared/entities/Sodax.ts`, `packages/sdk/src/index.ts` |
| Method signature and return type | Owning service/hook source and public barrel |
| Error codes/guards/context | Owning `errors.ts`, shared error wrappers, tests |
| Chain/environment support | `packages/types/src/chains/chain-keys.ts`, `chains.ts`, feature support lists |
| Config/options | `packages/types/src/sodax-config/sodax-config.ts`, `ConfigService`, constructor tests |
| dapp-kit hooks | `packages/dapp-kit/src/hooks/index.ts` and feature barrels/source |
| Wallet providers/connectors | wallet package public barrels, registries, config types, tests |
| Runnable examples | `apps/demo`, `apps/node`, example app, and compile fixtures |
| Public publication mapping | `sodax-document/sync-sodax-sdks.sh` and `SUMMARY.md` |

Tests prove behavior where prose/JSDoc and implementation disagree. Do not use
the existing public docs as evidence for another doc claim.

## Deliverables and publication map

### Existing pages to audit and retain

| Public area | Canonical `sodax-sdks` source | Downstream destination |
| --- | --- | --- |
| Foundation package | `packages/sdk/README.md` | `developers/packages/foundation/sdk/README.md` |
| Swaps | `packages/sdk/docs/SWAPS.md` | functional modules / `swaps.md` |
| Money market | `packages/sdk/docs/MONEY_MARKET.md` | functional modules / `money_market.md` |
| Bridge | `packages/sdk/docs/BRIDGE.md` | functional modules / `bridge.md` |
| Staking | `packages/sdk/docs/STAKING.md` | functional modules / `staking.md` |
| Migration | `packages/sdk/docs/MIGRATION.md` | functional modules / `migration.md` |
| Backend API | `packages/sdk/docs/BACKEND_API.md` | tooling modules / `backend_api.md` |
| Intent relay API | `packages/sdk/docs/INTENT_RELAY_API.md` | tooling modules / `intent_relay_api.md` |
| Existing How-to set | `CONFIGURE_SDK`, `ESTIMATE_GAS`, `HOW_TO_MAKE_A_SWAP`, `MONETIZE_SDK`, `WALLET_PROVIDERS`, `STELLAR_TRUSTLINE`, endpoint docs, Next.js, Bitcoin | existing How-to/deployment destinations |
| Connection packages | wallet package READMEs | `developers/packages/connection/*.md` |
| dapp-kit | `packages/dapp-kit/README.md` | `developers/packages/experience/dapp-kit.md` |
| AI integration | `docs/ai-integration-guide.md` | `developers/ai-integration/README.md` |

### Pages to publish or create

| Area | Source action | Recommended public placement |
| --- | --- | --- |
| DEX | Audit existing `packages/sdk/docs/DEX.md` | Foundation / Functional Modules |
| Leverage Yield | Audit existing `LEVERAGE_YIELD.md`; keep `LEVERAGE_YIELD_APR.md` as a linked technical companion | Foundation / Functional Modules |
| Swaps API v2 | Audit existing `SWAPS_API.md` | Foundation / Tooling Modules, beside Backend API |
| Logging | Audit existing `LOGGING.md` | How-to or SDK tooling/configuration |
| Recovery | Create `packages/sdk/docs/RECOVERY.md` from `RecoveryService`, tests, and dapp-kit/demo usage | Foundation / Functional Modules |
| Analytics | Create `packages/sdk/docs/ANALYTICS.md` from `AnalyticsOption`, resolver behavior, event types, and instrumentation tests | How-to / Configure Analytics |
| `@sodax/skills` | Audit/enrich `packages/skills/README.md`; reuse it rather than creating a duplicate | Experience Layer / `@sodax/skills` |
| Testnet answer | Create `packages/sdk/docs/TESTNET.md` | How-to / Testnet Availability |
| FAQ | Add `docs/faq.md` as canonical SDK-repo source, starting from the current audited FAQ and adding the concise testnet answer | `developers/faq.md` |

### Deliberately non-primary package pages

- Audit `packages/types/README.md` for repository/npm correctness, but do not
  present `@sodax/types` as a normal extra dependency. Explain that public types
  are re-exported through `@sodax/sdk` wherever it is mentioned.
- Keep `@sodax/libs` internal and `@sodax/assets` private/static. Their READMEs
  remain repository-maintainer docs, not `docs.sodax.com/developers/packages`
  navigation items.

## Detailed implementation phases

### Phase 1 — freeze an auditable inventory

1. Create a clean issue branch from the latest `origin/main`.
2. Record the SDK commit, docs-repo commit, and downstream submodule pointer.
3. Inventory all Markdown/MDX under:
   - root and `docs/`
   - `packages/*/README.md`
   - `packages/sdk/docs/`
   - `packages/wallet-sdk-react/docs/`
   - `packages/dapp-kit/src/**/README.md`
   - `packages/skills/**`
4. Classify each file:
   - public current-version docs
   - migration/history docs (legacy names are expected)
   - maintainer/internal docs
   - generated or downstream-synced copies
5. Build a checklist with one row per public page and these columns:
   owner, public URL, source file, exported surface, code references, findings,
   fix status, snippet/link verification, downstream sync status.
6. Diff from the last downstream submodule revision to the chosen baseline. Any
   added/removed public method, service, hook, package, config option, error code,
   or support list becomes an explicit audit item.

This classification prevents migration docs from producing false positives for
old v1 names and prevents internal packages from being promoted accidentally.

### Phase 2 — audit the canonical SDK/package docs against code

#### 2.1 SDK facade and package overview

- Reconcile `packages/sdk/README.md` with `Sodax.ts`, `src/index.ts`, package
  engines/exports, and the intended docs navigation.
- Add the missing `dex`, `leverageYield`, `partners`, `recovery`, and Swaps API
  surfaces or link to their standalone pages.
- Correct Node/package-manager requirements and repository/license links.
- Avoid volatile hard-coded chain counts. If a chain list is valuable, derive it
  from `ChainKeys`/feature support data or point to a generated reference.

#### 2.2 SDK functional modules

For each of Swaps, Money Market, Bridge, Staking, Migration, DEX, Leverage Yield,
Partner/Monetization, and Recovery:

1. Enumerate public methods from the owning service and barrel.
2. Compare documented parameter names, generic/raw-mode constraints, return
   shapes, default timeouts, partner-fee behavior, and orchestration steps.
3. Compare error tables with the owning error unions/guards and wrapper tests.
4. Compare per-chain support with feature support lists and code branches; do not
   infer feature support from wallet-provider support.
5. Validate examples against source types and a real demo/node usage when one
   exists.
6. Link advanced companion docs instead of duplicating large sections.

Apply the already-confirmed fixes, especially the Bitcoin raw-mode and invalid
`SodaxProvider testnet` claims.

#### 2.3 Tooling/configuration modules

- Reconcile Backend API and Swaps API methods with both service classes and API
  schemas.
- Reconcile `CONFIGURE_SDK.md` with the complete `SodaxOptions` shape, including
  `analytics`, `logger`, `fee`, feature overrides, and `swapsOptions`.
- Add `sodax.leverageYield` and the `sodax.api` alias/`api.swaps` surface to the
  service table.
- Verify logging defaults/coverage against `resolveLogger` and logger tests.
- Document analytics as opt-in/off-by-default, tracker failure isolation,
  feature/action allowlist semantics, detail level, and event shape directly
  from analytics types/tests.

#### 2.4 React and wallet packages

- Derive dapp-kit sections from its feature barrels. Add leverage-yield, newer
  partner, newer Bitcoin, and any missing Swaps API hooks; remove hard-coded hook
  counts unless generated.
- Verify hook call signatures and mutation variables from source, not from older
  skill docs.
- Audit wallet-sdk-core provider/config tables against its public barrel and
  provider config unions.
- Audit wallet-sdk-react README/topic docs against `chainRegistry`, config types,
  hook exports, connector subpaths, and peer dependencies.
- Correct the public package overview: dapp-kit provides hooks, contexts, and
  utilities; do not advertise a general component library that is not exported.

#### 2.5 Skills and duplicate AI docs

- Run the existing six `packages/skills` checks after any SDK-doc correction that
  changes public behavior; update skills only when the audited source proves
  they are wrong.
- Make `docs/ai-integration-guide.md` the canonical AI integration content.
- Replace the unguarded manual `docs/index.mdx` duplication with either:
  - a generated copy plus a check that fails on drift, or
  - a thin Mintlify wrapper/import if the platform supports it reliably.
- Do not expand the full Mintlify navigation in this issue without coordinating
  with #182.

### Phase 3 — create the missing standalone pages

#### 3.1 Recovery

Create `RECOVERY.md` with:

- when recovery is appropriate and when it is not
- `sodax.recovery` public methods and their exact params/returns
- raw vs signed behavior and required wallet provider
- hub asset discovery and destination constraints
- error handling using current typed errors/context
- a source-backed example, preferably mirrored by dapp-kit/demo usage

#### 3.2 Analytics

Create `ANALYTICS.md` with:

- explicit opt-in and default disabled behavior
- `AnalyticsConfig`, tracker callback, `level`, and `features` allowlist
- `start`/`success`/`failure` event phases and stable fields
- fire-and-forget/failure-isolation behavior
- privacy guidance: consumers own the tracker and payload handling; do not claim
  SODAX collects data when no tracker is configured
- minimal Segment/Amplitude/PostHog-style adapter examples without adding new
  SDK dependencies

#### 3.3 Testnet How-to

Create `TESTNET.md` with searchable headings that answer all issue phrasings:

- Is SODAX on testnet?
- Does SODAX have a testnet?
- Why is SODAX not available on testnets?
- Can I integrate SODAX on testnet?

Required content structure:

1. **Short answer:** there is no supported end-to-end SODAX testnet integration
   in the current SDK.
2. **What that means technically:** current SODAX chain keys/configs are
   mainnet-only; a cross-chain feature also depends on deployed hub/spoke
   contracts, relay, solver/backend, token config, and liquidity, not only an RPC.
3. **Important distinction:** wallet SDKs may connect/sign on some underlying
   testnets and infrastructure may expose test endpoints, but this does not make
   swaps/bridge/MM/staking an end-to-end supported SODAX testnet.
4. **Useful next steps:**
   - build and unit-test UI/orchestration with mocked wallet providers and
     mocked `Result` values;
   - use `raw: true` and gas estimation where the specific SDK method supports
     it to validate transaction construction without broadcasting;
   - test wallet connection/signing separately on a chain testnet, labelled as
     wallet-layer validation only;
   - use read-only config/quote flows or the maintained demo where appropriate;
   - follow the team-approved controlled-mainnet/contact path for final E2E.
5. **Limitations:** raw mode is method/chain-specific and must not be promised
   universally; no testnet funds can complete a mainnet SODAX flow.

The reason/cost/product wording and the final recommended mainnet/contact CTA
must be reviewed by the issue stakeholders (including the requester cited in
the issue). Code proves availability, not business rationale.

#### 3.4 Canonical FAQ

- Move/copy the current downstream FAQ into `sodax-sdks/docs/faq.md` and audit
  its existing code claims in the same pass.
- Add a short testnet question near setup/integration questions:
  direct answer, protocol-vs-wallet distinction, and link to `TESTNET.md`.
- Change downstream ownership documentation so future syncs do not overwrite a
  manually edited FAQ unexpectedly.
- Remove workshop/TODO prose before publication.

### Phase 4 — restore preventive documentation checks

The current main branch protects `packages/skills` but not the complete public
Markdown surface. Add a scoped repo-level docs gate instead of relying only on
review discipline.

Minimum checks:

1. **Local link/file validation** for public Markdown and downstream navigation.
2. **Public symbol/import validation** for `@sodax/*` examples and references.
3. **Selected snippet typechecking** for complete quickstarts and newly added
   pages. Mark partial/pseudocode fences explicitly so they are not treated as
   standalone programs.
4. **Known stale-pattern check** outside migration/history docs:
   removed props/imports/paths, old chain constants, obsolete spoke-provider
   APIs, and source-repo URLs.
5. **Documentation manifest coverage:** every intentionally public `Sodax`
   service/package is either mapped to a page or explicitly excluded with a
   reason. This catches newly added services/packages.
6. **AI page parity:** fail if canonical `ai-integration-guide.md` and its
   Mintlify rendering source drift.

Prefer a root `pnpm check:docs` wired into CI. Reuse the source-aware logic from
the historical PR #84 guards or the current skills scripts where applicable,
but keep public human docs and agent knowledge as distinct input sets.

### Phase 5 — update and run the downstream GitBook sync

Implement after the canonical `sodax-sdks` PR is merged or pin the downstream
submodule to its reviewed commit.

In `icon-project/sodax-document`:

1. Update `sync-sodax-sdks.sh` mappings for DEX, Leverage Yield/APR, Swaps API,
   Logging, Recovery, Analytics, Testnet, Skills, and canonical FAQ.
2. Keep source filenames stable and map destination paths explicitly; do not
   depend on case-insensitive filesystems.
3. Update `SUMMARY.md` under the existing Foundation/Connection/Experience and
   How-to groups.
4. Update `CLAUDE.md` ownership lists: the FAQ becomes synced content, and all
   new generated destinations must be listed as non-manual-edit pages.
5. Make link rewriting idempotent and extend it only for real cross-repo path
   differences. Prefer correct absolute links in canonical sources where a link
   must work in both repositories.
6. Run the sync from a clean clone/submodule state. A second run must produce no
   additional diff.
7. Review generated changes, including deletion of obsolete copies and the
   submodule pointer, before committing.

Recommended PR sequence:

1. `sodax-sdks`: canonical docs, missing pages, and docs guards.
2. `sodax-document`: sync-script/navigation changes plus generated output pinned
   to PR 1's merged commit.

Cross-link both PRs to issue #265. Do not hand-edit generated destination pages
to fix content that belongs upstream.

### Phase 6 — verification

#### SDK repository

Run at minimum:

```bash
pnpm check:docs
pnpm check:ai
pnpm check:ai-dev-files
pnpm lint
pnpm checkTs:packages
pnpm build:packages
```

- `check:ai-dev-files` is required only if guidance files change, but running it
  is cheap and catches accidental structure issues.
- Full runtime tests are not automatically required for prose-only changes.
  Run targeted tests for any source-aware checker, generated manifest, or code
  behavior touched during the work.
- Typecheck every complete code sample selected by the docs manifest.

#### Downstream docs repository

- Run the SDK sync in a clean checkout.
- Run it twice and assert the second run is idempotent.
- `git diff --check`.
- Verify every `SUMMARY.md` target exists with exact case.
- Scan generated Markdown for broken relative links and missing anchors.
- Build/open the GitBook preview and check the new package, feature, How-to, and
  FAQ routes.
- Smoke-check the live URLs after merge/deploy.

#### Content acceptance review

- Engineering reviewer verifies every changed API claim against the cited source.
- Product/docs reviewer approves the testnet rationale and CTA.
- Verify the short FAQ answer and long How-to do not contradict each other.
- Verify neither page implies that wallet testnet support equals protocol
  testnet support.

## Definition of done

- The page inventory accounts for every current public service and intended
  consumer package.
- All confirmed drift and all additional audit findings are fixed in canonical
  upstream files.
- DEX, Leverage Yield, Swaps API, Logging, Recovery, Analytics, Skills, and
  Testnet content have deliberate standalone sources and navigation decisions.
- The current SDK does not advertise an unsupported end-to-end testnet, while
  still giving readers concrete ways to evaluate/integrate safely.
- The FAQ answer links to the long How-to page.
- The two-repository sync is reproducible, idempotent, previewed, and pinned to
  the audited SDK revision.
- `check:docs` and existing AI/dev checks pass in CI.
- Issue #182 and #212 work remains separate and is referenced rather than
  duplicated.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Main moves during the audit | Record baseline, rebase once before final audit, rerun diff from last synced revision |
| Shared working tree changes underneath the task | Use a clean branch/worktree or immutable archive of the selected commit |
| GitBook and Mintlify sources diverge | Keep canonical Markdown explicit; guard/generated wrapper for Mintlify; do not expand platform scope here |
| Low-level testnet options are mistaken for protocol support | Put the distinction in both How-to and FAQ; verify against chain/config sources |
| Business rationale is invented from code | Require stakeholder approval for the “why” and CTA |
| Large doc audit misses method drift | Source-derived manifest plus public symbol/snippet/link checks |
| Downstream manual edits are overwritten | Document ownership and copy only from canonical SDK sources |
| New feature branches merge before completion | Repeat facade/package diff and docs-manifest coverage check after rebase |
