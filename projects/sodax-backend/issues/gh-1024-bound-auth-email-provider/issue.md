---
type: issue
repo: sodax-backend
github: 1024
status: Active
tags: [research, auth, bound, email-login, passkey, srp, keystore, jwt]
updated: 2026-08-12
related_issues: [gh-1069-email-provider-wallet-connectivity, gh-831-bitcoin-radfi-hmac-auth, task-bound-backend-proxy]
related_knowledge: [encrypted-keystore-vs-mpc-email-wallets]
related_decisions: []
---

# GH-1024 Bound Auth Email Provider

- Source: https://github.com/icon-project/sodax-backend/issues/1024
- Started: 2026-08-12 (research dossier)
- Related PR: none. Label `enhancement`, zero comments, created 2026-07-27.

## Problem

Raw issue body:

> We want to setup our own backend for email provider based wallet login (we are provider) so
> that we are not depending on external 3rd parties for email based logins.
> Use following email provider setup (auth) as base of knowledge, we should replicate it (not
> maybe directly copy, just pick out what we need to enable email based wallet logins):
> https://docs.bound.exchange/bound-docs/bound-auth/what-is-bound-auth,
> backend repo: https://github.com/lydialabs/radfi-be,
> https://github.com/boundex/radfi-web

## Context

This inverts the existing Bound relationship. `gh-831-bitcoin-radfi-hmac-auth` and
`task-bound-backend-proxy` are both about SODAX **authenticating to** Bound. This issue is
about SODAX **becoming** the provider.

It is also the server half of frontend **#1069** — see `[[encrypted-keystore-vs-mpc-email-wallets]]`.

## Acceptance Criteria

A `research(...)` ticket, so the deliverable is a document, not a diff — which
`docs/TEAM_CONVENTIONS.md` explicitly asks to confirm up front ("plan deliverable — code fix
vs. issue body").

- [x] What Bound Auth actually is: flow, key custody, what the server stores.
- [x] What the backend already has, and what it is missing.
- [x] Where such a service could live, given what is already being built.
- [ ] A build-vs-adopt recommendation with an owner. **Needs a product call.**

## Related

- Knowledge: [[encrypted-keystore-vs-mpc-email-wallets]]
- Decisions:
