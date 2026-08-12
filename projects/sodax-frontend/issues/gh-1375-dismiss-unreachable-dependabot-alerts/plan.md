---
type: plan
repo: sodax-frontend
github: 1375
updated: 2026-08-12
---

# Plan

## Goal

Make the dismissal session 20 minutes of clicking with evidence attached, instead of a
re-derivation — and make sure none of the justifications that go on the permanent record are
false.

## Why nothing was dismissed on 2026-08-12

Two reasons, both sufficient on their own.

**It is an outward-facing write to a shared repo's security record.** ~30 dismissals, each one
a claim on the record that SODAX has assessed a vulnerability as unreachable. That is not a
call to make unattended. (The token also may not carry `security_events`; reads work, writes
were not attempted.)

**Half the ticket's categories no longer hold**, and following it literally would put wrong
justifications on the record — see `process.md`. Two of them would be actively false.

## Approach when it is picked up

Work from the worksheet in `process.md`, not from the ticket's category list. For each open
alert: alert number, GHSA, package, scope, and a **verified or refuted** reachability line.
Dismiss only the ones where the reachability claim was actually checked against the lockfile
or the source. Anything cleared by a version bump goes to #1374 instead — dismissal is the
wrong instrument for those.

## Verification

Every dismissal justification traceable to a lockfile path or a source grep recorded in
`process.md`. After the session, re-read the open count and post the list on #1365.

## Risks

A wrong dismissal is worse than no dismissal: it silences a real alert and leaves a false
assessment on the record. The CSP-nonce category is the live example — see `process.md`.
