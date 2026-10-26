---
type: process
repo: sodax-sdks
github: 519
updated: 2026-10-20
---

# Process — index

This file is the session index. The log passed 20 KB on 2026-10-19 and was split into one file per
session under `process/`. Each of those files carries `github: 519`, so `rg "^github: 519"` still finds
them. Add a new file for each session and a row here; keep this file to the table.

| # | Date | File | What it settled |
| - | ---- | ---- | --------------- |
| 00 | standing | [findings](process/00-findings.md) | Cross-session findings: tree-shaking broken, chain libs ~70% of gzip, consumer advisories, the EVM-only what-if numbers |
| 01 | 2026-10-14 | [research-session-idea-capture-input](process/01-2026-10-14-research-session-idea-capture-input.md) | First read of #519 and the user's v3 priority (lightweight first) |
| 02 | 2026-10-14 | [v3-what-if](process/02-2026-10-14-v3-what-if.md) | Measured what v3 buys instead of estimating → `measurements.md` |
| 03 | 2026-10-14 | [v3-scope-session](process/03-2026-10-14-v3-scope-session.md) | First scope with difficulty and points → `plan-v3-scope.md` |
| 04 | 2026-10-14 | [scope-revision](process/04-2026-10-14-scope-revision.md) | The user rejected size-based scope: approach and feasibility first, points after |
| 05 | 2026-10-16 | [align-input-with-scope](process/05-2026-10-16-align-input-with-scope.md) | Paste-ready #519 input aligned with the scope |
| 06 | 2026-10-16 | [per-item-research-and-order](process/06-2026-10-16-per-item-research-and-order.md) | Research A–D per item, work order, sub-issues |
| 07 | 2026-10-16 | [feasibility-check](process/07-2026-10-16-feasibility-check.md) | Plan feasibility: proven vs code-read vs unverified; 5–8 months; CJS consumers stay on the root entry in 2.x → `plan-v3-order.md` §10 |
| 08 | 2026-10-16 | [dapp-kit-packaging-and-install-matrix](process/08-2026-10-16-dapp-kit-packaging-and-install-matrix.md) | Split packages only along install weight (SDK vs API, chain, wallet); features stay subpaths → `plan-v3-order.md` §11 |
| 09 | 2026-10-16 | [parent-issues](process/09-2026-10-16-parent-issues.md) | Parent issue drafts → `parent-issues.md` (do not paste as-is) |
| 10 | 2026-10-16 | [client-usage-per-issue](process/10-2026-10-16-client-usage-per-issue.md) | What each issue gives clients → `client-usage.md` |
| 11 | 2026-10-16 | [a-better-wallet-sdk-react](process/11-2026-10-16-a-better-wallet-sdk-react.md) | Lazy chain adapters (T3.9, not prototyped; partly wrong, see 18) and headless `createSodaxWallets()` → `plan-v3-order.md` §12 |
| 12 | 2026-10-16 | [every-package-rethought](process/12-2026-10-16-every-package-rethought.md) | Package-by-package rethink → `plan-v3-packages.md` |
| 13 | 2026-10-16 | [final-plan](process/13-2026-10-16-final-plan.md) | → `plan-v3-final.md` |
| 14 | 2026-10-19 | [resume-new-issue-workflow-on-main](process/14-2026-10-19-resume-new-issue-workflow-on-main.md) | R0bi7's spec → plan → PR workflow merged; what it changes for filing |
| 15 | 2026-10-19 | [t1-spot-check-evm-as-plugin](process/15-2026-10-19-t1-spot-check-evm-as-plugin.md) | T1 still holds on `0181a053`; EVM stays in core |
| 16 | 2026-10-19 | [r0bi7-issue-style-epic-535](process/16-2026-10-19-r0bi7-issue-style-epic-535.md) | How R0bi7 files issues; epic #535 and its overlaps |
| 17 | 2026-10-19 | [t2-probe-ssr-next16](process/17-2026-10-19-t2-probe-ssr-next16.md) | T2 works with SSR on Next 16.3.8; T12 add-on: swap-only 303 → 248 KB gzip with T1+T5 |
| 18 | 2026-10-19 | [feasibility-of-519-bullets](process/18-2026-10-19-feasibility-of-519-bullets.md) | 8-agent check of all 39 bullets, plus a second review → `research/e-519-bullet-feasibility.md` |
| 19 | 2026-10-19/20 | [deep-dive-and-ranking](process/19-2026-10-19-deep-dive-and-ranking.md) | 10 area reports, each adversarially verified, plus the 39-issue ranking → `research/f-deep/README.md`; two quota pauses and one failed resume |
