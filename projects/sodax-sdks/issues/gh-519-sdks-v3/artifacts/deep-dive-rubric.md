---
type: artifact
repo: sodax-sdks
github: 519
updated: 2026-10-19
tags: [v3, deep-dive, rubric]
---

# Deep-dive rubric (for re-running a missing area)

This is the rubric used for the 2026-10-19 deep dive into the 39 #519 bullets. It records the scales, the
report template and the area-to-bullet split. If an area report in `research/f-deep/` is missing,
re-run only that area with this rubric. The bullet text is in `research/e-519-bullet-feasibility.md`
§ Revised wording; the original pasted list is in `process/18-…`.

**Sources**
- Code: a clean worktree at origin/main `0181a053`.
- Read-only node_modules and dists: `sodax-sdks-t2probe`.
- Consumers: sodax-frontend, intents-whitelabel and sodax-backend, read via `git show origin/<branch>:path`.
- Installs: only `npm i --ignore-scripts --before=<today-14d>`, in scratch directories.

**Hard rules**
- No pnpm install or build.
- No worktrees.
- No GitHub writes.

**Calibration**
- Tag every load-bearing claim as [verified], [derived] or [judgement].
- State the scope of each probe.
- Don't write "impossible" unless it is proven.
- Use the verdict "Premise incorrect" when a bullet rests on something that doesn't exist.
- Count with commands.

## Complexity scale

| Level | Meaning |
| --- | --- |
| C1 | 1 PR, 1 package, ≲150 LOC, no public API change |
| C2 | 1–2 PRs, ≲500 LOC, additive API, unit tests suffice |
| C3 | 3–5 PRs or a package-wide mechanical change; needs fixtures or a probe |
| C4 | Cross-package refactor or a 3.0 break that needs migration; coordination; ≳1.5k LOC |
| C5 | Multi-package architecture or a cross-repo breaking dependency; long tail; or risk on paths that move funds |

## Benefit scale

| Level | Meaning |
| --- | --- |
| B1 | Nice-to-have |
| B2 | DX or maintenance gain for some |
| B3 | Measured gain on a common path (≥50 KB gzip or ≥50 MB install), or removes a recurring class of bugs |
| B4 | Large gain for most (≥200 KB gzip, ≥200 MB install, removes advisories), or unblocks product needs or several bullets |
| B5 | Prerequisite for much of v3, or removes a risk to user funds |

## Labels

- **Verdicts:** Feasible · Feasible with caveats · Needs a decision · Premise incorrect · Not feasible as worded.
- **Confidence:** Proven (a probe ran) · Code-traced · Judgement.
- **Timing:** 2.x · 3.0 · Later · Drop.

## Personas

| Persona | Who |
| --- | --- |
| P1 | EVM-only React dapp |
| P2 | Multi-chain React dapp |
| P3 | Node backend (sodax-backend, NestJS CJS) |
| P4 | API-only integrator |
| P5 | SODAX maintainers |
| P6 | AI-agent users |

## Per-bullet template

```
## <ID> · <short title>
**Bullet:** "<as worded>"  ·  **T-ids:** <ids>
### Today            (verified facts, path:line)
### Change           (from → to, client snippet)
### Feasibility — <verdict> · <confidence>
### Complexity — C<n> (PR breakdown, ~LOC, tests, coordination, breaking, top risks)
### Benefit — B<n>    (per persona, numbers with method)
### Recommendation   (timing, corrected one-line wording)
### Corrections to earlier research
```

Each area file starts with a 5-line summary and the table
`| ID | Feasibility | Complexity | Benefit | Timing | Why |`. It ends with
`## Dependencies between these bullets` and `## Not verified`.

## Areas

| File | Bullets |
| --- | --- |
| chains.md | sdk-1, wsc-3 |
| deps.md | sdk-4, sdk-5, sdk-7 |
| packaging.md | sdk-2, sdk-3, sdk-6, x-1 |
| sdk-runtime.md | sdk-8, sdk-9, sdk-10 |
| dapp-kit-surface.md | dk-1, dk-3, dk-5, dk-6, sk-3 |
| dapp-kit-flows.md | dk-2, dk-4, dk-7 |
| wallet-sdk-core.md | wsc-1, wsc-2, wsc-4 |
| wallet-sdk-react.md | wsr-1..5 |
| api.md | api-1..4, sk-4 |
| release-ci.md | x-2, x-3, x-4, x-5, sk-1, sk-2 |
