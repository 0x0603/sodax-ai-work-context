---
type: outcome
repo: sodax-sdks
github: 519
status: Input drafted, not posted
updated: 2026-10-14
---

# Outcome

- PR: none (idea capture only)
- Commits: none in icon-project repos
- Tests: n/a

## Summary

Input for #519 drafted in `ideas.md` §1, backed by `measurements.md` and `competitors.md`. The user
posts it.

Projected v3 gains for an EVM-only app (measured what-ifs, upper bounds; `measurements.md` § Projected
v3 gains):

| Metric | Today | v3 what-if |
| --- | --- | --- |
| Minimal swap dapp bundle | 2,994 KB gzip | 186 KB (582 KB with WalletConnect) |
| `npm i @sodax/sdk` | 412 pkgs · 777 MB · 35 advisories | ~18 pkgs · ~85 MB · 0 |
| Dapp install | 1,357 pkgs · 1.8 GB · 81 advisories | 29 pkgs · 108 MB · 0 |
| Node import + `new Sodax()` | 888 ms · 268 MB RSS | ~92 ms · 74 MB |

Chain plugins are the main lever. Client-first actions alone, with every chain still in core, save
about 5%.

## Follow-ups

- v2 bugs in `ideas.md` §3 — user decides whether and where to raise them.
- Re-run `artifacts/bundle-baseline/` on the first v3 build to show the delta.
