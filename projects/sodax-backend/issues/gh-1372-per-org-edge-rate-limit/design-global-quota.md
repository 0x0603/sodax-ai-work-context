---
type: research
repo: sodax-backend
github: 1372
updated: 2026-10-20
tags: [rate-limit, distributed-systems, haproxy, redis]
---

# Global quota alternatives

Follow-up to `review.md`. The user confirmed that the current choice is divisor 2 on production
gateway-a/b and divisor 1 on canary-c. Today's user-run IP-limit probe admitted about 600 for a
per-node threshold of 300 and did not show production traffic reaching c. The documentary claim
that c receives a production share should be confirmed separately. No implementation change was
requested or made for this architecture discussion.

## What a definitive solution means

Separate three requirements: a shared budget independent of traffic split, preserving the full
budget when a gateway fails, and exact enforcement even during store failure/network partition.
Dividing local budgets solves neither full utilization under skew nor failover utilization.

Without coordination, a node cannot distinguish two histories with identical local state but
different consumption on its peer. To enforce a strict global cap it must either consult one
authoritative decision point or spend previously reserved quota that no other node can spend.
During a partition, correctness can require waiting or rejecting requests even when unused global
quota may exist. This is a design constraint, not a missing HAProxy option.

## Practical recommendation if global accuracy becomes a requirement

Preserve the api-auth control plane and its keyset poller. Add a separate data-plane rate-limit
service, reachable via HAProxy SPOE or another reviewed integration, backed by one shared Redis
primary for rate-limit state. Each request supplies the resolved orgId and effective limit;
the check and state update execute atomically. Two independent per-deployment Redis instances
do not supply shared accounting. api-auth itself remains off the request path.

For a strict maximum of N accepted admissions in every rolling 60-second interval, atomically
remove expired admission timestamps, count remaining entries, and insert a unique request id
only if fewer than N remain. Use server time and an explicit policy for retries/deduplication.
This is a sliding-window log, not a fixed wall-clock minute or a token bucket with a burst budget.
It fixes the gateway split/skew/halved-failover problem while the shared store remains reachable.

It adds a network decision on keyed traffic and a shared failure dependency. Latency must be
measured between the actual gateway locations and store; no latency estimate was measured here.
Failure policy must be explicit: fail-open sacrifices the strict cap; fail-closed preserves
the cap at the cost of availability. An unavailable limiter should yield a dependency error such
as 503 rather than falsely asserting that the org exhausted its quota with 429.

Redis Lua atomicity does not make Redis failover lossless. Redis replication is asynchronous,
and even WAIT does not guarantee strong consistency. An absolute failure-inclusive guarantee
needs a coordination/durability design that preserves committed admissions across failover, or
a conservative recovery rule that avoids reissuing possibly spent quota.

## Other options

| Option | Benefit | Remaining cost or limit |
| --- | --- | --- |
| One designated owner per org | Full local budget, independent of Cloudflare traffic split | Forward requests/checks reaching the other gateway; failure requires state transfer and exclusive ownership, otherwise budget resets or split-brain |
| Coordinator grants quota batches | No store round trip for each local admission; no duplicate allocation | Unspent reservations can strand capacity; safe expiry/reclamation and rolling-window semantics are significantly more complex; never reallocate merely because a peer looks dead |
| Cloudflare Worker + one Durable Object per org | Managed authoritative state per org without self-hosting Redis | Worker needs the key-hash/org/limit mapping; each decision reaches the object; persist state and use atomic operations; placement latency and hot-org throughput need assessment |
| HAProxy Enterprise GPE | Supported aggregation of active-active stick tables | Collect/aggregate/push is not evidence of atomic global permission reservation for each request; do not label it an absolute quota guarantee |
| Active/passive gateway | One normal-operation counter and full N | Changes availability/load-balancing topology; replicated counters can lag during failover; not a strict failure-inclusive solution alone |

Plain Cloudflare WAF rate-limiting rules are not a substitute for a global authoritative counter:
their counters remain scoped to data centers (with a documented same-location exception).

## Sources checked

- [Redis Lua atomic execution](https://redis.io/docs/latest/develop/programmability/eval-intro/)
- [Redis WAIT consistency limits](https://redis.io/docs/latest/commands/wait/)
- [HAProxy 2.8 configuration](https://docs.haproxy.org/2.8/configuration.html)
- [HAProxy SPOE protocol](https://github.com/haproxy/haproxy/blob/master/doc/SPOE.txt)
- [Enterprise GPE aggregation](https://www.haproxy.com/documentation/haproxy-enterprise/enterprise-modules/global-profiling-engine/real-time-aggregation/)
- [Durable Objects model](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)
- [Cloudflare WAF counter scope](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)

The architecture comparisons and recommendations above are engineering inferences from these
mechanisms. No global limiter, ownership or quota-leasing implementation was built or benchmarked.
