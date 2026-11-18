---
type: brief
repo: builders-sodax-mcp-server
github: 126
status: Active, in review — PR #134 (feat/126-price-only-quote 28f0ee3, base feat/118 = #124), Closes #126
next: review of #134; retarget to development once #124 merges; conflicts with #133 in quote.ts/swap.ts/README for whichever merges second
updated: 2026-11-18
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
