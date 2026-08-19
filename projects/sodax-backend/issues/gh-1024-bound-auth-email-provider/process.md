---
type: process
repo: sodax-backend
github: 1024
updated: 2026-08-19
---

# Process — index

The session log grew past the point where reading it whole is sensible (~60 KB /
~16k tokens). It is now **one file per session** under `process/`, and this file
is the index. Read the row you need, not the folder.

Every file under `process/` carries the same frontmatter (`type: process`,
`github: 1024`, `session: <date>`), so `rg "^github: 1024"` still finds all of
them. Append a **new file** per session; add a row here. Do not grow this index
beyond the table.

## Sessions

| # | Date | File | What it settled |
| - | ---- | ---- | --------------- |
| 01 | 2026-08-12 | [research-pass](process/01-2026-08-12-research-pass.md) | First pass, from `radfi-be/docs/` + public docs. `radfi-web` unreachable. Three claims here were later corrected — read 02/03 before trusting any of it. |
| 02 | 2026-08-18 | [radfi-be-source-findings](process/02-2026-08-18-radfi-be-source-findings.md) | Read `src/` instead of `docs/`: **the two disagree in six places**, one a security claim that isn't implemented. Fez made the build call. |
| 03 | 2026-08-18 | [radfi-web-client-crypto](process/03-2026-08-18-radfi-web-client-crypto.md) | Client half readable at `15ac098`. **PRF settled — it IS PRF.** Argon2id-vs-SHA-256 bypass found. Derivation paths closed. Backup answered. |
| 04 | 2026-08-18 | [sdk-integration-design](process/04-2026-08-18-sdk-integration-design.md) | How `sodax-sdks` + `apps/demo` offer SODAX Auth. Forced the 3-package split, because `sodax-backend` must `pnpm add` the crypto directly. → [[plan-sdk-integration]] |
| 05 | 2026-08-18 | [deepening-verify-then-rewrite](process/05-2026-08-18-deepening-verify-then-rewrite.md) | 5-agent read of *installed* source (3 throttler variants, 3 CORS patterns, `better-auth@1.4.18` `dist/`) before touching a plan file. → [[plan-auth-api-scaffold]] |
| 06 | 2026-08-18 | [passkey-login-is-emailless](process/06-2026-08-18-passkey-login-is-emailless.md) | An earlier claim of mine was wrong: Bound's passkey login takes **no email**. Where the wrong claim came from, and the KDF-salt gap it exposed (Q13). |
| 07 | 2026-08-18 | [full-source-audit](process/07-2026-08-18-full-source-audit.md) | Systematic sweep after 06: 10-agent fan-out, every doc as the *thing under test*, each WRONG verdict sent to an adversarial defender. 4 findings changed the plan; 2 would have shipped broken wallets. |
| 08 | 2026-08-19 | [threat-model](process/08-2026-08-19-threat-model.md) | *Can it be stolen?* → and the half nobody had: *can it be lost?* One backup pipeline, wrong DB. Birthed [[plan-auth-api-durability]]. Also a workflow-failure note worth not repeating. |
| 09 | 2026-08-19 | [dapp-key-custody](process/09-2026-08-19-dapp-key-custody.md) | **The most consequential session.** "Does the dapp hold the key?" — yes, and there is no trust boundary in the npm-package model. → risk 5, Q15, [[0002-key-custody-boundary-for-third-party-dapps]]. **Blocks the 3 SDK packages.** |
| 10 | 2026-08-19 | [emailless-vs-per-credential-prf-salt](process/10-2026-08-19-emailless-vs-per-credential-prf-salt.md) | Re-verified 06 directly; no corrections. New root cause: Bound's emailless login works *because* the PRF salt is one global constant — so plan items 4 and 14 are in tension, not independent. |

## Source access — stated plainly

| source | result |
| --- | --- |
| `lydialabs/radfi-be` | **Accessible.** Private, `pull` permission only, default branch `dev`, pushed 2026-08-11. Read `docs/` and the auth-relevant source. |
| `boundex/radfi-web` | **404 with this token.** *(Superseded the same day — access was granted; the client half was read at `15ac098`. See session 03.)* |
| `docs.bound.exchange` Bound Auth | Read: *What is Bound Auth*, *How It Works*, *Security Model*. (*Account Settings*, *Fund Recovery* not fetched.) |

Reference clones live on this machine — paths in session 06. Both still resolve
at the commits the knowledge files cite: `radfi-be @ c1c1e06`, `radfi-web @ 15ac098`.

The public docs and the private repo agree on every load-bearing point **only at
the level of intent** — session 02 found six places where they do not agree on
substance. Read the code.
