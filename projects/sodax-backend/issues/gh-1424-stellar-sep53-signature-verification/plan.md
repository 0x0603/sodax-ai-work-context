---
type: plan
repo: sodax-backend
github: 1424
updated: 2026-10-30
---

# Plan

## Goal

`verifyStellarSignature` accepts SEP-53 signatures and keeps accepting the old format.

## Where

Paths are from `origin/development` at a12cd58f (2026-10-27); `main` has the same code.

- `packages/shared-utils/src/utils/chain-utils.ts:259` holds `verifyStellarSignature`, the only fix site.
- `apps/stateful-api/src/api/users/users.service.ts:63` is the only caller (`Chains.STELLAR` case,
  address uppercased first).
- Out of scope: `apps/sponsoring-api/src/domain/validation.ts:213` verifies transaction signatures,
  not messages.
- Out of scope: sodax-frontend and wallet-sdk-react. The frontend sends the plain-text message to
  `walletsKit.signMessage(message)` and posts `res.signedMessage` (base64). Nothing changes there.

## Facts the fix relies on

- **Old format, which the code accepts today:** ed25519 over `Buffer.from(message, 'base64')`. The
  message is plain English, so this decodes it as base64 into junk bytes. Old wallets, including
  the current Hana release, sign those bytes, so keep this path.
- **SEP-53:** ed25519 over `sha256("Stellar Signed Message:\n" + utf8(message))`. The signature is
  64 bytes, sent base64-encoded.
- Both Discord payloads verify as SEP-53. They fail as raw utf8, as `sha256(message)` and in the old format.
- `@stellar/stellar-sdk` 13.3.0 is enough (`hash` + `Keypair.verify`), so no SDK upgrade is needed.

## Approach

```ts
const sig = Buffer.from(signature, 'base64');
const keypair = Keypair.fromPublicKey(publicKey);
const sep53 = hash(Buffer.concat([Buffer.from('Stellar Signed Message:\n'), Buffer.from(message, 'utf8')]));
return keypair.verify(sep53, sig) || keypair.verify(Buffer.from(message, 'base64'), sig);
```

`hash` comes from `@stellar/stellar-sdk`; `node:crypto` sha256 works as well.

## Tests

There is no chain-utils unit test yet. Add `packages/shared-utils/test/unit/chain-utils.unit.test.ts`.
`users.service.spec.ts` mocks `verifyStellarSignature`, so tests there can't catch this.

Test vectors, both for address `GC6E42U7HW3TFWJAUGEVBGGROIKKGFKHFUHJEGL6W74CTL2VJTTPOBXD`:

| Wallet | message | signature (base64) |
| --- | --- | --- |
| Freighter | `By signing this I confirm that I have read and I agree to the terms of service and legal disclaimer provided by SODAX on 2026-10-30T09:43:37.485Z` | `wVvJgwpWdD/SdXatGsQHu7Wk8p1O/AtjlmrsnFWogvX+bGSlln1ukSj4+cydg3pEhW+pMFpQRNnHifsakpaMCA==` |
| Hana dev | `By signing this I confirm that I have read and I agree to the terms of service and legal disclaimer provided by SODAX on 2026-10-30T09:47:14.570Z` | `RB/psLqPxF1xoJCVECgFUhdw0ekIw4oxKEYcKD3oqziLSkoeYKfgL4F952JEBxsnfWNlY9wXdzxbsdcRUqdVAw==` |

Cases:

- Both vectors are valid.
- Old format is valid: sign `Buffer.from(message, 'base64')` with `Keypair.random()`.
- A vector checked against another address is invalid.
- A vector with the message changed by one character is invalid.

## Verification

- `pnpm --filter @repo/shared-utils test`, plus the stateful-api unit tests.
- Before committing, run `pnpm i` and `pnpm build:packages`. The pre-commit hook fails on a stale install.
- PR base is `development`.
