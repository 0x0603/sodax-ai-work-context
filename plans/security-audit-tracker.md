---
type: plan
status: Active
updated: 2026-07-21
related_issues: [700, 1555, 1556, 1557, 1558, 1559, 1560, 1561, 1448, 1197]
related_decisions: []
tags: [security-audit, tracker, sodax-frontend, sodax-sdks]
---

# Security Audit Tracker — SODAX frontend (epic #700)

Single pane to follow every audit finding → its issue → the PR that fixes it,
across **sodax-frontend** (`apps/web`, `apps/node`) and **sodax-sdks**
(`packages/*`). My owned work is 0x0603; the rest is @gosiamacpro / others.

- Epic: https://github.com/icon-project/ICON-Projects-Planning/issues/700
- Codex report: https://internal.sodax.com/docs/2026-07-11-sodax-frontend-security-audit.html
- Claude artifact ("Report 2"): https://claude.ai/code/artifact/a768b2b0-3b63-4f39-80db-2e28a447f2b7
- Prior SDK review (17-High): #1448 → PR sodax-sdks#247 (still open)

> **⚠️ #700 is the canonical audit report — do NOT re-audit or duplicate it.**
> Every finding (headline **0 Critical · 2 High · 10 Medium · 3 Low · 2 Info**, across
> the Codex report + Claude "Report 2") is already decomposed into issues #1555–#1561
> and inventoried below. Before running ANY new audit on this codebase, **diff against
> the inventory first** and spend budget only on surfaces not listed here. (The
> 2026-07-17 blind run burned a 461-agent workflow re-deriving the known SEC-01 P0.)

## Report finding inventory (#700) — de-dup target

| Finding | Issue | Status / PR |
| --- | --- | --- |
| SEC-01 — CMS privilege escalation (P0) | #1555 | PR #1568 **OPEN — P0 live on main** |
| WEB-H-1 — JSON-LD stored XSS | #1556 | not started |
| SEC-02 — glossary/Notion stored XSS | #1556 | not started |
| CSP `script-src` nonce | #1556 (tracked #1197) | not started |
| SDK-H-1 — partner-fee autoswap `minOut=0` | #1560 | accepted-risk (contract-verified) |
| SDK-M-1 — unsigned remote config | #1560 | accepted-risk (`initialize()` no-op) |
| WALLET-M-1 — raw BTC ECDSA | #1560 | accepted-risk (Radfi/Bound format) |
| WALLET-M-2 — Solana burner default | #1560 | resolved-in-v2 |
| WALLET-L-1 — ICON relay correlation | #1560 | **fixed** — sdk#299 |
| WALLET-L-2 — Stacks forces mainnet | #1560 | mostly-resolved |
| API-M-1 / SEC-05 — paid AI/email fail-open | #1557 | not started |
| API-M-2 — unauth inbox/CRM spam | #1557 | not started |
| CMS-M-1 — predictable ObjectId draft leak | #1557 | not started |
| STAKE-M-1 — instant-unstake MEV window | #1559 | not started |
| POOL-M-1 — deposit/supply account mismatch | #1559 | not started |
| SWAP-M-1 — ICON destination validation | #1559 | not started |
| SWAP-L-1 — sticky approval across signer | #1559 | not started |
| TOOL-M-1 — bitcoin-radfi argv/stdout secrets | #1561 | **fixed** — sdk#300 |
| SEC-06 / AUTH-I-1 — role from session, not DB | #1558 | in PR #1568 (unmerged) |
| SEC-03 — glossary PATCH over-posting | #1558 | **fixed** — fe#1574 |
| SEC-04 — monitor secret in URL | #1558 | **fixed** — fe#1573 |
| info — CMS `[id]` raw `error.message` leak | #1558 | **fixed** — fe#1574 |
| info — news/articles PATCH over-posting | #1558 | **fixed** — fe#1574 |

## Issues → PRs → status

| Issue | Phase / area | PR(s) | Status |
| --- | --- | --- | --- |
| [#1555](https://github.com/icon-project/sodax-frontend/issues/1555) | P0 · SEC-01 CMS privilege escalation | [#1568](https://github.com/icon-project/sodax-frontend/pull/1568) (gosia) | ⚠️ **PR OPEN, not merged — P0 still LIVE on main** |
| [#1556](https://github.com/icon-project/sodax-frontend/issues/1556) | Phase 1 · XSS & CSP | — | Not started (gosia) |
| [#1560](https://github.com/icon-project/sodax-frontend/issues/1560) | Phase 2 · SDK & wallet | [#299](https://github.com/icon-project/sodax-sdks/pull/299) | WALLET-L-1 fixed; rest dispositioned (see below) |
| [#1557](https://github.com/icon-project/sodax-frontend/issues/1557) | Phase 3 · public-endpoint abuse | — | Not started (gosia) |
| [#1559](https://github.com/icon-project/sodax-frontend/issues/1559) | Phase 4 · financial-flow UX | — | Not started (gosia + Anton/contract) |
| [#1561](https://github.com/icon-project/sodax-frontend/issues/1561) | Phase 5 · TOOL-M-1 node tooling | [#300](https://github.com/icon-project/sodax-sdks/pull/300) | Fixed (sdk copy only) |
| [#1558](https://github.com/icon-project/sodax-frontend/issues/1558) | Phase 6 · auth & CMS integrity | [#1573](https://github.com/icon-project/sodax-frontend/pull/1573), [#1574](https://github.com/icon-project/sodax-frontend/pull/1574), [#1568](https://github.com/icon-project/sodax-frontend/pull/1568) | SEC-04 + SEC-03/info fixed; SEC-06 in #1568 (unmerged) |

## My PRs (0x0603) — details

| PR | Repo | Covers | Verify | Caveat |
| --- | --- | --- | --- | --- |
| [sodax-sdks#299](https://github.com/icon-project/sodax-sdks/pull/299) | sodax-sdks | WALLET-L-1 — serialize ICONEX relay + timeout/cleanup | unit 17+8, differential vs main, revert-proof | UI/UX-robustness fix, not a security exploit |
| [sodax-sdks#300](https://github.com/icon-project/sodax-sdks/pull/300) | sodax-sdks | TOOL-M-1 — bitcoin-radfi secrets from env, no key print | biome + tsc clean | **rotate** keys/tokens once used on CLI; only sdk copy patched |
| [sodax-frontend#1573](https://github.com/icon-project/sodax-frontend/pull/1573) | sodax-frontend | SEC-04 — drop `&secret=` from price URL | ad-hoc drive w/ stubbed fetch (secret out of URL, in header) | confirm monitor endpoint reads the `Authorization` header before merge |
| [sodax-frontend#1574](https://github.com/icon-project/sodax-frontend/pull/1574) | sodax-frontend | SEC-03 + Info-1 + Info-2 — CMS over-posting strip + generic errors | biome clean; strip demo; preview build green | see Zod gotcha below |

## Independent re-audits

| Run | Date | Scope | Result |
| --- | --- | --- | --- |
| Blind re-audit (Claude, ultracode workflow) | 2026-07-17 | `apps/web` | **No new critical.** Independently rediscovered SEC-01 and hand-verified the full chain (incl. better-auth `dist/` internals); re-confirmed **P0 live on origin/main**. Two possibly-uncovered findings → #1556 / #1559. Evidence: `projects/sodax-frontend/issues/task-apps-web-security-audit/` |
| Web2 / supply-chain audit (Claude, ultracode workflow) | 2026-07-20 | `apps/web` + infra/CI config | **33 verified · 31 NEW** (surface #700 didn't cover). Top: CSP no `connect-src`; `claude.yml` PAT exfil via prompt-injection; Actions on mutable tags + `pull_request_target`; `.npmrc` runs dep install-scripts; swap tx signed without intent verification; Alchemy key in client bundle; registrar/Vercel infra hardening. Evidence: `projects/sodax-frontend/issues/task-web2-supply-chain-audit/` |

## Key findings / gotchas to remember

- **SEC-01 (P0) + SEC-06 are NOT in main.** PR #1568 is OPEN/unmerged; `auth.ts`
  on origin/main still lacks `input:false` / `disabledPaths:["/update-user"]` /
  Google-domain lock, and `requireAdmin`/`requirePermission` still read from the
  session cookie. The "✅ Fixed" / "done" ticks reflect *PR ready*, not *merged*.
  → real action = get #1568 merged (or confirm a prod hotfix).
  **Re-confirmed 2026-07-17** by an independent audit —
  `git show origin/main:apps/web/lib/auth.ts | grep "input:\|disabledPaths"` → no
  matches. Full hand-verified exploit chain (any Google account → `update-user`
  → CMS admin → JSON-LD stored XSS → drainer, uncontained because CSP has no
  `script-src`) in `task-apps-web-security-audit/outcome.md` — usable as
  corroborating evidence on #1555.
- **Audit hygiene: read this tracker BEFORE starting any audit.** The 2026-07-17
  blind run burned a 461-agent workflow to re-derive a known P0. Diff against known
  findings first, then spend the budget on unlooked-at surfaces.
- **Zod `.partial().parse()` re-fires `.default()` (zod 4.3.6).** `parse({title})`
  returns `{title, published:false, tags:[]}` → the audit's suggested
  `NewsArticlePatchSchema` fix would silently unpublish + wipe tags. #1574 uses
  field-stripping instead. Don't "fix" it back to the schema approach.
- **#1560 dispositions (verified against v2 source + `sodax-contracts@main`):**
  SDK-H-1 = accepted-risk (`Intents.fillIntent` reverts `InvalidSolver` unless
  `msg.sender == intent.solver`; `ProtocolIntents` binds the fixed solver) ·
  SDK-M-1 = accepted-risk (`ConfigService.initialize()` is a no-op today) ·
  WALLET-M-1 = accepted-risk (Radfi/Bound external-verifier format; low-s canonical) ·
  WALLET-M-2 = resolved-in-v2 (burner gone) · WALLET-L-2 = mostly resolved. Detail
  + evidence in `projects/sodax-frontend/issues/gh-1560-sdk-wallet-package-hardening/`.
- **TOOL-M-1 (#300):** file exists in both repos and has diverged; only the
  sodax-sdks copy was patched (per issue scope).

## Reminders on the GitHub side

- All my PRs are cross-referenced ("Refs …#issue") on the source issues, not
  `Closes` — #1558 has multiple findings and #1560/#1561 are cross-repo (no
  auto-close). Issue checkboxes stay owner-controlled; my decisions live in a
  comment on each issue, not in the issue body.
