---
type: issue
repo: sodax-frontend
github: 1069
status: Blocked
tags: [wallet, email-login, web3auth, mpc, hana, needs-decision, product-call]
updated: 2026-08-18
related_issues: [gh-1024-bound-auth-email-provider]
related_knowledge: [encrypted-keystore-vs-mpc-email-wallets]
related_decisions: [0001-own-the-email-wallet-auth-plane]
---

# GH-1069 Email Provider Wallet Connectivity

- Source: https://github.com/icon-project/sodax-frontend/issues/1069
- Started: 2026-08-12 (decision brief only)
- Related PR: none
- Created 2026-04-07. Last activity: the 2026-04-15 research comment.

## Problem

Add email-provider login to wallet connectivity — core logic in `wallet-sdk-core`, React in
`wallet-sdk-react`. Named provider: Web3Auth. The ticket says to branch off `sdk-v2-main`.

The ticket's own **IMPORTANT**: because a wallet address is derived from email + domain
account, a user logging in through a different email wallet provider gets a different address
and their balances do not show up — *"which is un-acceptable"*. It asks for research into
providers (Privy is named) that would give the same address regardless of provider.

The **NOTE**: Hana's account is to be used for this auth, so SODAX gets Hana-linked accounts
and balances out of the box, same derivation path.

## Context

The 2026-04-15 comment (0x0603) already answers the research question:

> Hana is using Web3Auth per their privacy docs, so the "same address" thing only works if we
> also use Web3Auth — with Hana's configs (`clientId`, allowed origins, a shared custom
> verifier on their Web3Auth dashboard).
>
> No provider offers "email-only, different-domain" wallets. Every MPC provider (Web3Auth /
> Privy / Turnkey / Magic, etc.) scopes keys to the app `clientId`. This is a security feature,
> not a limitation.
>
> note: sharing Web3Auth configs with Hana means coupled security (issue on either app affects
> both) and hard to untangle later

## Acceptance Criteria

Not re-derivable until the product call is made — see `plan.md`.

## Related

- Knowledge: [[encrypted-keystore-vs-mpc-email-wallets]]
- Decisions:
