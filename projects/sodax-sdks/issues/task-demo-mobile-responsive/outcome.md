---
type: outcome
repo: sodax-sdks
github: 
status: PR open
updated: 2026-09-30
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/494
- Commits: `sodax-sdks` `cd4ab4bf` fix(demo): polish swap balance, partner-fee contrast and
  mobile table scroll (serif fallback from a missing font, dark-theme cream text on white,
  missing page padding, nested 500px scroll box on phones).
- `sodax-sdks` `33dbba28` feat(demo): move Oracle into the More menu (one-line
  header now ~991px disconnected / ~1051px connected; `lg` inner is 992px, so `xl` stays).
- `sodax-sdks` `591077c8` feat(demo): move Staking and Dex into the More menu
  (header nav + mobile sheet; one-line header now needs ~1124px connected, so `xl` stays).
- `sodax-sdks` `f6e516ad` fix(demo): make every demo page usable on phones
  (branch `fix/demo-mobile-responsive`, 52 files, +392/−259, signed; pre-commit
  checkTs/build/test green on Node 24 before a clean rebase onto docs-only main commits).
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
| Every route at 320px | — | 0/13 overflow; logo no longer covered (fixed in `42720626`) |
| MM Supply modal, Swaps API + Limit Order dialogs, leverage token + eMode menus, 320/360/390, wallet | — | all inside viewport, nothing clipped (token picker fixed in `42720626`) |
| Swap status panel, injected long hashes + long error, 320/360/390 | — | no overflow |
| Desktop pixel diff 1280/1440, wallet connected | — | 23/26 identical; 3 at 1440 = data (a balance value on both swap pages, bnUSD icon failed to load on the baseline) |

Key screenshots: `artifacts/screens/`.

## What Changed

See `plan.md` §Changes; deviations from the plan are listed in `process.md`
§Changes During Work.

## Follow-ups

- Not tested: real wallet on a real phone (signing flows, keyboard over dialogs); states
  that need real funds or positions (MM borrow/withdraw/repay modals, staking dialogs,
  leverage close/adjust controls, recovery table with assets, BTC fund/withdraw).
- CandleChart OHLC values are SVG `<title>` hover text only (no touch access).
- `autoFocus` on chain/token search inputs opens the phone keyboard (prop change).
- Pre-existing, untouched: duplicate React key `SUI-Slush` in the wallet list; biome
  findings in `wallet-item.tsx:99` and `SupplyAssetsList.tsx:15`; `/fonts/*.ttf` 404s;
  "Select is changing from uncontrolled to controlled" warnings.
