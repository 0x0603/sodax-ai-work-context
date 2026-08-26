---
type: draft-comment
repo: sodax-sdks
github: 741
status: draft — NOT posted
updated: 2026-08-26
---

# Draft sign-off comment for ICON-Projects-Planning#741

> Paste target: a comment on the issue. Keep it terse and human. Do NOT post
> automatically — user posts or asks.

---

Reviewed both reports and cross-checked the whole High + Medium tier against
`sodax-sdks` main (`75dec7011`), plus a spot-check of the Low tier. Signing off,
with a few notes.

**Overall:** accurate — no fabricated findings, every code claim I checked holds
in source. No attacker-reachable fund loss; 0 Critical is right. Read it by
*effective* severity (0 High / 15 Medium), not the "6 High" headline, which is
intrinsic.

**Already fixed since the 22 Aug run** (report's "0 fixed" is stale):
- shell-quote → 1.10.0 (H-4 closed)
- react-router → 7.18.2 via #313 (M-5 react-router half closed; only next@16.2.6 left)
- ICON relay hardened in wallet-sdk-core + sdk (2 of 3 copies — `wallet-sdk-react`
  iconex channel still raw)

**A few things the report gets slightly wrong:**
- The axios `1.13.2` pin is described as protective, but it's actually what holds
  axios back — every upstream range is `^1.x`, so dropping/raising the override
  resolves 1.19.0 and clears all advisories. Same theme: it says "no upstream fix
  exists" for shell-quote and protobufjs, but both fixes shipped before the audit.
- H-3 "every enforcement point is soft" — `dependency-review` and CodeQL in the
  same workflow are blocking. The real gap is secret-scanning (all soft, no
  pre-commit hook), which is the half that matters given `apps/node` uses live keys.
- sdk-swap M-2 (Math.random intent ID) is over-rated at Medium — the intentId
  isn't a security token (on-chain identity is a keccak of the full struct), so
  it's hygiene, not a vuln. Worth fixing anyway.

**A few it undersells / misses:**
- BTC private-key wallet signs PSBTs with no confirmation UI at all — the "user
  reviews the wallet screen" mitigation doesn't exist on that path (strengthens M-1).
- `sdks-publish.yml` and the new `ai-drift-check.yml` both carry `id-token: write`
  alongside job-level tokens — the mutable-tag surface (M-1) is now 58 refs/15
  workflows, still 0 SHA pins.

**Suggested follow-up:** most of the real work is a single ~half-week PR — deps
(axios/ws/protobufjs/next/bigint-buffer), the bnUSD hub-migration bug, the dex
`relayData.address` bug, CSPRNG, and scoping the npm publish token. The
decode-and-verify-backend-tx item (M-1) and the Bound Exchange session changes are
larger and cross-repo — better as their own issues. Happy to file those.
