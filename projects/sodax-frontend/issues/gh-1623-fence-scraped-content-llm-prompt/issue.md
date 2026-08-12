---
type: issue
repo: sodax-frontend
github: 1623
status: Active
tags: [security, prompt-injection, llm, api-route, notion, audit-2026-07-28]
updated: 2026-08-12
related_issues: [gh-1622-email-guide-hardening, gh-1627-pin-github-action-shas]
related_decisions: []
---

# GH-1623 Fence Scraped Content Llm Prompt

- Source: https://github.com/icon-project/sodax-frontend/issues/1623
- Started: 2026-08-12
- Related PR: none yet — branch `fix/1623-fence-scraped-content`, local only
- Parent: #1621 (2026-07-28 whole-repo security audit follow-up), ranked 4 of 5
- Report: https://claude.ai/code/artifact/76aec015-413e-43f1-ad4b-155114a460d2 (finding 3 —
  the only finding raised independently by two auditors)

## Problem

`OWASP LLM01 Prompt Injection · CWE-1427`. Up to 25,000 characters of attacker-hosted page
text, plus the target's `<title>` and meta tags, were interpolated into the model's prompt
with no fence and no "treat this as data" instruction. A visitor who controls a website could
have SODAX's confidential BD qualification prompt read back to them, or plant chosen prose
into the internal Notion CRM row BD staff act on and onto a sodax.com-hosted guide page.

`# Scraped content (raw, for context only)` is a markdown heading, not a trust boundary — the
model has no way to tell it from the surrounding instructions.

## Context

Why this is Medium and not High, per the report — two independent containments verified in
code: `streamText` is called with **no tools**, so there is no agentic pivot; and the guide
renders through react-markdown **without `rehype-raw`**, so injected markup cannot become script.

The trap the ticket names: `analyze/route.ts` matches the `NOT_A_PROTOCOL:` sentinel against
**raw model output**. A prompt change that makes the model emit anything first silently stops
that match, and every non-protocol URL falls through as a normal lead.

## Acceptance Criteria

- [x] Wrap both untrusted blocks (`scraped.content` and the title/meta signals) in an explicit
      delimiter.
- [x] **Strip the closing delimiter from the content** before interpolating, so it cannot be
      broken out of.
- [x] Add one trust-boundary clause to the system prompt.
- [x] Confirm whether `scraped.signalsBlock` contains verbatim attacker text — **it does**; fenced too.
- [ ] **Open:** re-test with a known non-protocol URL and a couple of known-good ones. Needs a
      running app with provider + Notion credentials.
- [ ] **Open:** add the same clause to the Notion-hosted master prompt by hand.

## Related

- Knowledge:
- Decisions: D3 (reuse the documented markers) — recorded in `plan.md`
