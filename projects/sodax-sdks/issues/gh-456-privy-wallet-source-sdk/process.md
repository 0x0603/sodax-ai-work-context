---
type: process
repo: sodax-sdks
github: 456
updated: 2026-09-23
---

# Process — index

The session log passed the point where reading it whole is sensible. It is now **one file per
session** under `process/`, and this file is the index. Read the row you need, not the folder.

Every file under `process/` carries the same frontmatter (`type: process`, `github: 456`,
`session: <date>`), so `rg "^github: 456"` still finds all of them. Append a **new file** per
session; add a row here. Do not grow this index beyond the table.

## Sessions

| # | Date | File | What it settled | ~tok |
| - | ---- | ---- | --------------- | ---: |
| 01 | 2026-09-17 | [repo-and-privy-verification](process/01-2026-09-17-repo-and-privy-verification.md) | **F1-F6.** How the SDK wires EVM wallets today; what `@privy-io/wagmi@4.0.17` actually does (the decisive fact against it); registry + packaging; repo gates; the full trust-policy blocker list; adversarial verification of ten load-bearing claims | 3.0k |
| 02 | 2026-09-18 | [rev2-decision-and-pr163](process/02-2026-09-18-rev2-decision-and-pr163.md) | **F7-F10.** ADR 0003 written; `'use client'` absent from every published dist; `privyWalletOverride` answers the chain-coverage risk; **PR #163 already opened this seam** (+ reference text about it — **never post, do not touch that PR**); round-2 close and the 53 rev-2 edits | 1.9k |
| 03 | 2026-09-23 | [plan-audit](process/03-2026-09-23-plan-audit.md) | **Audit of `plan.md` rev 2 as the thing under test.** Approach holds; five cuts recommended (incl. deleting the late-readiness `reconnect()`); `build:packages` landmine was **factually wrong**; `EVM.privy` vs `EVM.wagmiConnectors` re-opened; base is 166 files stale | 2.3k |

## Changes During Work

- Created this dossier (`issue.md`, `brief.md`, `plan.md`, `plan-architecture.md`, `research.md`,
  `process.md` → `process/`, `outcome.md`).
- Context repo: decision 0003 (Privy supersedes 0001) written, 0001 status flipped.
- **No code changes in `sodax-sdks`.** Worktree `../sodax-sdks-456` on
  `feat/456-privy-wallet-source` is clean at `898b7e6a`; `origin/main` has since moved to
  `a7426e57`. Merge `main` in before the spike.
