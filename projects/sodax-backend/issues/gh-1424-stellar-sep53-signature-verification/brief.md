---
type: brief
repo: sodax-backend
github: 1424
status: Active, in review — PR #1439 open, CI green, FidelVe requested; local review done, real-wallet test pending
next: user tests a real Stellar wallet against the local stack (local-test.md); then merge origin/development into #1439 (needs the user's go-ahead)
updated: 2026-11-06
---

# GH-1424 Stellar register/users rejects SEP-53 signatures · brief

## State

- The issue is filed (Bug, High, Sprint Cherry, assigned to 0x0603).
- PR #1439 `issue/1424-stellar-register-users-rejects-sep-53` @ `739de339` → `development`. Worktree:
  hub `repos/backend/sodax-backend/.claude/worktrees/1424-stellar-register-users-rejects`.
  Changes: `chain-utils.ts` fix, `stellar-chain-utils.unit.test.ts`, a stateful-api integration spec
  `register-users-stellar.spec.ts`, one line in `claude-agents/SERVICES.md`.
- 2026-11-05: CI all green, Codex review on `739de339`: no findings. FidelVe is the requested
  reviewer, with no review yet. 10 commits behind `origin/development`; `git merge-tree` is clean, and
  of those commits only `apps/stateful-api/src/main.ts` touches the app, not the register flow.
- Root cause: `verifyStellarSignature` only accepts the old format, so SEP-53 wallets (Freighter,
  the next Hana build) get a 400 from `register/users`.
- Both reported payloads are valid SEP-53 signatures.

## Local review, 2026-11-05 (verdict: ready to merge)

- Logic matches SEP-53. The spec vectors pass. The 64-byte length check stops tweetnacl throwing on
  malformed input.
- The two Discord payloads: the old verifier returns false, the new one true.
- Tests ran: shared-utils 15/15; stateful-api 216/216 (23 files, including the 5 HTTP + Mongo
  integration tests).
- Smoke against a local server: SEP-53 201, legacy 201, wrong key 400, duplicate 400. CORS allows
  `localhost:3001`.
- Docs: nothing became false. The Swagger `address: 'EVM address'` label was already stale before
  the PR and is out of scope.
- Real-wallet test: the stack and recipe are in `local-test.md`. It ran on the first Mac on
  2026-11-05; the user had not signed with a wallet yet.

## Next action

1. User signs with a real wallet (Freighter, and the current Hana release) against the local stack.
   Read the result with `local-test/check-users-1424.cjs`.
2. Merge `origin/development` into #1439, never rebase. It is a commit and push, so the user says go.

## Settled — do not re-litigate

- The fix lives only in backend `shared-utils`. FE and wallet-sdk stay unchanged.
- Keep the old-format path, since the current Hana release still uses it.
- No Stellar SDK upgrade; 13.3.0 is enough.

## Open: the legacy path accepts public transaction signatures (pre-existing, not in #1439)

- The legacy branch verifies ed25519 over `Buffer.from(message, 'base64')` and nothing checks the
  message. A Stellar transaction signature signs the 32-byte tx hash, which anyone can read from
  the ledger. Send message = base64(tx hash) with that signature and you get a 201. Reproduced
  locally with a self-made tx.
- Effect: anyone can create a terms-acceptance record for any Stellar address that has ever signed a
  transaction, and that owner then never sees the terms modal. The old code had the same hole. Low
  severity: the terms record is no longer trustworthy, and no funds are at risk.
- Fix, if the user wants one, in its own PR after #1439 merges:
  - Check the message against the web app's only template, in `users.service.ts` before the chain
    switch: `By signing this I confirm that I have read and I agree to the terms of service and
    legal disclaimer provided by SODAX on <ISO timestamp>` (from
    `terms-confirmation-modal.tsx:59`).
  - That template base64-decodes to 88 bytes (measured), never a 32-byte tx hash, so the replay is
    closed. Current Hana legacy signatures still pass.
  - The template has no other caller. `services/wallet.ts` `registerWallet` is dead code (no
    callers, sends `{ evmAddress }`).
  - Risk: the FE and BE text are now coupled. A copy change in the FE must ship to the BE first.
  - Dropping the legacy path is not safe until the SEP-53 Hana build reaches users.
- Filed as sodax-backend #1474 (Bug, Priority Low, Backlog, no sprint, 2026-11-06). The repo is private;
  the hub baseline only bars security findings from public issues.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Report, context, acceptance criteria | `issue.md` | 0.4k |
| Code locations, format facts, fix, test vectors | `plan.md` | 0.8k |
| Run the PR + web locally and test a wallet | `local-test.md` + `local-test/*.cjs` | 0.8k |

## Landmines

- `users.service.spec.ts` mocks `verifyStellarSignature`, so put the tests in `shared-utils`.
- The stateful-api routes carry the global `api` prefix: `/api/users/register`, not `/users/register`.
- vitest `--maxWorkers=2` alone fails with "minThreads and maxThreads must not conflict"; add
  `--minWorkers=1`.
