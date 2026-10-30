---
type: brief
repo: sodax-backend
github: 1424
status: Active
next: implement SEP-53 + old-format verify in verifyStellarSignature, with unit tests
updated: 2026-10-30
---

# GH-1424 Stellar register/users rejects SEP-53 signatures · brief

## State

- The issue is filed (Bug, High, Sprint Cherry, assigned to 0x0603). No branch or code yet.
- Root cause: `verifyStellarSignature` only accepts the old format, so SEP-53 wallets (Freighter,
  the next Hana build) get a 400 from `register/users`.
- Both reported payloads are valid SEP-53 signatures.

## Next action

Implement the fix and its tests from `plan.md`, with a branch off `development`.

## Settled — do not re-litigate

- The fix lives only in backend `shared-utils`. FE and wallet-sdk stay unchanged.
- Keep the old-format path, since the current Hana release still uses it.
- No Stellar SDK upgrade; 13.3.0 is enough.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Report, context, acceptance criteria | `issue.md` | 0.4k |
| Code locations, format facts, fix, test vectors | `plan.md` | 0.8k |

## Landmines

- `users.service.spec.ts` mocks `verifyStellarSignature`, so put the tests in `shared-utils`.
