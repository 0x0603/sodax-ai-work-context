---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-18
parent: plan.md
tags: [sdk, engineering-standards, code-quality]
---

# Engineering standards for the SODAX Auth build (S1–S9)

Referenced by number from `plan.md`, `plan-sdk-integration.md`, and
`plan-auth-api-security.md` instead of restated ad hoc in each. Every phase's
"audit gate" / "Definition of done" means: re-read the diff against S1–S9, not
a generic "looks fine" pass.

### Engineering standards (S1–S9) — cited by number from every phase above instead of restated ad hoc

Grounded in what's already enforced in these repos, not invented:

- **S1 — No escape hatches.** No `any`, `@ts-ignore`, non-null `!`, unsafe casts, in SDK or backend code alike (`sodax-sdks/AGENTS.md:101`). No reason for `auth-api` to be looser than the SDK repo.
- **S2 — One dispatch table per concern, never a scattered `switch`/`if-else` chain.** Precedent: `wallet-sdk-react/AGENTS.md` — *"`chainRegistry.ts` is the dispatch table for chain types... instead of scattering switch statements."* Applied to `wallet-auth-core`'s per-chain provider factory: one exhaustive discriminated union, compile-time `never`-checked default, not a growing `if (chainType === 'EVM')` ladder.
- **S3 — Discriminate state by `kind`, don't invent parallel boolean flags.** Precedent: the existing wallet-modal state machine (`closed → chainSelect → walletSelect → connecting → success|error`) and its own rule, verbatim (`wallet-sdk-react/AGENTS.md:86`): *"Surface raw `Error` objects; do not introduce a **wallet-modal-specific** error taxonomy without a broader design decision."* S3 generalizes that from the wallet modal to any feature surface in this build — the generalization is ours, not the source's. `SodaxAuthModal` follows the identical shape.
- **S4 — One writer per persisted resource.** Precedent: `useXWalletStore.ts`'s single-writer side effect (only `setXConnection` writes `walletProviders`); Mongo collection ownership is enforced one-collection-one-service (`auth_*` = `stateful-api` only, `wauth_*` = `auth-api` only — confirmed in `stateful-api/src/auth/auth.constants.ts`'s own comment: *"must match the ownership table... sole writer = stateful-api"*).
- **S5 — Provider/Hydrator/Actions separation stays intact.** Precedent: `wallet-sdk-react/AGENTS.md` — *"Actions should not write connection state directly."* `SodaxAuthXConnector` only writes state through the sanctioned `setXConnection`/`setWalletProvider` calls the existing connectors use.
- **S6 — Named constants, never duplicated literals.** Directly targets Bound's actual bug (KDF params duplicated as inline literals under two different naming conventions in two places).
- **S7 — Small, single-responsibility files, folder-per-concern.** Precedent: `wallet-sdk-core/src/wallet-providers/<chain>/{<Chain>WalletProvider.ts, types.ts, index.ts, *.test.ts}`.
- **S8 — Tests co-located; crypto test vectors are static, committed fixtures**, never regenerated at test time (would silently mask a determinism regression).
- **S9 — A file is only edited by the package/service that owns it.** Cross-package diffs (e.g. `wallet-auth-react` proposing a `chainRegistry.ts` change) are reviewed and merged as a change to the *owning* package, under its own `AGENTS.md`, by someone accountable for it — never folded silently into another package's PR. Same logic: `auth-api` must never depend on `wallet-auth-core`/`wallet-auth-react` (S9 also motivates a dependency-import lint rule banning that import, not just reviewer memory).

Every "audit gate" / "Definition of done" mention above means: re-read the diff against S1–S9, not a generic "looks fine" pass.

