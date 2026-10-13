---
type: process
repo: sodax-sdks
github: 456
session: 2026-10-13
updated: 2026-10-13
---

# Session 13 — dual-agent review finding: failed connect leaves the Privy login signed in

## State found

- PR #486 head `293f2f56` (3 commits past `ff296f36`, pushed by Robi, not logged here). The worktree
  `../sodax-sdks-456` was at `ff296f36`, clean; fast-forwarded to `293f2f56`.
- Review comment `#issuecomment-6132044968` (R0bi7-sodax-worker, dual-agent, verdict Comment):
  one Low finding at `privyConnector.ts:321`, disposition `follow_up`.

## Finding — confirmed by a failing test

Interactive connect, `disconnectBehavior: 'logout'`: once `runtime.login()` resolves, any later throw
(another wallet becomes current, `getEthereumProvider` / `eth_chainId` timeout, `switchChain` to the
requested chain, `WALLET_MS` waits) runs `detachSession()` only. No flag was written and no sign-out is
owed, so `sdkDisconnect()` hits its `!attempt && !session && !flag.read()` early return. Privy stays
authenticated; the next "Email (Privy)" connect skips `login()` and attaches the previous user's wallet.

Repro (real wagmi + runtime): both variants — another wallet wins, and a provider that never loads —
showed `logout` calls 0, `authenticated: true` after SDK disconnect, next connect "connected 0x…AA
without login". The existing test "stands down when the user connects another wallet while the Privy
login is open" walks exactly this path but never asserted logout.

## Fix — pushed as `6f126096`

In `connect()`'s catch, when the attempt is still current (`attempt === controller`, so not
superseded and not already ended by `disconnect()`), interactive, `'logout'` mode, and
`loggedIn || runtime.getSnapshot().authenticated`: `signOutOwed.write(); void signOut();` — the same
path `disconnect()` takes, so it survives a reload and the next connect signs out first.

Why this shape over the alternatives:

- **Not "track the orphan in memory and honour it in `sdkDisconnect`"**: lost on reload, and does not
  cover the user who never presses disconnect after a failed connect.
- **Not "write the owed marker as soon as login resolves, clear on success"**: a second click on Email
  (Privy) during `prepare` supersedes the first attempt, and the new one would then sign out the
  session the user just logged into → asks for a second code.
- `loggedIn` is set after `login()` resolves because `loginCompleted()` (Privy `onComplete`) can
  settle it before the bridge republishes `authenticated`. The snapshot check covers an interactive
  attempt that skipped login (a superseded attempt's session, a restore that timed out).
- Restores are left alone: their flag stays, so the SDK disconnect still signs out, and the "one click
  reconnects without a code" behaviour after a slow restore is kept.
- Calling `logout()` on a session that already ended is already relied on by `disconnect()`.

Tests (`privyConnector.test.ts`): lost-to-another-wallet → SDK disconnect → next connect calls
`login` again; provider never loads → logout once; `'detach'` keeps the session; a closed login modal
never calls logout. Both new sign-out tests fail on `293f2f56`. Package: 318 tests, `checkTs`, Biome
green. `docs/WALLET_PRIVY.md` sessions bullet gained one clause.

Residual, not fixed: a tab closed between login success and the failure leaves the session without a
marker — equivalent to never disconnecting, not a broken disconnect contract.

## Commit

`6f126096` (signed) on `feat/456-privy-wallet-source`, pushed over `293f2f56`. The first hook run failed
on `apps/demo` `cross-env: command not found` — stale worktree install; `pnpm install --frozen-lockfile`
relinked the bin and the retry passed all 21 tasks (`TURBO_CONCURRENCY=2`). No reply posted to the
review — the user chose not to.
