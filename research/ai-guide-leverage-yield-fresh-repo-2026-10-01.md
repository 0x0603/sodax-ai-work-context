---
type: research
status: Done
updated: 2026-10-01
tags: [leverage-yield, ai-integration-guide, skills, docs, workshop]
related_issues: [gh-450]
---

# AI integration guide → leverage-yield vault app, from a fresh repo (2026-10-01)

Ran the workshop's "all at once" prompt ("Build the SODAX Leverage Yield vault feature with a nice,
polished UI…") against a **fresh Vite repo** instead of the starter, using only what
`docs.sodax.com/ai-integration-guide` points to. Result: `sodax/sodax-leverage-vaults/` (local git
repo, uncommitted at the time of writing, not pushed anywhere).

Setup that worked: `npx skills@latest add icon-project/sodax-sdks/packages/skills -a claude-code`
(skills from `main`), npm packages pinned to `2.2.0-rc.8`. `latest` (2.1.0) lacks
`useLeverageYieldDetailedStatus`, `isNoRouteRefusal` and the gates the skills reference, so a
consumer following the `main` skills must use the `rc` tag.

## Verified

- Typecheck + oxlint clean; production build OK.
- Live reads, quotes and approval detection in headless Chrome. Injected an EIP-6963 mock wallet with a
  real depositor address (`0x0ab7…05a6`, found from Sonic `IntentCreated` logs) that rejects every
  signature: shares showed per network (Sonic / Base / Arbitrum), deposit review planned the USDC
  approve, withdraw asked to switch to Arbitrum, every rejection returned quietly to review.
- Progress UI driven by a real filled Sonic deposit's `getDetailedStatus` (backend arm, `solved`,
  `fillTxHash`).
- **Not verified:** a funded deposit/withdraw (needs real funds).

## Doc gaps found (candidates for skills/doc fixes)

1. **No bundler guidance.** A plain Vite app white-screens with `Buffer is not defined` once
   `SodaxWalletProvider` mounts the non-EVM slots. Needed `vite-plugin-node-polyfills`
   (Buffer/process/global). Nothing in the skills mentions it; the workshop starter hides it.
2. **`@sodax/types` imports in wallet-sdk-react skill.** `integration/knowledge/recipes/setup.md`
   and the examples import `ChainKeys` from `@sodax/types`, while every ai-rules file says not to
   add that dependency. Under pnpm the import doesn't resolve without it.
3. **`useChainGroups().iconUrl` is `undefined` for every group** (rc.8), so the modal recipe's
   chain picker renders without icons. Mapped families to `baseChainInfo[...].logo` instead.
4. **Product anatomy vs. `vaultSwap` reality.** Anatomy says show steps and mark each as it
   completes with explorer links. `vaultSwap` has no progress callback and returns
   `srcTxHash` only when it resolves, which on the default backend path is **after `solved`**. So
   sign → deliver → fill all complete at once; there is no way to link the source tx while
   waiting. Worth either a progress callback or saying so in the anatomy.
5. **Share-balance fan-out cost.** "One holder per chain the user may hold under" means every EVM
   chain for an EVM wallet → per vault ≈ 14 queries every 15s, each ≥1 Sonic call. Measured ~360
   Sonic RPC calls/min with one wallet; raised the interval to 60s (invalidate on fill). The skills
   warn about APR read cost but not this one.
6. **Bitcoin as a vault source is undocumented.** Leverage-yield docs don't say whether a Bitcoin
   source needs the Radfi trading wallet; app excludes Bitcoin.

Minor: quickstart uses `sodax.config.initialize()`, setup recipe uses `sodax.initialize()` (both
exist; pick one).
