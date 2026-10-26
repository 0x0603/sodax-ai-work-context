---
type: draft
repo: sodax-sdks
github: 519
status: Ready (posting is the user's call)
updated: 2026-10-20
---

# #519 v3 bullets with Why and How

- **What this is:** the settled bullets from `drafts/519-bullets.md`, each with a short Why (the
  benefit) and How (the approach).
- **How it was made:** a workflow (run `wf_23308e1d-269`).
  - Four writers wrote the Why and How lines from the verified area reports in `research/f-deep/`.
  - Four fact-checkers then checked every line against those reports. They changed 26 of 38.
  - Lead edits: dk-5 now says "reject" instead of "throw", and wsr-1's number is now called a
    simulation.
- **Numbers:** each comes from a report line tagged [verified] or [derived], with its scope. "In our
  bundle tests" means esbuild runs, not real-app builds.
- **sdk-9 dropped (2026-10-20, the user):**
  - In SODAX's design everything goes through the SDK, so remote config can only re-serve what a
    released SDK already defines.
  - Remote config stays an opt-in 2.x feature inside #543, which settles its own version rule and
    trusted fields. Nothing turns it on by default in 3.0.
- **x-6 (2026-10-20):** added after the deep dive, from `research/g-chain-auto-tests.md`. It was not scored
  with the rubric.
- **Where to post it:** the second review advised against implementation detail in #519 itself. This
  version may fit better as a follow-up comment or as team-meeting notes.

**@sodax/sdk**

- [Sang]: Keep the Sonic hub and EVM chains in core. Every other chain type becomes an opt-in `@sodax/chain-<name>` plugin, with `@sodax/chains-all` for full-chain integrations
  - Why: EVM-only apps that skip our wallet packages stop carrying most non-EVM code; in our bundle tests `new Sodax()` shrank about 66%.
  - How: First the team decides where Tron, Monad and Sponsoring go. Then the chain registry lands in 2.x after #534 merges, without breaking anyone; chain packages and making `new Sodax()` EVM-only by default need 3.0.
- [Sang]: Publish unbundled ESM with no import-time side effects, and `sideEffects: false` on `@sodax/types`, so bundlers can drop unused code
  - Why: Mainly groundwork for per-feature entries and chain subpaths; apps that build `new Sodax()` gain little alone, but helper-only pages drop most of their sdk code.
  - How: Ships in 2.x without breaking anyone: the sdk, wallet-sdk-core and both API packages get per-file ESM next to their CJS build, Bitcoin's crypto setup runs on first use, and `@sodax/types` gets `sideEffects: false`.
- [Sang]: Publish ESM-only packages, with Node 22.12+ `require()` compatibility covered by consumer tests; viem, wagmi and TanStack Query become peers where used, tested at the floor and latest versions in CI
  - Why: Apps can use their own viem version without a second copy or type clashes; that copy was about 102 KB gzip in our bundle tests.
  - How: Needs 3.0: drop the CJS builds, keep `require()` working through a `default` export, and publish peer ranges alongside the PancakeSwap replacement. The team first picks the viem floor and how long 2.x gets fixes.
- [Sang]: Replace the PancakeSwap SDKs with the CL math, codecs and encoders we use, sourced from verified MIT-licensed implementations or written independently from the contract specs, with golden equivalence tests
  - Why: Every sdk app installs and bundles less (about 8% per entry in our bundle tests, after both steps), and PancakeSwap's unclear license leaves our dependencies.
  - How: In 2.x, with no API change: replace the math, codecs and encoders, drop PancakeSwap's v3 and Infinity SDKs, and add golden tests. `swap-sdk-core` holds the public `Price`/`Token` types, so it waits for 3.0.
- [Sang]: Lighter chain libraries: ICON over plain JSON-RPC with typed receipts, Stellar `/minimal`, and Solana instructions without Anchor or runtime IDL fetching
  - Why: In 2.x, browser apps that build `new Sodax()` get about 110 KB gzip lighter in our bundle tests, and Solana deposits stop fetching IDLs.
  - How: In 2.x, without breaking anyone: an ICON JSON-RPC client, Solana encoders, Anchor helpers split out, and Stellar `/minimal` in the sdk and both wallet packages at once. Dropping `iconService` and the Anchor helpers needs 3.0.
- [Sang]: Per-feature entry points like `@sodax/sdk/swap`, next to the `Sodax` facade
  - Why: Code that needs one feature, like swap, can import it directly and skip the full `Sodax` facade; dapps get this once dapp-kit has per-feature hooks.
  - How: After the unbundled ESM work, add a `createSodaxCore` entry and per-feature factories, and build the facade on them. Ships in 2.x as `import`-only subpaths without breaking anyone, unless the team prefers to wait for 3.0.
- [Sang]: Core and EVM browser entries need no Node builtins or globals (Buffer, process, global, crypto, stream); chain packages document what they still need
  - Why: Apps using only the core and EVM entries stop needing Node polyfills: Vite users drop that setup, and Next.js webpack builds ship fewer shims.
  - How: In 2.x, without breaking anyone: drop the `Buffer` use in swap status and add a browser build of `@sodax/libs` without `crypto`. The rest needs 3.0, after the chain split and PancakeSwap replacement.
- [Sang]: Standard API error metadata (status, body, retryable, aborted vs timeout), AbortSignal for requests and polling, and request IDs where the backend supports them
  - Why: Apps can check error fields instead of parsing messages, cancel stale requests and polls, and give support a request ID to find in backend logs.
  - How: Give every API error the same fields and pass the caller's AbortSignal to fetch and each wait loop. Additive in 2.x after we pick how cancels are reported; solver errors change shape in 3.0.
- [Sang]: Optional: a `@sodax/sdk/testing` entry with typed fake wallet providers, schema-checked API fixtures and a `fetch` option, with no test-runner dependency
  - Why: Our tests could swap 44 unchecked wallet casts for typed fakes that fail to compile when an interface changes; demand from outside users is unmeasured.
  - How: In 2.x, add a `fetch` option to `Sodax` in one pass with the API error work, plus fixtures if the team approves 2.x subpaths. Wallet fakes wait for 3.0, after the wallet interfaces shrink.

**@sodax/dapp-kit**

- [Sang]: Ship dapp-kit as unbundled ESM with per-feature and per-chain subpaths, make the SDK a peer, and stop re-exporting the whole SDK
  - Why: Mostly groundwork: React apps likely need per-chain subpaths to build once chains become optional; a peer SDK avoids a second SDK copy when versions drift.
  - How: In 2.x, ship the unbundled build, then subpaths if the team agrees; per-chain ones also depend on which chains become optional. The SDK peer and dropping the re-export are breaking, so they wait for 3.0.
- [Sang]: Lifecycle hooks for money market, staking, migration and DEX on one shared core, with `srcTxHash` on every post-broadcast error and a public settlement-status read
  - Why: Apps can show users a pending state with a tx link after a relay timeout, not a bare "Failed", and drop hand-rolled step machines.
  - How: Additive in 2.x: `srcTxHash` on errors first, the settlement read after #534, hooks after #540 once the team decides how tracking resumes after a closed tab. DEX parts and the swap-cancel error change are 3.0.
- [Sang]: Export a query-key factory that keeps today's key shapes, plus `queryOptions` builders for every query
  - Why: Apps refresh and prefetch SODAX queries with exported keys and `queryOptions` instead of hand-copied arrays, like the 12 in sodax-frontend and intents-whitelabel today.
  - How: After fixing the allowance keys that leave out inputs, add a key factory that reproduces today's arrays exactly, then builders feature by feature. Additive in 2.x, with a snapshot test guarding every key shape.
- [Sang]: Resolve wallets from a nestable wallet-source context by default (wallet-sdk-react or the app's own); an explicit `walletProvider` always wins
  - Why: Apps no longer have to look up a wallet and pass it to the hooks, so sodax-frontend could drop its 23 `walletProvider as any` casts.
  - How: Add a small wallet-source contract and a nestable provider that wallet-sdk-react or the app fills; hooks use an explicit `walletProvider` first, else the source's wallet for that chain. Additive in 2.x; nothing needed for 3.0.
- [Sang]: Normalize SDK/API operation failures to `SodaxError`; query functions reject on failure instead of returning `Result` as data or swallowing errors
  - Why: Apps get SDK and API failures in `error` as a `SodaxError`; today query hooks fail in four ways, and some hide the failure in `data`.
  - How: 2.x wraps SDK and API failures in `SodaxError`, keeping message and cause, so no known app breaks. 3.0 makes query functions that return `Result` or swallow errors reject instead; the team picks where solver errors get converted.
- [Sang]: Standard hook and parameter names (deprecated aliases until 3.0), and `SodaxProvider` accepts an existing `Sodax` or core instance, so apps don't import the full facade
  - Why: Apps get predictable names and can pass their own instance, so a core instance skips the full facade and #543's live config can reach dapp-kit.
  - How: 2.x adds new names beside deprecated aliases, an instance prop and a facade-free provider; 3.0 drops the aliases. The team picks the naming rule, ahead of #540's new hooks, and that provider's shape.
- [Sang]: Named polling presets, with an override on `SodaxProvider`
  - Why: Apps set polling once on `SodaxProvider` instead of per hook call, which can help on rate-limited RPCs, and similar hooks poll at the same rate.
  - How: After the `queryOptions` builders land, add named presets they read and a `polling` prop on `SodaxProvider`; per-call `queryOptions` keep working. Additive in 2.x, and the docs check must learn the preset names.

**@sodax/wallet-sdk-core**

- [Sang]: Move private-key and mnemonic signers to server-only entries; browser classes never reference them
  - Why: Multi-chain dapps stop shipping private-key code they don't use: 98 to 160 KB gzip less in our bundle tests, mostly from Injective.
  - How: 2.x adds server-only and browser-only classes, starting with Injective, and moves wallet-sdk-react to the browser ones; nothing breaks. 3.0 drops private-key paths from today's classes once the team decides where server signers live.
- [Sang]: Keep wallet interfaces focused on signing and submission, with a supported way for both SDK and API-only apps to wait for receipts, plus migration guidance for existing wallet receipt methods
  - Why: Writing a custom wallet or test fake gets easier for most chains: required members across today's wallet interfaces drop from 35 to 26.
  - How: Once the team picks how SDK and API-only apps wait for receipts, in-repo callers move in 2.x after #511 and #512, and wallet reads get deprecated, then removed in 3.0. Migration notes cover receipt methods.
- [Sang]: Move non-EVM signers into the chain packages and slim `@sodax/wallet-sdk-core` down to the shared base and EVM signers
  - Why: Apps add a chain with one package, signer included; alone it saves little, but with opt-in chains and wallet adapters it shrinks installs and bundles.
  - How: Needs 3.0: each non-EVM signer moves in the same PR that extracts its chain package. The team decides whether wallet-sdk-core stays as a slim base + EVM package (proposed) or folds into `@sodax/sdk/wallet`.
- [Sang]: EIP-1193 and Solana Wallet Standard adapters (a viem `WalletClient` already works)
  - Why: Non-React and API-only apps could wrap a browser wallet directly instead of wiring viem or Solana's wallet adapter themselves; we found no request for it.
  - How: Add the two small adapters later in 3.x, without breaking anyone, and build the Solana one after the wallet interface cleanup. Decide whether the EIP-1193 one switches the wallet's chain or just follows it.

**@sodax/wallet-sdk-react**

- [Sang]: Opt-in chain adapters (`adapters={[evm(), solana()]}`), with only selected chains bundled, connect-time wallet SDKs loaded when needed, and state scoped to each provider
  - Why: An EVM-only app would load about 91% less wallet JS at startup in our bundle simulation, once wallet-sdk-core also ships per-file builds.
  - How: After #534 merges, 2.x adds per-provider state, an adapters prop beside today's config and per-file builds, breaking nothing. 3.0 removes config and global singletons, once the team decides how hooks behave outside a provider.
- [Sang]: Upgrade to wagmi v3 (viem ≥ 2.43) and make connector SDKs optional peers, installed only when their connector is used
  - Why: Apps stop installing unused connector SDKs: 541 MB less on an npm install of today's wallet-sdk-react, with no startup JS gain in code-split builds.
  - How: Needs 3.0 and goes first in that window: wagmi, viem and React Query become peers, and WalletConnect users install it themselves. The team decides whether to bump our TypeScript to 5.9.3 or just recommend it.
- [Sang]: Reuse the app's `QueryClient` instead of creating a nested one
  - Why: Apps' own QueryClient defaults and error handlers start applying to SODAX queries; today the frontend and whitelabel lose them under the wallet provider.
  - How: Ship it in 2.x with no API change: the wallet provider uses the app's QueryClient and creates its own only when none exists. Release notes should say SODAX queries now follow app defaults.
- [Sang]: Type `useXAccount`'s address by chain (narrowed for EVM and ICON), without adding a hook named `useAccount`
  - Why: Fixed-chain EVM and ICON calls get a typed address with no cast, but only 4 of 61 calls in our consumer apps are fixed-chain.
  - How: Make useXAccount infer the address type from a fixed chain key, with a union for dynamic keys; it is a type-only change. It can ship later in 3.x without breaking anyone.
- [Sang]: If the team wants it: embedded and social wallets as wallet sources for the chain adapters, starting with social login on Privy, which loads only when used
  - Why: Users without a wallet extension could sign in with a social account and get an embedded wallet; no consumer app uses Privy yet.
  - How: The team first decides if it wants this and which login options. Social login then extends our Privy email login in 2.x without breaking anyone; loading Privy only when used comes with the chain adapters.

**@sodax/skills**

- [Sang]: Pin every non-npm skills channel (skills CLI, sodax.com/skill.md, doc links) to the latest stable release, with a 2.x ref for 2.x users
  - Why: AI coding agents get skills matching the latest stable release instead of main, and 2.x users keep 2.x guidance once main moves to 3.0.
  - How: Point the install command, skill.md and doc links at a release ref, which the CLI accepts. Ships in 2.x before the first breaking merge, once the team settles the docs channel and 2.x ref names.
- [Sang]: Serve docs.sodax.com, and the AI guidance built from it, from the latest stable release, with main as a preview and a hotfix path for docs-only fixes
  - Why: Developers and AI tools read docs that match the stable release; since September, changes reaching stable were live in docs a median 27.1 days early.
  - How: Mintlify serves a branch each stable publish moves; main stays the preview, and docs-only fixes go to that branch. Ships in 2.x before the first breaking merge, once the team agrees to end live-on-merge docs.
- [Sang]: Generate the hook index and query-key reference from source, and fail `check:ai` when they drift
  - Why: Agents using the hook index in our skills find every hook (14 are missing today), and PRs that add hooks stop hand-editing the tables.
  - How: Additive 2.x work that can start now: a script fills the tables between markers from source, and `check:ai` runs it in check mode. The team picks whether hook descriptions come from JSDoc.

**API packages**

- [Sang]: One viem-free `@sodax/api` for swaps, bridge, leverage yield, backend and sponsoring: one transport, per-API subpaths, one raw-tx schema, and the old packages kept as shims
  - Why: API-only apps get the leverage yield, backend and sponsoring clients without the SDK's 776 MiB npm install, and duplicate client code stops drifting apart.
  - How: Merge swaps-api and bridge-api into `@sodax/api`, keeping the old packages as shims, and move those three clients into it. Additive in 2.x after the error-model decision; fix the Bitcoin raw-tx gap now, before #534.
- [Sang]: `@sodax/api/react`: the API-lane hooks with an `ApiProvider` and no `Sodax` instance; dapp-kit re-exports the same hooks, so names, keys and errors stay one family
  - Why: React apps using only our API hooks could drop the SDK: about 774 MiB less on an npm install, not counting wallet packages.
  - How: Move the API-lane hooks into `@sodax/api/react` with names and keys unchanged; `SodaxProvider` mounts an `ApiProvider`, so dapp-kit can re-export the same hooks. Additive in 2.x, after `@sodax/api` lands and we decide where `SodaxError` lives.
- [Sang]: Document API mode per flow and chain: which endpoints return unsigned transactions, how each chain signs and broadcasts them, and the sponsoring and Bitcoin exceptions
  - Why: Teams calling our HTTP APIs learn how each chain signs from a single page instead of demo code, and two wrong passages get fixed.
  - How: An integration-modes page with an endpoint table per flow and a per-chain signing table linked to the code, plus a bridge HTTP page. Docs only, so it can go out now in 2.x.
- [Sang]: Check the API clients' schemas against the live OpenAPI specs on a schedule and on API PRs, once the backend serves the bridge spec
  - Why: We see mismatches between our client schemas and the live API specs in CI; a prototype already found four public token reads failing on prod.
  - How: In 2.x, turn the prototype into a non-blocking CI check against each live spec. Point the broken token reads at the v2 routes now; the bridge spec needs a backend fix.

**Cross-cutting**

- [Sang]: Mark `@sodax/types` side-effect-free, split it into chains, tokens and config subpaths, and stop inlining it into other packages
  - Why: API-only apps stop bundling the token list (an API client fell under 8 KB gzip in our bundle tests), and other apps lose duplicate copies.
  - How: Ships in 2.x without breaking anyone. Add `sideEffects: false` and stop inlining together now; do the split as a move-only PR right after #534 merges, since the open chain PRs edit the same files.
- [Sang]: Track install size, bundle size and consumer audit results in CI, with regression budgets and explicit approval for baseline changes
  - Why: Maintainers see size and audit regressions in the PR that causes them, and the size wins promised by other v3 items get measured, not assumed.
  - How: CI installs packed packages into sample apps, so the audit sees what users get, and flags regressions against the base branch; baseline bumps need approval. First in 2.x; the team decides if it blocks merges.
- [Sang]: A v2 → v3 migration guide covering every breaking change, plus a codemod for the mechanical import and rename changes
  - Why: Everyone moving to 3.0 needs the guide; the codemod mainly saves us time, since our example apps hold most of the known mechanical edits.
  - How: Build a ts-morph harness in 2.x and write each transform once its API freezes. The guide and codemod ship with 3.0; the team picks a published package or a repo script with a skill.
- [Sang]: Test the supported entry points on the Node engines floor, current Node, Deno, Bun and Workers (`nodejs_compat`), and publish the results as a support matrix
  - Why: CI starts covering the Node 22 line our backend runs on, and integrators get a published list of the runtimes we test.
  - How: Add a Node 22.12 leg plus Deno, Bun and Workers smoke tests in 2.x; the matrix ships with 3.0. The team decides which entry points count and whether Bun and Deno are best effort.
- [Sang]: A `release-2.x` maintenance line with its own npm dist-tag, so `latest` never moves back to 2.x
  - Why: Without a guard, the first 2.x patch after 3.0 would make `npm i` install 2.x again; teams on 2.x can still get fixes.
  - How: In 2.x now, make publishing send any older-major release to its own tag; cut `release-2.x` at 3.0.0. The team decides how long 2.x is kept and whether it gets all fixes or security only.
- [Sang]: Automatic per-chain checks: golden tx tests for every chain in CI, plus scheduled keyless live checks (RPCs, config vs on-chain state, simulated SDK-built transactions) that open an owned issue when a chain breaks
  - Why: Today a broken chain is usually found by users; our live e2e suite has been red behind a green check in every sampled run since 2026-08-20.
  - How: Start with nightly keyless checks and golden vectors behind a required check, then per-chain simulation and backend success-rate alerts; funded canary swaps only after a team decision.
