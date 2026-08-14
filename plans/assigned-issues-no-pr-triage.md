---
type: plan
status: Active
updated: 2026-08-14
related_issues: [1622, 1623, 1627, 1374, 1375, 1632, 1069, 330, 251, 21, 1024]
related_decisions: []
tags: [triage, cross-repo, assigned-issues, sodax-frontend, sodax-sdks, sodax-backend]
---

# Triage — my assigned issues that have no PR (2026-08-12)

Cross-repo, so it lives here rather than in any one issue folder. The per-issue detail is in
the eleven `plan.md` / `process.md` / `outcome.md` sets linked below; **this page is the entry
point and the record of the session-level decisions**, which otherwise have no home.

## Scope

`gh search issues --assignee=0x0603 --state=open` → **20 open issues** across four
`icon-project` repos. Nine already carry one of my PRs, so this pass covered **the 11 with no
PR at all** (verified per issue via its GitHub timeline — no `cross-referenced` / `connected`
pull-request event).

State of the other nine: `research/open-prs-state-2026-08-11.md`.

## The eleven

| Tier | Repo | Issue | Folder | Status now |
| --- | --- | --- | --- | --- |
| A1 | frontend | #1622 harden `/api/partners/email-guide` | `gh-1622-email-guide-hardening` | implemented, local branch |
| A2 | frontend | #1623 fence scraped content in the analyze prompt | `gh-1623-fence-scraped-content-llm-prompt` | implemented, local branch |
| A3 | frontend | #1627 pin 11 GitHub Action refs to SHAs | `gh-1627-pin-github-action-shas` | **PR #1684 open (2026-08-14)** |
| B1 | frontend | #1374 `pnpm.overrides` for Dependabot deps | `gh-1374-pnpm-overrides-dependabot` | unblocked, re-scoped, not started |
| B2 | frontend | #1375 dismiss unreachable alerts | `gh-1375-dismiss-unreachable-dependabot-alerts` | worksheet only, nothing dismissed |
| B3 | frontend | #1632 pre-signature preview modal | `gh-1632-pre-signature-preview-modal` | blocked on a priority call |
| B4 | frontend | #1069 email-provider wallet connectivity | `gh-1069-email-provider-wallet-connectivity` | blocked on a product call |
| B5 | sdks | #330 Bound endpoint inventory | `gh-330-bound-exchange-endpoint-inventory` | blocked — its premise is false |
| B6 | sdks | #21 controller hooks | `gh-21-controller-hooks` | design drafted |
| B7 | backend | #1024 research(bound-auth) | `gh-1024-bound-auth-email-provider` | research delivered |
| C1 | sdks | #251 Aleo review (PR #95) | `gh-251-aleo-integration-review` | still correctly blocked |

Tier A = code. Tier B = the deliverable is a written artifact — either because the ticket asks
for research/design, or because its instructions had decayed and a corrected worksheet was
worth more than a blind diff. Tier C = blocked on someone else.

`#1622 → #1623 → #1627` is the order epic #1621 asks for, and also the right risk order.

## What shipped

Three branches in `sodax-frontend`, one commit each, `main` untouched. As of **2026-08-14** the
1627 branch is pushed and in review as PR #1684; the other two are still local:

| branch | commit | state |
| --- | --- | --- |
| `chore/1627-pin-action-shas` | `43721806` (was `791acc31`, amended) | PR #1684 open |
| `fix/1622-email-guide-hardening` | `1b0366c6` | local, not pushed |
| `fix/1623-fence-scraped-content` | `322b53b6` | local, not pushed |

Gates: `pnpm lint`, `pnpm checkTs`, `pnpm build` green on each. This repo has **no test suite
at all** — `pnpm test` is a no-op and CI never runs it — so verification was typecheck + lint +
build plus hand-written drivers run against the shipped source (the email canonicaliser table,
the prompt-fence break-out test).

## The four findings that outlived their own tickets

1. **#330's premise is false.** The browser → Bound proxy it is gated on was never built —
   sodax-backend#831 closed with HMAC signing for swaps-api's own calls (#1028) instead, and no
   issue tracks a proxy. The inventory would also produce a *partial* switch: `apps/node` and
   `apps/demo` hardcode the Bound URLs and would not move.
2. **#1374 is blocked by its own pin.** Root `package.json` already carries
   `axios: "1.13.2"`; every open axios advisory needs ≥1.18.0, so that override is what is
   holding axios vulnerable — 29 of 116 open alerts. Meanwhile kysely/qs/minimatch have zero
   alerts left and protobufjs, which holds the critical, is not on the ticket's list.
3. **#1024 is the structural answer to #1069.** Bound Auth is an *encrypted-keystore* model, not
   MPC — the address derives from a user-held mnemonic, so the `clientId` scoping that
   dead-ends #1069 does not exist. Neither issue says so. Written up once in
   `knowledge/architecture/encrypted-keystore-vs-mpc-email-wallets.md`.
4. **#1632 cannot be built as written.** Every path it names moved when `packages/` left
   `sodax-frontend` (#1308); three of its acceptance criteria have nothing to run against.

## Session decisions

D1–D4 are also recorded in the issue folders they belong to. **D5 and D6 are session-level and
live only here.**

- **D1 — `actions/checkout` pinned to v4.4.0 (`11d5960a`), not the `34e11487` the ticket names.**
  That SHA is real and in the v4 lineage — it is v4.3.1 — but `@v4` resolves to v4.4.0, two
  commits ahead. Following the ticket literally would silently downgrade CI as a side effect of
  a pinning-only change, and its consistency argument was conditional on PR #1565 landing,
  which has not happened. One-line flip if the reviewer disagrees.
- **D2 — `anthropics/claude-code-action` pinned after all.** *Revised 2026-08-14 — the original
  rationale was wrong.* "#1608 merged so Dependabot bumps the SHAs" does not survive the
  arithmetic: weekly runs behind a 14-day cooldown against a ~1.2-day release cadence bounds the
  drift, it does not remove it. Pinning is still right, because `v1` is force-repointed on every
  release and that mutability is exactly the CWE-494 the ticket targets — but it is pinned
  *knowingly stale*, which is what the ticket asked for. No `cooldown` exception added: that job
  holds `CROSS_REPO_TOKEN`. The pin itself was also stale on commit and was corrected to
  v1.0.192 before push — see the 1627 `process.md`.
- **D3 — reused `BOUNDARY_HEAD`/`BOUNDARY_FOOT`** rather than a new `<sodax-untrusted-data>`
  tag: `docs/agent-readiness.md` §6 mandates those exact strings.
- **D4 — #1622's heavy URL validation runs after Turnstile and the quotas**, not at the
  existing check site, so an unauthenticated caller cannot drive host resolution.
- **D5 — only `sodax-ai-work-context` was pushed.** "Không push lên sodax\*" read as the
  `icon-project` work repos, where a push is visible to the team. This repo is
  `0x0603/sodax-ai-work-context` and `AGENTS.md` names commit + push here as the session-end
  sync. Work-repo branches are local, with no upstream set. **Superseded for 1627 on 2026-08-14**
  — pushed and PR #1684 opened on explicit instruction. The 1622 / 1623 branches are unchanged.
- **D6 — no GitHub comment posted, on any issue; no issue body edited; no new tracker issue
  opened.** Six issues have a drafted comment sitting in their `outcome.md` under
  "Draft comment for the issue — NOT POSTED". Posting is outward-facing and stays a human action.
  Still holds on 2026-08-14: PR #1684 carries 1627's corrections in its own description, so its
  drafted issue comment was dropped rather than posted, and #1627's body was left untouched.

## Open — needs a person

| What | Where | Why it cannot be closed from a terminal |
| --- | --- | --- |
| Does the Resend template render `protocol_name` / `protocol_url` escaped or raw? | #1622 | Lives in the Resend dashboard. If raw, finding 1 was worse than Medium. |
| Add the trust-boundary clause to the Notion master prompt | #1623 | The live system prompt is fetched from Notion, not the repo. |
| Re-test the `NOT_A_PROTOCOL:` sentinel against a real non-protocol URL | #1623 | Needs a running app with provider + Notion credentials. |
| Priority call on the pre-signature modal | #1632 | Asked of @FezBox on 2026-06-30, never answered. |
| Product call: accept different addresses / ask Hana for shared Web3Auth config / build the keystore model | #1069 + #1024 | Partnership and risk decision, not engineering. |
| Dismiss the Dependabot alerts | #1375 | Outward-facing write to a shared repo's security record. |

## Quick wins spotted in passing (not this session's scope)

- **sdks #232 is one click from closing #304** — approved, merges cleanly, and its red
  "Validate PR title" check is stale runs; the title was fixed 2026-07-30 and has passed since.
- **sdks #311 and #308 are both missing a required changeset**, and the CI gate *false-passes*
  because their base predates the workflow's introduction.

Detail for both: `research/open-prs-state-2026-08-11.md`.
