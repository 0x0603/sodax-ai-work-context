---
type: issue
repo: sodax-backend
github: 1424
status: Active
tags: [stellar, sep-53, signature, register-users, terms, wallet]
updated: 2026-10-30
related_decisions: []
---

# GH-1424 Stellar register/users rejects SEP-53 signatures

- Source: https://github.com/icon-project/sodax-backend/issues/1424
- Started: 2026-10-30
- Board: New World #12, Bug, High, Stream Backend, Chain Stellar, Sprint Cherry, assignee 0x0603
- Related PR:

## Problem

`POST /v2/be/register/users` returns `400 Invalid signature for the given address` for Stellar
wallets that sign messages with SEP-53. Users of those wallets can't accept the terms on
sodax.com: the agree button spins, then goes back to idle.

## Context

- The Hana wallet team reported it on Discord on 2026-10-30. They had upgraded the Stellar SDK
  for the Protocol 30 network upgrade and added SEP-53 support.
- Freighter (now Varial), the most-used Stellar wallet, already signs with SEP-53 and fails today.
  The current Hana release still works because it signs the old way.
- SEP-53: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md
- Debug tip from 0xmatterhorn: to bring the terms modal back, block
  `https://api.sodax.com/v2/be/register/users` in DevTools → Network.

## Acceptance Criteria

- [ ] SEP-53 signatures pass `register/users`.
- [ ] Signatures in the old format still pass.
- [ ] Unit tests cover both formats, plus a wrong-key rejection.
