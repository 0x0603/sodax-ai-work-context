---
type: brief
repo: builders-sodax-mcp-server
github: 120
status: Merged — PR #121 into development as 614d564 (2026-11-11, merged by the user); #120 closed
next: ops (Robi) set RPC_CONFIG on both MCP apps and check boot warnings; still to do, in a new small PR with "Refs #120": /health.rpcConfig and the README/.env.example single-quote note (user hasn't said when)
updated: 2026-11-11
related_issues: [79, 110]
---

# GH-120 RPC overrides from RPC_CONFIG · brief

## State
- Issue #120 (Task, sub of epic #79 — not the follow-up #119: it must ship before the swap tools' production
  release, so ops set the RPCs once), on gosodax board #1, In progress. Filed 2026-11-11 at the user's ask.
- Why: the MCP's `SODAX_RPC_URL_<chainId|FAMILY>` was never weighed against the backend's `RPC_CONFIG` (plan
  decision 8 / ADR D5 only rejected a per-call `rpcUrl`). Production (`master`, 2026-08-03) reads neither; the test
  server sets none, so no migration.
- Done in the worktree: `parseRpcOverrides` reads `RPC_CONFIG` as swaps-api does (sodax-backend
  `apps/swaps-api/src/config/configuration.ts:52` `unescapeJsonString`; fields per chain derived from the packaged
  config like `allowedRpcFieldsByChain`, without its fail-open fallback; `https://` only (see the review bullet); Injective taken too, though SDK
  2.2.0 hard-codes `getNetworkEndpoints(Network.Mainnet)`). Lenient on purpose (the user agreed): unknown chain/field
  or bad value → one warning naming it, never boot failure, because the backend owns the value on a newer SDK
  (2.3.0-rc.2 vs 2.2.0). Blank values count as unset (the E2E workflow's unset secrets).
- E2E workflow builds `RPC_CONFIG` per step from the existing `SODAX_RPC_URL_42161/8453` secrets (not job-level:
  secrets stay out of install/build); the script reads `rpcUrl` from it with its own reader (no src/sodax.ts import).
- Tests (before review): 948 unit, incl. swaps-api's full documented example taken as is with no warning. Local boot with a
  single-quoted value + an unknown chain: starts, warns `a-newer-chain`, no value in logs. /simplify done.
- /code-review xhigh (13 findings), fixed: URLs must match `^https://\S+$` (`HTTPS:`, whitespace or no `//` crashed
  Solana's client at boot, and a URL without `//` escaped log redaction); https only again (user had said "follow
  BE" = accept http; reverted for security: track trusts RPC answers, keys in clear; BE's value still pastes as is,
  http entries are skipped with a warning; tell the user if they object); no fail-open fallback (it hid unread
  fields); legacy `SODAX_RPC_URL_*` named in a warning; `isRpcUrl` / `parseRpcConfigJson` / `isRecord` in
  constants.ts, shared with the E2E script; workflow uses `toJSON(secrets…)`; no backend internals in code, README or
  issue #120 (repo is public); test table of fields the SDK reads (verified in sdk 2.2.0 dist). Skipped: a log of the
  applied chains (#111's boot record has `rpc_overrides.chains`). 954 tests; local boot with the crashing values
  starts and only warns.
- Conflicts to expect: #110/#111, #115 and #118 edit `parseRpcOverrides` (`isHttpsUrl`) and the old README
  `SODAX_RPC_URL_<family>` row (#118 adds text there: move it into the `RPC_CONFIG` row when merging).
- After the PR's review (user, 2026-11-11), same PR: (1) the `rpc_config.skipped` warning echoes unknown chain keys
  and field names verbatim, so a secret pasted as a key would reach logs: print only chain-key/field-shaped names,
  else `(an unknown key)`; (2) `/health.rpcConfig` = applied chain keys + skipped/legacy counts (never names: /health
  is public), so the user can check Robi's Coolify value without Coolify access. Optional, not planned: a boot
  eth_chainId probe per EVM override (catches a dead URL or a URL for the wrong chain). Say so in the PR body.
  (3) README/.env.example: say "single quotes, not double" for a `.env` file — node's --env-file cuts a
  double-quoted JSON value (`{\` or `{`); compose env_file and Coolify/process env take both (tested 2026-11-11).
- Parity re-check vs the backend (2026-11-11, origin/HEAD c69b50be): same variable, same unescape, same apply
  (`chains` + `hub.rpcUrl` from `sonic`, sodax.provider.ts:23-31); backend SDK 2.3.0-rc.2 has the same 22 chain keys
  as 2.2.0 (field names there not re-checked). Differences by design: lenient vs strict, https only, blank = unset,
  `{}` entry accepted silently; the backend logs "Applying RPC overrides for: …" (ours: #111 boot record / item 2).
- 2026-11-11 merge of development (#111) + second /code-review xhigh (9 findings, all fixed in fd6a7cd): warning
  names only chain-key/field-shaped entries (item 1 above done), RPC URLs avoid the redaction's stop characters
  (`"'\\<>`), values trimmed, boot record lists RPC overrides only when the SDK loads, canary script test, README
  rows for the two warnings, `rpc_url` dropped. 1069 tests. Still to do after review: /health.rpcConfig, README note.
- Ops answer once merged: set `RPC_CONFIG` on both MCP apps with swaps-api's value; never `SODAX_RPC_URL_*`.
  Setting it before the release is safe: current code ignores it.

## Which file answers what
| Question | File |
|---|---|
| The issue as filed | `issue.md` and GitHub #120 |
