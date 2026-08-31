---
type: brief
repo: sodax-sdks
github: 401
status: Active
next: await review on PR #402 (settings modal + swap-only staging fix + bridge/swap controls)
updated: 2026-08-31
---

# GH-401 Demo Sodax Settings Modal · brief

## State in five lines

- PR #402 (branch `fix/demo-staging-solver-submit`) now carries the staging submit fix,
  the full Sodax Settings modal, and the follow-up bridge/swap control pass (`0339bc7d3`).
- Issue #401 body expanded with the settings-modal scope (Robi's ask) and retitled.
- The modal now separates Swap SDK submit-tx and Bridge SDK submit-tx, adds a Bridge API base
  URL override, and labels which feature consumes each endpoint. The Production/Staging preset is
  explicitly named as swap-solver-only; bridge has no staging preset.
- Gates green (demo checkTs + Biome + pre-commit build/test); browser-verified modal copy and
  layout via the local demo.
- Flagged for review in the PR: `solverEnvironment` now persists across reloads (was: reset to
  Production); Sui "setState during render" warning on remount is pre-existing.

## Next action

Wait for Robi's review on PR #402. If asked, only remaining manual validation is a wallet-backed
end-to-end smoke across swap and bridge pages; the local UI/code gates are complete.

## Map

| Question | File |
| --- | --- |
| What was the original bug + expanded ask? | `issue.md` |
| How was it built (design, steps, risks)? | `plan.md` |
| What happened during the work? | `process.md` |
| Final result | `outcome.md` (empty until merged) |

## Key repo facts (verified 2026-08-25)

- `SodaxProvider` re-creates the SDK on config **reference** change (`SodaxProvider.tsx:24`);
  the demo keys the provider on `env + JSON.stringify(settings)` and `.clear()`s the
  module-level queryClient on change (quote keys carry no env/endpoint).
- Demo pre-commit hook runs full workspace build — commit with `TURBO_CONCURRENCY=2`, 600s
  timeout; commitlint rejects sentence-case subjects (lowercase after the type).
