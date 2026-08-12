---
type: plan
repo: sodax-frontend
github: 1623
updated: 2026-08-12
---

# Plan

## Goal

Give the model an explicit, unbreakable trust boundary around everything the scrape returns,
without disturbing the sentinel that classifies non-protocol URLs.

## Approach

**D3 — reuse the repo's existing markers, do not invent `<sodax-untrusted-data>`.**
The ticket suggests that tag but also says "the repo already has this pattern — reuse it
rather than inventing one". `docs/agent-readiness.md` §6 *mandates* the exact marker strings
for user-generated content going to an LLM, and `app/agent/md/route.ts` and
`app/llms-full.txt/route.ts` already carry them verbatim. Following the documented house rule
beats a fourth convention.

**Fence both blocks, not just the page body.** `scraped.signalsBlock` is not purely our own
extraction — see `process.md`. It embeds the target's `<title>`, its top five headings and
three `<meta>` fields verbatim, and it is interpolated **twice**.

**Strip the markers from the text before wrapping.** This is the step that makes the fence
load-bearing and the one the ticket flags as easy to skip: without it, a page that embeds the
closing marker closes its own fence and continues as instructions.

**Put the clause in the user prompt, not only the system prompt.** `fetchLeadMagnetSystemPrompt`
fetches the live system prompt **from a Notion page at request time**; the in-repo
`system-prompt.ts` / `solana-system-prompt.ts` are fallbacks used only when Notion is
unconfigured, empty, or unreachable. A clause added to the repo alone would not be in effect
in production. Both static fallbacks get it too, for the fallback path.

**The clause must restate the first-character rule.** That is the sentinel trap: a fence
instruction that invites an acknowledgement would break `text.trimStart().startsWith(...)` and
send every non-protocol URL through as a normal lead, into Notion and onto a hosted page.

## Steps

1. `analyze/route.ts`: add the two marker constants, a `fenceUntrustedContent` helper that
   strips-then-wraps, and a `TRUST_BOUNDARY_CLAUSE`.
2. Fence all three interpolations (signals ×2, content ×1) and prepend the clause.
3. Add the matching section to both static system prompts.
4. Verify, commit on `fix/1623-fence-scraped-content`. **Do not push.**

## Verification

- `pnpm lint && pnpm checkTs && pnpm build` green.
- A break-out driver that loads the real constants and helper out of the shipped source and
  feeds it a payload containing both markers — asserts exactly one head and one foot survive,
  the output opens and closes with them, and the injected text is still present as data.
- Sentinel check site untouched (verified by diff).
- **Manual, deferred:** one known non-protocol URL + two known-good protocol URLs against a
  running app. Cannot be done without credentials.

## Risks

- Prompt changes shift classification output. Expect some drift; sanity-check known-good URLs.
- Stripping the closing delimiter mutates the scraped text before the model sees it —
  intended, but it means the prompt is no longer byte-identical to the page.
- The fence is only half-installed in production until the Notion master prompt gets the same
  clause by hand.
