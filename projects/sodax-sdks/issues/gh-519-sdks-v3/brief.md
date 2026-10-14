---
type: brief
repo: sodax-sdks
github: 519
status: Active
next: User reviews ideas.md §1 and posts their own input on #519 (R0bi7's issue — agents do not post)
updated: 2026-10-14
tags: [v3, idea-capture, lightweight, bundle-size, architecture, what-if]
related_issues: [gh-302, gh-456]
---

# GH-519 SDKs v3 · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

#519 is R0bi7's idea-capture board for v3: bullets per package, name prefix, details later.

On 2026-10-14:
- Measured the published 2.2.0 packages (bundle, install, Node import, tsc, audit).
- Wrote a ranked, evidence-backed idea list for the user's own input, lightweight first.
- Measured what v3 would gain, using source builds and dependency-group installs. EVM-only swap dapp:
  2,994 → 186 KB gzip. `npm i`: 778 MB / 35 advisories → ~85 MB / 0.
- Distilled peer SDK research into `competitors.md`.

Nothing is posted and no icon-project code changed.

## Next action

User edits `ideas.md` §1 (the paste-ready block, now with a what-if line) and posts it themselves.

If v3 work starts:
- re-run `artifacts/bundle-baseline/` against the v3 build;
- `measurements.md` holds both the before numbers and the projected after numbers.

## Settled — do not re-litigate

- Do not edit #519's body or comment on it from an agent (memory: stay off others' issues).
- The numbers in `measurements.md` are for **published 2.2.0**, not `main`. `main` package.json still
  says `2.0.0-rc.17`; the release script bumps at publish.
- What-ifs are upper bounds: stubbed code disappears and no replacement code is counted.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What should I post on #519? | `ideas.md` §1 | 4.5k (whole file) |
| Why each idea — file:line evidence, v2 bugs found, open questions | `ideas.md` §2–4 | (same) |
| How heavy is the SDK today, and why does tree-shaking fail? | `measurements.md` | 4.7k |
| What would v3 gain (bundle, install, audit, Node, tsc)? | `measurements.md` § Projected v3 gains | (same) |
| What do LI.FI / Relay / CoW / Wormhole / Solana Kit / thirdweb / viem do? | `competitors.md` | 2.3k |
| How to re-measure (scripts + entries, incl. source what-ifs) | `artifacts/bundle-baseline/`, `measurements.md` § Reproduce | small |
| Source issue summary | `issue.md` | 0.5k |
| What was done in each session | `process.md` | 1.2k |

<!-- ~tok ≈ bytes / 3800 -->

## Landmines

- `ideas.md` §3 lists real **v2 bugs**, for example:
  - QueryClient shadowing in wallet-sdk-react `EvmProvider`;
  - `useBitcoinBalance` returning `0n` on HTTP error.

  They are the user's to raise; none are posted.
- Bundle numbers stub Node builtins as external. A real browser app adds `buffer` / `crypto`
  polyfills on top, so the figures are a floor.
- The `@pancakeswap/*` 358 MB is mostly six nested `viem@2.37.13` copies. PancakeSwap alone is 131 MB,
  so don't quote 367 MB as "PancakeSwap code".
- The React-layer audit's "1 critical" is `protobufjs` via the Stellar wallets kit → Trezor. Its
  effective risk is lower than the label.
