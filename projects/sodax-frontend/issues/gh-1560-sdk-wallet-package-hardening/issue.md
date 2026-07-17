---
type: issue
repo: sodax-frontend
github: 1560
status: Active
tags: [security-audit, sdk, wallet, icon, phase-2]
updated: 2026-07-16
related_decisions: []
related_issues: [700, 1448]
---

# GH-1560 SDK & Wallet Package Hardening (Security audit · Phase 2)

- Source: https://github.com/icon-project/sodax-frontend/issues/1560
- Started: 2026-07-16
- Related PR: sodax-sdks branch `fix/security-audit-1560` (WALLET-L-1 only); cross-refs sodax-sdks#247 (#1448)

## Problem

Phase 2 of the SODAX frontend security audit epic (#700). Six findings from the
**Codex** report against the SDK/wallet packages (`packages/sdk`,
`packages/wallet-sdk-core`, `packages/wallet-sdk-react`), which live in the
**sodax-sdks** repo, not sodax-frontend:

- SDK-H-1 (High) — partner-fee autoswap submits `minOutputAmount = 0n`.
- SDK-M-1 (Med) — unsigned remote config can replace SDK routing.
- WALLET-M-1 (Med) — raw Bitcoin ECDSA signatures lack domain/replay binding.
- WALLET-M-2 (Med) — Solana burner wallet enabled/auto-connected by default.
- WALLET-L-1 (Low) — ICON wallet responses not correlated to their request.
- WALLET-L-2 (Low) — Stacks browser signing forces mainnet.

## Context

Audit caveat: the deployed web app pins **published `@sodax` 1.5.7-beta**, not
the local workspaces; each finding must be confirmed against current v2 source
before treating it as a release blocker. Three of the six overlap with the
earlier SDK security review **#1448** (17-High, PR sodax-sdks#247) and were
already dispositioned there. See `outcome.md` for the full per-finding mapping.

## Acceptance Criteria

- Every #1560 finding has a recorded disposition (fixed / accepted-risk /
  resolved-in-v2), cross-linked to #1448 where it overlaps.
- Genuine open code work implemented + tested on a dedicated branch.

## Related

- Knowledge:
- Decisions:
- Issues: gh-1448 (SDK security review, overlapping dispositions), epic #700
