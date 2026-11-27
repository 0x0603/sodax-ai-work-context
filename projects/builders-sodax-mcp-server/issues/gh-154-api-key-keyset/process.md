---
type: process
repo: builders-sodax-mcp-server
github: 154
tags: [api-key, api-auth, keyset, enforcement, mcp, review]
updated: 2026-11-27
---

# GH-154 Process

## 2026-11-27: Authentication plan review

Scope: review `plan.md`, without implementing the verifier or changing its proposed behavior.
Fetched the MCP development ref and confirmed it is still `a36489d`. Inspected that ref rather than
the hub checkout's unrelated feature branch. Checked the producer and client contract at backend
`dcb1796b`, the debug verifier at `f578673`, and the current GH-154 issue through read-only GitHub CLI
calls. The GitHub connector failed authentication; the CLI fallback succeeded.

### Findings

1. **P1: Accept a validated empty replacement keyset.** `plan.md:47-53`, `:81-83` and `:185` reject
   a successful empty response after a populated snapshot. That response is legitimate: revocation
   hard-deletes rows (`apps/api-auth/src/keys/keys.service.ts`, `revoke`), and `KeysetService.build`
   publishes the full remaining set. Revoking the last key, or an intentional revoke-all, therefore
   leaves the MCP accepting the old keys indefinitely even while api-auth is reachable. Rejecting
   malformed responses is appropriate; non-emptiness is not a validity invariant. Accept the empty
   map atomically and alert on the count change separately. Replace the rejection test with a test
   that the last revoked key becomes `unknown_key`, including on an existing swap SSE session.

2. **P2: Re-evaluate SSE messages in monitor mode too.** `plan.md:128-129` restricts message-time
   checks to `enforce`, while `:23` promises monitored outcomes. Existing `messageContext` returns
   a copy of the opening session context. With the proposed changes, a key revoked or suspended
   after connection can continue to report its opening `ok` outcome throughout a monitor session;
   a session opened without a snapshot can keep reporting `snapshot_unavailable` after recovery.
   Re-check the current message key in both `monitor` and `enforce`, replace its check context and
   response locals, and reject only in `enforce`. Keep the existing session-key ownership check.
   If #146 removes SSE first, this finding no longer applies. Test the verdict and log/analytics
   fields after revocation and recovery, not just whether a monitor request passes.

3. **P2: Qualify the revocation guarantee.** `plan.md:52-53`, `:214` and `:244-245` promise one
   interval, but failed polls deliberately preserve the previous snapshot without an expiry.
   Even a successful poll takes time after the interval begins. State that revocation takes effect
   after a successful replacement is applied; under healthy polling, the delay includes the poll
   interval and request/application latency. During an outage there is no fixed upper bound with
   the proposed availability policy. This is consistent with backend decision 2 and does not
   itself require introducing a snapshot TTL. If a hard maximum is required, explicitly choose a
   maximum stale age and define what enforcing requests do after it. A Discord alert alone does
   not enforce a revocation deadline.

### Clarifications before implementation

- **Boot modes:** `plan.md:43-44` describes startup continuation in any mode and then says swap gets
  503 until a snapshot arrives. Qualify that restriction as `enforce` only; `monitor` must still
  expose shape-valid swap toolsets with outcome `snapshot_unavailable`. Pin both modes in the boot
  tests. The issue still contains the older fail-to-start acceptance criterion, already identified
  in the plan's Open section; synchronize it after the behavior is settled.
- **304 freshness:** explicitly count a 304 with an existing snapshot as a successful verification:
  reset the freshness age, consecutive failure count, and last error, and recover a stale alert.
  Otherwise unchanged keys can trigger a false stale incident. Add fake-time coverage for
  `200 -> failures -> 304` and sustained healthy 304s beyond 300 seconds. The backend client already
  tests that 304 resets age (`packages/api-auth-client/test/keyset-snapshot.service.test.ts`).
- **Refusal attribution:** call `noteKeyCheck` before `selectToolsets` can throw, so 401/403/503
  request logs retain the current outcome and matched org. Check captured logs for rejected
  requests, not only successful tool calls.

### Validation and disposition

This was source and contract inspection. No runtime tests were run because the implementation does
not exist yet. The empty-keyset behavior is the primary correctness blocker. The polling architecture,
atomic replacement, redirect refusal, and HTTP-only verifier remain appropriate for this scope.
`plan.md`, upstream source code, and the GitHub issue were left unchanged. The dossier was already
untracked at session start; no commit or push was performed during this review.

## 2026-11-27: Follow-up review of the revised plan

Re-read the revised plan after the user reported updated documentation. The three original findings
are resolved: empty snapshots replace populated snapshots, SSE monitor messages refresh their verdict,
and the revocation guarantee explicitly depends on successful polling. The boot-mode, 304 freshness,
and refusal-attribution clarifications and their test cases are included. Merge order now explicitly
keeps SSE in this implementation and removes it later in #146.

No remaining implementation blocker was found in this documentation review. One minor test wording
clarification remains at `plan.md:216`: rejected requests always carry `caller.key_check`, but
`caller.org_id` is present only for matched keys. `unknown_key` and `snapshot_unavailable` have no
matched org; their tests must allow an absent org attribute, consistent with `checkApiKey`'s contract.

Fetched development again and confirmed the baseline is still `a36489d`. A read-only check of GH-154
confirmed that its boot acceptance criterion is still the old fail-to-start behavior, so syncing the
issue remains necessary. The verifier token remains a release dependency. No implementation or
runtime tests were performed; the revised `plan.md` was left unchanged.
