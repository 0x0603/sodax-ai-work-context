---
type: outcome
repo: sodax-frontend
github: 1623
status: Merged — PR 1935 (dfab081c), issue closed 2026-10-05; manual sentinel re-test still owed
updated: 2026-10-06
---

# Outcome

> **2026-10-05 update.** Shipped as PR icon-project/sodax-frontend#1935 (head `0d3d1d62`).
> **Merged 2026-10-05** by 0x0603 after gosiast's approval (merge commit `dfab081c`); #1623
> auto-closed.
> The final design differs from the 2026-08-12 description below:
> - The clause is appended to the **system** prompt in code, not sent in the user prompt.
>   The edits to `system-prompt.ts` / `solana-system-prompt.ts` were dropped, so the
>   "add the clause to the Notion page by hand" follow-up no longer applies.
> - Marker stripping uses a loose regex, not exact-string `replaceAll`.
> - Net diff: `analyze/route.ts` only, +26/−4. The "Draft comment" at the bottom is obsolete.

- PR: #1935, merged (`dfab081c`). The original local commit `322b53b6` was reworked in `0d3d1d62`.
- Commits: 1 — `fix(web): fence untrusted scraped content in the analyze LLM prompt`
- Tests: no suite in this repo. Verified by lint + typecheck + build + a break-out driver
  run against the real source.

## Summary

Both untrusted blocks are fenced with the markers `docs/agent-readiness.md` §6 already
mandates, the markers are stripped out of the text first so the fence cannot be broken out of,
and the trust-boundary clause is sent in the user prompt so it survives the fact that the live
system prompt lives in Notion rather than the repo.

## What Changed

**`apps/web/app/api/partners/analyze/route.ts`**
- `UNTRUSTED_BOUNDARY_HEAD` / `UNTRUSTED_BOUNDARY_FOOT` — the same two strings
  `app/agent/md/route.ts` and `app/llms-full.txt/route.ts` use.
- `fenceUntrustedContent()` — strips both markers out of the text, then wraps it.
- `TRUST_BOUNDARY_CLAUSE` — prepended to the user prompt; restates the first-character rule
  so the `NOT_A_PROTOCOL:` sentinel match cannot be broken by a preamble.
- All three interpolations fenced: `signalsBlock` ×2 and `content` ×1.

**`apps/web/lib/lead-magnet/system-prompt.ts`** and **`solana-system-prompt.ts`**
- An `# Untrusted input (read before anything else)` section, so the fallback path is not
  weaker than the Notion-hosted primary.

## Follow-ups

- **Needs a running app with credentials (morning):** re-test with one known non-protocol URL
  and two known-good protocol URLs. The non-protocol case is the one that matters — if the
  clause induces any preamble, the sentinel match silently stops working and every
  non-protocol URL gets written to Notion as a normal lead. Not claimed as done here.
- **Needs a human with Notion access:** add the same clause to the master prompt page. Until
  then the fence is installed in code but the *instruction* half only reaches production
  through the user prompt (which is the durable half, but the system prompt should agree).
- Worth noting for whoever owns the Notion prompt: it can be edited by BD/marketing, so any
  security-relevant clause placed there can be removed by someone editing copy. That is an
  argument for keeping the load-bearing instruction in code, which is what this does.

## Draft comment for the issue — NOT POSTED

> Fixed on a local branch. Three notes:
>
> **`signalsBlock` needed fencing too** — answering the ticket's open question. It is not
> purely our own extraction: `formatSignalsBlock` embeds the page `<title>`, its top 5
> headings and three `<meta>` fields verbatim, uncapped and unescaped, and the block is
> interpolated twice. Fencing only `scraped.content` would have left the smaller channel open.
>
> **I reused `BOUNDARY_HEAD`/`BOUNDARY_FOOT` rather than adding `<sodax-untrusted-data>`** —
> `docs/agent-readiness.md` §6 mandates those exact strings and `app/agent/md` +
> `app/llms-full.txt` already use them.
>
> **The clause is in the user prompt, not just the system prompt.** `fetchLeadMagnetSystemPrompt`
> pulls the live prompt from Notion at request time, so a clause added only to
> `system-prompt.ts` would never be in effect in production. Both static fallbacks got it as
> well, but the Notion master prompt still needs the same paragraph added by hand.
>
> The sentinel re-test is still outstanding — it needs a real run against a known non-protocol
> URL, which I can't do without credentials.
