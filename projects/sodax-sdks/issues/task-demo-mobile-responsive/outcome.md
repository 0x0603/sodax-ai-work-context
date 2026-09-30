---
type: outcome
repo: sodax-sdks
github: 
status: Committed locally — push/PR awaiting user go-ahead
updated: 2026-09-30
---

# Outcome

- PR: not opened yet (waiting for the user's go-ahead).
- Commits: `sodax-sdks` `7711e93b` fix(demo): make every demo page usable on phones
  (branch `fix/demo-mobile-responsive`, 52 files, +392/−259, signed, pre-commit
  checkTs/build/test green on Node 24).
- Tests: demo has no unit tests; verification is the Playwright harness below.

## Summary

Every `apps/demo` route is usable from 360px up; desktop (≥1280px) renders as on
`main`. UI only: class edits plus `MobileNav`, the tap-to-open tooltip and the oracle
chart's scroll wrapper.

## Verification results (harness in `artifacts/harness/`)

| Check | `main` | branch |
| ----- | ------ | ------ |
| Page-level horizontal overflow, 13 routes × 360/390/768/1024, no wallet | 39/52 (every route at 360/390/768) | 0/52 |
| Same, stubbed EIP-6963 wallet connected | — | 0/52 |
| Settings modal, wallet sheet, nav sheet, Select list inside viewport | Settings/wallet off-screen at 360/390 | all widths OK; nav sheet lists 13 routes, closes on navigate |
| Swap review dialog at 360×740 | — | 16px gutters, fits, scrolls vertically, no sideways overflow |
| ⓘ tooltip on touch | tap does nothing | tap opens, 2nd tap / tap outside closes |
| ⓘ tooltip with mouse | hover opens, click closes | identical |
| Desktop pixel diff 1280/1440, no wallet (network replayed from `main`) | — | 25/26 identical; 1 = live value (LTV 81.95% vs 81.94%) |
| Desktop pixel diff 1280/1440, wallet connected | — | 23/26 identical; 3 at 1440 = data (a balance value on both swap pages, bnUSD icon failed to load on the baseline) |

Key screenshots: `artifacts/screens/`.

## What Changed

See `plan.md` §Changes; deviations from the plan are listed in `process.md`
§Changes During Work.

## Follow-ups

- Not tested: real wallet on a real phone (signing flows, keyboard over dialogs).
- CandleChart OHLC values are SVG `<title>` hover text only (no touch access).
- `autoFocus` on chain/token search inputs opens the phone keyboard (prop change).
- Pre-existing, untouched: duplicate React key `SUI-Slush` in the wallet list; biome
  findings in `wallet-item.tsx:99` and `SupplyAssetsList.tsx:15`; `/fonts/*.ttf` 404s;
  "Select is changing from uncontrolled to controlled" warnings.
