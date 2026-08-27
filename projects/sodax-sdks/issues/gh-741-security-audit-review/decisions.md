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

<!-- Next decisions get appended here. -->

