---
type: brief
repo: builders-sodax-mcp-server
github: 116
status: Active — #123 merged (596aa0e); PR #128 open (fix/116-tool-inputs-json, 43630f0 on development 596aa0e), "Refs #116"
next: CI and a review on #128; items 3, 5, 6, 7 still open
updated: 2026-11-16
related_issues: [79, 119, 115, 118]
---

# GH-116 What an agent stumbled on · brief

## State

- 2026-11-16 second PR, #128 (43630f0): #116 item 4 plus the same class from an outside MCP review. `format: "json"`
  is the data alone (formatResponse frames Markdown only; not-found answers `null`); spoke chain-key tools
  (swap tokens, hub assets, money market tokens) resolve names via `toChainKey` (exact key first, raw value when the
  chain list can't be read, ICON not offered); AMM candles take the numeric chain id the API parses (ParseIntPipe);
  relay chain ids must be digits; `connSn` required, digit string or safe integer, plain string schema (no anyOf);
  volume JSON keeps `nextCursor`, Markdown prints it whole, cache key covers every filter. /simplify + /code-review
  done and fixed. Not done: EVM chain-id fallback in `toChainKey`, money market assets' ignored `chainId`, relay
  JSON wrapper shapes. 1091 unit tests, tsc, biome, build green. Follow-ups filed: #126 price-only quote mode, #127
  delivery tracking (sub-issues of #119, on #124's branch until #117/#124 merge).
- #116 (sub of follow-up epic #119, Backlog). A second first-time run (with a key) added: source limit not said
  up front, key refusal points only at docs, AMOUNT_TOO_LOW says "send", `sodax_swap_track` hides that it submits.
  #122 was filed for these by mistake, closed as duplicate of #116.
- User's call: do all but the docs point (that one is sodax-sdks#577, user edits it locally); rename the tool to
  `sodax_swap_submit_and_track` because no client uses it yet (production has no swap tools).
- Done in the worktree (1070 tests, /simplify + /code-review applied):
  - rename everywhere (src, tests, README, server.json, index.html);
  - `GET_A_KEY` (portal path, Owner/Admin, docs link) in every key message; key rotation points at the portal;
  - quote description + swap instructions say only some chains can start a swap; `UNSUPPORTED_SOURCE` names them
    (`details.sourceChains`), worded per caller: quote → swap from one of them; track/cancel → which chain was it sent from;
  - AMOUNT_TOO_LOW asks whether to quote more, not to send;
  - cancel advice under the new name: say track won't resubmit. `not_submitted` (no cached quote, submitted but no
    backend row yet, or not the quote's deposit) sends the agent to track: track submits in none of them. First draft
    said "ask the user first", which R0bi7 caught (review 5860628421): a declined ask let a submitted swap fill. Fixed
    in 4e7e2b1, plus sent-swap wording when no source chain can be named.
- Rejected after /code-review: checking the source chain before the token (it skipped the missing-config and pasted-key
  checks). Kept on purpose: the source sentence in both instructions and description (some clients drop instructions).
- Outside this PR: #577's `docs/builders-mcp.mdx:103` still says `sodax_swap_track` (user's push). #117/#118 use the old
  name ~60 times each: rerun the rename after merging development into them.
