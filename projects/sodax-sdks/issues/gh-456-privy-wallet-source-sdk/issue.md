---
type: issue
repo: sodax-sdks
github: 456
status: Active
tags: [wallet, privy, email-login, embedded-wallet, wallet-sdk-react, evm, wagmi, walletconnect]
updated: 2026-09-17
related_issues: [gh-1069, gh-1024]
related_decisions: [0001, 0002]
---

# GH-456 Integrate Privy as a wallet source in the SDK

- Source: https://github.com/icon-project/sodax-sdks/issues/456
- Author: FezBox (2026-09-15). Assignee: 0x0603. No comments as of 2026-09-17.
- Started: 2026-09-17
- Related PR: —

## Problem

Add **Privy** as an opt-in wallet source in the SODAX SDK, sitting in the same wallet list as
MetaMask, Hana, WalletConnect, etc. Selecting it opens Privy's login so a user can sign in with
email (and set up password/recovery) and get an embedded wallet, then use SODAX (swap, lend,
bridge) as if they had connected any other wallet.

Partner-facing SDK option, not a replacement of the other wallets. Partners who want email
onboarding enable it; everyone else leaves it off.

Context in the issue: approved as the wallet-connectivity path (Robi/Fez 3 Sep) and as the
**replacement for the in-house email login** (Anton/Fez 14 Sep). This card is the SDK slice.

## Issue body — high-level analysis (verbatim)

**Where this lands.** Wallet connect UX lives in `@sodax/wallet-sdk-react`. Signing already lives
in `@sodax/wallet-sdk-core` (`EvmWalletProvider` takes an injected EIP-1193 / viem client). Privy
embedded wallets speak EIP-1193, so we should **not** invent a new core provider class. This is a
React connector / provider-config job.

**Closest existing pattern.** WalletConnect. Today `EVM.walletConnect` on `SodaxWalletConfig`
optionally pushes a wagmi connector in `EvmProvider.tsx`; `EvmHydrator` surfaces it in
`useXConnectors({ xChainType: 'EVM' })` and the wallet modal picks it up with no extra UI. Privy
should follow that shape: optional `EVM.privy` config → connector appears in the same list.

**Why it is not a copy-paste of WalletConnect.** Privy's wagmi integration requires:
- wrapping the tree with `PrivyProvider` (`appId`)
- using `WagmiProvider` from `@privy-io/wagmi` (not `wagmi`) when Privy is enabled
- `reconnectOnMount: false` for the embedded wallet
- a login modal (email) instead of a QR / extension popup

That provider swap is the main integration risk: EIP-6963 injected wallets (MetaMask, Hana, …)
must keep working when Privy is on.

**Login vs password.** Privy's email login is OTP (`sendCode` / `loginWithCode`), not a
traditional email+password account. Password in Privy is the **wallet recovery/backup** factor
(`setWalletRecovery`). V1 should: email login → auto-create embedded EVM wallet → prompt/enable
Privy recovery (password). If we need password-as-login, that needs a Privy dashboard/login-method
check before we design it.

**Chain scope.** Privy is native on EVM + Solana. SODAX hub is Sonic (EVM). **V1 = EVM only.**
Solana can be a follow-up. Do not take on Sui/ICON/Bitcoin/etc. in this card.

**Bundle.** Do not make `@privy-io/*` a hard dependency of `@sodax/wallet-sdk-react`. Optional
peer + config gate, same spirit as WalletConnect's `projectId` skip. Partners who omit `EVM.privy`
never load Privy.

**Prior art.** Feasibility brief *Email-Login Wallets* (2026-06-22) already recommended this route:
React connector beside WalletConnect, reuse existing `IEvmWalletProvider`. Vendor later settled on
Privy (not Web3Auth). Related open card: sodax-frontend#1069 (Web3Auth / Hana-derivation research
on the old frontend repo) — this card supersedes that for implementation.

## Issue body — game plan (verbatim)

1. **Config slot** — add optional `EVM.privy` (`appId` required; login methods default to email;
   skip + warn if `appId` missing), mirroring `EVM.walletConnect` in
   `packages/wallet-sdk-react/src/types/config.ts` and `EvmProvider.tsx`.
2. **Provider wiring** — when the slot is set, mount `PrivyProvider` and Privy's `WagmiProvider`;
   keep the current wagmi path when it is not. Confirm injected wallets still appear and connect.
3. **Connector in the list** — hydrator should expose a stable connector (`id` + label, e.g.
   `privy` / "Email (Privy)") in `useXConnectors` and the wallet modal, alongside the other EVM
   options.
4. **Connect flow** — `selectWallet(privy)` → Privy login UI (email) → embedded EVM wallet created
   → account hydrates into the store → existing `EvmWalletProvider` signs SODAX intents. Enable
   password recovery as part of that first-login path.
5. **Optional peers** — `@privy-io/react-auth` + `@privy-io/wagmi` as optional peerDependencies;
   document install. No Privy in the default bundle.
6. **Prove it** — enable the slot in `apps/wallet-modal-example` (or demo): pick Privy from the
   list, email login, complete a signed SODAX action (swap or intent).
7. **Docs + changeset** — add `WALLET_PRIVY.md` next to `WALLETCONNECT.md`; README one-liner;
   changeset on `wallet-sdk-react`.
8. **Out of scope for this card** — Solana Privy, replacing sodax.com's in-house email login
   (frontend follow-up that *consumes* this option), server wallets, session keys, AA / smart
   accounts, fiat onramp.

## Requirements

- [ ] Privy appears as one wallet option in the SDK wallet list when `EVM.privy` is configured,
      same place as the other EVM wallets
- [ ] Selecting it runs Privy email login and provisions an embedded EVM wallet (password/recovery
      set up as part of that flow)
- [ ] After connect, the user can sign SODAX transactions through the existing `EvmWalletProvider`
      / dapp-kit hooks — no special-case swap/lend path
- [ ] Other wallet options (injected + WalletConnect) keep working when Privy is enabled
- [ ] Partners who omit `EVM.privy` do not load Privy code and see no Privy option
- [ ] Documented with a copy-paste config example (app id, email login)

## Acceptance Criteria

- [ ] AC 1: With `EVM.privy.appId` set, `useXConnectors({ xChainType: 'EVM' })` includes a
      Privy/email connector; without it, the connector is absent and no Privy provider is mounted
- [ ] AC 2: Choosing that connector opens Privy login; a new user can sign up with email, set
      recovery/password, and ends with a connected EVM `XAccount`
- [ ] AC 3: A returning user with the same email reconnects to the **same** embedded address
- [ ] AC 4: After Privy connect, a SODAX signed action (swap createIntent or equivalent demo flow)
      succeeds using the standard wallet-provider slot — no Privy-specific SDK call at the feature
      layer
- [ ] AC 5: MetaMask (or any EIP-6963 injected wallet) and WalletConnect still connect and sign
      while Privy is enabled
- [ ] AC 6: Docs (`WALLET_PRIVY.md` + README) show the config slot, required packages, and the
      email login behaviour; changeset published on `@sodax/wallet-sdk-react`

## Notes (verbatim)

- Repo: `icon-project/sodax-sdks` (`packages/wallet-sdk-react`, not a new `wallet-sdk-core`
  provider).
- Follow the in-repo `add-wallet-provider` skill — EVM is provider-managed, so this is a wagmi
  connector / config slot, not a new `XConnector` subclass.
- Needs a Privy App ID (SODAX / partner dashboard) before this can be demoed against production
  Privy.
- Frontend consumption (sodax.com dropping in-house email login in favour of this option) is a
  separate card.
- Related: sodax-frontend#1069 — leave it open until this ships, then close as superseded.

## Corrections to the issue text (verified in source, 2026-09-17)

- **"changeset published"** (step 7, AC 6) is stale: PR #407 (merged 2026-08-30) removed
  changesets; release notes come from commit subjects. The equivalent deliverable is a clean
  `feat(wallet-sdk-react): …` commit subject. See `plan.md`.
- The issue's assumption that Privy *requires* `WagmiProvider` from `@privy-io/wagmi` is the
  vendor's documented path, not the only one — evaluated in `plan.md` § Approach.

## Related

- Knowledge: `knowledge/architecture/encrypted-keystore-vs-mpc-email-wallets.md` (app-id-scoped
  key derivation — why the same email gives different addresses per Privy app)
- Decisions: `0001-own-the-email-wallet-auth-plane` (build in-house — **superseded by the
  14 Sep product call recorded in this issue**), `0002-key-custody-boundary-for-third-party-dapps`
- Issues: sodax-frontend#1069 (superseded for implementation), sodax-backend#1024 (in-house Bound
  auth — the thing Privy replaces)
