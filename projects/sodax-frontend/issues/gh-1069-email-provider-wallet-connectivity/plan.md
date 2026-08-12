---
type: plan
repo: sodax-frontend
github: 1069
updated: 2026-08-12
---

# Plan

## Goal

Close the ticket's research question (it is already answered), and put the three real options
in front of whoever owns the product call.

## Why no code

The blocker is not technical. The 2026-04-15 comment settled the research: address-portability
across providers is not purchasable, because `clientId`-scoping is the security property that
makes MPC custody work. What is left is a **partnership and risk decision**, not an
engineering task.

## The three options

**(A) Accept different addresses.** Ship email login on our own Web3Auth `clientId`. Simple, no
partner dependency, fully under our control — and it breaks the ticket's stated requirement,
because a Hana user logging in by email at SODAX sees an empty wallet.

**(B) Ask Hana to share their Web3Auth configuration** — `clientId`, allowed origins, and a
shared custom verifier on their dashboard. This is the only route to the ticket's requirement.
Cost, stated plainly: **coupled security.** A compromise or misconfiguration on either app
affects both, we inherit their verifier's lifecycle, and the arrangement is hard to untangle
later. It is also a request to another company, so it may simply not be granted.

**(C) Don't do email login on the MPC model at all** — see the cross-repo note below.

## The cross-repo observation that should be on the table

Backend issue **#1024** (`research(bound-auth)`) is researching an **encrypted-keystore**
model — the Bound Auth architecture, where the server is a blind custodian of a
client-encrypted keystore blob and the address derives from a mnemonic the *user* holds.

In that model the `clientId` coupling **does not arise at all**, because the key is not scoped
to an app. That makes #1024 the structural answer to this ticket's "un-acceptable" problem, and
neither issue currently says so. Detail in `[[encrypted-keystore-vs-mpc-email-wallets]]`.

It is not a free lunch — it is a much larger build (see the #1024 folder), and it makes SODAX
the custodian of an encrypted blob and of an auth surface it does not have today. But it is the
option that actually satisfies the requirement without a partner dependency, and it should be
weighed against (A) and (B) rather than tracked separately.

## Steps once a direction is chosen

The plug-in point is already known and does not need rediscovering: an email provider is one
more `XConnector` subclass. Interface `IXConnector` in
`sodax-sdks/packages/wallet-sdk-react/src/types/interfaces.ts`, base class
`XConnector` (`src/core/XConnector.ts:16`, `connect()` :39, `disconnect()` :44), concrete
connectors under `src/xchains/<chain>/`, registered through `chainRegistry.ts`.

## Verification

n/a until a direction is chosen.

## Risks

Option (B)'s coupled security is the one that is hard to reverse. Worth writing down before
anyone asks Hana, not after.
