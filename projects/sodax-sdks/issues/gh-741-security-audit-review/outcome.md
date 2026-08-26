---
type: outcome
repo: sodax-sdks
github: 741
status: Reviewed — ready to sign off (with caveats)
updated: 2026-08-26
---

# Outcome — GH-741 Security Audit Review

- PR: — (review/sign-off task, no code change in scope)
- Verification basis: origin/main `75dec7011` (2026-08-25) exported read-only;
  cross-checked with live OSV + npm registry queries (2026-08-26)
- Method: 10-agent verification fan-out, one cluster per agent, every conclusion
  carries file:line evidence from the main snapshot. See `process.md`.

## Summary (the verdict)

The audit is **accurate and safe to sign off**, with caveats about how its
severity is presented and a short list of corrections. Bottom line for a reader
who wants one paragraph:

- **No fabricated findings.** Every load-bearing code claim across the full High +
  Medium tier re-derives from source (only line numbers drift, from post-audit
  refactors). The audit even refuted 3 of its own findings correctly.
- **No attacker-reachable fund-loss vector. 0 Critical is correct.** The 101
  findings decompose into ~1 real functional bug (bnUSD hub migration bricked), a
  cluster of first-party-backend **trust assumptions** (blind-signed backend txs,
  relay-status trust), and a long tail of supply-chain hygiene + robustness
  footguns. None is exploitable by an arbitrary third party.
- **The "6 High" headline is intrinsic; effective is 0 High / 15 Medium** — the
  audit says so itself. Read it by effective severity, not the headline.
- **The audit's main distortion is remediation-difficulty, not lie-about-bugs**:
  it twice claimed "no upstream fix exists" when the fix predated the audit, and
  misread the axios pin as protective when the pin is what holds axios back.
- **Some findings were already fixed after the audit date** (ledger stale):
  shell-quote, react-router, ICON relay hardening (2 of 3 copies).

## Is the audit accurate? — Yes, unusually so for an AI audit

Every High and Medium was checked against `origin/main` source. Result: all
present-on-main findings had their concrete code claims confirmed; the
disagreements are about **severity calibration and remediation framing**, never
about whether the code says what the audit says.

## Where the audit OVERSTATES

1. **Headline reads scarier than reality.** "6 High" is intrinsic severity;
   effective is 0 High. A skim reader over-weights it.
2. **sdk-swap:M-2 (Math.random intent ID) — intrinsic Medium is inflated.** The
   intentId is not a security token: the on-chain intent identity is
   `keccak256` of the full ABI-encoded struct (creator/tokens/amounts,
   `EvmSolverService.ts:366-375`). Predicting it enables neither forgery nor
   front-running; cancel needs the full matching struct (`EvmSolverService.ts:400`).
   Genuinely Low/Info (CWE-338 hygiene). Still worth a <2h CSPRNG fix for the
   repo's own "CSPRNG only" rule.
3. **"No upstream fix exists" claimed twice when the fix predated the audit** —
   overstating remediation difficulty:
   - shell-quote (H-4): audit says affected "through 1.8.4"; 1.8.4 published
     2026-05-22, 1.9.0 on 06-25, 1.10.0 on 07-10 — all before the 08-22 audit,
     and main already resolves the clean **1.10.0** (`pnpm-lock.yaml:9971`).
   - protobufjs (M-6): recommendation says "retarget to >=7.6.5 once released";
     7.6.5 published 2026-07-04, seven weeks before the audit.
   - axios (H-1): the audit reads the `1.13.2` pin as intentional protection.
     Every upstream range is `^1.x` (`@injectivelabs/sdk-ts`/`utils` declare
     `^1.13.2`), so **the exact pin is what holds axios at the vulnerable
     version** — dropping/raising it resolves 1.19.0 and clears all 29 live OSV
     advisories while still de-duplicating.
4. **secrets-supply-chain:H-3 "every enforcement point is soft" — half wrong.**
   `dependency-review-action@v4` and CodeQL in the same `security.yml` are NOT
   `continue-on-error`; dependency-review blocks newly introduced vulnerable deps
   at PR time. The secret-scanning half (gitleaks/OSV/semgrep all soft, husky hook
   runs no secret scan) is fully correct and is the real gap — the repo's
   `apps/node` scripts consume real mainnet `PRIVATE_KEY` env.
5. **wallet-sdk-core:M-1 — the "domain-less ECDSA reusable under any EVM
   ecrecover" half is overblown.** That raw-keccak256 path exists ONLY on the
   private-key/node branch (`BTCWalletProvider.ts:150-159`); browser connectors
   delegate to wallet-native prefixed signing, so it is not the phishing surface.
   The load-bearing half (bare `Date.now()` login message, no domain/nonce,
   `RadfiProvider.ts:176`) is real and correctly Medium. The audit's own
   verification already walks the ECDSA half back.
6. **crosschain-encoding:M-4 — effective severity mildly overstated.** The default
   `walletMode` is TRADING (`chains.ts:862`), which substitutes the RadFi trading
   address into `src_address` (`BitcoinSpokeService.ts:635-640`); a user's
   case-sensitive Base58Check address only reaches the lowercasing under the
   non-default USER mode. Code claim (unconditional `toLowerCase`,
   `btc-utils.ts:75`) is exactly right.
7. **sdk-bridge-migration:M-1 — anchor misplaced.** The documented Sonic-source
   flow uses `action='revert'`, under which the spender is CORRECT
   (`MigrationService.ts:226-228`). The flow is bricked at the *approve* step
   (no hub unified-bnUSD approve path under either action), not by a wrong
   spender. "Users burn gas on reverts" is unlikely — it fails at gas estimation.
   The conclusion ("documented flow unusable via SDK helpers") still stands, and
   the repo's own tests lock in the broken behavior
   (`MigrationService.test.ts:296-310, :616`).
8. **sdk-intent-relay:M-1 refutation cites a false mitigation.** The refutation
   text says "spoke.verifyTxHash confirms the source tx before polling" — but
   `verifyTxHash` fails open for EVM/ICON/Injective/Bitcoin
   (`SpokeService.ts:1091-1117`), which is exactly the audit's own L-9 finding.
   The refutation's *conclusion* (relay status trust = documented first-party
   trust assumption, not a vuln) is still sound.

## Where the audit UNDERSTATES / MISSES

1. **BTC private-key wallet signs PSBTs with no confirmation UI at all**
   (`BTCWalletProvider.ts:120-135`, `psbt.signAllInputs`). The "user reviews the
   wallet confirmation screen" mitigation the whole sdk-swap:M-1 argument leans on
   does not exist on this path — this strengthens the audit's own case.
2. **ws@7.5.10 is runtime, not dev-only** (H-2): pulled by `jayson` under
   `@solana/web3.js`, `@cosmjs/socket` under `@injectivelabs/sdk-ts`, and
   `@walletconnect/jsonrpc-ws-connection`. react-devtools now resolves the clean
   7.5.13 instead. Finding is marginally worse than written.
3. **next@16.2.6 carries 4 HIGH advisories**, the audit cites only 1 (M-5).
4. **`ai-drift-check.yml` (merged after the audit)** adds 4 more mutable tag refs
   plus `id-token: write`, enlarging M-1's surface: now **58 refs / 15 workflows**,
   still 0 SHA pins (audit said 53/14).
5. **`sdks-publish.yml` also has `id-token: write`** (M-3): code in the
   install/build steps can mint an OIDC token, not just read `NODE_AUTH_TOKEN`.
6. **dex `executeWithdraw` dst branch has a second bug** the audit missed:
   recipient is derived as the dst-user's hub wallet while the message executes on
   `fromHubWallet` (`AssetService.ts:413`).
7. **Partial remediation drift:** ICON relay was hardened in 2 of 3 duplicated
   channel implementations (comment credits "Security audit WALLET-L-1",
   `IconWalletProvider.ts:185-188`), but
   `wallet-sdk-react/src/xchains/icon/iconex/index.tsx` still ships the raw
   first-response-wins version (no timeout, no address validation).

## Already fixed since the audit date (ledger "0 fixed" is stale)

- **shell-quote** → 1.10.0 (OSV-clean). H-4 effectively closed.
- **react-router** → 7.18.2 via #313/`ff345adac` (OSV-clean). M-5's react-router
  half closed; only next@16.2.6 remains.
- **ICON relay** hardened in wallet-sdk-core + sdk (2 of 3 copies).

## Per-finding verdict table (High + Medium)

Legend: Acc = code claims accurate · Sev = severity calibration · on-main = still
present at `75dec7011`.

| ID | Acc | on-main | Sev verdict | Fix effort |
| --- | --- | --- | --- | --- |
| sdk-swap:M-1 (blind-sign backend tx) | yes | yes | fair (intrinsic High / effective Med) | large ~4-6d full; 0.5d min (schema tighten) |
| secrets-supply-chain:H-1 (axios pin) | yes | yes | fair | trivial ~0.25d |
| secrets-supply-chain:H-2 (ws) | partial (paths) | yes | fair, slightly worse than written | small ~0.5d |
| secrets-supply-chain:H-3 (CI non-blocking) | partial | yes | fair (dep half weaker) | medium ~1-2d |
| secrets-supply-chain:H-4 (shell-quote) | partial (stale) | **no** (fixed) | fair | trivial (<0.5h, done) |
| sdk-staking…:H-1 (dst misroute) | yes | yes | **refuted** — residual Low correct | small ~0.5d |
| wallet-sdk-core:M-1 (bare-timestamp login) | partial | yes | fair, ECDSA-half overblown | trivial SDK 1h; nonce/revoke needs server |
| dapp-kit:M-1 (RadFi tokens in localStorage) | yes | yes | fair | small ~0.5-1d (revoke needs server) |
| sdk-bridge-migration:M-1 (bnUSD hub migrate) | yes | yes | fair (functional bug, not sec) | small ~0.5d |
| sdk-bridge-migration:M-2 (encodeAddress) | yes | yes | fair (effective Low) | medium ~1d |
| intent-fund-flow:M-1 (no chain binding) | yes | yes | fair | medium ~1-2d |
| intent-fund-flow:M-2 (Stacks PostCond Allow) | yes | yes | fair | medium ~1-2d |
| crosschain-encoding:M-4 (lowercase src_addr) | yes | yes | fair intrinsic, effective overstated | trivial <2h + relay coord |
| sdk-money-market:M-1 (eMode bitmap misindex) | yes | yes | fair (display-only) | small ~0.5-1d |
| sdk-swap:M-2 (Math.random intent ID) | yes | yes | **overblown** → Low/Info | trivial <2h |
| wallet-sdk-react-providers-chains:M-1 (ICONex) | partial | changed | fair | small ~0.5d |
| wallet-sdk-react-store:M-1 (persisted xConn) | yes | yes | fair (effective Low) | medium ~1-3d |
| sdk-staking…:M-1 (relayData.address) | yes | yes | fair (functional) | trivial <2h |
| sdk-staking…:M-2 (minOut=0) | yes | yes | **refuted** — residual Low fair | small ~0.5-1d |
| sdk-staking…:M-3 (baked unstake quote) | yes (in-repo) | yes | fair | medium (full fix needs contract) |
| sdk-intent-relay:M-1 (relay status trust) | yes | yes | **refuted** — residual Info/Low fair | medium ~1-2d; doc-only <2h |
| secrets-supply-chain:M-1 (mutable tags) | yes | changed (58/15) | fair | small ~0.5d |
| secrets-supply-chain:M-2 (no release-age) | yes | yes | fair, ^-range half overblown | small ~0.5d |
| secrets-supply-chain:M-3 (token job-level) | yes | yes | fair | trivial <1h |
| secrets-supply-chain:M-4 (bigint-buffer) | yes | yes | fair | small ~0.5d (patch) |
| secrets-supply-chain:M-5 (next/react-router) | partial | changed (RR fixed) | fair | trivial <2h |
| secrets-supply-chain:M-6 (protobufjs) | yes | yes | fair | trivial <2h |

Low-tier spot-check (6 suspect findings: deepMerge L-1, verifyTxHash L-9,
money-market L-1/L-2, providers M-3, dapp-kit L-1): **none warrants upgrade to
Medium+**; the Low tier is internally consistent and if anything slightly
conservative. Swallowed-error-to-benign-value patterns (0n balances, fail-open
verify) are correctly Low because no signing/fund path gates on those values.

## Fix-effort roadmap

**Tier 1 — mechanical + verified-real bug, ~3-4 engineer-days (do now):**
axios override →1.19.0 (0.25d); ws ranged overrides (0.5d); protobufjs pin 7.6.5
+ next ^16.2.11 (<0.5d); bigint-buffer pnpm patch (0.5d); scope NODE_AUTH_TOKEN to
publish step (<1h); bnUSD hub migration fix + correct the 2 tests locking wrong
behavior (0.5d); dex relayData.address→fromHubWallet (<2h); CSPRNG randomUint256
(<2h); port ICONex hardening into wallet-sdk-react (0.5d).

**Tier 2 — supply-chain hardening, ~2-3d:** SHA-pin 58 action refs + environment
gate on 9 publish workflows (0.5d); `minimumReleaseAge` (0.5d); make
gitleaks/OSV/semgrep blocking after baselining (1-2d).

**Tier 3 — design-level, ~10-15d (needs architecture decisions):** client-side
decode-and-verify for backend-built txs — EVM approve/createIntent + PSBT outputs
(4-6d full; 0.5d schema-tighten minimum); bind `expectedChainId` for EVM (1-2d);
Stacks post-conditions (1-2d, raw path needs type change); encodeAddress
validators for BTC/NEAR/INJ (1d); RadFi tokens out of localStorage + domain-sep
login message (0.5-1d SDK-side — true revoke/nonce needs a **Bound Exchange
server** change, outside this repo); rehydrate re-verify BTC/NEAR/STACKS (1-3d);
fix executeWithdraw dst branch (0.5d).

## Sign-off recommendation

**Sign off** with these notes attached: (a) read severity by *effective*, not the
"6 High" headline; (b) the already-fixed list above (so nobody re-triages
shell-quote/react-router/ICON); (c) Tier 1 should become concrete follow-up tasks;
(d) the audit self-verified only 7/101 entries — this review independently
cross-checked the entire High + Medium tier plus a Low spot-check, so the
coverage gap is now closed for the load-bearing findings.

## Follow-ups

- Draft sign-off comment for the issue: `review-comment.md` (this folder) — NOT
  posted; awaiting user to post or ask.
- If the team wants the fixes: Tier 1 is a single ~half-week PR; Tier 3 items
  should be split into their own issues (esp. the backend decode-and-verify and
  the Bound Exchange server-side session changes, which are cross-repo).
