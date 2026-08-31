---
type: brief
repo: sodax-sdks
github: 401
status: Active
next: await Robi's review on PR #402; two product decisions still open (see Next action)
updated: 2026-08-31
---

# GH-401 Demo Sodax Settings Modal · brief

## State in five lines

- PR #402 (branch `fix/demo-staging-solver-submit`) carries the staging submit fix, the full Sodax
  Settings modal, and the bridge/swap control pass. Last **pushed** commit: `e61a2670c`.
- Last pushed commit `8b5b98306`: the modal regrouped by feature (Swap SDK · Bridge SDK · Partner
  fee · API endpoints); a global partner-fee pair (`partnerFeeAddress` + `partnerFeeBps` →
  `SodaxOptions.fee`); that one setting also seeds the per-request `partnerFee` on the Swaps API and
  Bridge API pages via the new `components/shared/PartnerFeeFields.tsx`; hints on the two contract
  rows. Working tree clean.
- CI on the pushed head is green across the board; PR is `BLOCKED` only on `REVIEW_REQUIRED` — no
  human review submitted yet (the `R0bi7-sodax-worker` runs are issue comments, not reviews, and
  their findings were fixed in `5de40cb37` / `1a2a87e15`).
- Gates for the uncommitted work: demo `checkTs` + Biome on changed files, plus a Playwright pass
  over the local demo (sections render, fee validation fires, a valid pair persists).
- Flagged for review in the PR: `solverEnvironment` now persists across reloads (was: reset to
  Production); Sui "setState during render" warning on remount is pre-existing.

## Next action

Wait for Robi's review on PR #402. Two product decisions are parked with the user, both deliberately
kept out of `8b5b98306`:

1. Should the demo ship SODAX's own fee as the modal default (`0x93D5CE288b3BF6b33F913b98FD1fA844Acc462d4`
   / 0.1%, matching `sodax-frontend/apps/web/providers/constants.ts:26-29`), or stay empty?
2. `DEPOSIT_PARTNER_FEE` on the leverage-yield page is 10 bps (0.1%) while its own comment and
   `apps/demo/AGENTS.md` both say 1%. The frontend constant carries the same value with a correct
   `10 bps = 0.1%` comment, so the demo's prose is near-certainly the wrong half — but changing
   either needs the user's word.

Remaining manual validation is a wallet-backed end-to-end smoke across swap and bridge.

## Map

| Question | File |
| --- | --- |
| What was the original bug + expanded ask? | `issue.md` |
| How was it built (design, steps, risks)? | `plan.md` |
| What happened during the work? | `process.md` |
| Final result | `outcome.md` (empty until merged) |

## Key repo facts

Verified 2026-08-31:

- **`ConfigService.initialize()` is a no-op.** The dynamic backend-config fetch + re-layer is
  commented out (`ConfigService.ts:158-185`, `TODO(config-v2)`), so a constructor-merged override
  is never clobbered — this is *why* the modal's `solver.*` overrides work at all. When config v2
  goes live, the override-preserving line is the commented
  `mergeSodaxConfig(response.config, this.userConfig)` at `:171-173`, and `userConfig` is today
  "accepted but unused" (`:137-138`). Re-verify it before that switch flips.
- Staging and production presets carry **identical** intents contracts
  (`apps/demo/src/constants.ts:19-27`); only `solverApiEndpoint` differs.
- `BridgeService` never reads solver config — bridge backend submit-tx goes via `BridgeApiService`
  on the gateway (`baseApiConfig`), so the swap solver env cannot move it.
- Partner fee cap is `FEE_PERCENTAGE_SCALE = 10000` bps (`shared-utils.ts:113`); the
  `common.ts:53` "Maximum allowed is 100 (1%)" comment is **stale**, and the 100-bps cap in
  `BridgeCard.tsx` is the backend's. `SodaxOptions.fee` never reaches the Swaps/Bridge API routes
  (`backendApiV2.ts:79`) — those take a per-request `partnerFee`.

Verified 2026-08-25:

- `SodaxProvider` re-creates the SDK on config **reference** change (`SodaxProvider.tsx:24`);
  the demo keys the provider on `env + JSON.stringify(settings)` and `.clear()`s the
  module-level queryClient on change (quote keys carry no env/endpoint).
- Demo pre-commit hook runs full workspace build — commit with `TURBO_CONCURRENCY=2`, 600s
  timeout; commitlint rejects sentence-case subjects (lowercase after the type).
