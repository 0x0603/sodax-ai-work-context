---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-20
tags: [v3, testing, chains, monitoring]
---

# Automatic per-chain testing

**Code read.** sodax-sdks `origin/main` 0181a053 (2026-10-18), sodax-backend `origin/development` 985959e9 (2026-10-08, not fetched), sodax-frontend `origin/main` 1b915ec7, intents-whitelabel `origin/main` 5e1fbbaa. The verification pass also read the unmerged sodax-sdks branches `feat/{monad,tron,xrp,ton,zcash}-mpc-integration`. All reads used `git show` / `git grep` on those refs.

**Probes.** First pass: 2026-10-20, 05:22–05:45 UTC. Verification pass: 06:07–06:15 UTC. Both ran from one machine, not from a GitHub runner. Most probes ran once; retries are noted. All were read-only: GETs, eth_call, simulate calls and local anvil forks. Nothing was signed or broadcast. Scripts and outputs are in the session scratchpad (`.../scratchpad/sdk-tests-ci/`, `chainsim/`, `backend-signals/`, `g-critic/`). They are not copied into this repo.

**Tags.** [verified] means a path:line, a command or a probe. [derived] means arithmetic on verified numbers, with the arithmetic shown. [judgement] means an opinion. [not re-checked] means a first-pass result whose output was not saved; treat it as unverified.

## Problem

SODAX runs on 22 chains [verified: `chain-keys.ts:16-39`], and unmerged branches add 5 more (see below). A change in our code, or on a chain or an RPC, can break one flow on one chain, for example swaps from Polygon. Some backend failures already page a Discord or Telegram channel, but no job checks each chain and flow on a schedule, so many breaks surface through users [judgement, from the inventory below]. We want machines to check each chain and each flow on their own and tell a named person when one breaks.

## What exists today

### sodax-sdks

- **Chains.** 22 mainnet chain keys of 9 chain types: 14 EVM (13 spokes plus the Sonic hub) and one chain each for ICON, Injective, Sui, Stellar, Solana, Stacks, NEAR and Bitcoin. There is no testnet chain config. [verified: `packages/types/src/chains/chain-keys.ts:4-39`; `git grep -c "_MAINNET:"` = 22]
- **Chains in flight.** Unmerged branches add `monad`, `tron`, `xrp`, `ton` and `zcash`, with 4 new chain types (TRON, XRP, TON, ZCASH). That would make up to 27 chains of 13 types [verified: `git diff origin/main...origin/feat/<x>-mpc-integration -- packages/types/src/chains/chain-keys.ts`; derived: 22 + 5 = 27, 9 + 4 = 13]. None of the per-chain methods below was checked for them.
- **Flow code is shared across chains.** Feature services call `SpokeService`, which routes by chain type to 10 spoke implementations. So a bug in `EvmSpokeService` breaks all 13 EVM spokes at once. [verified: `SpokeService.ts:158-192`; 10 `*SpokeService.ts` files; the file has 74 `case` lines by `grep -cE '^\s*case '`]
- **Unit tests.** 3,490 `it(`/`test(` call sites in `packages/` (17 of them are the live e2e suite) and 273 in `apps/`. The rest run offline, and they lean on mocks [verified: `git grep -E '^[[:space:]]*(it|test)…' | wc -l`; the regex can miss unusual forms]:
  - Feature tests replace `spoke.deposit` and `spoke.sendMessage` with spies [verified: 123 spy or mock lines by `git grep` in `packages/sdk/src/**/*.test.ts`].
  - The router test never calls the deposit or sendMessage routes [verified: `SpokeService.test.ts`, 0 matches].
  - `SwapService.test.ts` names 8 of the 22 chains [verified: grep of `ChainKeys.*`].
  - There are no snapshot or golden-vector files [verified: `git grep toMatch*Snapshot` = 0; no `__snapshots__` paths].
- **EVM test list is hand-written.** The EVM spoke tests loop over a hand-written `TEST_CHAINS`. Today it lists all 13 EVM spokes, but its `satisfies` clause only checks that each entry is an EVM spoke, so a new EVM chain can be left out without an error. The header comment still says "12". [verified: `EvmSpokeService.test.ts:14,117-131`]
- **Live e2e suite.** It has 17 tests. 9 of them make no network call (8 drift-helper tests and 1 static-config check). The 8 live ones read the Sonic hub RPC and api.sodax.com (backend, relay and solver routes). No test calls a spoke RPC. [verified: `packages/sdk/src/e2e-tests/*.ts`; `e2e.test.ts:172,249,327-411,416,486`; default hosts in `packages/types/src/common/constants.ts:16-29,90`]
  - It runs on PRs only, and the step has `continue-on-error`. The check stays green; a failure only adds a warning annotation. [verified: `.github/workflows/ci.yml:258-306`; `:264` is `if: github.event_name == 'pull_request'`, `:300` is `continue-on-error: true`, `:303-306` the warning]
  - All 24 sampled job logs from 2026-08-20 to 2026-10-19 have at least one failed test. The cause changed over time: Robinhood money-market tokens missing from config (2026-08-20); then Stellar HBAR listed for money market with no hub reserve (in 22 of the 24 logs, first seen 2026-09-09, still failing 2026-10-19); and one Sonic RPC 503 "No backend available" (2026-10-04). The second drift arrived while the test was already red, so the signal did not change. [verified: saved job logs in `scratchpad/sdk-tests-ci/`; `moneyMarket.ts:160`]
- **Schedules and gates.**
  - The only scheduled workflow is the weekly security scan. [verified: `git grep -nE 'schedule:|cron:' origin/main -- .github/workflows` → `security.yml:10,12` only]
  - Merging into main needs one approval and signed commits, but no status check. [verified: `gh api` GET of rulesets 16101300, 23866626, 25343590 and of branch protection, 2026-10-20]
  - CI holds no RPC secrets. Its secrets are npm publish, project, Claude and cross-repo tokens. [verified: `git grep -ohE "secrets\.[A-Z0-9_]+"` in `.github/workflows`]
- **Pieces to build on.**
  - `raw: true` unsigned builds in all 10 spoke services [verified: grep per file].
  - A keyless hub check, `SpokeService.simulateDeposit`: one eth_call to the hub asset manager, which reverts with "Simulation completed" when it would accept the deposit. It encodes the payload from its own params, not from a real spoke transaction. [verified: `SpokeService.ts:602-696`] A hand copy of it was accepted for one listed token on each of the 21 spoke chains (all 9 types), and both negative controls were rejected [verified: 28 eth_calls, 06:07 UTC; see Verification].
  - First-pass byte-equality probes for ICON (2,000 cases) and Solana (600 cases) [not re-checked: `f-deep/deps.md:398` says they were not re-run].
  - 7 files with keyless raw builds in `apps/node`. That app is excluded from the root build, lint, checkTs and test, so use them as examples, not as a base. [verified: root `package.json:10,17,19,21`]
- **Live defects found while probing.**
  - The default Polygon RPC `polygon-rpc.com` answers HTTP 401 "tenant disabled": 6 of 6 tries over two sessions [verified: `chains.ts:812`; probes 05:2x and 06:08 UTC].
  - The default Ethereum RPC `eth.merkle.io` answered 429 on every try (5–6) over two sessions [verified: `chains.ts:1200`]. Both RPC results come from one host; GitHub runners were not tested.
  - 4 public `/be` token reads fail SDK validation on prod (api-4). Re-checked one: `GET /v1/be/config/swap/0xa4b1.arbitrum/tokens` → 20 items, 0 with `chainKey`; items carry `xChainId` [verified: GET 06:08 UTC]. The four repos have no caller of these reads, so only external integrators are hit [verified in `f-deep/api.md`, api-4 "Callers"].

### sodax-backend

- **One alert path.** `monitoring-service` reads Docker logs and posts ERROR blocks to Discord webhooks and Telegram bots. [verified: `apps/monitoring-service/src/monitoring.service.ts:261-300`; `config/configuration.ts:47-53`]
- **How alerts are deduplicated.** NoiseGate fingerprints the header line of each error. It silences a repeat of the same fingerprint for 30 min ±10 %, and it limits each service to 6 messages a minute; a new fingerprint skips the limit. Numbers with 5 or more digits and anything after a `/` are normalized away before hashing. [verified: `monitoring.service.ts:650-667,838-846`; `monitoring-noise-gate.ts:74-84,121-155,189-205`]
- **Swap, bridge and intent alerters page on single give-ups.** None of them groups by chain [derived: survey `backend-signals`].
  - Only one incident can be open per collection, so a second chain breaking does not page again. [verified: `packages/incident-manager/src/schema.ts:64-70`; `apps/swaps-api/src/tasks/submit-swap-txs/constants.ts:133-134`]
  - A stalled relay can take about 24 h to page. [derived: `constants.ts:18`, `SWAP_REFUND_MAX_RELAY_AGE_MS = 24 * 60 * 60_000`]
- **The data for per-chain success rates already exists.**
  - `stateful_submit_swap_tx_v2` has `srcChainKey`, `status`, `createdAt` and `updatedAt`; each intent carries numeric `srcChain` and `dstChain`. [verified: `stateful-submit-swap-tx.schema.ts:80`; `packages/shared-schemas/src/schemas/intents/intent-events.schema.ts`]
  - `stateful_submit_bridge_tx` holds bridge transfers; `intent_journal` holds every hub intent.
  - None of the 43 non-test `$group` stages is keyed on a chain field. [verified: `git grep` for `$group:` stages = 43, 12 of them in `docs/` scripts; `_id` keys listed and read]
- **No live checks.** There are no synthetic or canary transactions and no scheduled live check. The only cron in backend CI is an image cleanup. [verified: `api-auth-image-cleanup.yml:8-9`]
- **The health endpoint shows only the hub.** `/v1/be/healthz/status` lists hub-indexer aggregators (intents, money-market, wallet-factory, amm, protocol-revenue), task heartbeats, locks, drainer instances and the backup watcher. Nothing is per spoke chain. `health.service.ts` logs no error or warning, so a stale heartbeat cannot reach monitoring-service through it. [verified: GET 06:08 UTC; `apps/api/src/api/health/health.service.ts`, 0 `logger.error`/`warn`]
  - **It answers per instance.** 6 GETs on prod at 06:09 UTC showed the intent canceller enabled 2 times (ticking) and disabled 4 times; canary showed it disabled. [verified] A check that reads this endpoint once gets one random instance's view.
- **Signing keys.** The grep found two: the task-executor key (`INTENT_CANCELLER_PRIVATE_KEY`, used for hub transactions) and the Stellar sponsor seed. [verified: `apps/task-executor/src/config/configuration.ts:50`; `apps/sponsoring-api/src/stellar/stellar-horizon.service.ts:48`; scope: key-name grep over `*.ts`]
- **RPC config.** The backend's SDK instance uses `RPC_CONFIG` overrides, else the SDK public defaults. Backend #1086 and #1114 were RPC-config incidents. [verified: `.env-example:341-364`]

### sodax-frontend

- **No failure tracking for DeFi flows.** There are no e2e tests and no Sentry. GA4 has a `*_completed` event for swap, stake, unstake, unstake claim, migration, liquidity and fee claims, each with `source_chain`, and no failure event for any of them. PostHog is used only for deck analytics. [verified: event list in `apps/web/lib/analytics.ts`; `apps/web/lib/deck/analytics.ts`]
- **It already runs scheduled checks that open GitHub issues:**
  - `tag-surface.yml`, daily at 07:00 UTC, one open issue at a time;
  - `link-sweep.yml`, monthly.
  This is a ready pattern for alerts. [verified: `tag-surface.yml:21,71,115-143`; `link-sweep.yml:11,126,164-208`]
- **Its RPCs differ from the SDK defaults.** In production it uses Alchemy for Sonic, Solana and 8 EVM chains, which also avoids the dead Polygon and Ethereum defaults. So a check of the SDK defaults does not test the endpoints sodax.com uses. [verified: `apps/web/providers/constants.ts:45-59,92-104`]

### intents-whitelabel

- **No safety net.** No tests, no workflows (`.github/` holds only issue images) and no error-reporting library. [verified: `git ls-tree`; `package.json`]
- **Its swaps bypass the backend submit table.** It pins SDK 2.0.0-rc.12, whose `SwapService` relays on the client. [verified: `package.json:22-27`; `@sdks@2.0.0-rc.12:packages/sdk/src/swap/SwapService.ts:402`] Current SDKs try the backend submit-tx first and fall back to the client relay on any failure. [verified: `SwapService.ts:1179-1190`]

## Layers

No single layer catches everything [judgement]. The breaks seen so far fall into two kinds. Each layer below lists which kind it catches.

- **SDK-side regressions:** #74, #216, #357, #442. Offline tests on every PR can catch this kind.
- **Chain-side or ops drift:** Sui JSON-RPC shutdown (#360), NEAR RPC (#397), Sui package upgrade (#467), backend RPC config (#1086, #1114), the Polygon 401, Robinhood money-market tokens missing from config (August 2026) and Stellar HBAR. Offline unit tests do not see these. Scheduled live checks can.

[verified: sodax-sdks commit subjects for the #-numbers; backend `.env-example:350-364`; e2e job logs; judgement on the split]

### L0: offline per-chain golden tests (SDK CI)

- **What it catches.** A code change that alters the bytes we build for a chain:
  - encoding, the RLP or Borsh payload, account metas;
  - address formats, signing, routing to the wrong spoke service;
  - config mistakes, such as a missing chain in a test list or a bad address checksum.
  This is the #74, #216, #357 and #442 class. [judgement]
- **How.**
  - For each spoke service and flow (deposit, sendMessage, approve), commit a pinned input and the expected raw tx bytes or object built with `raw: true`.
  - EVM, Sonic, ICON and NEAR raw deposits make no network reads, so they need only fixed inputs. ICON also needs a fixed clock, because it stamps `Date.now()`. NEAR's raw result is an action description, not signed bytes. [verified: `EvmSpokeService.ts:157-176`; `NearSpokeService.ts:144-191`; `IconSpokeService.ts:61-96`, clock at `:87`]
  - Injective, Solana, Stacks, Stellar, Sui and Bitcoin read chain state during a raw build. They need recorded RPC responses, served through a fake `fetch` or transport. [verified: survey `sdk-tests-ci`]
  - Flow-specific hub calldata (the `data` field for a swap intent, a money-market action, a stake, a migration, a DEX action) is built in each feature service, so each needs its own vectors on top of the spoke ones. [judgement]
  - Add `TEST_CHAINS == EVM_SPOKE_ONLY_CHAIN_KEYS`, plus non-EVM address-format checks in `@sodax/types` (strkey, base58, bech32, Sui 0x+64). [verified gap: `config-address-checksum.test.ts:62-64` checks EVM addresses only]
- **What it misses.** Anything on the chain or the network: dead RPCs, contract upgrades, IDL changes, hub config drift, solver or relay outages.
- **Cost.** Runs in seconds inside `pnpm test`, with no network [judgement]. The work is about 30 spoke fixtures [derived: 10 spoke services × 3 flows], plus the per-feature ones.
- **Owner repo.** sodax-sdks.
- **When it runs.** Every PR. It is a gate only if "Build and Test" becomes a required check on main. Today no check is required.

### L1: scheduled read-only live checks, no funds

- **What it catches.** Chain-side and ops drift:
  - **RPCs:** each default endpoint answers, with the right EVM chain id. That is about 27 endpoints [derived: 22 chains + Stellar Horizon + ICON debug + Injective indexer + Bound API + Bound UMS; Bound's companion hosts not counted]. Injective's `rpcUrl` is unused: the SDK takes gRPC and indexer endpoints from `@injectivelabs/networks` [verified: `InjectiveSpokeService.ts:127-130`]. Also check the endpoints that sodax.com (Alchemy, needs a key) and the backend (`RPC_CONFIG`, not in git) really use [judgement].
  - **Config against on-chain state:**
    - each listed money-market token has a reserve (the current e2e check);
    - the hub `simulateDeposit` for every listed (chain, token): 336 calls [verified: runtime count on 0181a053: 382 swap + 202 money-market entries = 584, 400 unique (chain, address), 336 off the hub; `SpokeService.ts:604-605` rejects hub tokens];
    - the two are complementary: the hub accepted the Stellar HBAR deposit today, so of the two only the reserve check catches that drift [verified: 06:07 UTC].
  - **Contract changes:**
    - Solana: both SODAX programs publish an Anchor IDL account, so "on-chain IDL hash = vendored IDL" is feasible [verified: `getMultipleAccounts` 06:14 UTC, 4,004 and 2,206 bytes]. An IDL can lag a program upgrade, so also watch each program's last-deploy slot [judgement].
    - Sui: since #467 the SDK reads the asset manager's package id per call, but the connection's package id is still static config, so check that one [verified: `SuiSpokeService.ts:140-150,240-245`].
    - EVM and Stellar: watch proxy implementation slots or code hashes, and contract wasm hashes [judgement, not probed].
  - **API:** one quote per source chain from api.sodax.com.
  - **API schemas:** the api-4 OpenAPI drift check.
- **What it misses.** The spoke-side transaction itself, such as a wrong instruction or a missing approval; SDK code bugs; the destination leg; anything that needs a signature.
- **How to call it.** Use the SDK's own `simulateDeposit`, not a copy. In this review a hand copy produced a false Solana rejection until its base58 bug was fixed. A rejection comes back as "reverted for an unknown reason", so the alert cannot say why without a trace. [verified: 06:07 UTC]
- **Cost.**
  - Per run: about 27 RPC checks, 336 hub eth_calls, 22 quotes, and the api-4 check (about 4 spec GETs, then 59 schema pairs compared offline). That is about 389 requests [derived: 27 + 336 + 22 + 4; api-4 figures from `f-deep/api.md:331-338,385`].
  - Hourly runs would make 8,064 hub eth_calls a day against `rpc.soniclabs.com` [derived: 336 × 24]. That RPC accepted a 2-call JSON-RPC batch [verified: 06:08 UTC]; batch-size limits were not tested.
  - Public endpoints are the only option today, because CI holds no RPC secrets [verified]. Whether they are reliable enough from GitHub runners was not measured; the Ethereum default failed every try today.
- **Owner repo.** sodax-sdks. Reuse `packages/sdk/src/e2e-tests` and `vitest.e2e.config.ts`.
- **When it runs.** Nightly cron plus `workflow_dispatch`, on main. Also before release, on the release branch.

### L2: simulate the real SDK-built transaction against live state, no funds

- **What it catches.** A per-chain flow breaking on the source side: the SDK builds the tx, the source chain accepts it, and the hub accepts the emitted payload. It would catch the Sui package upgrade (#467) and Stellar raw payload (#216) classes before users hit them. [judgement]
- **How, per chain.** Build with `raw: true` as a known holder, simulate on the source chain, then feed the payload to the hub `simulateRecvMessage`. Reading the payload needs logs or events; where the simulate call returns none, compute it as `simulateDeposit` does. The method differs by chain:

  | Chain type | Simulation method | What was run (scope) |
  | --- | --- | --- |
  | EVM | `eth_simulateV1` with state overrides returns logs, so the payload can be read: works on 6 of 14 default RPCs (Sonic, Arbitrum, Base, Optimism, BSC, Robinhood). `eth_call`/`estimateGas` with a state override works on 4 more (Avalanche, Redbelly, HyperEVM, Kaia) but returns no logs. Lightlink rejects overrides; Hedera ignores them (`0x`, no error). Polygon and Ethereum: default RPC down, not tested. | Override support: a synthetic contract and balance, one try per RPC [verified: `chainsim/out/evm_probe.jsonl`]. The SDK deposit only on Arbitrum: native and USDC from an unfunded synthetic address passed, and the hub accepted the payload read from the simulated log [verified: `arb_simv1_*.json`; hub call re-run 06:08 UTC]. |
  | Solana | `simulateTransaction` with sigVerify off, `replaceRecentBlockhash`, an existing funded account as fee payer | Only a plain SOL transfer (150 CU): passed; unfunded payer → AccountNotFound; sigVerify on → SignatureFailure [verified: `solana_probe*.txt`]. The SODAX deposit instruction was not simulated [judgement: the same method should work]. No account overrides, so token deposits need a real holder. |
  | Sui | gRPC `SimulateTransaction` with `checksEnabled: false` | Only a trivial Move call, and a split of someone else's coin from an unfunded sender: passed with checks off, rejected with checks on [verified: `sui_probe*.txt`]. The SODAX deposit call was not simulated [judgement]. |
  | Stellar | Soroban `simulateTransaction` | A hand-built copy of the SDK's asset-manager `transfer` of native XLM: passed with a real holder as `from` (the source account can be unfunded); unfunded `from` → `Error(Contract, #6)`; amount over balance → `#42` [verified: `stellar_probe.txt`]. Not built by SDK code. |
  | Injective | Cosmos `/simulate`, empty signature, existing account, current sequence | A hand-built `MsgExecuteContract` `transfer` to the SODAX asset manager: passed; over-balance, wrong sequence, unknown account and wrong contract all failed [verified: `injective_probe.txt`]. |
  | ICON | `debug_estimateStep` (v3d endpoint) with a funded third-party sender | The SDK's native-ICX deposit shape, sent from the ICON treasury address: 0x8a118 steps; unfunded sender → OutOfBalance; wrong `_to` → UnknownFailure [verified: 3 calls, 06:08 UTC]. It returns a step count only, no events, so the hub payload must be computed. |

- **No keyless simulation found for Stacks, NEAR and Bitcoin.** They go to L3.
  - Stacks: `call-read` rejects public functions (NotReadOnly), and the fee estimate is the same for a valid and an impossible amount [verified: `stacks_probe.txt`]. The node's newer `/v3/transactions/simulate` (stacks-core develop-branch spec) needs operator auth (`rpcAuth`) and a fully signed tx that can pay its fee [verified: `chainsim/out/stacks_openapi_develop.yaml:2513-2531`]. Third-party simulators were not checked.
  - NEAR: a view call cannot attach a deposit, and `ft_transfer_call` needs 1 yoctoNEAR [judgement; not probed].
  - Bitcoin: mempool-acceptance tests need signed txs [judgement; not probed].
- **What it misses.**
  - The destination leg: the solver fill and the relayer's hub-to-spoke delivery.
  - Stacks, NEAR and Bitcoin; Lightlink and Hedera (no usable overrides).
  - Flow-specific hub actions, unless the simulation passes the real `data` field (not tried; all probes used empty `data`).
- **Cost.**
  - One source simulation plus one hub eth_call per (chain, token), so at most 672 calls per full sweep [derived: 2 × 336], fewer because 5 chains have no method.
  - A holder list per chain and token, kept current. Holder lookup worked on Injective and Stellar, and the Solana public RPC rate-limited it (429) [not re-checked].
  - Each RPC needs a self-check that it applied the override, because Hedera returns `0x` with no error [verified: `evm_probe.jsonl`].
- **Owner repo.** sodax-sdks, as a separate scheduled suite.
- **When it runs.** Nightly. Before release, on the release candidate build.

### L3: fork or devnet runs where they exist

- **What it catches.** Full execution, not just simulation, and the chains L2 cannot reach:
  - **Sonic hub:** an anvil fork ran the real hub `recvMessage` after the Connection contract was stubbed with `anvil_setCode`, and the asset was credited [not re-checked: the first-pass anvil logs in scratch are empty].
  - **Lightlink:** the SDK's native-deposit shape passed on a local anvil fork, the Connection emitted one event, and a value-mismatch control reverted [verified: anvil 1.7.1, fork block 233,543,582, 06:1x UTC].
  - **Hedera:** a native deposit ran on an anvil fork [not re-checked]. The fork may not match the real chain: HTS tokens and tinybar scaling are not modelled [judgement].
  - **Solana:** solana-test-validator `--clone` or Surfpool [judgement, not run].
  - **Stacks:** Clarinet simnet with `repl.remote_data` [judgement, not run].
  - **NEAR:** near-sandbox with spooned contracts [judgement, not run].
  - **Bitcoin:** structural PSBT checks plus the hub leg only [judgement].
- **SODAX testnet.** The SDK has no testnet chain config [verified: `chain-keys.ts`]. The frontend's `NEXT_PUBLIC_TESTNET` switch only repoints the relay [verified: `apps/web/providers/constants.ts:14,86-90`]. Stale leftovers exist on Solana devnet and NEAR testnet [not re-checked]. Whether any working testnet stack exists was not verified.
- **What it misses.** Real validator, relayer and solver behaviour. Fidelity also drops where the fork tool does not model the chain (Hedera HTS).
- **Cost.**
  - New tooling per chain: anvil for EVM is cheap; Clarinet, near-sandbox and Surfpool each add a dependency and CI setup.
  - Forks need a pinned block to stay deterministic. The public Sonic RPC served state 5,000,000 and 20,000,000 blocks back [verified: 2 `eth_getBalance` calls, 06:1x UTC].
- **Owner repo.** sodax-sdks.
- **When it runs.** Nightly for EVM and the hub. On demand or weekly for Stacks and NEAR until they prove stable [judgement].

### L4: small canary transactions with real funds, on a schedule

- **What it catches.** Everything in one round trip: source tx, relay, hub, solver fill, destination delivery and the backend status. It is the only active test of the relayer and solver; L5 sees them only through user traffic. [judgement]
- **What it misses.** Rare tokens and routes. A canary covers only the paths it runs.
- **Costs.** [judgement unless tagged]
  - A funded wallet on each chain, with gas plus swap amounts. Each run pays source gas, solver spread and fees. One route each way per spoke, once a day, is 42 swaps a day [derived: 21 × 2 × 1]. Ethereum and Bitcoin fees dominate. No amounts were measured.
  - Stuck funds: if relay or fill fails, the canary's funds wait on the hub for a refund. Refunds depend on the intent canceller, which answered enabled on only some prod instances and disabled on canary [verified: 06:09 UTC].
  - Bitcoin trading mode signs through Bound, so a Bitcoin canary also needs a Bound account [verified: `chains.ts:540,889-893`].
- **Key security.** [judgement]
  - One key per chain, separate from the keeper and sponsor keys, in a low-balance hot wallet with a hard cap.
  - Signing only in server-only code (wsc-1). Keys in a secret store, not in sodax-sdks GitHub secrets: that repo's workflows already hold npm publish tokens [verified: workflow secrets list], and a workflow change merged to main can read repo secrets.
  - Alert on any outflow that does not match a scheduled run.
  - Alert when a balance is low; no automatic top-up from a treasury.
- **Owner repo.** sodax-backend task-executor (it already holds a hub key and heartbeats), or a separate ops repo. Not sodax-sdks PR CI. [judgement]
- **When it runs.**
  - Daily or every few hours on the main routes, for example each chain → Sonic USDC and back.
  - Not on PRs.
  - Needs a team decision first.

### L5: production telemetry alerts from backend data

- **What it catches.** Real users failing on one chain, for flows the backend relays and for anything that reached the hub. It also catches relay and solver problems that SDK tests do not see. [judgement]
- **How.** A cron job in task-executor or swaps-api, using the existing heartbeat pattern. [derived: field list in survey `backend-signals`]
  - Group by chain over a window:
    - `stateful_submit_swap_tx_v2` by (`srcChainKey`, `intent.dstChain`);
    - `stateful_submit_bridge_tx` by `srcChainKey`;
    - `intent_journal` by `srcChain` and `dstChain` (numeric relay ids; map them to chain keys).
  - Compute the success rate and the time to settle. Settle time ≈ `updatedAt − createdAt` on solved rows.
  - Emit one `logger.error` per unhealthy chain, with the chain key in the header line. NoiseGate then keeps chains apart, and the one-incident-per-collection limit does not apply. Use chain keys, not numeric chain ids: ids of 5 or more digits (42161, 43114) all hash as `N`, and text after a `/` becomes `/path`. [verified: NoiseGate code above]
- **What it misses.**
  - Failures before submit-tx: wallet, sign or createIntent.
  - Client-relayed flows before they reach the hub: money market, staking, migration, DEX, and whitelabel swaps [verified: `relayTxAndWaitPacket` callers in `packages/sdk/src`]. `intent_journal` still sees intents that reach the hub. GA4's `*_completed` events carry `source_chain`, so "no completions on a chain that usually has them" could cover part of this gap [judgement].
  - Chains with too little traffic to compute a rate.
  It needs a minimum sample size and an "expected traffic but zero solved" rule. [judgement]
- **Caveat.** Submit-table rates measure the backend path, not the user outcome: on any backend failure the SDK falls back to the client relay [verified: `SwapService.ts:1179-1190`]. Join with `intent_journal` before alerting.
- **Cost.**
  - One aggregation query per window. Add a `createdAt` index first; the dashboard comment says there is none, so these queries scan the collection. [verified: `apps/sodax-backend-dashboard/app/api/swaps/observability/route.ts:62-66`]
- **Targets.** The frontend label (about 30 s, or about 3 min when Ethereum is either side) is a UI promise, not a measured target [verified: `apps/web/lib/swap-timing.ts:1-25`]. It does not fit Bitcoin, where the SDK waits up to 1 h [verified: `chains.ts:901`]. Start from measured per-route baselines. [judgement]
- **Owner repo.** sodax-backend.
- **When it runs.** Continuously, every 5–15 minutes [judgement].

## Per-chain matrix

Columns:
- **L0 inputs:** "pure" means the raw build makes no network reads, so fixed inputs are enough. "recorded" means it needs recorded chain reads.
- **L1 extra:** any check beyond RPC liveness and the hub `simulateDeposit`. Those two apply to every chain; the hub check passed for one listed token on each of the 21 spoke chains [verified: 06:07 UTC].
- **L4 feasibility:** [judgement] throughout.

| Chain type (chains) | L0 inputs | L1 extra | L2 method | L3 tool | L4 feasibility |
| --- | --- | --- | --- | --- | --- |
| EVM spokes (13) | pure | chain id; Polygon and Ethereum defaults failing today; proxy or code-hash watch | `eth_simulateV1` on 6 of 14 RPCs; `eth_call` override on 4 more (no logs); Polygon and Ethereum need a working RPC; Lightlink and Hedera need L3 | anvil fork (Lightlink re-run today); Hedera fidelity caveat | Easy: cheap gas on most chains, Ethereum costly |
| Sonic hub (1) | pure | MM reserves vs config; vault hub assets | hub `simulateRecvMessage` (all chains) | anvil fork + Connection stub (not re-checked) | Easy |
| ICON | pure + fixed clock | — | `debug_estimateStep`, funded third-party sender; step count only | none found | Medium: needs ICX wallet |
| Injective | recorded (sequence, pubkey) | probe the gRPC and indexer endpoints, not `rpcUrl` | Cosmos `/simulate`, empty signature | none found | Medium |
| Sui | recorded (package id, coins) | connection package id current; gRPC up | gRPC `SimulateTransaction`, checks off (generic tx only so far) | unclear (`sui.forking.v1alpha` client exists) | Medium |
| Stellar | recorded (account, network) | trustlines; Soroban RPC up | Soroban `simulateTransaction`, holder as `from` | none probed | Medium: trustlines and sponsor |
| Solana | recorded (IDL, mint, blockhash) | on-chain IDL hash vs vendored; program deploy slot | `simulateTransaction`, sigVerify off, funded fee payer (generic tx only so far) | test-validator `--clone` / Surfpool (not run) | Medium: SOL rent and ATAs |
| Stacks | recorded (contract interface) | contract interface reachable | none keyless; `/v3/transactions/simulate` needs node auth and a signed tx | Clarinet simnet `remote_data` (not run) | Medium |
| NEAR | pure | RPC supports `query` (#397) | none found over RPC | near-sandbox spooning (not run) | Medium |
| Bitcoin | recorded (UTXOs) | mempool API up; Bound API up | none found for unsigned txs | regtest, structural only | Hard: fees, Bound signing, dust rules |
| In flight: Monad, Tron, XRP, TON, Zcash | unknown | unknown | not checked | not checked | not checked |

[verified: L0 inputs from survey `sdk-tests-ci`; L2 rows as tagged in the L2 table; judgement: L4 column and "not run" tools]

## Flows, not just swaps

All flows that start on a spoke share the spoke services, so L0 spoke vectors and the L1 hub sweep protect every flow's deposit leg. The rest differs per flow. [judgement, on the verified relay paths below]

| Flow (SDK service) | Relay path | Keyless coverage beyond the deposit leg | Production signal |
| --- | --- | --- | --- |
| Swap (`SwapService`) | backend submit-tx, client relay on failure | quotes (L1); L2 with the real intent `data` (not tried) | submit table + `intent_journal` (L5) |
| Bridge (`BridgeService`) | backend submit-tx or client relay | L2 deposit leg; destination leg none | `stateful_submit_bridge_tx` (L5) |
| Money market (`MoneyMarketService`) | client relay | reserve check (L1); borrow and withdraw are destination legs, none | hub MM events only; per-chain mapping not checked |
| Staking, migration, DEX, leverage yield, partner fee claim | client relay (leverage yield also has a backend API) | per-feature L0 vectors only | GA4 `*_completed` by `source_chain` [judgement] |

[verified: `relayTxAndWaitPacket` and submit-tx callers by `git grep` in `packages/sdk/src`; GA4 fields in `analytics.ts`]

## Not covered by any keyless layer

- **Solver fill:** a quote proves the API prices a route, not that the solver will fill it (inventory, limits).
- **Relayer delivery:** spoke → hub and hub → spoke, per chain.
- **Destination execution:** the spoke asset manager's release, spoke rate limits and liquidity.
- **Wallets:** wallet-sdk-react connectors, browser wallet updates and dapp-kit hooks. No layer here runs a wallet.

Cheap partial checks to try [judgement, not probed]:
- time since each spoke Connection last sent or received a message, against its usual traffic;
- spoke rate-limit headroom and asset-manager balances per token;
- the EVM destination leg through `eth_simulateV1` with the spoke Connection's code overridden by a stub, the same trick as the anvil Sonic run.

## Recommended rollout

Ordered by cost against catch rate. Each phase lists its first PRs.

### Phase 0: stop the known silent failures (days)

1. **sodax-sdks:**
   - Fix or exclude the Stellar HBAR money-market entry (`moneyMarket.ts:160`), so the e2e suite can go green.
   - Replace the Polygon default RPC. Test the Ethereum default from a GitHub runner, and replace it if it fails there too.
   - Route the 4 `/be` token reads to `/v2/be/config/*` (the api-4 fix-now).
2. **sodax-sdks:** run `pnpm test:e2e` nightly on main (cron + `workflow_dispatch`).
   - Split RPC and HTTP errors from assertion failures.
   - Open or comment on one GitHub issue per failing check. Copy the frontend `tag-surface.yml` pattern.
   - Needs: an owner named for the issue and `issues: write` on the workflow. No secrets.

### Phase 1: L1 chain-health canary (1–2 weeks)

3. **Chain-health suite in sodax-sdks:**
   - liveness and chain id for the default endpoints (about 27), plus the ones sodax.com and the backend use;
   - the hub `simulateDeposit` sweep over every listed (chain, token) (336 calls), through the SDK's own function;
   - the money-market reserve check;
   - one quote per source chain from api.sodax.com;
   - contract-change checks: the Solana IDL hash and deploy slot, the Sui connection package id.
4. **api-4 drift check:** run the OpenAPI drift check on the same nightly schedule.
5. **Builds on:** api-4 (schema drift) and sdk-8 (status, retryable and request IDs, so a failure can be classified and traced to backend logs).

### Phase 2: L0 golden vectors and a real gate (2–3 weeks)

6. **List guards:** `TEST_CHAINS` vs `EVM_SPOKE_ONLY_CHAIN_KEYS`; non-EVM address-format tests in `@sodax/types`; and a test that every `ChainKey` has an entry in the health-check registry, so a new chain (Monad, Tron, …) fails CI until it is covered.
7. **Golden vectors:** raw tx vectors for each spoke service × deposit/sendMessage. Start with EVM, Sonic, ICON and NEAR, which need no recorded reads. Then add the 6 chain types that need recorded reads, then the per-feature `data` vectors.
8. **Required gate:** ask an admin to make "Build and Test" a required check on main.
9. **Builds on:**
   - sdk-10: typed fakes and a `fetch` option for recorded reads;
   - sdk-8: the same 8 transport sites, done in one pass;
   - x-2: its consumer fixtures;
   - x-4: the runtime matrix reuses the fixtures, so the vectors can run under Node 22.12 and the current Node.

### Phase 3: L2 + L3 nightly simulation (3–4 weeks)

10. **EVM simulation:** start with the 6 RPCs that support `eth_simulateV1`, then the hub payload. Add an RPC self-check that the override was applied. Use anvil forks for Lightlink and Hedera, and an anvil Sonic fork for the full `recvMessage`. Polygon and Ethereum need a working RPC.
11. **Non-EVM simulation:** Solana, Sui, Stellar, Injective and ICON, each with its chain's simulate call on the SDK-built deposit (not yet tried for Solana and Sui) and a curated holder list.
12. **Stacks and NEAR:** a spike on Clarinet `remote_data` for Stacks and near-sandbox for NEAR.
13. **Needs:**
    - probably paid RPC keys as CI secrets, because public endpoints rate-limit;
    - an owner for the holder list.

### Phase 4: L5 backend per-chain alerts (parallel with phase 3, backend team)

14. **Per-chain health job** in sodax-backend task-executor: success rate and settle time by chain, one `logger.error` per bad chain (chain key in the header), a minimum sample size, and a `createdAt` index. Join submit rows with `intent_journal`.
15. **Cross-repo tracking:** this is cross-repo work, so it needs a parent issue in sodax-sdks with a sodax-backend sub-issue before coding.

### Phase 5: L4 funded canaries (only after a team decision)

16. **Canary task:** a task with server-only signers (wsc-1), one capped wallet per chain, and a fixed route list.
17. **Needs:**
    - a fund budget;
    - key custody;
    - a working refund path (the intent canceller runs on only some prod instances today);
    - a decision on which chains and how often.

## Alerting and noise

- **Where alerts go.** [judgement]
  - **sodax-sdks scheduled checks:** one GitHub issue per check and chain, using the `tag-surface.yml` pattern. Open it on the first confirmed failure, comment on repeats and close it automatically on green.
  - **Backend L5 and L4:** the existing `monitoring-service` path to Discord and Telegram.
  - **Open question:** who watches those channels. The backend has no pager integration. [verified: no PagerDuty, Opsgenie or Slack code in sodax-backend]
- **A red check must not hide a new failure.** The e2e money-market test stayed red through two different drifts and one RPC outage, so the second drift did not change the signal [verified: job logs]. So key each alert by (check, chain, token). Keep expected failures in a pinned list that fails when an entry stops reproducing, as `e2e.test.ts:53-65,78-119` already does for vault hub assets [verified]. [judgement]
- **Flake control.** [judgement]
  - Retry each network call with backoff. As a scale check: at an assumed 1 % transient failure rate, a 389-request run would see about 4 failed requests [derived: 389 × 0.01 ≈ 3.9; the rate is an assumption].
  - Alert only after 2 consecutive failed runs, or a failure from 2 different RPCs.
  - Label each failure as `infra` (RPC down, 429, 503, timeout) or `assertion` (wrong state, revert). Route `infra` with lower urgency. On 2026-10-04 a Sonic 503 made the e2e look like config drift [verified: job log].
  - Read per-instance endpoints per instance, or the result flaps (see the health endpoint above).
  - Pin fork block numbers. Keep a self-check for RPC features such as overrides.
- **Rate limits.** [judgement unless tagged]
  - Today the Ethereum default answered 429 on every try and the Solana public RPC rate-limited a holder lookup [verified for Ethereum; not re-checked for Solana].
  - GitHub-hosted runners share IP ranges with other users, so per-IP limits may bite harder than from one laptop (not measured).
  - Batch JSON-RPC calls, spread them over the window, and use paid keys at least for Ethereum and Polygon.
  - Give the jobs their own api.sodax.com key, so their traffic is attributable and keeps working if key enforcement is turned on.
- **Ownership.** [judgement]
  - Each chain type gets a named owner in the workflow file or CODEOWNERS (sodax-sdks and sodax-backend already have `.github/CODEOWNERS` [verified]).
  - An open drift issue blocks the next release until it is fixed or explicitly waived.
  - The e2e case shows what happens without an owner: 60 days of red in the sampled logs (2026-08-20 to 2026-10-19), behind a green check [derived: 11 + 30 + 19 days].

## Proposed #519 bullet

0x0603: Run scheduled per-chain health checks (RPC, config vs on-chain state, keyless SDK-built tx simulation) and per-chain golden tx tests in CI, with failures opening an owned issue.
Why: a break on one chain (dead RPC, contract upgrade, config drift, encoding bug) is found today mostly by users; the live e2e suite has been red behind a green check in all 24 sampled runs since 2026-08-20.
How: nightly keyless checks first (RPCs, hub simulateDeposit for every listed token, quotes, contract-change checks), offline golden vectors per spoke service behind a required check, then per-chain simulation and backend success-rate alerts; funded canaries only after a team decision.

## Not verified

- **Default RPC failures:** whether `polygon-rpc.com` (401) and `eth.merkle.io` (429) also fail from GitHub runners. The probes ran from one host.
- **Backend recency:** whether sodax-backend commits newer than 985959e9 change alerting. The refs were not fetched.
- **External alerting:** whether the solver, the relayer or an external Prometheus/Alertmanager already alerts per chain. They are outside these repos.
- **Traffic per chain:** swap volume per chain was not measured (no DB access). It decides the L5 window and which chains need L2–L4 instead of rates.
- **SDK-built simulation on Solana and Sui:** only generic transactions were simulated there.
- **Untested L3 tools:** Clarinet `remote_data`, near-sandbox spooning, Surfpool and the Sui forking service were not run against SODAX contracts. The Sonic `recvMessage` fork and the Hedera fork were not re-run.
- **Destination leg:** delivery checks (solver fill, relayer execution on spokes). No method was probed.
- **Testnet relay:** what the "TESTNET relay" behind `canary-api.sodax.com/v1/relay` serves. Its `/v1/relay` returned 403; the iconblockchain host was not probed (forbidden).
- **Intent canceller:** whether running it on only some prod instances is intended.
- **New chains:** simulation and fork methods for Monad, Tron, XRP, TON and Zcash.
- **CI run time:** GitHub Actions minutes and wall time for the nightly suites were not measured.
- **Intended config?** Whether Stellar HBAR in money market is intended (waiting for the reserve) or a bug.
- **Required check:** whether the team will make "Build and Test" required, and who can edit ruleset 16101300.
- **L4 costs:** all L4 cost and feasibility figures are [judgement]. No funded wallet was used.

## Verification (2026-10-20)

An adversarial pass over this note, 06:00–06:20 UTC, on the same refs (sodax-sdks 0181a053, sodax-backend 985959e9 not fetched, sodax-frontend 1b915ec7, intents-whitelabel 5e1fbbaa). Network calls were read-only and few: 28 hub eth_calls, 1 Arbitrum-payload hub call, 3 ICON `debug_estimateStep` calls, 2 ICON balance reads, 4 RPC liveness calls, 1 JSON-RPC batch, 2 historical-state reads, 1 Solana `getMultipleAccounts`, 10 API GETs, 5 `gh api` GETs, and one local anvil fork of Lightlink. Scripts and outputs: `scratchpad/g-critic/`.

**Checked and confirmed.**
- Chain count and types, the SpokeService router, `raw: true` in all 10 spoke services, `TEST_CHAINS`, the EVM-only checksum test, `SwapService.test.ts` chain count, no snapshots, the e2e job (`ci.yml:258-306`), the single cron, no required status check (rulesets read via `gh api`), the Polygon and Ethereum default RPC failures, the Injective endpoint override.
- Token counts by running the `@sodax/types` source: 382 swap + 202 money-market entries.
- Backend: Discord/Telegram sinks, NoiseGate behaviour, one incident per collection, the 24 h relay age gate, chain fields in the swap and intent schemas, no `$group` on a chain field, no live checks, hub-only health, the keys found, the missing `createdAt` index.
- Frontend: GA4 events, the two issue-opening crons, the RPC overrides, the swap-timing label. Whitelabel: no tests, workflows or error reporting; rc.12 client relay.
- Cited issue numbers against commit subjects (sdks) and code comments (backend #1086, #1114).
- Simulation probes re-read from saved outputs (EVM, Solana, Sui, Stellar, Injective, Stacks), and re-run where cheap: the hub check per spoke chain, the Arbitrum payload on the hub, ICON `debug_estimateStep`, a Lightlink anvil fork, Sonic historical state.

**Changed.**
- `eth_simulateV1` works on 6 of 14 default RPCs, not 7; added which 4 RPCs return no logs, and that Polygon and Ethereum were untested (RPC down), not unsupported.
- Solana and Sui "Works" rows: the probes simulated a SOL transfer and generic Sui calls, not the SODAX deposit. Stellar and Injective probes were hand-built copies of the SDK call. ICON was re-run; noted it returns no events.
- Stacks: "no public way" replaced by what was checked, including the auth-gated `/v3/transactions/simulate` in the stacks-core develop spec.
- "simulateDeposit reproduced for 12 chains of all 9 types": its saved output covered 4 chains. Re-ran it: 21 of 21 spoke chains passed, 2 controls rejected, and Stellar HBAR passed (so it does not catch that drift).
- "Stellar HBAR failed for 61 days": the HBAR failure starts 2026-09-09 in the saved logs; the suite has been red since at least 2026-08-20, with Robinhood config drift first and one Sonic 503.
- L1 cost: the hub sweep is 336 calls after removing duplicates and hub tokens, not 584; the endpoint count is about 27, not 23; the api-4 check is about 4 spec GETs, not 59 requests; the old "about 630" left out the schema step, and "about 15,000 a day" was 14,016. New figures: about 389 requests per run, 8,064 hub calls a day if hourly.
- Test call sites: 3,490 in `packages/`, not "about 3,400". `$group` stages: 43, not 36. The 17 e2e tests: 9 make no network call.
- GA4 does not send "only `swap_completed`": it has 9 DeFi completion events and no DeFi failure event.
- The intent canceller is not simply disabled: prod answers per instance (2 of 6 GETs enabled).
- `apps/node` is excluded from build, lint, checkTs and test, so it is not a base. The ICON/Solana byte-equality probes and the Sonic and Hedera anvil runs are marked not re-checked (outputs not saved; anvil logs empty).
- NEAR L3 tag `[derived, not run]` → `[judgement, not run]`. "SODAX testnet: no usable" → what the SDK and frontend actually contain.
- The 4 broken `/be` reads: added that no in-repo code calls them.
- Added: chains in flight (5 chains, 4 new types); consumer-specific RPCs (frontend Alchemy, backend `RPC_CONFIG`); contract-change detectors (Solana IDL accounts verified to exist; Sui connection package still static); the client-relay fallback that skews submit-table rates; NoiseGate fingerprint rules for chain names; Bitcoin vs the frontend timing label; a flows table; a "not covered by any keyless layer" list; canary key, cost and stuck-fund risks; a registry guard for new chains; alert masking and rate-limit notes; calibrated "nobody notices" in Problem.

**Still judgement.** The layer split and catch claims, all L4 costs and feasibility, owner and schedule choices, the untested L3 tools, that the Solana and Sui methods work for the SODAX deposit, the NEAR and Bitcoin "no simulation" calls, the partial checks for relay and destination legs, GA4 as a signal, the GitHub-runner rate-limit concern, and the 1 % flake rate used for scale.
