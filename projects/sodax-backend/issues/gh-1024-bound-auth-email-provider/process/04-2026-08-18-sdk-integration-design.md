---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-18
updated: 2026-08-18
---

# 2026-08-18 (later) — SDK integration design session

Separate session, scope: how `sodax-sdks` (`wallet-sdk-react` specifically)
and `apps/demo` should offer SODAX Auth as a login option, and how
`sodax-backend` reuses the client-crypto logic. Worked directly against live
source of `sodax-sdks` and `sodax-backend` (both on disk under `sodax/`), not
docs. Full design written to `plan.md`'s new "Phase 3 — SDK integration"
section — this entry is the process log, not a duplicate of that content.

## What changed the design mid-session

- User required the client-crypto package be installable by `sodax-backend`
  directly (`pnpm add`, no special setup) — confirmed low-friction since
  `sodax-backend` already consumes `@sodax/sdk`/`@sodax/types` as plain npm
  deps across 7 apps today (`apps/api`, `apps/swaps-api`, `apps/task-executor`,
  `apps/sponsoring-api`, `apps/stateful-api`, `apps/bridge-api`,
  `apps/sodax-backend-dashboard`). This is what forced the 3-way package split
  (`keystore-crypto` zero-deps / `wallet-auth-core` / `wallet-auth-react`)
  rather than one bundled package — backend must never be forced to install
  `wallet-sdk-core`'s 9 chain SDKs just to reuse a few crypto functions.
- Two corrections found by direct source-reading, not assumption, that
  reversed earlier framing in this same session:
  1. `SodaxWalletConfig.<CHAIN>.connectors` replaces defaults, doesn't merge
     (`wallet-sdk-react/docs/CONNECTORS.md:216`) — a naive "just register a
     connector" helper would have silently deleted users' existing wallet
     options for any chain it touched.
  2. EVM/Solana/Sui bypass the `IXConnector`/`chainRegistry` mechanism
     entirely (`providerManaged: true`, driven by wagmi/wallet-adapter/
     dapp-kit hooks instead) — the "one connector type, works on all 9
     chains" pitch only holds for the other 6 chain families without further
     `wallet-sdk-react` core work. Scoped v1 to those 6, flagged EVM/Solana/Sui
     as fast-follow.
- Mid-session, the user relayed real operational feedback from the Bound team
  directly (Slack, verbatim quotes and a live `settings` collection JSON
  sample) — not something the earlier `radfi-be`/`radfi-web` source reading
  could have surfaced, since it's about production incidents, not code:
  AAGUID whitelisting for passkey authenticators (some Windows password
  managers can't reliably retrieve a passkey later) and a post-registration
  local PRF re-verification step (Bound tried a server-round-trip version of
  this and reverted it due to challenge-TTL expiry — informed the fix of
  making the re-verification purely local/client-side instead).

## Method

Used 3 parallel Explore agents for initial `sodax-sdks` reconnaissance
(`wallet-sdk-core`, `wallet-sdk-react`, repo-wide conventions/branches/deps),
then direct file reads for `apps/demo`'s wiring and a `Plan` agent to turn the
accumulated findings into an execution-ready phased plan — whose two most
consequential claims (the two corrections above) were independently
re-verified by hand against `chainRegistry.ts` and `docs/CONNECTORS.md`
before being trusted, per this workspace's own "read the code, not the docs"
discipline (which the original 2026-08-12/2026-08-18 backend research passes
already established are necessary here, not optional).

## Changes During Work

None to scope — this session extended Phase 2 (build) with the SDK-side
detail Phase 2 always implied ("Client integration is nearly free", "Connector
+ frontend wiring") but hadn't actually verified against `wallet-sdk-react`
source until now.
