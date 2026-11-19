---
type: brief
repo: builders-sodax-mcp-server
github: 126
status: Done — PR #134 squash-merged into development 2026-11-19 (725ae0d, approved by R0bi7), #126 closed; docs gosodax/sodax-sdks#645 stays draft until the server deploys
next: none here; #133 takes #134's names when it catches up (gh-116); mark sodax-sdks#645 ready once the server deploys
updated: 2026-11-19
related_issues: [119, 124, 129]
---

# GH-126 Price-only quote mode · brief

## Plan (decisions)

- `mode?: "price_only" | "prepare"` on `sodax_swap_quote`; no mode keeps today's behaviour.
- `price_only` (even with addresses): `status: "price_only"`, no steps, no `quoteId`, never `checkQuoteRoom` or
  `putQuote`, no transaction builds. `missing` keeps meaning "what a prepare still needs" (may be empty).
- `prepare` without `fromAddress`: input error naming `fromAddress`.
- Every quote result carries `quotedAt` (ISO, when the price was read).
- Quote description + swap instructions: watch with `price_only`, prepare only when the user is ready to sign.
- Test: repeated `price_only` calls with `fromAddress` never reach the open-quote cap.

## Outcome so far (2026-11-18)

- Built by an agent; /simplify: one `addressAsk` wording for the prepare error and nextStep, `getQuote` returns
  `quotedAt`. Skipped: `ready` from `missing` (loses narrowing, 6 TS errors), always hinting `mode "prepare"` (changes
  no-mode results, against the AC).
- /code-review: 8 findings, 5 fixed. A secret pasted into `mode` was echoed by zod's enum error: now screened in a
  `z.preprocess` before the enum (schema keeps its `enum`). fromAddress/mode descriptions, README wording, and the
  price_only nextStep ("the same arguments and mode prepare") fixed. Skipped: a new MISSING_ADDRESS code
  (hypothetical client), server vs hub clock for `quotedAt` (defined as when this server got the price), mode param in
  quoteNextStep.
- 1275 unit tests, checkTs, lint green.
- 2026-11-18 user's /code-review of #134: 10 findings, 6 fixed in 0a37aec (a 64-hex `mode` was echoed by the enum
  error; refusal now fatal with no stray "Required"; mode trimmed/lowercased; open-quote cap advice names price_only;
  one QUOTE_MODES; schema enum pinned by a test). Skipped: reusing an unclaimed quote (changes no-mode results), polling
  pacing (out of scope), sender check in price_only (kept on purpose), recipient/config checks in price_only (by design).
- 2026-11-18 design changed at the user's call: `sodax_swap_quote` split into `sodax_swap_price` (pair + amount, no
  address, no slippage; `status: "price"`, `expectedAmount`, `prepareNeeds`, `quotedAt`) and `sodax_swap_prepare`
  (fromAddress optional in the schema so a missing one is a structured INVALID_ADDRESS listing both; slippageBps with a
  "tighter fills less" note; deadlineMinutes). `mode` gone. Commit `feat(swap)!` 9470774 (breaking: the old tool runs on
  development). Issue #126 body rewritten + comment. Rejected after discussion: raising the slippage floor and a track
  "price moved below minimum" signal (no evidence it's needed). Targeted /code-review: 13 findings, 7 fixed.
- 2026-11-18 sdks docs: one PR for all four MCP PRs (user's call). sodax-sdks gates implementation on `plan-approved` or
  `no-plan` (agents never apply either; the user applied `no-plan` to #644). Spec in the template's sections. I committed
  before the label (not pushed): wrong order, caught before any push.
