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

<!-- Next decisions (protobufjs exact, next version, bnUSD fix approach, etc.)
     get appended here as we work through the 🟢 list. -->
