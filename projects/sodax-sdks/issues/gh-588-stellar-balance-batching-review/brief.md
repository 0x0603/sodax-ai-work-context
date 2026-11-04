---
type: brief
repo: sodax-sdks
github: 588
status: Reviewed
next: Wait for Robi to re-check e181f0b9 on PR #590, then merge.
updated: 2026-11-04
---

# GH-588 Stellar balance batching review

## State

Robi reviewed PR #590: on a Horizon 404 every token read as zero, including custom Soroban tokens such as legacybnUSD that an unfunded address can hold. Fixed in e181f0b9 (pushed 2026-11-04): on 404 only XLM and classic assets read zero, custom tokens are still simulated with a sequence-0 stand-in source. Tests and checks pass.

## Next action

Wait for Robi to re-check e181f0b9 on PR #590 (the 404 point came on Discord, no PR thread), then merge.

## File map

| Question | File |
| --- | --- |
| Source issue and review boundary | `issue.md` |
| Review approach | `plan.md` |
| Reproduction, verification, and the 2026-11-04 fix | `process.md` |
| Earlier review finding and follow-up | `outcome.md` |
