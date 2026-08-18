---
type: issue
repo: sodax-backend
github: 1024
status: Active
tags: [auth, bound, email-login, passkey, srp, keystore, jwt, build]
updated: 2026-08-18
related_issues: [gh-1069-email-provider-wallet-connectivity, gh-831-bitcoin-radfi-hmac-auth, task-bound-backend-proxy]
related_knowledge: [bound-auth-mechanism, encrypted-keystore-vs-mpc-email-wallets]
related_decisions: [0001-own-the-email-wallet-auth-plane]
---

# GH-1024 Bound Auth Email Provider

- Source: https://github.com/icon-project/sodax-backend/issues/1024
- Started: 2026-08-12 (research dossier) · **Build call made 2026-08-18**
- Related PR: none yet. Label `enhancement`, zero comments, created 2026-07-27.

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

**Fez confirmed the direction on 2026-08-18**: build the entire piece of infrastructure — email
login, passkey, setup, backup, encrypted keys — running on our servers, using `radfi-be` as a
reference to *redo*, explicitly **not** integrating Bound's email login. Fez also arranged the
`lydialabs/radfi-be` read access for exactly this purpose. Full quote and reasoning in
[[0001-own-the-email-wallet-auth-plane]].

The ticket was filed as `research(...)`, so the original deliverable was a document. That part is
done. With the build call made, the deliverable becomes a design record plus an implementation.

## Acceptance Criteria

- [x] What Bound Auth actually is: flow, key custody, what the server stores.
      → [[bound-auth-mechanism]], derived from source at `68d8dab`.
- [x] What the backend already has, and what it is missing.
- [x] Where such a service could live, given what is already being built.
- [x] A build-vs-adopt recommendation with an owner. **Answered by Fez: build.**
- [ ] Post the research + decision as an issue comment (per `docs/TEAM_CONVENTIONS.md`,
      before implementing). **Still zero comments on the issue.**
- [ ] Confirm the open scope questions with Fez — see `plan.md` §Open questions.
- [ ] Design record `docs/auth-api.md` in `sodax-backend`.
- [ ] Cross-repo parent/sub-issue structure (backend + sdks + frontend) before coding.

## Related

- Decisions: [[0001-own-the-email-wallet-auth-plane]]
- Knowledge: [[bound-auth-mechanism]], [[encrypted-keystore-vs-mpc-email-wallets]]
