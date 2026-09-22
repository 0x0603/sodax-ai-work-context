---
type: plan
repo: sodax-frontend
github: 1871
updated: 2026-09-18
---

# Plan

## Goal

Pin rc.6 following `docs/sdk-upgrade-guide.md`, with the log entry the guide asks for.

## Approach

Guide §3 (bump + `pnpm install`), §7 (lint / checkTs / build), §9 (docs, PR). Classify
via `checkTs` first: clean → case A, no code changes. Diff the shipped `index.d.ts` of
the four packages against rc.5 baselines to list what moved; grep the app for each.

## Steps

1. Branch `chore/bump-sodax-sdk-2.2.0-rc.6` off `origin/main`.
2. Save rc.5 `d.ts` baselines; bump pins; `pnpm install`.
3. `rm -rf apps/web/.next`; `pnpm checkTs`; `npx biome lint apps/web`; `pnpm build`.
4. Log entry + rotate oldest; `CLAUDE.md` pin; commit; PR.

## Verification

All three gates green. Build noise (`DATABASE_URI`, OG fetch) is env, not SDK.

## Risks

- Smoke matrix not run locally (no wallets); owed on staging.
