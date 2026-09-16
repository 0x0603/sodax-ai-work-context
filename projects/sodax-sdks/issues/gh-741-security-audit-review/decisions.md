---
type: decision-log
repo: sodax-sdks
github: 741
status: Active
updated: 2026-08-26
---

# Decision log — GH-741 audit fixes

Running log of every decision made while implementing the audit follow-up fixes.
One entry per decision. "Who": You = user, Claude = me, Both = agreed. Newest at
the bottom. When a decision changes something in the sdks repo, the entry names
the branch/file so it can be traced.

Branch for all implementation: **`fix/audit-741-quick-wins`** (sodax-sdks), based
on `origin/main`. One branch for the whole 🟢 "fix now" batch — see D-001.

---

## D-001 · Branch strategy — one branch for the whole 🟢 batch
- **When:** 2026-08-26 · **Who:** Both
- **Decision:** Implement the audit fixes on a single branch
  `fix/audit-741-quick-wins` cut from `origin/main`, not a branch per finding.
- **Why:** repo/team convention is one branch per feature; the 🟢 batch is one
  logical unit ("audit quick wins") and ships as one PR. Base is `origin/main`
  (the working tree was on a stale `feat/robinhood-money-market`, clean, no WIP).
- **Status:** done — branch created, tracking origin/main.

## D-002 · axios override → fixed version `1.19.0`
- **When:** 2026-08-26 · **Who:** You asked for a fixed number; Claude picked 1.19.0
- **Decision:** In `pnpm-workspace.yaml` change the axios override from `"1.13.2"`
  to a fixed `"1.19.0"` (a single pinned version, not a range, not latest).
- **Why:**
  - 1.13.2 sat inside ~29 OSV advisories (secrets-supply-chain:H-1). 1.19.0
    returns **0 vulns** on OSV.
  - `@injectivelabs/sdk-ts` and `@injectivelabs/utils` both declare `axios: ^1.13.2`
    (the only path that pulls axios), so 1.19.0 satisfies them with no conflict.
  - **Not `1.20.0`** even though it is latest: it was published **today
    (2026-08-26)**, hours before this change. Jumping onto a same-day release is
    exactly what audit finding M-2 (no release-age cooldown) warns against. 1.19.0
    was published **2026-07-29** — ~4 weeks stable.
  - Kept as an **override** (not a package `dependencies` pin) because no SODAX
    package depends on axios directly; it only enters transitively via Injective.
- **Status:** done + pushed as commit `57b5036d7` on `fix/audit-741-quick-wins`.
  Lockfile resolves a single `axios@1.19.0`, zero `1.13.2` remaining. Pre-commit
  hook (checkTs + build + test, 18 tasks) passed.

## D-003 · No autonomous commit/push
- **When:** 2026-08-26 · **Who:** Both (standing rule)
- **Decision:** Claude edits files but never runs `git commit`/`push` on the sdks
  branch or the context repo unless you ask in that same message.
- **Why:** repo rule + your workflow — you trigger commits.
- **Status:** standing. axios change is staged in the working tree only.

---

## D-004 · ws override → fixed per major (`ws@7`→7.5.13, `ws@8`→8.21.3)
- **When:** 2026-08-26 · **Who:** Both (you want fixed numbers; Claude picked the versions)
- **Decision:** Add two overrides in `pnpm-workspace.yaml`:
  `"ws@7": "7.5.13"` and `"ws@8": "8.21.3"`.
- **Why:**
  - Unlike axios, the tree carries **two majors at once**: 7.x (via `jayson` under
    @solana/web3.js and `@cosmjs/socket` under @injectivelabs, range `^7`) and 8.x
    (via rpc-websockets/@solana/web3.js, @injectivelabs, ethers, walletconnect,
    range `^8`). Forcing everything to one number would push 7.x consumers across a
    major break — so pin **per major** instead.
  - The vulnerable copies (7.5.10, 8.17.1, 8.18.0-8.18.3, 8.20.1) all sat in
    GHSA-96hv-2xvq-fx4p (memory-exhaustion DoS) and some in GHSA-58qx-3vcg-4xpx
    (uninitialized-memory disclosure). **7.5.13** and **8.21.3** both return 0 OSV
    vulns and satisfy the consumers' `^7` / `^8` ranges.
  - **8.21.3** is the latest 8.x but published **2026-08-07** (~3 weeks stable,
    not same-day) so it clears the release-age concern; 7.5.13 shipped 2026-07-17.
- **Status:** done + pushed as commit `64b394360` on `fix/audit-741-quick-wins`.
  Runtime `ws` now resolves only 7.5.13 / 8.21.3, no vulnerable copy left
  (`@types/ws@8.18.1` is a type-only devDep, harmless). Pre-commit hook passed.
- **Breaking check (you asked):** none found. (1) SODAX imports `ws` nowhere —
  it is purely transitive, so no first-party call site touches its API. (2) No
  major jump: 7.5.10→7.5.13 and 8.17-8.20→8.21.3 stay inside their major.
  (3) Consumer ranges are satisfied — jayson `^7.5.10`, @cosmjs/socket `^7`,
  rpc-websockets `^8.5.0`; `pnpm install` reported no ws peer conflict.
  (4) ws changelog across the bumped range is bug/security fixes + additive
  options only (8.21.0's maxFragments/maxBufferedChunks default off) — no API
  removals. (5) `pnpm build:packages` = 7/7 packages pass, exit 0. Real WebSocket
  behavior (Solana/Injective subscriptions) is only exercised by the mainnet
  e2e/smoke suite, not unit tests — flag for the PR, but no breakage expected.

## D-005 · protobufjs override → fixed `7.6.5`
- **When:** 2026-08-26 · **Who:** Both
- **Decision:** Change the override `protobufjs: "^7.5.8"` → exact `"7.6.5"`.
- **Why:** the floating `^7.5.8` still resolved 7.6.0, inside three advisory
  ranges (unbounded Any, property shadowing, .proto infinite loop). 7.6.5 (latest
  7.x, published 2026-07-04, OSV-clean) clears all three; only pulled via
  @trezor/protobuf, whose exact spec the override already supersedes.
- **Status:** done + pushed as commit `7f985dca8`. Resolves protobufjs@7.6.5.

## D-006 · next → pin `16.2.12` in example-next-js-16
- **When:** 2026-08-26 · **Who:** Both
- **Decision:** In `apps/example-next-js-16/package.json`, change `next: "^16.0.0"`
  → exact `"16.2.12"`.
- **Why:** the floating range resolved 16.2.6, inside four HIGH advisories
  (middleware/proxy bypass, SSRF in Server Actions + rewrites, Server Actions DoS).
  16.2.12 is the latest 16.2.x (2026-07-25, OSV-clean). App is private/unpublished,
  so exact pin is fine.
- **Status:** done + pushed as commit `f0f6d286e`. Resolves next@16.2.12.

## D-007 · bigint-buffer CVE-2025-3194 — patch now, alias preferred
- **When:** 2026-08-26/27 · **Who:** Both (you dislike the patch approach)
- **Decision (current):** pushed a pnpm patch that drops the native binding so the
  safe pure-JS path is used. **Pending switch:** replace the patch with an
  override alias `bigint-buffer: "npm:@trufflesuite/bigint-buffer@1.1.10"` (Truffle
  fork, OSV-clean, drop-in) — no patch file to maintain.
- **Why:** bigint-buffer@1.1.5 is abandoned (since 2022, no upstream fix) and has
  an unpatched native buffer overflow. It enters via TWO paths — `@solana/web3.js`
  (direct `bigint-buffer: ^1.1.5`) and `@solana/spl-token` → `buffer-layout-utils`
  → bigint-buffer. Both patch and alias target bigint-buffer itself, so they close
  both paths in one line. Bumping web3.js/spl-token cannot remove it: spl-token
  0.4.x (through latest 0.4.15) always pulls buffer-layout-utils.
- **Status (updated 2026-08-27):** patch commit `c0cebc27f` **reverted** — dropped
  from the branch tip via ref update + force-push, so `fix/audit-741-quick-wins`
  now holds 4 deps commits (axios/ws/protobufjs/next), no bigint change. Per your
  call, **bigint-buffer is left UNPATCHED** — CVE-2025-3194 stays open until the
  deferred kit v8 migration (D-008). This is acceptable because the CVE is
  **availability-only (crash/DoS), NOT fund-loss** (CVSS C:N/I:N/A:H) and needs a
  hostile Solana RPC. Alias remains available anytime if we want to close it sooner
  without waiting for the migration.

## D-008 · @solana/kit v8 migration — DEFERRED (note, don't do now)
- **When:** 2026-08-27 · **Who:** You (decided to wait)
- **Decision:** Do NOT migrate `@solana/web3.js` 1.x → `@solana/kit` v8 now. Note
  it as future work; wait until kit 8.x matures, then upgrade straight to the
  latest stable at execution time.
- **Why:** this is the only way to truly remove bigint-buffer (kit v8 uses native
  BigInt/DataView, drops buffer-layout-utils). But: (1) `@solana/kit@8.0.0` and
  `@solana-program/token@0.16.0` were both released **2026-08-21 — 6 days ago**;
  jumping onto a brand-new major is exactly the release-age risk the audit flags,
  worse than the axios 1.20.0 we deliberately avoided. (2) It is a full **rewrite**
  (not a bump) of the Solana surface across `sdk` + `wallet-sdk-core` +
  `wallet-sdk-react` — connection/tx/sign/decode APIs all change, plus
  `spl-token 0.4.x → @solana-program/token`. Rewriting a lot of code to fix a
  LOW-severity CVE is disproportionate and adds more risk than it removes.
- **Scope when done:** 3 packages, breaking API migration, needs its own plan +
  tests; repo has no PR-time e2e, so mainnet smoke testing is required.
- **How to track:** per repo convention (no extra tracker issues), raise this in
  the audit PR thread as deferred follow-up, not a new GitHub issue. This entry is
  the record.
- **Wait on BOTH, not just kit:** `@solana-program/token@0.16.0` (the spl-token
  successor) is still a **0.x pre-1.0** release (API not yet stable) and also
  shipped 2026-08-21. So the migration waits on both `@solana/kit` reaching a
  settled 8.x AND `@solana-program/token` reaching a stable (ideally ≥1.0) line —
  then upgrade both to their latest at execution time.
- **Status:** deferred. Revisit when kit 8.x AND @solana-program/token have
  matured (target: a few months).

## D-009 · CI — scope npm publish token to the publish step (secrets-supply-chain:M-3)
- **When:** 2026-08-27 · **Who:** You asked "safe? then do it"; Claude assessed safe + did it
- **Decision:** In `.github/workflows/sdks-publish.yml`, remove the job-level
  `env: NODE_AUTH_TOKEN` and set it only on the "Publish packages" step.
- **Why:** at job level, checkout/install/build all inherited the npm publish
  token; only publish needs it. If any install/build-time dependency ran hostile
  code it could read the token and publish poisoned @sodax/* packages. Moving it
  to the publish step follows least-privilege and matches the 8 sibling
  per-package workflows (which already scope it correctly).
- **Safety:** low risk — YAML-only, 2 lines moved, no code/lockfile change;
  install/build genuinely don't need the token (public registry + local tsup);
  the sibling workflows prove `setup-node` registry-url + `$NODE_AUTH_TOKEN`
  resolves fine when the token is present only at publish time.
- **How:** done in a throwaway git worktree of the audit branch so the user's
  `feat/leverage-positions` WIP was never touched.
- **Status:** done + pushed as commit `63e39a0cd`. Branch now has 5 commits.

## D-010 · Code fix #8 CSPRNG (getRandomBytes) — committed first of group B
- **When:** 2026-08-27 · **Who:** You drove it ("commit getRandomBytes đi")
- **Decision:** `getRandomBytes` now uses `globalThis.crypto.getRandomValues` with an
  explicit availability guard (you asked for the guard), plus 4 unit tests. Web
  Crypto is the right isomorphic CSPRNG here: the build is `platform: 'neutral'`
  (must run browser + Node), and `globalThis.crypto` is guaranteed by the repo's
  `engines.node >=22.12`. It is NOT an XSS defense — a script that runs in the page
  can monkey-patch any RNG; and intentId is not a secret anyway (on-chain identity
  is a keccak of the whole struct), so this is a repo-standard hygiene fix.
- **How committed independently:** the group-B code fixes all sit uncommitted in
  one working tree; the pre-commit hook runs the full test suite, and fix #6 bnUSD
  makes 2 old tests red. So bnUSD was stashed while committing CSPRNG, then popped
  back. Order to commit group B: independent ones first (CSPRNG done, relayData,
  ICONex), bnUSD last (needs its 2 tests rewritten).
- **Status:** done + pushed as commit `86842c8e8`. Branch now has 6 commits.
  Remaining uncommitted in the tree: #6 bnUSD, #7 relayData, #9 ICONex.

## D-011 · Code fix #7 relayData destination — committed
- **When:** 2026-08-27 · **Who:** You approved after questioning it ("ok commit push đi")
- **Decision:** `AssetService.executeWithdraw` now sets `relayData.address` to
  `fromHubWallet` (was the spoke `recipient` / `params.srcAddress`), plus a new
  `AssetService.test.ts`.
- **Why it IS a bug (verified in code, not from the audit's word):** `relayData.address`
  is documented in IntentRelayApiService as "address on the Hub chain ... Required
  for Solana and Bitcoin; ignored for all other chains." In the same function the
  spoke `sendMessage` commits `dstAddress: fromHubWallet` (line 413), so the relay
  destination must equal `fromHubWallet`. The original code used `recipient`
  (= spoke srcAddress ≠ fromHubWallet) — an internal contradiction; `executeDeposit`
  and the sibling DEX/staking services all use the hub wallet.
- **Flow:** this is the **DEX liquidity withdraw** path (`sodax.dex.assetService`,
  dapp-kit `useDexWithdraw`, demo ManageLiquidity) — NOT swap/staking. Effective
  low: only Solana/BTC use relayData.address, no test existed, real-world usage
  unconfirmed. Not fund-loss (availability only; assets stay in the hub wallet).
- **Note for the PR:** the buggy line was written by **Robi** (commit `a30abe4736`,
  2026-05-03), who also owns issue #741. Flag it for Robi to confirm in the PR since
  it is their code and the Solana/BTC branch is untested on-chain.
- **Status:** done + pushed as commit `df130aa75`. Branch now has 7 commits.
  Remaining uncommitted: #6 bnUSD, #9 ICONex.

## D-012 · Code fix #6 bnUSD (sdk-bridge-migration:M-1) — IGNORED, investigate later
- **When:** 2026-08-27 · **Who:** You (product call)
- **Decision:** Do NOT fix bnUSD now. Reverted the code change (was uncommitted).
  Note for later; likely NOT a real fix to make.
- **Why (your product insight):** migration exists to move tokens legacy → new;
  the **new → old** direction that this "bug" breaks is something almost nobody
  wants. If new→old shouldn't exist, the right fix is to **hide/disable it in the
  frontend**, not to add SDK plumbing for a pointless flow.
- **What the live UI investigation actually found** (sodax-frontend migrate tab,
  screenshot Sonic→Sui): the stuck path is **new bnUSD FROM Sonic (hub) → legacy**.
  The bnUSD tab always calls `action: 'migrate'` (isRevertDirection is ICX&SODA-only,
  migrate-button.tsx:65,118); source Sonic ⇒ needsApproval=true; the allowance check
  uses the wrong spender AND `approve('migrate')` for a hub source throws
  `invariant(false, 'Invalid params for migrate action')` (MigrationService.ts:87).
  So the real gap is `approve('migrate')` hub bnUSD — NOT the `revert` branch the
  audit/survey pointed at. new→old from a non-hub EVM spoke, and all old→new, work.
- **Correction to earlier assessment:** the audit's sdk-bridge-migration:M-1 and my
  survey framed this as a `revert` check-then-approve gap with a small "just do it"
  fix (CHANGE A/B). The UI shows it is the `migrate`+hub path, and — more importantly —
  it guards a direction that may be a product mis-feature. So M-1 is "code-accurate,
  fix-questionable": don't schedule the SDK fix until product intent is confirmed.
- **If it does need fixing:** SDK side is easy (~0.5d — mirror the revert approve
  branch into the `migrate` action for hub bnUSD, spender = getUserRouter) but needs
  Robi's confirmation on migrate/revert semantics + a mainnet/staging test (no PR e2e).
- **Status:** ignored/deferred; code reverted, branch clean of bnUSD. Raise in the
  audit PR thread as a product question, not a new GitHub issue.

## D-013 · Code fix #9 ICONEX channel hardening — committed; NO dedup
- **When:** 2026-08-27 · **Who:** Both
- **Decision:** Hardened the wallet-sdk-react ICONEX channel to **parity** with the
  already-hardened wallet-sdk-core / sdk copies: serialize (single-flight queue),
  correlate by expected response type, 300s timeout + listener cleanup, validate
  `isIconAddress` before storing the account, try/catch on the hydration reconnect.
  Committed with tests (correlation blocks a forged event; timeout; forged payload
  → undefined).
- **NO dedup (you rejected refactor C):** the 3 duplicate impls stay separate.
  Reason we did NOT gom them into one source: `@sodax/libs` docs are explicit it is
  for **third-party build-workarounds only** ("if npm import just works, it doesn't
  belong here"), so first-party channel logic must not go there; `@sodax/types` is
  DOM-free; sdk doesn't depend on wallet-sdk-core. A true dedup would need a NEW leaf
  package (`@sodax/icon-common`) — out of scope, and you chose to keep it as-is.
- **Safety:** high — a faithful port of the production-tested core impl (verified
  side-by-side: same 300s timeout, queue, correlation, isIconAddress). Not fund-loss;
  closes an identity-spoofing / hang gap on the ICON wallet connect used by ICON→Sonic
  migration. Real browser+Hana behavior not covered by unit tests (no PR e2e).
- **Status:** done + pushed as commit `89b84f143`. Branch has 8 commits. Working
  tree clean — group B complete (bnUSD ignored per D-012).

## D-014 · Hardening tier (former "PR-2") folds into PR #405 — same issue, same branch
- **When:** 2026-08-27 · **Who:** You
- **Decision:** The 🔵 should-fix hardening items do NOT get a separate PR-2.
  All of them land on `fix/audit-741-quick-wins` / PR #405 — "đều chung 1 issue".
  Cadence: implement one item → explain → user confirms → push → next item.
  The PR body carries a per-item status table (ID | Issue | Fix | Status),
  now with a "Hardening" section.
- **First item shipped — secrets:M-2:** `minimumReleaseAge: 20160` +
  `trustPolicy: no-downgrade` in pnpm-workspace.yaml, commit `8db565497`.
  14 days chosen over 30 (user asked): malicious releases are pulled within
  hours-to-days, so >14d adds friction (delays legit CVE patches, breeds
  routine `minimumReleaseAgeExclude` entries) without real protection.
  `pnpm i` clean, no lockfile churn; CI frozen-lockfile unaffected.
- **Remaining queue (in order):** secrets:M-1 (SHA-pin actions + env gate),
  secrets:H-3 (blocking scans + gitleaks hook), crosschain:M-4, 
  bridge-migration:M-2, intent-fund-flow:M-1, intent-fund-flow:M-2.

## D-015 · secrets:M-1 shipped — SHA-pin 57 action refs + environment gate
- **When:** 2026-08-27 · **Who:** Both (user: "no breaking changes, think first")
- **What:** All 57 `uses:` refs across 15 workflows pinned to full commit SHAs
  with `# vX.Y.Z` comments; `environment: npm-publish` added to all 9 publish
  jobs. Commit `aeab1dd80`.
- **Resolution method:** `git ls-remote --tags` per repo, peeled (`^{}`) SHA for
  annotated tags (gh-1627 lesson). Every SHA re-verified as a commit object via
  `repos/{o}/{r}/git/commits/{sha}` before commit. Notable:
  `actions/dependency-review-action@v4` is a mutable BRANCH (no v4 tag) — pinned
  to `2031cfc` = tag v4.9.0.
- **Non-breaking rationale:** SHAs = exactly what tags resolve to today; a
  referenced-but-missing environment is auto-created ruleless on first run (no
  approval blocking); npm token is repo-level so still readable by gated jobs.
- **Follow-up (admin, repo settings):** required reviewers on `npm-publish` +
  move SODAX_SDKS_NPM_PUBLISH_TOKEN into the environment. Noted in PR body.
- **Note:** sodax-sdks had 0 pinned refs before this (user thought it was done —
  that was sodax-frontend gh-1627/PR #1684). No dependabot.yml here, so SHA
  bumps are manual until one is added (offered, not scheduled).

## D-016 · secrets:H-3 shipped — blocking scanners with explicit baselines
- **When:** 2026-08-27 · **Who:** Both
- **What:** commit `2e216a5f2`: security.yml gitleaks broad+strict and OSV lose
  `continue-on-error`; semgrep gets `--error` + 3 excluded rules; new
  `osv-scanner.toml` (33-advisory baseline, package named per entry);
  `.gitleaks.toml` allowlists Stacks c32 principals (the 1 broad finding was the
  public contract id in stacks-raw-intent.ts:37); `blockExoticSubdeps: true`
  (lockfile verified 0 exotic resolutions); husky pre-commit gets a staged
  gitleaks scan guarded by `command -v` (warn, don't block, when uninstalled).
- **Verified:** both gitleaks configs 0 leaks on a CI-equivalent clean tree;
  hook syntax exit 0; YAML parses; pnpm accepts new settings; live Security run
  on `aeab1dd80` confirmed semgrep baseline = exactly the 14 findings covered
  (13 excluded-rule + 1 fixed by blockExoticSubdeps).
- **Accepted trade-offs:** semgrep excludes are RULE-level (new instances of
  unsafe-formatstring / detect-non-literal-regexp won't block either — reverse
  by dropping --exclude-rule and nosemgrep-ing sites); weekly OSV cron now goes
  red on new CVEs — needs a human owner or it becomes alarm fatigue.
- **Benchmark (6-agent survey of viem/MetaMask-core/OpenZeppelin/anza-kit/
  Uniswap-sdks, 2026-08-27):** post-fix sodax-sdks leads peers on scanning
  (secret scan absent in 4/5, dep-scan blocking only in viem). Biggest remaining
  gap: npm OIDC trusted publishing (4/5 peers publish with NO long-lived token).
  Other follow-ups: env protection rules (admin), dependabot.yml for pin bumps,
  top-level `permissions: {}` (Scorecard Token-Permissions). Raise in PR thread.

## D-017 · crosschain:M-4 shipped — per-type src_address canonicalization
- **When:** 2026-08-27 · **Who:** Both
- **What:** commit `c0c2d0354`: encodeBtcPayloadToBytes branches on address_type —
  P2PKH/P2SH (Base58Check, case-sensitive) preserved exactly; bech32 keeps
  lowercase canonicalization (byte-identical for the working cohort, so no
  regression surface). 5 new tests (first coverage of this fn), incl. key-order
  stability since the wallet signs the exact JSON string.
- **Relay compat:** on-demand payload is NOT handled in sodax-backend (external
  relay service, no local source) — flagged in PR body for the relay team to
  confirm case-sensitive comparison on P2PKH/P2SH.
- **Bitcoin-wide sweep (user asked):** no other case-corruption site exists.
  Checked clean: isNativeBitcoinToken (symbol compare), IntentRelayApiService
  (tx-hash hex compare), BTCWalletProvider, RadfiProvider, swaps-api (header
  names only), dapp-kit btc hooks, Unisat/Xverse/OKX connectors, OP_RETURN
  deposit path (binary). Theoretical edge noted, NOT fixed (scope):
  detectBitcoinAddressType throws on all-uppercase bech32 (BIP-173 QR form) —
  unreachable today (all call sites feed wallet-returned lowercase), fail-closed.

## D-018 · bridge-migration:M-2 shipped — encodeAddress fail-closed validators
- **When:** 2026-08-27 · **Who:** Both
- **What:** commit `6d321f36a`: EVM viem isAddress strict:false (format only —
  strict checksum would break working lowercase integrators); Bitcoin
  isValidBitcoinAddress in btc-utils via fromBech32/fromBase58Check (ECC-free —
  toOutputScript needs initEccLib for P2TR, a pure util must not depend on init
  order; prefix bc/tb + version/length policy keeps ltc1/inj1/bcrt1/witness-v2
  out); NEAR nomicon grammar regex (near-api-js exports no validator; covers
  eth-implicit 0x form); Injective regex + hand-rolled BIP-173 checksum verify
  (~25 lines, zero new deps — user declined the bech32 micro-dep; fuzz-validated
  1000/1000 vs reference lib, 500/500 single-char mutations caught) accepting
  38-char accounts AND 58-char CosmWasm contracts.
- **Caught by user pushback:** the original 38-only inj regex would have
  rejected 32-byte contract recipients — widened after "còn gì không tự tin".
  Also fixed: BridgeService.test fixture was a checksum-INVALID made-up bech32
  (validator caught it); replaced with a lib-generated valid address.
- **Verified:** full suite 2439 tests green; bcrt1 unused repo-wide; wire format
  byte-identical for valid inputs (tests lock utf8-hex outputs).
- **Honest limits (flagged, not fixable here):** relay-side expectations
  unverifiable (external service — PR body asks relay team); LTC/BCH legacy
  version-byte collisions; testnet-in-mainnet-flow (pure fn, no config); NEAR
  on-chain existence; valid-but-attacker addresses (frontend preview modal's
  job, cf. sodax-frontend gh-1632).

## D-019 · intent-fund-flow:M-1 shipped at scope (A) — EVM chain binding
- **When:** 2026-08-27 · **Who:** Both (user chose scope A: shortest, no contract
  change, non-breaking)
- **What:** commits `ef4e4f82a` + docs trim `868fb5449`. Additive optional
  2nd param `EvmSendTransactionOptions { expectedChainId }` on
  IEvmWalletProvider.sendTransaction; EvmWalletProvider checks
  walletClient.getChainId() (viem normalises eth_chainId hex→number; every
  malformed response throws = fail-closed) and refuses on mismatch, option
  stripped from the tx. Passed at 5 sites: EvmSpokeService deposit+sendMessage,
  SonicSpokeService ×3 — swap/bridge route through spoke.deposit so covered.
- **Scope (A) vs (B):** ~21 lower-stakes sites (Permit2 ×7, Erc4626 ×4, Erc20,
  EvmVaultTokenService ×2, PartnerFeeClaim ×3, BalnSwap…) NOT yet passing the
  option — same pattern, add anytime. Un-migrated sites behave exactly as
  before (no check).
- **Why this design:** verified in node_modules source that viem/wagmi already
  enforce chain binding natively when given intent (assertCurrentChain /
  ChainMismatchError); the raw-tx provider abstraction had stripped it. No
  single choke point exists (dapps pass walletProvider per call — checked).
  Contract-side block.chainid check = strongest binding, needs redeploy →
  suggest in PR thread as defense-in-depth.
- **Tests/docs:** 3 new guard tests; 39 exact-arg assertions updated (now lock
  chain-binding on 13 chains); skills evm.md + SKILL.md gotchas; docs
  WALLET_PROVIDERS.md custom-impl requirement #4 (custom providers must honor
  the option or the protection silently disappears). check:ai + check:doc-links
  green. User asked comments AND docs be 1-2 lines, no noise — applied.

## D-020 · intent-fund-flow:M-2 shipped — Stacks post-conditions. Hardening 7/7 COMPLETE
- **When:** 2026-08-27 · **Who:** Both
- **What:** commit `a97059d49`: deposit → PostConditionMode.Deny + one
  willSendLte(amount) cap per FT the token contract defines (or uSTX native);
  sendMessage → Deny + zero conditions; raw path embeds conditions; Pc added to
  @sodax/libs stacks/core re-export.
- **Correction (2026-08-28, bot review 2 finding 5, verified):** "raw path
  embeds conditions" is WRONG. Conditions land on the in-memory unsigned tx but
  `serializePayloadBytes(tx.payload)` drops them (Stacks conditions live in the
  tx envelope, not the payload); `StacksRawTransaction` has no field for them
  and `StacksWalletProvider.signAndSendTransaction` signs raw payloads with
  Allow (pre-existing). Net effect of the raw branch: a wasted fail-closed
  interface fetch. Fix planned in plan-pass23.md §R5. Wallet provider already forwarded
  postConditions in both modes — untouched (comment on the swaps-api Allow path
  updated: tightening it belongs to swap:M-1).
- **Evidence-driven conditions:** read the LIVE Clarity source (Hiro API):
  impl.transfer → state.deposit = exactly ONE movement of `amount` from caller.
  Audited all 4 token contracts: no fee-on-transfer. Two traps caught during
  verify: USDC asset name is `usdcx-token` (≠ contract name — hence on-chain
  interface fetch, cached, never hardcode) and sBTC defines TWO FTs
  (sbtc-token + sbtc-token-locked) — hence cap-per-FT, unmoved ones pass at 0.
- **Verification limit:** no PR e2e for Stacks — PR body asks for one staging
  FT + STX deposit before merge. 34/34 stacks tests, suite 2444/2444.
- **@stacks libs question (user):** 7.3.1 vs latest 7.6.0 — no OSV advisories,
  Pc API present in 7.3.1; upgrade = routine maintenance, kept out of this PR.

## D-021 · Dual-agent bot review on PR #405 — all 3 findings verified correct; 2 fixed
- **When:** 2026-08-27 · **Who:** Both
- **Bot review** (comment 5437099607, R0bi7-sodax-worker, reviewed at `89b84f143`
  — before the 8 hardening commits). Verified each finding against source:
  1. **ICONEX queue holds user connect behind a stalled hydration reconnect for
     300s** — TRUE (module-global FIFO from D-013 + fire-and-forget reconnectIcon
     at useInitChainServices:35). FIXED (uncommitted): `request()` gains a
     `timeoutMs` param; hydration passes ICONEX_HYDRATION_TIMEOUT_MS=30s;
     interactive keeps 300s. Queue architecture unchanged.
  2. **executeWithdraw dst-branch builds tx on the destination spoke with the
     hub wallet as src** — TRUE but PRE-EXISTING; it IS the Tier-3 roadmap item
     "fix executeWithdraw dst branch ~0.5d" in outcome.md. NOT fixed in PR;
     draft reply prepared. Note: new encodeAddress validators make this branch
     fail fast for non-EVM dst instead of relaying garbage.
  3. **reconnectIcon `catch {}` makes the caller's console.warn dead code** —
     TRUE. FIXED (uncommitted): internal catch removed; sole call site (verified
     via rg) already has `.catch(console.warn)` → hydration stays non-fatal AND
     diagnostics live.
- **Safety analysis of fix 1 (user challenged "design đúng không"):** late
  responses after a short timeout are covered by D-013 type-correlation for
  dangerous types (signing/JSON); the same-type REQUEST_ADDRESS window is benign
  (payload = the wallet's own address, isIconAddress-validated). Residuals
  accepted: user connect can still wait ≤30s behind a stalled hydration;
  late-response window widens slightly — both bounded, both smaller than the
  bug. Cancel/priority-queue alternatives rejected: a dispatched window event
  can't be unsent, so they share the late-response semantics with more state.
- **Peer patterns (evidence-read):** wagmi reconnect → connector.isAuthorized()
  → silent eth_accounts (never competes with interactive eth_requestAccounts);
  Phantom autoConnect = connect({onlyIfTrusted:true}); WalletConnect/
  sats-connect correlate by request id (no serialization needed). ICONex relay
  has neither request ids nor a silent address query — our shim is the standard
  legacy-provider treatment.
- **Follow-up idea (needs a manual Hana test, not in PR):** relay enum has
  REQUEST_HAS_ADDRESS/HAS_ACCOUNT — if Hana answers them without a popup,
  hydration could probe silently and only send REQUEST_ADDRESS when the wallet
  is alive, mirroring the eth_accounts pattern.
- **Tests:** 4 new (queue freed after short timeout then next request resolves;
  reconnectIcon rejects at 30s without touching persisted state; happy-path
  restore). wallet-sdk-react 189/189, tsc + Biome clean.
- **Status:** committed + pushed 2026-08-28 as `757ba5781` (user: "commit push
  đi"; hook 18/18 tasks, wallet-sdk-react 189/189). Also answers bot review 2's
  R2 — reply "fixed in 757ba5781" pending with the R1–R5 reply pack
  (plan-pass23.md).

## D-022 · dapp-kit:M-1 downgraded — product knowledge on Bound tokens
- **When:** 2026-08-27 · **Who:** You (product call), corroborated in code
- **User's facts (server-side, not visible in repo):** Bound access token TTL
  **10 minutes**, refresh token **7 days**. Tokens grant data viewing and flow
  initiation only — they do NOT affect signing.
- **Code corroboration:** every bearer-authorized RadfiProvider mutation
  (createWithdrawTransaction, withdrawToUser, requestRadfiSignature,
  signAndBroadcast*) operates on PSBTs that require the USER's wallet signature;
  the trading wallet is multisig (Bound + user), so a stolen token cannot move
  funds unilaterally. Impact of localStorage theft = data exposure / session
  read, not fund loss.
- **Decision:** dapp-kit:M-1 moves 🟠 → ⚪ (optional). The SDK-side "tokens to
  in-memory" change is deprioritized (it also costs stay-signed-in UX for a
  10-minute credential); server-side logout-revoke stays a Bound nice-to-have.
  When raising the 🟠 list in the PR thread, include this downgrade + rationale
  so the audit ledger closes the finding honestly instead of silently dropping it.
- **Net remaining 🟠:** swap:M-1 (no BE needed — client-side verify),
  wallet-react-store:M-1 (no BE), wallet-sdk-core:M-1 (needs Bound server).

## D-023 · wallet-sdk-core:M-1 + wallet-react-store:M-1 closed by product call
- **When:** 2026-08-27 · **Who:** You (product calls)
- **wallet-sdk-core:M-1 (bare-timestamp Bound login) → accepted, won't fix:**
  "đây là design của Bound, không đổi được" — the message format is Bound
  Exchange's contract, not SODAX's to change. Consistent with D-022: a
  harvested/replayed login only mints tokens that are view/initiate-only
  (multisig gates funds), so residual risk ≈ the already-downgraded
  dapp-kit:M-1. Ledger note: accepted Bound design constraint, not a fix debt.
- **wallet-react-store:M-1 (rehydrate re-verify) → won't fix:** no fund loss
  (a forged persisted connection spoofs display identity only — signing still
  requires the real wallet extension), while changing rehydrate logic risks
  BREAKING reconnect UX across BTC/NEAR/STACKS (prompts on load, locked wallet
  dropping connections). Risk of the fix > risk of the finding.
- **🟠 table final state:** only **swap:M-1** remains open (client-side verify,
  no BE needed; min 0.5d schema-tighten). All four dispositions + rationale go
  into the PR-thread comment when raising, so the audit ledger closes each
  finding explicitly.

## D-024 · swap:M-1 TRIAL implemented — NOT committed/pushed (user: "code thử nhưng không push")
- **When:** 2026-08-27 · **Who:** Both
- **Layer 1 (audit minimum), packages/swaps-api:** rawTxSchemas AddressSchema →
  `^0x[40hex]$`, HexSchema → even-length hex (were bare `typeof === 'string'`).
  Protects every consumer of the wire client. Fixture fallout fixed: Injective
  test fixtures used '0xfrom'/'0xto' garbage the old schema swallowed; 5 new
  negative tests. 103/103.
- **Layer 2, packages/dapp-kit:** new `utils/verifyEvmApprovalPlan.ts` —
  fail-closed semantic check before ANY signature in
  useSwapsApiApproveAndBroadcast: tx/resetTx must target body.inputToken, carry
  0 value, decode to ERC-20 `approve`, spender must equal the config-derived
  expected (hub → config.solver.intentsContract, spoke →
  chainConfig.addresses.assetManager — same source as SwapService), reset must
  zero, approve ≥ inputAmount. 10 unit tests (attacker spender / wrong token /
  transfer-instead-of-approve / unknown calldata / low amount / non-zero reset /
  attached value / non-EVM shape). Hook tests upgraded to verification-valid
  fixtures. dapp-kit 592/592, tsc + biome clean.
- **Trial scope NOT covered (next steps if adopted):** bridge-API
  approve-and-broadcast hook (same one-line wiring); semantic verify of the
  createIntent tx itself (decode intent calldata vs body params — needs the
  intents-contract ABI mapping); Bound PSBT output verification
  (useRadfiWithdraw/useRenewUtxos — separate, harder); Stellar trustline path
  untouched.
- **OUTCOME (user call): deferred as follow-up** — "tôi nghi không cần làm,
  followup sau". Trial REVERTED from the working tree; the full diff is parked
  as `swap-m1-trial.patch` in this folder (377 lines, applies clean at
  `a97059d49`; includes both layers + all tests). To resume:
  `git apply swap-m1-trial.patch` from the sdks root.
- **Working tree state after revert:** only the ICONEX bot-review parcel
  remains (D-021, awaiting commit confirm).

## D-025 · Remaining research threads closed via the intent-relay audit report
- **When:** 2026-08-27 · **Who:** Claude (research), user asked "còn gì chưa research xong"
- **Discovery:** ICON-Projects-Planning also holds
  `2026-08-25-intent-relay-security-audit.md` (310KB, 165 findings, 10
  verified) — an audit OF the relay source (repo private; layout
  `verifiers/btc/src/{helper,parser,index}.ts`, Go core, per-chain
  verifiers/executors, AWS/terraform). Local copy: session scratchpad
  `intent-relay-audit.md`.
- **M-4 relay-side question → answered with evidence:** the report states the
  BTC on-demand path IS cryptographically checked via "secp256k1 ECDSA
  recovery + BIP322" (finding at report line ~485), and the relay's
  `canonicalEncode` signs src_address/data/src_chain_id/dst_chain_id/
  wallet_used/timestamp/address_type — the EXACT field order our
  encodeBtcPayloadToBytes emits (cross-validates our key-order test as
  load-bearing). No address normalization/toLowerCase appears anywhere in the
  relay audit. ⇒ ECDSA recovery yields the CANONICAL Base58Check address, so
  only a case-preserved src_address (our c0c2d0354 fix) can ever match; the
  old lowercased form could never verify. PR note upgraded from "please
  confirm" to "audit evidence + one-line eyeball request".
- **Hana silent-probe (REQUEST_HAS_ADDRESS) → dead end for research:** Hana
  extension is closed-source (no public repo found). Only path is a manual
  test with the extension. Stays optional follow-up.
- **Note for the team (outside 741):** the relay audit itself carries serious
  verified findings (plaintext keys in tfvars, default-open EVM connection
  verification, single-RPC trust) — presumably its own sign-off cycle; not
  this issue's scope.

## D-026 · Bot-review-2 R1+R5 fixed; R4 deferred by user
- **When:** 2026-08-28 · **Who:** Both (user: "R5 R4 đi" then "làm r5 thôi")
- **R1 (blocking regression):** fixed + pushed `39a9710c7` —
  `encodeTokenIdentifier` split: BITCOIN/NEAR/INJECTIVE token identifiers keep
  utf-8 semantics, everything else delegates to the validated `encodeAddress`;
  used only for the `encodedToken` leg in `resolveSimulationEncoding`. 6 tests
  feed the real configured identifiers ('0:0', '897442:43', 'inj', factory
  denom, 'NEAR') — pass through the identifier path AND still rejected by the
  recipient validators.
- **R5:** fixed (uncommitted) — post-condition computation lifted out of
  `reqData`; raw mode skips the interface lookup entirely (conditions can't
  ride `serializePayloadBytes`); direct-send path unchanged (Deny + caps).
  New test: raw FT deposit → zero fetch + no postConditions on the unsigned
  build. Side discovery: the old raw-FT tests were silently doing LIVE fetches
  to api.hiro.so — hermetic again after this. 35/35 stacks, suite 2451/2451.
- **R4: user chose DEFER** (interrupted the fix mid-flight) — reply cites the
  deliberate D-019 scope (A) and commits to leading the follow-up with the
  single-site fix (`Erc20Service.approve` + optional expectedChainId param
  covers all 8 EVM approval flows).
- **Remaining bot-2 queue:** commit R5 → terse replies R1–R5 → re-review →
  Pass 2/3 batches per plan-pass23.md.

## D-027 · Self-review (user's rule template) + fixes — 40b368c56
- **When:** 2026-08-28 · **Who:** Both (user asked for a full re-audit per the
  @claude review rules, then "fix luôn nếu gọn")
- **Review result:** 1 should-fix + 3 nits; verified non-findings recorded:
  every remaining nativeToken passes its validator (no residual R1 class —
  Solana System Program base58, Stellar SAC, Stacks principal, EVM zero-addr),
  all 5 changesets accurate (stacks one correctly silent about raw), multi-FT
  cap deliberate, R4 gap dispositioned.
- **Fixed in `40b368c56`:** (1) skills gap — chain-specifics.md Stacks row now
  documents Deny+caps, the FT interface-lookup failure mode, and raw skipping
  the lookup; (2) sendMessage raw no longer passes conditions into the unsigned
  build (consistent with deposit; test asserts absence); (3) gitleaks tarball
  sha256-verified in security.yml (hash from the official checksums.txt).
- **Remaining nit (not code):** branch is 1 commit behind origin/main
  (`4a079e7c6` robinhood) — merge/rebase at landing time.
- **Still pending:** post the 5-point reply to bot review 2 (draft approved
  shape shown to user, awaiting go), staging Stacks test, sign-off post.

## D-028 · Review-3 wrap-up + swap-api coverage closed
- **When:** 2026-08-30 · **Who:** Both
- **Review 3 (comment 5448404283, at 517bd293b):** 6 findings — F2 was already
  fixed by e619e3425 (pushed minutes after the review ran); F5 changeset
  qualified; F3+F4 = residuals documented in-code (`1878a9765`); F1 =
  executeWithdraw dst, pre-existing #1137 — user walked through the code,
  usage census (0 in sdk repo AND 0 in sodax-frontend; skills dex.md:56
  documents the WRONG shape) → recommendation: DELETE in a separate follow-up
  PR after @R0bi7 acks no external usage. Not #405 scope.
- **User surfaced the architecture fact:** the swaps-api BACKEND builds its
  raw txs with OUR SDK. Consequences: (1) BE needs NO code changes — just a
  @sodax/sdk bump after release (noted in PR follow-ups, optional 400-mapping
  nicety); (2) the Stacks extend-raw-format follow-up is now feasible
  end-to-end (both halves are our code); (3) exposed the last chain-binding
  gap: dapp-kit approvalPlan broadcast backend-built approvals unbound —
  FIXED `66a461ec3` (+ locking test). Demo signAndBroadcast was fc9db7406.
- **User challenged the approvalPlan guard as "vô nghĩa"** — clarified: it
  targets the wallet-on-wrong-network failure mode (client-side, pre-signature,
  bound to the USER's srcChainKey), not BE content verification (that is the
  parked swap:M-1). Comment reworded to say exactly that.
- **Coverage matrix (swap thường vs swap-api) now equal** on chain-binding +
  build-time validation; deltas remaining: content-verify (parked by user
  choice), Stacks raw conditions (follow-up).

## D-029 · Full-branch audit (23-agent workflow) + closure fixes
- **When:** 2026-08-31 · **Who:** Both (user: "audit lại toàn bộ … đảm bảo không
  breaking … đặc biệt hỗ trợ được raw và normal tx")
- **Method:** workflow `wf_8c94007d-3f3` — 8 dimension sweeps over the whole
  diff `75dec7011…1878a9765`, every blocker/should-fix put through an
  adversarial refutation agent (14 verdicts, 4 REFUTED), plus a completeness
  critic. Ran across 3 sessions (2 hit model limits; resumed from cache).
- **HEADLINE — raw vs signed matrix: both modes sound.** Every `raw:true`
  branch early-returns BEFORE every new guard (expectedChainId, Stacks
  post-condition lookup, validators on non-recipient args); zero structural
  change to any raw return vs merge base; BTC payload_hex byte-identical
  between modes (built once, shared). Value-level changes are deliberate and
  mode-symmetric: BTC Base58Check case, relayData.address, CSPRNG intent ids.
- **Fixed in this pass:** (1) chain-bound the remaining hub-static sends —
  BalnSwapService.call, PartnerFeeClaimService ×3, EvmVaultTokenService
  deposit/withdraw (+ test assertions now pin the binding); (2)
  apps/swap-api-example signAndBroadcast (the demo analogue we had missed);
  (3) evm.md wording made precise — names exactly what is bound and that
  Permit2Service/Erc4626Service are not (no chain key reaches those
  signatures); (4) WALLET_PROVIDERS.md + changeset now document the ONE real
  source-break: a custom provider with its own second options param must widen
  to `YourOptions & EvmSendTransactionOptions` (proven with tsc probes:
  compiles at merge base, TS2416 at HEAD); (5) changeset lists @sodax/dapp-kit;
  (6) security.yml strict gitleaks gains `if: always()`.
- **Confirmed-but-deliberately-not-fixed:** Permit2 ×7 / Erc4626 ×4 unbound
  (needs signature change — follow-up); AssetService dst branch (verifier
  CONFIRMED the misroute AND that it is byte-identical to merge base — this
  branch only flips BTC/INJ from silent-misroute to abort; NEAR/EVM still
  misroute → strengthens the delete-it follow-up); `npm-publish` environment
  still doesn't exist in repo settings (admin, already in PR follow-ups).
- **Refuted (no action):** MoneyMarketService dstAddress default and
  EvmVaultTokenService-unbound framed as new (both out of diff), Stacks
  "new network dependency" (pre-existing on the same host/await chain),
  dapp-kit changeset claimed as release-integrity bug (fixed group covers it).
- **Nits accepted:** isIconAddress accepts `cx…` contracts; BTC address_type
  keyed off personal address in TRADING mode (pre-existing, taproot in
  practice); getFtAssetNames error branches untested.
- **Gates after fixes:** sdk 2452, dapp-kit 582, wallet-sdk-react 189,
  wallet-sdk-core 152, checkTs 7/7, biome clean (2 pre-existing warnings),
  check:ai + check:doc-links green.

## D-030 · Pass 2/3 delta split into its own issue — ICON-Projects-Planning#753

**Date:** 2026-09-03

Split gosiast's 2026-08-27 Pass 2/3 comment (#741, comment 5437714067) out of
#741 into its own tracking issue: **ICON-Projects-Planning#753**, 43 items,
49 checkboxes across Batches F/G/H/CI plus the admin and deferred lists.
#741 stays the review of the 2026-08-22 report.

**Why not `icon-project/sodax-sdks`,** which was the first choice because the code
and PR #405 live there: that repo is **PUBLIC** and ICON-Projects-Planning is
**PRIVATE**. None of the 43 items is fixed yet, so filing there would have been
public disclosure on a live mainnet system — including the Bitcoin withdraw path
that signs an API-built PSBT without checking outputs, the P2-1 NaN drain chain,
which four npm tag patterns have no ruleset, and which secret classes neither
gitleaks config detects. User was asked and chose the private repo.

**Re-check at `22dd56b90` (2026-09-03) found four items stale** since the comment,
now recorded in the issue's "Stale" section:
- **P2-14** — `.github/CODEOWNERS` now exists (landed with #391/#383); only
  `.claude/` and `packages/skills` remain uncovered.
- **M26** — `changeset-check.yml` was deleted (#407); `lint-pr.yaml`'s action is
  SHA-pinned after `fddc63a4b`, so the "mutable tag" half is gone. Residual:
  no `permissions` on `lint-pr.yaml`, none top-level in `ci.yml` so `build` inherits write.
- **N6** — baseline is now `870000` B / **5%** (was 750000/15%) after `affdbf1e2`,
  so "112 KB of headroom" is really ~43.5 KB. The other two gaps stand.
- **P2-12** — H-3 (`2e216a5f2`) made the scanners blocking, so SKILL.md:19 is now
  half true; the gap is coverage (P2-8), not enforcement.

**Also verified this session:** bot-review-2 **R1 has landed** — the
`encodeTokenIdentifier` split is in `7f287f56b` with BOT-R1 tests in
`shared-utils.test.ts`, so it no longer blocks the queue.

**Fund-loss ordering** (now the lead section of #753, and the reason Batch F leads
with M16 rather than with the Highs): M16 is the only item that loses money with
nothing compromised — `btc.ts:389-390,462-463` and `near.ts:186-187,251-252,341-342`
sign mainnet intents with `minOutputAmount: 0n, deadline: 0n`. The most direct
attacker-gets-the-money path is the Bitcoin withdraw stack (swap:M-1 + C-2):
`RadfiProvider.createWithdrawTransaction:343-373` drops `recipient`, and
`BitcoinSpokeService.ts:459-476` signs the returned PSBT with no output check.

<!-- Next decisions get appended here. -->


