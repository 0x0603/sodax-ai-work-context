---
type: issue
repo: sodax-sdks
github: 265
status: Active
tags: [documentation, docs-sync, testnet, sdk]
updated: 2026-07-02
related_decisions: []
---

# GH-265 Sync Verify Docs And Testnet Answer

- Source: https://github.com/icon-project/sodax-sdks/issues/265
- Started: 2026-07-02
- Related PR:

## Problem

The public SODAX developer documentation is behind the current `sodax-sdks`
code and does not expose several newer SDK/package surfaces. The issue asks for
three connected outcomes:

1. Audit all existing SDK documentation against the current code.
2. Prepare current package and feature documentation as standalone Markdown
   pages that can be synced to `https://docs.sodax.com/developers/packages`.
3. Add a useful, accurate answer about SODAX testnet availability both as a
   How-to page and as a shorter FAQ answer.

## Context

- `sodax-sdks` is the canonical source for SDK/package docs.
- `docs.sodax.com` is currently published from the separate
  `icon-project/sodax-document` GitBook repository.
- `sodax-document/sync-sodax-sdks.sh` copies selected files from a
  `sodax-sdks` submodule, injects GitBook frontmatter, and rewrites selected
  links.
- The `sodax-sdks/docs/` Mintlify config added by PR #262 is a separate,
  minimal site with only the AI integration page. It is not currently the
  complete `docs.sodax.com` publication pipeline.

## Acceptance Criteria

- [ ] Every consumer-facing Markdown surface in the SDK workspace is inventoried
      and classified as public, internal, migration-only, or generated/synced.
- [ ] Public claims, imports, method signatures, return/error shapes, chain
      support, package requirements, and examples are verified against current
      source and tests.
- [ ] Existing factual drift is corrected in the canonical `sodax-sdks` source
      files, not only in generated `sodax-document` copies.
- [ ] New public SDK features and the `@sodax/skills` package have standalone
      Markdown sources and explicit downstream sync/navigation mappings.
- [ ] A How-to page accurately explains the lack of a supported end-to-end
      SODAX testnet and gives users concrete next steps.
- [ ] The canonical FAQ contains a concise version linking to the How-to page.
- [ ] The distinction between protocol support and wallet-provider/testnet
      plumbing is explicit, so low-level testnet configuration is not presented
      as a supported SODAX testnet deployment.
- [ ] The downstream sync is run from the audited SDK revision and produces no
      broken navigation or links in a GitBook preview.
- [ ] Relevant documentation/source-consistency gates pass and cover the public
      Markdown surfaces going forward.

## Related

- GitHub issue #182: standalone Mintlify swaps docs research/MVP.
- GitHub issue #212: generated staging/production solver-compatible asset docs.
- `sodax-document` PR #14: initial v2 sync workflow.
- `sodax-document` PR #18: latest merged SDK sync (2026-06-10).
- `sodax-sdks` PRs #81, #82, and #84: previous source-vs-doc audit and guard work.
