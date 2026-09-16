---
type: plan
repo: sodax-sdks
github: 741
status: Active
updated: 2026-09-03
---

# Plan — Pass 2/3 delta triage → continue in PR #405

## Source

- Comment: <https://github.com/icon-project/ICON-Projects-Planning/issues/741#issuecomment-5437714067>
  (gosiast, 2026-08-27) — two audits at `4a079e7c`, scoped as a delta against the
  2026-08-22 report: **Pass 2** items 1–15 + 1 correction, **Pass 3** N1–N9 +
  13 never-posted items (M15…L27) + 5 amendments.
- Full evidence (triage page): <https://claude.ai/code/artifact/fc39cd4d-e60a-480d-804d-291c2b0a3c78>
- **Tracking issue: [ICON-Projects-Planning#753](https://github.com/icon-project/ICON-Projects-Planning/issues/753)**
  (created 2026-09-03, D-030) — all 43 items as checkboxes, plus the four stale
  corrections found at `22dd56b90`. Tick there as items land; this file stays the
  duplicate-vs-new reasoning and batch ordering.
- Target: PR #405 (`fix/audit-741-quick-wins`, 16 commits @ `a97059d49`,
  ICONEX bot-review parcel D-021 still uncommitted in the tree).

## Verification (2026-08-27, this session)

5-agent read-only fan-out (`wf_67271d66`) re-verified all 33 code-level findings
against the **branch tip** (not `4a079e7c`): **32 confirmed, 1 partially fixed
(P2-12), 0 refuted, 0 already fixed.** Registry/GitHub-settings claims (items 2,
9, N7–N9, half of P2-8/M26) are not locally verifiable — the comment queried them
live; re-check at execution. Nuances the fan-out added:

- **C-6**: the staging-endpoint-on-mainnet ternary is *consistently labeled*
  ("MAINNET staging" banner) — reads deliberate, but diverges from the canonical
  mainnet config (`chains.ts:863-865` = `api.bound.exchange`). Product question,
  not a blind fix.
- **M16**: only **2 scripts / 5 sites** (btc.ts:389,462; near.ts:186,251,341),
  not "5 scripts" — the raw-intent scripts already use real deadlines.
- **N5**: `prepublishOnly` does run pretty+build+test for sdk/wallet-sdk-core
  during publish (ties into L22), but types/libs/swaps-api/dapp-kit/
  wallet-sdk-react publish with build only, and no scanner ever sees a tag.
- **L19**: no SDK runtime consumer of `xTokenManager`/config `walletAddress`
  found — bypass is latent, not live.
- **P2-12**: H-3 (commit `2e216a5f2`) made the scanners blocking, so the
  SKILL.md sentence is *half* true now; the remaining gap is detection coverage
  (= P2-8), not enforcement.

Severity note (standing rule for these audits): headlines are intrinsic.
Effective is lower for several — P2-1 needs a compromised/MITM'd mempool.space
response; N1 needs a hostile backend (same trust model as deferred swap:M-1);
P2-3 triggers only from consumer-side logging. Ordering below is effective
risk × effort.

## Duplicate vs new

### Trùng — already shipped in PR #405, no work

The comment itself confirms these Pass-2 candidates were dropped as in-flight:
**sdk-swap:M-2** (CSPRNG), **secrets-supply-chain:M-3** (token scoping),
**ICONEX hardening**. Nothing else in the comment restates the 2026-08-22 report.

### Trùng with PR-body follow-ups — merge, don't duplicate

| Comment item | Existing PR-body follow-up it extends |
| --- | --- |
| N7 (sole npm maintainer, long-lived token, unused `packages: write`, 2FA question) | "Consider npm OIDC trusted publishing" + env-secret move |
| Item 2 (4 missing tag rulesets, no main-ancestry check) | "Repo settings (admin)" bullet |
| Item 9 (no `required_status_checks` on main ruleset) | same bullet |
| Item 14 (no CODEOWNERS) + dependabot half | "Consider a dependabot.yml" |

Two YAML-doable slivers extracted from these become code items below:
remove unused `packages: write` (×9 workflows); add a tag→main ancestry-check
step to publish workflows.

### Amendments that touch an existing PR-405 disposition

| ID | Amends | Effect on our disposition |
| --- | --- | --- |
| CORR-1 | swap:M-1 (deferred) | Splits out a **cheap S item**: port `case 'BITCOIN': BitcoinRawTxSchema` from `packages/sdk/src/backendApi/rawTxSchemas.ts:169` into `packages/swaps-api/src/rawTxSchemas.ts` (switch at :113-140 lacks it). Do now; note the parked `swap-m1-trial.patch` also touches that file (trivial merge later). |
| C-2 | swap:M-1 (deferred) | `RadfiProvider.createWithdrawTransaction` accepts `recipient` and never sends it (:347 vs body :358-365) — the missing PSBT check is structural. Stays deferred with the M-1 family, but the fix shape changes: send recipient, then assert PSBT outputs. Update the trial notes. |
| C-3 | wallet-react-store:M-1 (won't-fix) | The won't-fix rationale was rehydrate-UX risk. This is the **write** path: `partialize` leaf pass-through (`useXWalletStore.ts:169-172`). Projecting through the sanitizer's shape is S and touches no reconnect logic → recommend flipping to **fix**. |
| C-4 | secrets:I-3 (was Info) | `auth`/`refresh-token` commands print a 7-day refresh token unredacted, no `requireInteractiveStdout` (bitcoin-radfi.ts:971-979 vs :882,:900). Escalation justified → **fix (S)**. |
| C-5 | secrets:L-3 (was Low) | claude.yml: `CROSS_REPO_TOKEN` + allowlisted `Bash(env)`/`Bash(curl *)` = exfiltration primitive (claude.yml:53-58); ai-drift-check.yml is the in-repo safe pattern. **Fix (S)**. |
| C-6 | #354-adjacent | See nuance above — **ask Robi first** (deliberate staging for smoke scripts, or bug?). |
| P2-12 | secrets:H-3 (fixed) | Remaining: soften SKILL.md:19 to the real guarantee, or make it true via P2-8's extra rules. **S, pair with P2-8.** |

### Mới — everything else (all verified confirmed)

Listed in the execution batches below.

## Bot review 2 (PR comment 5441564727) — verified 2026-08-28, BLOCKS the queue

Dual-agent review by R0bi7-sodax-worker at `a97059d49` (does not see the
uncommitted ICONEX parcel). Verdict "Request changes". 5-agent verification
(`wf_2cbcbf78`), one agent per finding, all evidence re-derived from source:

| # | Finding | Verdict | Action | Effort |
| - | ------- | ------- | ------ | ------ |
| R1 | encodeAddress validators break token identifiers in default deposit simulation (High, blocking) | **correct** | **fix in PR now** | S |
| R2 | ICONEX hydration blocks interactive connect ≤300s (Med) | correct at reviewed commit | already fixed in the uncommitted D-021 parcel — commit it, reply "fixed" | S |
| R3 | executeWithdraw `params.dst` misuses hub wallet as recipient+src (Med) | partially correct | reply: true but pre-existing (#1137, `553805bab`); follow-up, not this PR | S–M later |
| R4 | expectedChainId absent on Erc20 approve + 18 other sends (Low) | correct | deliberate D-019 scope A — but approve is the single funnel for ALL EVM approval legs; optional S fix now, else reply + follow-up | S |
| R5 | Stacks raw FT deposit does a fail-closed interface fetch whose result never reaches the signed tx (Low) | correct — and it refutes D-020's "raw path embeds conditions" claim | fix in PR now (skip lookup in raw mode); correct D-020 log | S |

### R1 — the one real regression (fix first)

Verified end-to-end: `SpokeService.deposit` simulates by default for every
non-hub family; `resolveSimulationEncoding` (SpokeService.ts:639) special-cases
only ICON/SUI and otherwise calls `encodeAddress(srcChainKey, token)`. The
agent ran the *real configured identifiers* through the new validators:
Bitcoin `0:0` + `897442:43`, all 5 Injective denoms (`inj`, factory/…, ibc/…,
peggy…), native NEAR `NEAR` — **all throw**. NEP-141 accounts and the 3
assetManager addresses pass, so only the token leg is broken. Bridge's
USER-mode skip doesn't save defaults (packaged walletMode is TRADING;
swap/moneyMarket have no skip). Pre-branch these were utf-8 pass-through;
zero tests cover the path; dapp-kit/demo never set `skipSimulation`.

**Fix:** new `encodeTokenIdentifier(spokeChainId, token)` in shared-utils —
BITCOIN/NEAR/INJECTIVE → utf-8 hex (identifier semantics), rest delegate to
`encodeAddress`; use it for `encodedToken` only (keep the validator on
`encodedSrcAddress`/assetManager). Tests: feed the real configured identifiers
from @sodax/types (no throw) + companion asserts that `encodeAddress` still
rejects them. Do NOT weaken the recipient validators.

### R2 — commit the parcel, then reply

Parcel verified in tree: `request(timeoutMs)`, hydration 30s / interactive
300s, queue freed on timeout (tests prove the exact scenario). Reply after
committing: fixed in `<commit>`; residual ≤30s wait acknowledged; the
availability-probe idea (REQUEST_HAS_ADDRESS) stays a follow-up — Hana is
closed-source, needs a manual extension test (D-021). Optional cheap
hardening if pushed: fail-fast in `reconnectIcon` when
`window.hanaWallet?.available !== true`.

### R3 — true mechanics, wrong urgency

Byte-identical to merge base (only relayData.address changed on this branch,
df130aa75); introduced by #1137. No in-repo caller passes `dst` (documented
public API though). Reviewer under-states the worse half — `srcChainKey:
dstChainKey` broadcasts the spoke tx on the *destination* chain — and
over-states "unrecoverable funds": default simulation should reject the
foreign (srcChain, srcAddress) pair before signing (derived, hub contract not
in repo). Our branch strictly improves this path (BTC/NEAR/INJ dst now fail
closed; expectedChainId refuses wrong-chain signing). Fix sketch (recipient =
native dstAddress; message origin stays source chain; 3 assertions) is in the
wf output — park as follow-up. Also fix the wrong `dst` shape documented in
`packages/skills/.../sodax-dapp-kit/.../dex.md:56` (can ride Batch H).

### R4 — user call: S fix now or reply-and-defer

Single-site fix covers all 8 feature flows (every EVM approval funnels through
`SpokeService.executeErc20ApprovalPlan` → `Erc20Service.approve:237`):
optional `expectedChainId` on Erc20ApproveParams + pass
`getEvmViemChain(params.srcChainKey).id` in the sendApprove closure; guards
the USDT reset leg too. Plus a 1-line tighten of `evm.md:93` (currently easy
to over-read). If deferring instead: reply citing deliberate scope (D-019),
commit to leading the follow-up with this site.

### R5 — fix + correct our own record

Post-conditions land on the in-memory unsigned tx but are dropped by
`serializePayloadBytes(tx.payload)`; `StacksRawTransaction` has no field for
them; `StacksWalletProvider.signAndSendTransaction` hardcodes Allow (
pre-existing). So raw FT deposits gained only a new fail-closed fetch. Fix:
lift post-condition computation out of the raw branch (raw mode = no
interface lookup, 1-line comment why), pass conditions only to the
direct-send path; test asserting no fetch in raw mode. Behavior-neutral for
signed outputs. **D-020's "raw txs carry the conditions too" is wrong — log
corrected.** The real tightening (extend the raw format to carry conditions,
cross-package M) joins the swap:M-1 backend-tx verification follow-up.

### Revised step 0 + reply pack

1. **R1 fix** (blocking) → commit.
2. **Commit the D-021 ICONEX parcel** (message per D-021).
3. **R5 fix** → commit.
4. **R4**: user decides fix-now (S) vs defer-with-reply.
5. Terse PR replies: R1/R5 "fixed in <sha>", R2 "fixed in <sha> + residual",
   R3 "pre-existing (#1137), follow-up", R4 per decision. Then request
   re-review. (Bot also flagged the unreviewed lockfile bytes — reply that the
   lockfile is generated by the override changes, verified via
   `pnpm install --frozen-lockfile` + OSV rescan.)

## Execution plan — PR #405, D-014 cadence (one item → explain → confirm → push)

**Step 0 = the "Revised step 0" above** (R1 → parcel → R5 → R4 call → replies
+ re-review request). The prepared finding-2 reply from the FIRST bot review
is superseded by the R3 reply above (same underlying issue).

**Scope check for the user:** PR #405 has 16 commits; the batches below add
~20 more. D-014 precedent is "same issue → same PR", and every batch below is
same-theme (audit hardening), so default = keep folding. If Robi/review load
says otherwise, the natural cut is Batch CI → separate PR. Confirm before
starting Batch CI.

### Batch F — fund-loss / secret-exposure first (do in this order)

| # | ID | Fix | Effort |
| - | -- | --- | ------ |
| 1 | P2-1 | `BitcoinSpokeService.getFeeRateEstimate`: `Number()` + `Number.isFinite && > 0` guard (+ sanity cap) so a non-numeric mempool.space fee estimate can't NaN-drain change to miners (:154, :331-335, :355-382) | S |
| 2 | P2-4 | `apps/demo/vite.config.ts`: stop inlining the whole build env — `'process.env': {}` + explicit defines for the keys providers.tsx reads (siblings already do this) | S |
| 3 | CORR-1 | Bitcoin rawTx schema port into swaps-api (see amendments table) | S |
| 4 | P2-3 | `BaseWalletProvider`: `toJSON()` + `util.inspect.custom` returning redacted view; 7/9 providers currently serialize key material (evidence per provider in wf output) | M |
| 5 | N1 | `SwapTokenSchema` (swaps-api schemas.ts:35-43): `decimals` → integer 0–255, format checks on address-ish fields. The "reconcile against static token list" half joins the deferred swap:M-1 family (same backend-trust model — keep dispositions consistent). Demo mapper `as Address` casts → `isAddress` | M |

### Batch G — package hardening (S unless noted)

| ID | Fix |
| -- | --- |
| P2-5 | zustand `devtools`: `enabled: process.env.NODE_ENV !== 'production'` in `useXWalletStore.ts:178` **and** `useWalletModalStore.ts:47` |
| C-3 | `partialize`: project connections through the sanitizer's shape (shared helper with persistSanitize.ts) |
| P2-7 | dapp-kit `package.json` files: drop `"src"` (only published pkg shipping source; 28 test files gitleaks-allowlisted) |
| P2-15 | `minOutputAmount > 0n` invariant in `SwapService.createIntent` + `SonicSpokeService.createSwapIntent` |
| C-4 | radfi `auth`/`refresh-token`: `requireInteractiveStdout` + fingerprint-truncate the token echo |
| L8 (M) | Strip instance `x-api-key` when a per-call `baseURL` override changes origin — `api-utils.ts:177-181` + same pattern in `SwapsApiService.buildClient`; generalize `SponsoringApiService.inheritedKeyFor` |
| N2 | Pin `CHAIN_LOGO_BASE_URL`/`TOKEN_LOGO_BASE_URL` (chains.ts:74, tokens.ts:39) from `main` to a tag/SHA; needs a release-process bump note |

### Batch H — apps / reference surfaces

| ID | Fix | Effort |
| -- | --- | ------ |
| M15 | swap-api-example slippage: `s > 100` → `s >= 100` (100% currently yields truthy string `"0"`) | S |
| M21 | demo partner-fee-claim + BridgeCard: `isAddress`/per-chain validation on the 6 user-typed address sites (pattern already at page.tsx:60,:88,:231) | S |
| L21 | mock-sponsoring server: bind `127.0.0.1`; `/__control/*` currently dispatches before the api-key gate | S |
| P2-11 | datadogLogger: replace `dd-api-key`-in-URL guidance with browser client token / proxy | S |
| M22 | Reference scripts 5% → 0.5% haircut behind a named constant (swap.ts:85, flint-deposit.ts:128) | S |
| M16 | btc.ts + near.ts (5 sites): real `deadline` via `getSwapDeadline` + quote-derived `minOutputAmount`, mirroring swap.ts:74-86 | M |
| P2-10 | demo vercel.json: HSTS + CSP with `frame-ancestors` (test against WalletConnect/extension flows), drop X-XSS-Protection | M |

### Batch CI — workflows/repo files (confirm scope with user first)

| ID | Fix | Effort |
| -- | --- | ------ |
| N5 | Verify the artifact on the tag path: lint/checkTs/test (+ scans) in publish jobs, or `workflow_run` gate on green CI+Security for the tagged SHA | M |
| N6 | Move/copy the sdk tarball size:check into sodax-sdk-publish.yml + sdks-publish.yml before `pnpm publish` | S |
| L22 | Non-mutating `prepublishOnly`: check-only Biome in sdk/wallet-sdk-core/skills `ci` chains | S |
| L27 | `concurrency` group on the 8 single-package publish workflows | S |
| M30 | SARIF → `github/codeql-action/upload-sarif` (+ `security-events: write`), drop/shorten public artifacts; semgrep p/secrets currently uploads unredacted match lines | S |
| M26 | `permissions` blocks for ci.yml / changeset-check.yml / lint-pr.yaml | S |
| C-5 | claude.yml: drop `Bash(env)`/`Bash(curl *)`/WebFetch from allowlist, add disallowedTools per ai-drift-check.yml; scope CROSS_REPO_TOKEN read-only | S |
| P2-8 | `.gitleaks-strict.toml`: rules for AWS keys, GitHub PATs, JWTs, Stellar seeds, mnemonics, bare 0x64-hex (entropy-gated) | M |
| P2-12 | Then retrue/soften SKILL.md:19 | S |
| P2-13 | turbo.json: `remoteCache.enabled` off, prune the 10 foreign env names | S |
| N7-sliver | Remove unused `packages: write` from the 9 publish workflows | S |
| Item-2-sliver | Ancestry-check step in publish workflows: refuse a tag not reachable from `main` | S |
| N3-sliver | skills README: pin the `npx skills` instruction to a version, lead with the npm package | S |
| L9 | Add `SECURITY.md` (reporting route) | S |
| Item 14 | Add `CODEOWNERS` (workflows, `.claude/`, `packages/skills` at minimum — owner names need Robi) | S |

### Not in the PR — one consolidated follow-up comment (user posts, extends PR-body follow-ups)

Admin/registry, per repo rule "no extra tracker issues":

- Tag rulesets for `@sdks@*`, `@sodax/libs@*`, `@sodax/skills@*`,
  `@sodax/swaps-api@*` (item 2); `required_status_checks` on the main ruleset
  (item 9); require-codeowner-review once CODEOWNERS lands (item 14).
- Secret scanning: enable non-provider patterns + AI detection (P2-8 half).
- `default_workflow_permissions` → read (M26 half).
- npm: OIDC trusted publishing + 2FA/automation-token question + second
  maintainer (N7); `npm deprecate` all `@sodax/wallet-sdk` versions (N8);
  register stub `sodax`/`sodax-sdk`/`sodax-sdks` (N9).
- Private vulnerability reporting toggle (L9 half).
- Environment `npm-publish`: required reviewers + move the token in (already in
  PR body).

### Decision-needed / deferred (raise in the same comment or PR thread)

- **Item 6 (Soroban `assembleTransaction`)** — whether a crafted auth entry is
  exploitable needs a Stellar engineer; interim option: schema-validate
  `CustomSorobanServer` responses (M). Don't guess.
- **C-6** — staging endpoints on the mainnet branch of btc.ts/bitcoin-radfi.ts:
  deliberate? Ask Robi before changing.
- **L19** — empty-string addresses in shipped config: latent (no runtime
  consumer); M-effort type change; defer or late batch.
- **C-2 + N1-reconcile half** — deferred swap:M-1 family (trial parked as
  `swap-m1-trial.patch`).
- **N4** — SBOM for `@sodax/libs` inlined deps; minimum viable: document the
  `noExternal` set in the package README (S), CycloneDX later.
- **L26** — user's own `.claude/settings.local.json` pre-approves `--no-verify`
  commits; local machine cleanup, not repo work.

## Standing next actions (unchanged from brief)

Staging Stacks FT+STX deposit test before merge · post the 2026-08-22 sign-off
comment (`review-comment.md`) · 🟠 dispositions comment (D-022/D-023 rationale)
· Robi confirms relayData (D-011) and the relay-side P2PKH/P2SH question (D-017).

## Tracking checklist (tick as items land)

Front of queue — bot review 2:

- [x] R1 `encodeTokenIdentifier` split in simulation encoding — `7f287f56b`, BOT-R1 tests in `shared-utils.test.ts`
- [x] Commit the D-021 ICONEX parcel (answers R2) — `757ba5781`, pushed 2026-08-28
- [ ] R5 Stacks raw: lift post-conditions out of the raw branch
- [ ] R4 decision: guard the approval funnel now (S) vs reply-and-defer
- [ ] Terse replies R1–R5 + lockfile note → request re-review

Batch F — fund-loss/secret: [ ] P2-1 · [ ] P2-4 · [ ] CORR-1 · [ ] P2-3 · [ ] N1
Batch G — packages: [ ] P2-5 · [ ] C-3 · [ ] P2-7 · [ ] P2-15 · [ ] C-4 · [ ] L8 · [ ] N2
Batch H — apps: [ ] M15 · [ ] M21 · [ ] L21 · [ ] P2-11 · [ ] M22 · [ ] M16 · [ ] P2-10
Batch CI (confirm scope first): [ ] N5 · [ ] N6 · [ ] L22 · [ ] L27 · [ ] M30 · [ ] M26 · [ ] C-5 · [ ] P2-8 · [ ] P2-12 · [ ] P2-13 · [ ] N7-sliver · [ ] item2-sliver · [ ] N3-sliver · [ ] L9 · [ ] P2-14
Wrap-up: [ ] admin/registry follow-up comment (user posts) · [ ] decision items raised (P2-6, C-6, L19, N4) · [ ] Stacks staging test · [ ] sign-off comment

## Bookkeeping while executing

- PR body status table gets a **"Pass 2/3"** section; one row per landed item.
- Log decisions in `decisions.md` (next id: D-031); bump `brief.md` same edit.
- Verify each item against source at fix time (line refs above are from the
  2026-08-27 fan-out at `a97059d49` + uncommitted ICONEX parcel).
