---
type: plan
repo: sodax-frontend
github: 1374
updated: 2026-08-12
---

# Plan

## Goal

Get this to the point where it can be executed in one sitting by someone who can drive the
wallet flows — which means re-deriving the package list first, because the ticket's is wrong now.

## Why nothing was implemented on 2026-08-12

Deliberate. This rewrites `pnpm-lock.yaml` and shifts resolution under Trezor connect,
WalletConnect, the Stellar and Injective SDKs and Vercel Blob. The ticket itself says it
"needs testing of all wallet flows + RPC calls before merge", and **this repo has no test
suite at all** — `pnpm test` is a no-op and CI never runs it. A lockfile regeneration
committed unattended, with no automated regression net and no way to drive a wallet, is
exactly the change that looks fine in review and breaks a signing path in production.

The sequencing gate, on the other hand, **is satisfied** — see `process.md`. So this is ready
to start, it just needs a person at the keyboard.

## Approach when it is picked up

1. **Fix the axios pin first — it is the whole ticket in one line.** Root `package.json`
   already carries `"axios": "1.13.2"`, added by #1042 as a supply-chain mitigation. Every
   open axios advisory needs **≥1.18.0**. The existing override is what is currently holding
   axios *vulnerable*, and it accounts for 29 of the 116 open alerts. This is an edit to an
   existing pin, not a new override — and #1621 already noted "the pin now blocks its own
   remedy" and asked for a comment here.
2. **Re-derive the list.** Do not use the ticket's twelve. Query the alerts API, group by
   package, take `security_vulnerability.first_patched_version` as the floor, and check the
   resolved version in the lockfile. Drop anything with zero open alerts; add anything with
   open alerts that is missing.
3. **Split direct vs transitive** per the ticket's second mitigation, and bump direct deps
   rather than overriding them.
4. **Then** the guard — `scripts/check-dependency-floors.mjs` reading the override table,
   running `pnpm why`, failing when a resolved version is below its floor, wired as a CI step.
   It must land **in the same PR as the bumps**, never before: added first, it fails CI
   immediately on axios.
5. Smoke the wallet matrix. `docs/sdk-upgrade-guide.md` already documents that matrix for SDK
   bumps and is the right checklist to borrow.

## Verification

`pnpm install` → `pnpm lint` → `pnpm checkTs` → `pnpm build`, then the wallet matrix by hand:
connect on each supported chain, one swap, one save/deposit, and an RPC read per chain — the
five libraries whose resolution moves are all on those paths.

## Risks

- `lodash` 4.17.23 → 4.18.0 is the one genuine behaviour risk in the set (a minor bump, but
  lodash is used broadly). Everything else in the list is a patch-level floor.
- Overrides are invisible at the call site. The guard is what stops this from silently
  regressing, which is why it is not optional.
