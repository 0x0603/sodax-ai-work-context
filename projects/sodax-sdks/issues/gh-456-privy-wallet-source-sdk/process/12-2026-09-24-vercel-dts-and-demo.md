---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-24
updated: 2026-10-05
---

# Session 12 — Vercel previews hang on the declaration build; Privy in `apps/demo`

> Renumbered 09 → 12 on 2026-10-05: written 2026-09-24 on a second machine and not pushed until then; the other
> machine had taken 07–09 in the meantime. In time order it sits between sessions 06 and 07.

Committed and pushed on the user's request: `bbc80df4` build(wallet-sdk-react) — the DTS split; `4a17e728`
feat(demo) — Privy in `apps/demo` + lockfile. Both signed; hook green (sdk 2903, dapp-kit 814, wallet-sdk-react
276 tests); `core.bare` stayed false. PR #486 body updated (two-pass paragraph, `apps/demo` for QA, twelve commits).
**Confirmed on Vercel** for `4a17e728` (4 cores, 8 GB, cache miss): main DTS pass 60 s, privy pass 10 s, both previews
succeed (`sodax-frontend-demo-v2`, `playground`).

## Vercel previews of #486 failed — cause and fix

- `playground` and `sodax-frontend-demo-v2` sat "deploying" 04:09 → 04:55 and failed: the 45-minute limit.
  `vercel inspect <dpl> --logs` (the CLI re-logged in through the device flow): builder **4 cores, 8 GB**;
  `@sodax/wallet-sdk-react:build` cache miss → `DTS Build start` at 04:09:46, then nothing.
- Baseline on the same builder, main commits that changed the package (`bf0eb3a0`, `ccad9185`): cache miss,
  **DTS 49 s**, success. Main gets remote-cache hits otherwise; CI has no `TURBO_TOKEN`, so only Vercel builds
  fill that cache.
- Local, with `NODE_OPTIONS=--max-old-space-size=<cap>` on the declaration worker: with the privy entry it OOMs
  (`ERR_WORKER_OUT_OF_MEMORY`) at 3072/4096/**6144**; the baseline (no privy entry) also OOMs at 4096 and 6144 —
  **the main declaration pass already needs 6–8 GB**, on an 8 GB builder. The privy entry tipped it over.
  Plain `tsc` over the same entries uses ~1.0 GB (1.2 GB with Privy), so the cost is rollup-plugin-dts, not the
  TS program. Stubbing Privy's types did not help (still OOM at 6144). **The privy entry alone: 3.5 s, fits in
  3 GB.** CI (GitHub, 16 GB) took 57.8 s for the combined pass.
- Fix: `tsup.config.ts` keeps `src/privy/index.ts` in the JS pass (it must share the `EVM.privy` registry chunk)
  but restricts `dts.entry` to the main entries, listed from `src/xchains` because tsup does not expand globs in
  `dts.entry`; new `tsup.privy-dts.config.ts` emits `dist/privy/index.d.ts` in a second pass (`dts.only`,
  `clean: false`, object entry so it lands in `dist/privy/`). Main pass DTS 25 s (baseline 26.6 s); privy pass 3.4 s.
  The new privy `.d.ts` inlines `PrivySource` (structurally identical) and imports only Privy and `@sodax/types`;
  `wallet-modal-example` checkTs passes across the two files; attw `./privy` 🟢; isolation + verify-dist OK.
  Docs: `SUB_PATH_EXPORTS.md` § tsup build, package `AGENTS.md` (keep the passes separate).
- Not fixed, worth raising in the PR thread: the main pass alone is at the edge of the 8 GB builders; the next
  entry or heavy type added to the package may hang Vercel again. Skipping declarations on Vercel (both apps run
  plain `vite build`) would remove the edge — a team call, not done here.

## Privy in `apps/demo` (user asked: "tôi nghĩ nên thêm vào apps demo")

- Same shape as `wallet-modal-example`: `src/privy.ts` (`typeof`-guarded env read so Rollup drops the import
  when unset), `index.tsx` awaits it before the first render, `providers.tsx` passes `privy` into `EVM`,
  `resolve.dedupe: ['@privy-io/react-auth']`, devDependency `@privy-io/react-auth` 3.40.0, `example.env`,
  README row, `AGENTS.md` line. The demo's wallet modal is a non-modal `Sheet`, so Privy's dialog needs no special
  handling.
- Lockfile: +168/−193 lines, **no new tarballs** — pnpm re-picked peer variants (utf-8-validate 5/6, immer) for
  the new importer; a plain `pnpm install` on HEAD changes nothing, so the churn is this change's.
- Verified: `checkTs`; biome (one pre-existing warning in `vite.config.ts`); build without the env → 0 files with
  Privy code; with a fake 25-char id → exactly 1 lazy Privy chunk (~2 MB, not in `index.html`); browser smoke on
  `vite preview`: app renders, the EVM row shows the envelope icon (`PRIVY_ICON`), clicking it fails at once with
  `PrivyApiError: Invalid Privy app ID` (Privy's `auth.privy.io/api/v1/apps/<id>` 400).
- For QA on the Vercel preview: someone with access sets `VITE_PRIVY_APP_ID` (Preview) on the
  `sodax-frontend-demo-v2` project and allows the branch alias origin in the Privy app.

## Bug found in the user's first live try: a background reconnect killed an open Privy login

- Symptom (demo, real app id): Privy login completed, no address, console `UserRejectedRequestError … Superseded
  by a newer connection attempt.` from the `useXConnect` path.
- Cause, reproduced with real `@wagmi/core`: flag `…privy.connected = 1` in the browser; the user's connect opens
  the login; a wagmi reconnect runs meanwhile (page-load restore right after a reload, or `EvmHydrator`'s retry)
  and `connect({ isReconnecting })` aborted every pending attempt, then gave up because the user was not yet
  authenticated (and cleared the flag). The OTP then completed with nothing waiting → Privy logged in, SDK not.
- Fix (uncommitted at the time of writing): `privyConnector` tracks whether the pending attempt is a user connect;
  a restore arriving meanwhile throws at once (wagmi swallows it) instead of aborting it. A user connect still takes
  over a pending restore. Two tests; the first fails without the fix (mutation-checked). 278 tests, `checkTs` green.
- Demo: the wallet `Sheet` (non-modal) no longer closes on interactions inside `#privy-dialog` (Privy's dialog id in
  3.40, `index-rkoxGjIC.mjs`) — not verified live, needs a real app id; `wallet-item` no longer logs user
  rejections as errors.
- Residual, not fixed: if that restore finds another authorized wallet (e.g. MetaMask) it can still connect it while
  the Privy login is open, and Privy then stands down as "another wallet connected".

## External review (pasted by the user) → one change taken

- Taken: **bound `EvmActions.disconnect`** — each wagmi disconnect gets `EVM_DISCONNECT_TIMEOUT_MS` (10 s); a stalled
  wallet is warned and no longer awaited. Pre-existing hang (the old code's comment already named "hangs (WC relay)"),
  widened by disconnect-all and by `useBatchDisconnect` awaiting chains in sequence. Test with a never-settling
  connector; fails without the deadline. `CONNECT_FLOW.md` and package `AGENTS.md` updated. 279 tests, `checkTs`,
  knip, biome, doc gates green. Uncommitted, together with the reconnect fix above.
- Not taken for #456: `mode: 'existing-provider'` / `disconnectBehavior` — additive later (`mode` defaulting to
  `'managed'` keeps `privy({ appId })` compiling; package is `2.0.0-rc`). The review's "don't override supported
  chains" is wrong for that mode: Privy 3.40 throws `Unsupported chainId` (4901) for chains missing from the host's
  `supportedChains`, so the SDK must export its chain list for the host to merge.
- Reviewer's revised verdict (pasted by the user): **approve after** (a) the per-connector disconnect deadline,
  (b) the committed reconnect-race fix with its regression test, (c) real-app QA of AC2–AC5 before un-drafting.
  `existing-provider` does not block V1; as a follow-up it is one feature: reuse the host provider and auth
  lifecycle, detach-only disconnect, no override of login methods/appearance, exported chain definitions (or a merge
  helper) with RPC overrides so Sonic avoids 4901, and a discriminated `mode` that keeps `privy({ appId })` valid.
- Committed and pushed on the user's request: `b94687e8` reconnect-race fix, `6db1ef90` disconnect deadline, `4c2a61dc`
  demo sheet. PR #486 body rewritten as short bullets (sections: what it adds, differs from the issue, changes for
  every EVM wallet, build, demos, known limits, why draft, follow-up `existing-provider`), sixteen commits.

## Live QA on the user's local demo (localhost:1993, real Privy app)

- Symptom: Privy login succeeded, the connect spun forever, nothing restored on reload. Temporary `[privy-debug]`
  traces showed `authenticated: true`, `hasEmbeddedAccount: true`, `embedded` set, but `walletsReady: false` forever.
- Cause (Privy 3.40 `useWallets`): `ready = areExternalConnectorsReady && hasResolvedInitialUser && walletProxy && …`,
  and `areExternalConnectorsReady` is set only from the external connectors' `connectorInitialized` event — never
  with `disableAllExternalWallets: true`. Unit tests mocked Privy, so only a real login could show it.
- Fix `1951626e`: the bridge treats the wallets as ready once Privy is ready, the user loaded and the embedded wallet
  listed (or none expected); the login wait also ends on `authenticated` and fails after `LOGIN_OPEN_MS` (5 s) if
  Privy never shows its dialog (`login()` only warns while Privy still holds a user); `createWallet()` bounded by
  `WALLET_MS`; waits name their step. 6 tests, each mutation-checked. The user confirmed it works ("ổn rồi").
- CI of `4c2a61dc` failed: `sodax-demo-v2#build` out of heap at ~4 GB — `4e334fbc` makes the Privy chunk always
  built, and #116 (2026-05-20) had dropped the demo's heap flag while its AGENTS.md still claimed 8 GB. Fix
  `8bc1930e`: `NODE_OPTIONS=--max-old-space-size=6144` (not 8 GB: Vercel builders have 8 GB).
- Hana (EIP-6963) not restored after a refresh on the dev server: most likely the known dev-only StrictMode bug in
  `EvmHydrator` (`process/10`). StrictMode was turned off locally for the user to confirm, then restored; the result
  was not reported before the user asked to commit. Not fixed in #486.
