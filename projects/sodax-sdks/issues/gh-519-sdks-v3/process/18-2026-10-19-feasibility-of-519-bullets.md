---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-19
updated: 2026-10-19
---

# 2026-10-19 — feasibility of the 39 #519 bullets

- **Request:** the user pasted their full v3 bullet list (39 bullets, `0x0603:` prefix). They asked to
  read the issues and to use several agents to check whether each bullet can be implemented.
- **#519 state:** the body now carries the user's own six `**[SANG]**` bullets under `@sodax/sdk`,
  added by the user, not by an agent. Their wording differs from the pasted list: on #519, bullet 2
  folds in the per-feature entries, and bullet 4 adds the install-size reasons.
- **Assignees:** #540 → 0x0603; #541 → gcranju and 0x0603; #543 → 0x0603. R0bi7 authored all three. The
  earlier brief called them "R0bi7's issues"; they are the user's to work.
- **Method:**
  - Eight read-only agents, one per area: chains, deps, packaging, sdk-runtime, dapp-kit, wallets,
    skills-api and release-ci.
  - They read a clean worktree `sodax-sdks-v3feas` at `0181a053` and node_modules from
    `sodax-sdks-t2probe`.
  - Consumers were read at sodax-frontend `1b915ec7`, intents-whitelabel `5e1fbba` and sodax-backend
    `985959e9`.
  - Each bullet was judged as worded, with a verdict, evidence, breaking status, size and a wording fix.
- **Hand spot-checks after the agents:**
  - the PancakeSwap `LICENSE` files are GPL-3.0 in `v3-sdk` and `infinity-sdk`;
  - `libs/tsup.config.ts:100-108` externalizes `crypto`;
  - `sodax-frontend` `swaps-api-sign.ts:173-179` calls the wallet receipt waits;
  - `/v2/be/config/all` returns 200 with `version: 2020008`;
  - semver reads `v2` and `2.x` as ranges, so npm rejects them as tags;
  - the `CONFIG_VERSION` encoding makes 2.2.0 = 2_020_099.
- **Result:** see `research/e-519-bullet-feasibility.md`.
  - Verdicts: 5 feasible, 27 feasible with caveats, 6 need a decision, 1 premise wrong (sk-4).
  - Also in that file: 14 team decisions, the real issues found in today's code, 12 corrections to
    research A–D, and a revised paste-ready wording.
- **Probes kept:** `artifacts/feasibility-probes/` holds the ICON 2,000-case and Solana 600-case
  byte-equality probes, the browser-globals probe and the packaging scans. The raw outputs stayed in
  the session scratchpad and are gone.
- **Housekeeping:** `process.md` passed 20 KB and was split into `process/`. Its Findings section moved
  to `process/00-findings.md`.
- **Second review (pasted by the user, same day):**
  - **Confirmed:** the license conflict, the receipt-wait callers, the `latest` backport bug, the `v2`
    tag rule, the config endpoint, the assignees, ICON 2,000/0 failures and Solana 600/0 failures.
  - **Corrected in the file:**
    - the count was 39, not 40, and 27 FC, not 28;
    - sk-4 is "premise incorrect, needs new scope", not "not feasible";
    - the lazy-load claim is limited to the current design;
    - the license wording now says "provenance unsettled", not "never copy";
    - the probes prove equivalence within their tested scope only;
    - T2 is described as a limited gain for `new Sodax()`, not "no gain".
  - **Lead re-checked:** all four srcTxHash drops (MM, staking, migration, DEX), with cited lines.
- **Not done:** nothing was posted or commented on GitHub. The #519 wording is the user's call.
