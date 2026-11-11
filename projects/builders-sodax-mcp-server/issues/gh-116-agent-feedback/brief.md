---
type: brief
repo: builders-sodax-mcp-server
github: 116
status: Active, in review — PR #123 at 4e7e2b1 (on development 614d564), CI green, "Refs #116" (items 3–7 stay open)
next: R0bi7 re-checks his review fix; merge before the swap tools' production release (the rename breaks clients after it)
updated: 2026-11-11
related_issues: [79, 119, 115, 118]
---

# GH-116 What an agent stumbled on · brief

## State
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
