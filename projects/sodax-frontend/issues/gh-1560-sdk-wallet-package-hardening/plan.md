---
type: plan
repo: sodax-frontend
github: 1560
updated: 2026-07-16
---

# Plan

## Goal

Close #1560 by dispositioning every finding against current sodax-sdks v2 source
and implementing only the finding that is genuinely open in code.

## Approach

1. Cross-reference all six #1560 findings against #1448's dispositioned 17-High
   list (verified against v2 source + `sodax-contracts`).
2. For overlaps → adopt #1448's disposition (accepted-risk), cross-link, no code.
3. For non-overlaps → verify current v2 source and classify (resolved-in-v2 vs
   open).
4. Implement the one open code item (WALLET-L-1) on a dedicated branch,
   `fix/security-audit-1560` in sodax-sdks, off `main`.

## Steps

- [x] Map #1560 ↔ #1448 (see outcome.md table).
- [x] Confirm WALLET-M-2 resolved by wallet-react v2 refactor (burner removed).
- [x] Confirm WALLET-L-2 largely refactored (`resolveNetwork`), residual only.
- [x] Fix WALLET-L-1 in **both** copies (wallet-sdk-core + @sodax/sdk) + tests.
- [x] Update consumer docs (SKILL.md, icon.md).
- [ ] Record accepted-risk / resolved-in-v2 dispositions on the #1560 GitHub issue.

## Verification

- `checkTs`, targeted `vitest`, and `biome check` on the touched files.
- Full `pnpm build` / `check:ai` is blocked by a pre-existing `@sodax/swaps-api`
  DTS-resolution failure in this checkout, unrelated to these changes.

## Risks

- Deployed app uses published 1.5.7-beta; "resolved on main" ≠ "resolved in the
  shipped beta" — confirm against the published package before sign-off.
- WALLET-L-1 adds a serialization queue + ~5 min timeout to the ICONEX path
  (minor behaviour change on the tx-send path; documented).
