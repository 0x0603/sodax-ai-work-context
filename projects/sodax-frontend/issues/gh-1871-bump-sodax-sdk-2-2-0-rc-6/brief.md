---
type: brief
repo: sodax-frontend
github: 1871
status: Active
next: PR 1872 review, then the Step 8 smoke matrix on staging before promotion
updated: 2026-09-18
---

# Bump @sodax/* to 2.2.0-rc.6 · brief

## State in five lines

PR icon-project/sodax-frontend#1872 open (commit `b117e337`, base `main`), closes
#1871. Pins rc.5 → rc.6, lockfile, `CLAUDE.md` pin, upgrade-log entry (rc.1 → rc.3
entry retired; its two lessons moved into §3 and §7). `checkTs`, read-only lint and
`pnpm build` green locally. Zero call-site changes. Smoke matrix (guide §8) NOT run.

## Next action

Review of PR 1872. Before promotion, someone with wallets runs the §8 smoke matrix on
staging; Sui deposit is the one to watch (the release's `!` change).

## Settled — do not re-litigate

- Separate branch/issue/PR from the swap-min-amount work (#1869 / PR 1870); they are
  independent and merge in any order.
- rc.6 does not contain `isAmountTooSmallRefusal` (sdks branch unmerged); PR 1870's
  local matcher stays.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What changed in the SDK and what it touches here | `issue.md` | 0.4k |
| Gates run and their results | `process.md` | 0.3k |
| Files changed | `outcome.md` | 0.2k |

## Landmines

- A stale `node_modules` (rc.3) faked a `checkTs` error on main (`isRealWorldAsset`);
  `pnpm install` fixes it. Do not chase it in source.
- The live `/swaps/tokens` feed did not serve `sUSDS` on 2026-09-18; it appears on
  `/swap` when the backend syncs, not with this pin. No `/coin/susds.png` logo.
