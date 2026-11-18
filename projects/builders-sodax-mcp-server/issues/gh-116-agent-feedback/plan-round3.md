---
type: plan
repo: builders-sodax-mcp-server
github: 116
status: Active
updated: 2026-11-18
related_issues: [119, 124, 128, 129]
---

# GH-116 round 3: what #123 and #128 left

Checked in code on #124's branch `5dedece` and #128's `fed598a` (2026-11-18).

## Already covered

- 1 (chain support): #123 says it up front; the non-EVM gap closes with #124.
- 2 (keyless refusal), 3d (AMOUNT_TOO_LOW), 8 (rename): #123.
- 3c (track "before it expires"): `swap.ts:350` already says call track even after expiry.
- 4a/4c (chain names, `format: json`): #128.
- 6 (attempt count, stop time): `stopAfter`/`pollUntil` exist for an unseen tx (`track.ts:78`); the rest is #129's
  `maxAttempts`/`until`. Moved there, not done here.
- 7a (45 tools, ~11k tokens): the `builder`/`swap` profiles are the answer. No code.

## This round

New PR `feat/116-swap-results`, base `feat/118-swap-from-non-evm` (#124, swap code moved there), `Closes #116`.

| Item | Decision | Where |
|---|---|---|
| 3a approve summary | approve and reset_approve steps carry `approves: { token, symbol, spender, amount }`, decoded from the step's own calldata so it can't disagree with what is signed | agent A |
| 7c burn recipient | a zero or `0x…dEaD` `toAddress` is refused as an input error naming `toAddress` (strict default) | agent A |
| 3b text repeats `structuredContent` | keep the JSON text (MCP spec: SHOULD, and some clients read only `content`), serialize it compactly; measure before/after on a quote fixture | agent B |
| 5 support + reference | every swap tool result carries `requestId` (HTTP only); swap instructions and unexpected-error advice name the SODAX Discord (`https://www.sodax.com/discord`, from sodax-sdks `docs/contact.mdx`) and ask for the requestId and tx hashes | agent B |
| 7b `sodax_refresh_cache` open | server-wide cooldown, one clear per 60 s; a call inside it says when the last clear was | me, in `wt-116c` |
| 4b Markdown shows 20 rows | truncation note points at `format: "json"` for the full list | me, on #128's branch (item 4 is #128's) |

Agents work uncommitted in detached worktrees `wt-116-agent-a` / `wt-116-agent-b`; their diffs are applied to
`wt-116c`, then /simplify + /code-review once on the whole, then the user's "commit push".
