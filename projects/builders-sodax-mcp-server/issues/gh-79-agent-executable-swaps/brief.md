---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active — #81 in PR #91, #82 in draft PR #92, #83 in draft PR #93, #84 in draft PR #94
next: Push PR #94 (+`1eba6c1`, `c639939`), the ADR commit `21d9017` to PR #90 and the hub branch when the user asks; then #85 per plan-85-swap-track.md
updated: 2026-10-26
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- `plan.md` follows the ADR on PR #90 (synced 2026-10-26).
- ADR (#80) is draft PR #90 (base `development`), branch `feat/agent-executable-swaps` @ `3c9b00b` (D2: swap tools
  require a key, 2026-10-26; design review revision `f59edf0`). No reviewer requested; its one comment is the
  user's `@claude do PR review`, which produced no review.
- #81 is PR #91 into `development`, branch `feat/81-forward-api-key` @ `f27de38` (off `development` @ `02ba5df`):
  key forwarding via `requestContext`, `SODAX_ENV`, relay on `api.sodax.com/v1/relay`, README and `.env.example`.
  A code review (2026-10-26) found the key reaching the relay and more; 9 fixes pushed as `f27de38`
  (`plan.md` row 81 has the result). On canary the gateway routes the relay to the testnet relay. Checks green locally (105 tests, lint, build, `docker build` 353 MB); smoke-tested against
  production and canary. No reviewer requested.
- #84 (`sodax_swap_quote`) is draft PR #94 into `development`, branch `feat/84-swap-quote` (off
  `feat/83-resolve-token` @ `2997dd8`). Pushed: `a5fc108` (commits 1–5), `a802484` (second review). Local, not
  pushed: `1eba6c1` (third review: ABI decode of the signed swap, `SWAP_MISMATCH`) and `c639939` (SDK commit 6:
  recipient checks, pinned contracts, Sonic open, HBAR priced only). 348 unit tests, 13 contract tests on both hosts.
  Details and accepted advisories: `plan-84-swap-quote.md` §Commit 6.
- All of #79–#89 are assigned to the user (`0x0603`) as of 2026-10-26. "@0xmatterhorn" is the user's Discord handle.
- Discord 2026-10-23 (see `process.md`): R0bi7 says the epic is a core draft and the user may adjust decisions.
  Signing: the agent holds the key, signs and broadcasts, then passes the tx hash to MCP (D1 holds).
- Code lives in the hub submodule `sodax-command-center/repos/client/builders-sodax-mcp-server`. The standalone
  clone `sodax/builders-sodax-mcp-server/` (local signing key and noreply identity set) is legacy.
- `improvement-ideas.md` predates the ADR revision and has not been re-mapped.

## Blocked on

1. R0bi7's review of PR #90.
2. A BE wallet-balance route. Blocks #86 and the quote's balance check. No owner yet.
3. Open with Paul: double counting (inbound + outbound), per-IP write cap and jail on the MCP IP. The HAProxy move
   itself is settled (R0bi7, Slack 2026-10-23).
4. A funded test wallet and a canary API key.
5. A gosodax admin for the E2E secrets and the staging `SODAX_ENV=canary` setting.

## Next action

Push when the user asks: PR #94 (`1eba6c1` third review, `c639939` SDK), the ADR amendment `21d9017` to PR #90,
and the hub branch `docs/builders-mcp-swap-sdk` @ `8f319c8` (open the hub PR once #94 merges). Then #85
(`plan-85-swap-track.md`, SDK reads). Reviews of PR #90–#94 are still open.

## Settled — do not re-litigate

1. Full SDK (`@sodax/sdk` + `@sodax/types`), chosen 2026-10-23 for later features, with overrides for `axios`,
   `toml`, `ws`; `bigint-buffer` is the one with no fix (corrected 2026-10-26, `plan-84-swap-quote.md` §Review).
   Only the NEAR/Stellar recipient check uses it in #84; the Swaps API stays REST. Chain reads (balances #86,
   source-tx receipts #85) go through the SDK from this server; SDK bugs are fixed in `sodax-sdks`, not worked
   around (user, 2026-10-26). That amends ADR D6 for phase 1; the ADR text on PR #90 still needs the edit.
2. Build the intent with `createIntent` and an explicit minimum output and deadline. Never use `includeTxData`.
3. Check the EVM source tx on chain before calling `submit-tx`: the receipt succeeded and holds the `connection`
   contract's log carrying the cached relay payload. Matching the tx input is not enough.
4. Phase 1 sources are EVM and Sonic. No per-call `rpcUrl`; RPC overrides come from env only.
5. Swap tools require an API key (user's call, 2026-10-26; presence check only, BE decides validity). Builder
   tools stay keyless; a key, when sent, is forwarded on every BE call. ADR D2 says so (`3c9b00b`).
8. #81 keeps `solver.ts` / `relay.ts` on REST: the SDK changes the builder tools' inputs and outputs
   (`plan.md` §Constraints). `@sodax/types` and `engines` land in #83, `@sodax/sdk` in #84.
6. Partner fee is set by the builder at connection level (header, URL query or stdio env), never as a tool input.
7. One PR per sub-issue (user's call, 2026-10-26), each on its own branch off `development`, in `plan.md` order;
   #90 is the ADR. A boot-time switch keeps the swap tools off in production until #85, #87 and #88 are in. The
   sodax-sdks docs and skill go in a separate PR with its own issue.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The epic as written (goal, locked decisions, tools, safety rules, AC), what each sub-issue solves | `issue.md` | 3.5k |
| Decisions, constraints, SDK fit, per-sub-issue work, verification, prerequisites, follow-ups, risks | `plan.md` | 4.5k |
| #82 implementation plan (reviewed): profiles, swap key gate (403), rollout switch, snapshot test, 1 open question | `plan-82-tool-profiles.md` | 4k |
| #83 implementation plan (reviewed): live token list + chain config, resolver rules, action-tool template, restricted-token rule; no new dependency | `plan-83-resolve-token.md` | 4.5k |
| #84 implementation plan (reviewed): quote build path, partner fee, REST over `SwapsApiService`, errors, cache, SDK commit after the cooldown; §After implementation | `plan-84-swap-quote.md` | 4.5k |
| #85 implementation plan (reviewed): track state machine, deposit check from the `connection` Message log, RPC env, alerts, cancel flow, 4 open questions | `plan-85-swap-track.md` | 9k |
| #86 implementation plan (reviewed): `sodax_get_balance` through the SDK (`getWalletBalance`, `Erc20Service.getAllowance`), quote balance + allowance wiring, error wrapping, SDK follow-ups | `plan-86-get-balance.md` | 3.5k |
| Discussion log: balance in BE, custom RPC, full SDK vs light, rate limit, API key, cancel, partner fee | `process.md` | 2k |
| Candidate changes from before the ADR revision, not re-mapped | `improvement-ideas.md` | 1.9k |

## Landmines

- Canary runs on mainnet chains, so canary swaps move real funds.
- `submit-tx` allows 10 per 60 s per IP for the whole MCP.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Repo is public (hub `repos.yaml`): keep PR text free of internal detail.
