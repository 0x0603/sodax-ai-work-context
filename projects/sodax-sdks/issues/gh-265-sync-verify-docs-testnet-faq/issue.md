---
type: issue
repo: sodax-sdks
github: 265
status: In Review
tags: [docs, docs-sync, mintlify, gitbook, faq, testnet, how-to, skills, swaps-api, packages]
updated: 2026-07-13
related_issues: [gh-255-bridge-api, gh-1417-swaps-api-sdk]
related_decisions: []
---

# GH-265 docs(sdks): sync, verify docs and create how-to answer

- Source: https://github.com/icon-project/sodax-sdks/issues/265
- Work repo: `sodax-sdks`
- Author: R0bi7 · Assignee: 0x0603 (me) · Label: documentation · Type: Task
- Started: 2026-07-13

## Problem

Three deliverables, from the issue body:

1. **Verify** the state of all existing SDK docs and make sure they are **up to
   date with the code**.
2. **Create docs for new packages** the same way as for e.g. swaps, and prepare
   them to be **synced into `docs.sodax.com/developers/packages`** — single `.md`
   files (e.g. the `skills` package → the "experience" sub-section).
3. **Per @DavidFBD** (NOTE: the SDKs do **not** support testnets): add a section
   answering "Is SODAX on testnet? / Why not? / Can I integrate on testnet?". A
   page under `docs.sodax.com/developers/how-to`, plus a smaller **FAQ answer** in
   the synced FAQ markdown. It must explain SODAX is not (or is limited) on
   testnets and give a useful next step so the reader keeps exploring.

## Context

- The live `docs.sodax.com/developers` tree is already largely synced from the
  in-repo markdown (`packages/sdk/docs/*.md` slugs map 1:1 to the live pages).
  Sections: Deployments, Packages (Foundation/Connection/Experience), Technical
  Overview, How-to (7 pages), AI Integration, FAQ (a TODO stub).
- **Sync mechanism (confirmed by R0bi7):** edit docs in `sodax-sdks` → a sync script
  in the separate **`sodax-document`** repo pulls them into a new branch → PR to
  `sodax-document` main (with GitBook preview) → approve/merge publishes to
  `docs.sodax.com`. The repo `docs/` folder (Mintlify, PR #262) is a separate effort,
  NOT the docs.sodax.com source.
- A full doc-vs-code audit was run (see `reference/audit-findings.md`): most docs
  are accurate, ~8 need real fixes (2 High), 2 SDK files are internal/stale and
  should NOT be synced, and `skills` + `swaps-api` (+ maybe `types`) have no page.
- Testnet: verified mainnet-only — 21 `_MAINNET` chains, `mainnet:true`, zero
  testnet configs. One stale example bug found (`<SodaxProvider testnet={false}>`).

## Acceptance Criteria

- [ ] **ALL** existing docs verified vs code (not just the synced feature docs —
      incl. `LOGGING.md`, `installation/nextjs.md`, repo-root `README.md`, full
      `wallet-sdk-react/docs`, `dapp-kit/.../backend/README.md`); drift fixed (esp.
      the 2 High items: `HOW_TO_MAKE_A_SWAP.md` error example; `types` README backend
      row). Out-of-scope docs recorded, not silently skipped.
- [ ] New single-`.md` package pages authored for `@sodax/swaps-api` and
      `@sodax/skills` (→ Experience), following the `SWAPS.md` template; `@sodax/libs`
      explicitly excluded; `@sodax/types` decision made.
- [ ] `dapp-kit` README gains the missing Leverage Yield section (+ other hooks).
- [ ] Testnet **how-to page** created + condensed **FAQ answer** added, both grounded.
- [ ] Pages actually land on `docs.sodax.com` via the `sodax-document` sync-script
      → PR → GitBook-preview → merge flow (new pages registered in the sync script).
- [ ] `docs/index.mdx` + `ai-integration-guide.md` skill count fixed (four → five).

## Related

- Knowledge: `knowledge/operations/run-swaps-api-locally.md`
- Evidence: `reference/audit-findings.md` (full per-doc triage + live-site map)
- Decisions: —
