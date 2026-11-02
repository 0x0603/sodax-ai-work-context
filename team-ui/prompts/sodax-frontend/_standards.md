<!-- sodax-frontend coding standards. The console writes them to plans/coding-standards.md before each step; the Standards step
fixes the diff to them, reviews check against them, and the retro proposes changes you adopt at "You approve the
standards change". Mined from review comments (people, Codex, Copilot) on merged PRs, 2026-11-02. Edit from the console
(⋯ → Edit coding standards); run scripts/setup-team-ui.sh --export after, to sync. -->
# Coding standards: sodax-frontend

The repo's `CLAUDE.md` comes first and wins on conflict. Apply its "Common Pitfalls", "Naming & Clean Code", "Architecture Notes > SEO" to every diff, and by path: `docs/security-practices.md` (workflows, deps), `docs/third-party-tag-surface.md` (`<Script>`), `docs/b2b-page-performance.md` (marketing), `docs/agent-readiness.md` (llms*, `.well-known`), `docs/sdk-upgrade-guide.md` (`@sodax/*`). `.cursorrules` and the `claude.yml` prompt are wrong here; ignore them.

## Rules

1. A failed read or missing quote is never `0`, `'0'`, `0n`, `[]` or success. Show unknown/error, retry, block signing. Why: #2037 (failed read showed $0, hid a position), #1597 (0n quote as min amount = no slippage floor), #1779. Spot: `return '0'`, `?? 0n`, `catch { return [] }`.
2. Lock the flow from click to wallet prompt. Any `await` before `mutateAsync` (re-quote, approval wait) sets a submitting flag that disables the button and blocks close; closing cancels follow-up prompts. Why: #1634, #1597. Spot: `disabled` without the pending/submitting flag.
3. Decimals follow the amount's origin: hub pool amounts/fees 18, spoke input/balances the token's `decimals`; compare chains only after `formatUnits`. Why: #974, #1086, CLAUDE.md "Pool position amounts". Spot: literal `18` next to `formatUnits`/`parseUnits`.
4. Parse user or URL amounts once, guarded, outside render. `parseUnits` throws on `1e3`, `''`, `.`. Why: #2034 (open), #812 (throw in render). Spot: `parseUnits`/`BigInt()` in render or `useMemo` without try/catch.
5. Token identity is `(chainKey, address)`. Address sets, map keys, dedup and equality include `chainKey`; SODAX reuses EVM addresses across chains. Why: #1813 (6 real tokens dropped), CLAUDE.md vault-share pitfall; trap: `lib/utils.ts:116` `dedupByAddress`. Spot: `Set` of addresses, `.address ===`.
6. No new `as any`/`as unknown as` in transaction code (payloads, `walletProvider`, `srcAddress`); use the SDK param type or `satisfies`. CI misses it: `apps/web/biome.json` turns `noExplicitAny` off. Why: #812, #974, #1086; #1695 (Sui `rpcUrl` vs `rpc_url` passed tsc).
7. Queries in always-mounted UI (`(apps)/layout.tsx`, `RouteTabs`, closed dialogs, pickers) need `enabled` tied to visibility and wallet; poll only while the value is on screen. Why: #2043, #1775, #1548. Spot: new `useQuery` or `refetchInterval` without `enabled`.
8. Server `fetch` in pages, layouts and routes gets `AbortSignal.timeout(...)` and a bounded read; failure degrades the section, not the page. Why: #1761, #1779, #1897, #1549.
9. Moving or removing a route keeps old URLs working (`next.config.js` redirects/rewrites, `/exchange/*` aliases, layout path checks) and updates sitemap, `llms*.txt`, internal links. Why: #1832, #1548, #1746, #1954.
10. Tracking calls fire once, on the real outcome, with source/audience; optional fields are omitted, not `undefined`; no PII. Why: #1683, #1725, #1810, #1858, #974. Spot: new or moved `track*(`.
11. Numbers in copy come from data or one shared constant, never typed into JSX or markdown. Why: #1199, #1721, #1690, #1775. Spot: `18+`, `20+ networks` in strings.
12. Rows of `shrink-0`/`whitespace-nowrap` items must wrap or fit at 320px. Why: #1830, #1728, #1687, #1971. Spot: nowrap children without `flex-wrap`/`min-w-0`.
13. Reuse before adding: `lib/utils.ts` token filters, `getWalletErrorMessage`, `formatTokenAmount`, `lib/format-stats.ts`; one constant per list. Why: #1815, #840.
14. Removing or changing code a doc names: fix the doc in the same diff. Why: #1590 (`apps/web/docs/TOKEN_GROUPING.md:29` still documents a deleted component), #1783. Spot: `rg <name> docs apps/web/docs CLAUDE.md`.

## Tests

- Runner: `node --test` + `tsx`; tests in `apps/web/scripts/*.test.mjs` import the `.ts` module directly. There is no hook or
  component harness, so logic that needs a test moves into a pure function.
- Public interface: the exported function of `lib/` or a route `_utils/`; stores via `createSwapStore()` with stubbed storage. Hooks stay thin wrappers over a pure function.
- A diff touching money logic (amounts, fees, min-receive, balances, token filters, address checks) extracts it into a
  pure function in `lib/` or the route's `_utils/` and tests it there.
- Tautological: expected values built from the code's constants (a vault list from `SodaTokens`). Use literals: the #1813 collisions, amounts with 6/7/9/18 decimals.
- Structure-sensitive: `findings[0]` or exact `dataLayer.length` (`check-tag-surface.test.mjs:43`, `contact-analytics.test.mjs:62`). Find by event name or severity instead.
- Unfailable: stubs (SDK, `window`) so wide the guarded branch never runs. A new test must fail when its protected line is deleted.

## Merge danger

One-way doors, read closely (paths under `apps/web/` unless root config):
- `app/(apps)/**/*{dialog,footer,button}*.tsx`, `lib/swaps-api-sign.ts`, `swap/page.tsx`: signing, approvals, quote/intent bodies.
- `lib/utils.ts`, `app/(apps)/*/_utils/**`, `hooks/useAllChain*Balances.ts`, `lib/address-validation.ts`, `services/price.ts`: amounts, fees, token lists, destinations, prices.
- `providers/constants.ts`, `@sodax/*` pins in `apps/web/package.json`: partner fee, API key, RPCs.
- `**/_stores/*.ts` with `persist`: a bad shape bricks the page for returning users.
- `providers/providers.tsx`, `hooks/useWalletConnection.ts`, `*Hana*`: wallet connection.
- `middleware.ts`, `next.config.js`, `app/layout.tsx`, `scripts/tag-surface-baseline.json`, `app/sitemap.ts`, `app/llms*.txt`, `app/.well-known/**`, `public/**`: CSP, redirects, SEO, published metadata (`stellar.toml`).
- `lib/analytics.ts`, `components/cookie-consent/**`, `app/api/partners/**`, `lib/lead-magnet/**`, `app/api/d/**`: analytics, consent, PII, CRM, email.
- `lib/auth.ts`, `lib/permissions.ts`, `app/api/{auth,cms}/**`: roles.
- `.github/workflows/**`, `turbo.json`, `.env.example`, `pnpm.overrides`, `pnpm-lock.yaml`, `.gitleaks.toml`, `osv-scanner.toml`: CI, env, deps.

Two-way doors, skim: marketing copy/layout in `components/{landing,partners,holders,solana,news}` and content pages (not metadata), CSS, `design-harness/**`, `apps/web/docs/**`.
