---
type: process
repo: sodax-frontend
github:
updated: 2026-07-17
---

# Process

## Log

- **2026-07-17** — Scoped to `apps/web` (600 TS/TSX, ~73k LOC, 28 API routes).
  Scouted inline first: `middleware.ts`, `next.config.js`, `lib/sanitize.ts`,
  `providers/create-wagmi-config.ts`, tracked env files, `NEXT_PUBLIC_` vars.
- Ran an ultracode `Workflow`: 6 web-research agents (latest FE attack vectors) ∥
  6 recon agents → briefing → 12 audit dimensions → 3-lens adversarial verify per
  finding → gap-hunt → synthesis → refactor. 461 agents planned.
- **Workflow died mid-run**: 340/461 agents failed on the session limit
  (`resets 6:20pm`). Survivors: 6/6 research (49 vectors), 6/6 recon, finders
  (145 raw findings), **97/369 verify verdicts**. Gap-hunt, synthesis and refactor
  produced nothing.
- Salvaged results from `journal.jsonl` (the returned tally was misleading — see
  Findings), then hand-verified the severe findings against real source.
- Wrote the top-3 refactors by hand. **No files in sodax-frontend were changed.**

## Findings

### The verify-phase failure poisoned the workflow's own scoring

Script logic was `survives = valid.length > 0 && refutedCount < 2`. When all three
verifiers for a finding died, `valid.length === 0` ⇒ `survives = false`. So the
returned **"13 confirmed / 132 refuted"** conflates *actually refuted* with
*never checked* — and the severe findings (critical auth escalation, the XSS set,
supply chain) all sat in the dead-verifier bucket. The 13 "confirmed" that came
back were the low-severity tail, purely because their dimensions' verifiers
happened to run first.

**Lesson (mirrors gh-1560's own "stale checkout" note): never report a workflow's
aggregate verdict without checking the agent failure list first.** A partially-dead
fan-out fails *silently and biased*, not loudly. Design fix for next time:
distinguish `refuted` from `unverified` as separate states, and never let an
agent error collapse into "refuted".

### Hand-verification method that actually settled WEB-C-1

Reading `lib/auth.ts` alone was not enough to know whether the missing
`input: false` was exploitable — that depends on better-auth's internals. Read the
installed package's `dist/` directly:

- `dist/db/schema.mjs:54` → `parseInputData` gates **only** on `input === false`.
- `dist/api/routes/update-user.mjs:15` → `z.record(z.string(), z.any())`,
  `use: [sessionMiddleware]`.
- `dist/db/to-zod.mjs:8` → `isClientSide && field.input === false` filter.

That turned "suspicious config" into a proven chain. **Reading the dependency's
real source is what separates a confirmed finding from a plausible one.**

### Unverified — needs a verify pass (do NOT treat as confirmed)

Raised by finders whose verifiers died. Listed so the next round starts here:

| File | Claim | Why it matters |
| --- | --- | --- |
| `lib/swaps-api-sign.ts:68` | approve + intent calldata is entirely server-supplied and blind-signed; spender/amount never validated or displayed | **Could outrank WEB-C-1** if it holds |
| `wallet-sdk-react` chunk `:1752` | EVM txs carry no `chainId` ⇒ signed on whatever chain the wallet is on | Overlaps the packages surface — belongs to #1560's repo |
| `swap-confirm-dialog.tsx:234` | no chain verification before signing; the only gate is upstream on Review | |
| `useFeeClaimExecute.ts:39` | partner fee claim, full balance, zero chain verification | |
| `migrate-button.tsx:333` | cross-chain migration fires straight from a button, no confirm step | Irreversible |
| `unstake-request-item.tsx:199` | "Claim early −X%" forfeits up to 50% on one unconfirmed click | Irreversible |
| `api/partners/analyze/route.ts:51` | Turnstile fails **open** when `TURNSTILE_SECRET_KEY` is unset / on preview | |
| `api/partners/email-guide/route.ts:148` | unauthenticated endpoint sends SODAX-branded mail to any recipient | Phishing-as-a-service |
| `terms-confirmation-modal.tsx:59` | terms signature has no nonce / domain binding ⇒ replayable bearer token | |
| `useConnectAllWithHana.ts:21` | Hana connector picked by attacker-controllable name substring under EIP-6963 | |
| `package.json:5` | pnpm 9.8.0, no `ignore-scripts` / build allowlist ⇒ ~20 transitive postinstalls | |
| `.github/workflows/security.yml:33` | OSV-Scanner `continue-on-error`, Semgrep no `--error` ⇒ security CI never gates | |
| `pnpm-lock.yaml:16852` | `protobufjs@7.4.0` advisory, reached via Stellar/Trezor, runs a postinstall | |

### Research output — treat 2026 claims as unverified

The 6 research agents returned 49 vectors with real sources for the well-known set
(EIP-7702 delegation phishing, Permit2 signature phishing, the Sept 2025
chalk/debug npm clipper, Shai-Hulud, CVE-2025-29927, CVE-2025-57822, React2Shell
CVE-2025-55182). **But several claimed 2026 incidents were never independently
verified by me** — `@injectivelabs/*` compromise (2026-07-08), axios (2026-03-31),
Mastra (2026-06), Polymarket runtime-loaded code (2026-06-25), CVE-2026-44578.
The Injective one matters because this repo integrates Injective — **verify before
acting on it.** Agents were instructed not to invent CVEs, but that is not a guarantee.

### Ran blind — the cost, and the one thing it bought

The audit was started **without reading `plans/security-audit-tracker.md`**, which
is the canonical map of epic #700. Consequence: a 461-agent workflow spent itself
rediscovering **SEC-01 / #1555**, a known P0 whose fix has been sitting in PR
**#1568** the whole time. The proposed `input: false` refactor duplicated work
already written.

What the blind run *did* buy — worth keeping, though it was luck, not design:

- **Independent corroboration.** Two separate methods (Codex, and this workflow +
  hand-verification) converging on the same P0 is real signal.
- **A hand-verified live-on-main check** that the tracker asserted but didn't prove:
  `git show origin/main:apps/web/lib/auth.ts | grep "input:\|disabledPaths"` → no
  matches. Usable evidence to push #1568 to merge.

**Lesson: read the tracker first.** The next audit should start by diffing against
known findings, then spend its agent budget on the surfaces nobody has looked at
(here: the "Unverified" table above) instead of re-deriving the known.

## Changes During Work

- None in `sodax-frontend` — audit only, no code touched.
- Scope narrowed mid-request by the user from "whole source" to **`apps/web`**.
- Reframed **twice**:
  1. After reading `gh-1560/outcome.md` — stopped re-raising the `minReceive = 0`
     class already dispositioned accepted-risk under SDK-H-1.
  2. After finding `plans/security-audit-tracker.md` (untracked, written the same
     day) — dropped the "this is Phase 3" framing entirely. The phases are already
     numbered and owned; this task is an **independent re-audit** whose findings
     map onto #1555 / #1556 / #1557 / #1559, not a new phase.
