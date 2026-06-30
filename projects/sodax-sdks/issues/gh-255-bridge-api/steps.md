---
type: steps
repo: sodax-sdks
github: 255
status: Active
updated: 2026-06-30
---

# GH-255 Bridge API — micro-steps (follow-along)

> Derived from `plan.md` + `reference/backend-contract/04-decisions.md`, decomposed and
> adversarially checked. Each box is one small grounded task. Work **one box at a time,
> top to bottom**: do it, run its `verify:`, tick `[ ]`→`[x]` only when green.

## You are here

- ✅ **Phase 0 done** — branch off #210 (`feat/swaps-api-v2`); scaffold commit `8fd58453` (17 stub files).
- **Priority: SDK-first** (types → sdk → dapp-kit → demo → docs). `useBackendSubmitTx` ships **default-OFF**.
- `> scaffold exists` = file already stubbed at `8fd58453`; you're **filling it in**, not creating.
- At each phase end, run the **✅ Gate** before the next phase.

---

## Phase 1 — `@sodax/types` (plan §1)

- [ ] **P1.1** File header + imports + request/create DTOs — `types/src/backend/backendBridgeApiV2.ts` · mirror `backendApiV2.ts` header (1-37) + CreateIntentParamsV2 (299-346) · verify: `pnpm --filter @sodax/types checkTs` · (~25min) · `>` scaffold exists
- [ ] **P1.2** Submit-tx + status DTOs (5-state, no intent, relayData=object) — `types/src/backend/backendBridgeApiV2.ts` · mirror `backendApiV2.ts` SubmitTx* (559-666) · verify: `pnpm --filter @sodax/types checkTs` · (~25min) · `>` scaffold exists
- [ ] **P1.3** Token DTOs (`BridgeTokenV2`) + JSON-safety guard — `types/src/backend/backendBridgeApiV2.ts` · mirror `backendApiV2.ts` SwapTokenV2 (103-118) + guards (911-930) · verify: `pnpm --filter @sodax/types checkTs` · (~20min) · `>` scaffold exists
- [ ] **P1.4** `IBridgeApiV2` aggregating interface (7 methods incl getTokens/getTokensByChain) — `types/src/backend/backendBridgeApiV2.ts` · mirror `backendApiV2.ts` ISwapsApiV2 (684-727) · verify: `pnpm --filter @sodax/types checkTs` · (~15min) · `>` scaffold exists
- [ ] **P1.5** Export bridge DTOs from backend barrel — `types/src/backend/index.ts` · mirror `backend/index.ts:2` · verify: `pnpm --filter @sodax/types checkTs` · (~10min)
- [ ] **P1.6** Add `bridgeOptions.useBackendSubmitTx` to config — `types/src/sodax-config/sodax-config.ts` · mirror `SwapsClientOptions` + `swapsOptions?` · verify: `pnpm --filter @sodax/types checkTs` · (~15min)

✅ **Gate:** `pnpm --filter @sodax/types checkTs`

---

## Phase 2 — `@sodax/sdk` Bridge HTTP client (plan §2)

- [ ] **P2.1** Straightforward bridge response schemas — `sdk/src/backendApi/bridgeApiSchemas.ts` · mirror `swapsApiSchemas.ts` token/allowance/approve/createIntent; **reuse the exported `RelayExtraDataResponseSchema` from `swapsApiSchemas.ts:55` (do NOT re-declare); keep this file type-import-free** · verify: `pnpm --filter @sodax/sdk checkTs` · (~25min) · `>` scaffold exists
- [ ] **P2.2** Tolerant submit-tx-status schema (`status: v.string()`) — `sdk/src/backendApi/bridgeApiSchemas.ts` · mirror `swapsApiSchemas.ts` SubmitTxStatus* (stay type-import-free) · verify: `pnpm --filter @sodax/sdk checkTs` · (~25min) · `>` scaffold exists
- [ ] **P2.3** `BridgeApiService` HTTP client (7 routes) — `sdk/src/backendApi/BridgeApiService.ts` · mirror `SwapsApiService.ts` (ctor/`request<S>`/7 methods) · verify: `pnpm --filter @sodax/types build && pnpm --filter @sodax/sdk checkTs` · (~40min) · `>` scaffold exists
- [ ] **P2.4** Domain→wire mapper `toCreateBridgeIntentParamsV2` — `sdk/src/backendApi/BridgeApiService.ts` · mirror §1 field map + `BridgeService.ts:63` `CreateBridgeIntentParams` · verify: `pnpm --filter @sodax/types build && pnpm --filter @sodax/sdk checkTs` · (~20min) · `>` scaffold exists
- [ ] **P2.5** `resolveBridgeApiConfig` = alias of `resolveBaseApiConfig` — `sdk/src/backendApi/apiConfig.ts` · mirror `resolveSwapsApiConfig`/`resolveBaseApiConfig` · verify: `pnpm --filter @sodax/sdk checkTs` · (~15min)
- [ ] **P2.6** Wire `bridge` into `BackendApiService` (+ setHeaders) — `sdk/src/backendApi/BackendApiService.ts` · mirror swaps wiring (L182/196/655) · verify: `pnpm --filter @sodax/types build && pnpm --filter @sodax/sdk checkTs` · (~20min)
- [ ] **P2.7** Export `BridgeApiService` from barrel — `sdk/src/backendApi/index.ts` · mirror `index.ts:8` · verify: `pnpm --filter @sodax/sdk checkTs` · (~5min)
- [ ] **P2.8** Bridge API test — route table (7 verbs/URLs) — `sdk/src/backendApi/BridgeApiService.test.ts` · mirror `SwapsApiService.test.ts` routing (156-295) · verify: `cd packages/sdk && npx vitest run src/backendApi/BridgeApiService.test.ts` · (~30min) · `>` scaffold exists
- [ ] **P2.9** Bridge API test — behavior cases (bigint body, valibot fail, transport err) — `sdk/src/backendApi/BridgeApiService.test.ts` · mirror `SwapsApiService.test.ts` behavior (301-588) · verify: `cd packages/sdk && npx vitest run src/backendApi/BridgeApiService.test.ts` · (~35min) · `>` scaffold exists
- [ ] **P2.10** Test `resolveBridgeApiConfig` alias — `sdk/src/backendApi/apiConfig.test.ts` · mirror `apiConfig.test.ts` (46/95) · verify: `cd packages/sdk && npx vitest run src/backendApi/apiConfig.test.ts` · (~20min)

✅ **Gate:** `pnpm --filter @sodax/types build && pnpm --filter @sodax/sdk checkTs && (cd packages/sdk && npx vitest run src/backendApi)`

---

## Phase 3 — `@sodax/sdk` BridgeService refactor + Bitcoin-Bound (plan §3)

- [ ] **P3.1** Ctor params (`backendApi`, `useBackendSubmitTx`) **+ Sodax.ts wiring (atomic)** — `sdk/src/bridge/BridgeService.ts` + `sdk/src/shared/entities/Sodax.ts` (the `new BridgeService({…})` call, **line 97**, gains `backendApi` + `bridgeOptions.useBackendSubmitTx`) · mirror `SwapService.ts` ctor (164-213) + swaps Sodax wiring (57/72-78) · **do both together — checkTs can't pass with only half** · verify: `pnpm --filter @sodax/sdk checkTs` · (~25min)
- [ ] **P3.2** `BridgeExtras` + widen `BridgeParams` to 4-arg — `sdk/src/bridge/BridgeService.ts` · mirror `intent-types.ts` SwapExtras (74-78) + SwapActionParams (123-128) · verify: `pnpm --filter @sodax/sdk checkTs` · (~20min)
- [ ] **P3.3** Plumb Bitcoin-Bound into `createBridgeIntent` (accessToken/srcPublicKey + lift effective-wallet for raw) — `sdk/src/bridge/BridgeService.ts` · mirror `SwapService.ts` createIntent Bitcoin block (859-934) · verify: `pnpm --filter @sodax/sdk checkTs` · (~30min)
- [ ] **P3.4** Extract `fallbackBridgeSteps` (verifyTxHash + relayTxAndWaitPacket, shared deadline) — `sdk/src/bridge/BridgeService.ts` · mirror `SwapService.ts` fallbackSwapSteps (486-546) · verify: `pnpm --filter @sodax/sdk checkTs` · (~25min)
- [ ] **P3.5** Add backend `submitTx` (FULL relayData, terminal `executed && dstIntentTxHash`) — `sdk/src/bridge/BridgeService.ts` · mirror `SwapService.ts` submitTx (563-627) · verify: `pnpm --filter @sodax/sdk checkTs` · (~35min)
- [ ] **P3.6** Refactor `bridge()` submit+fallback branch — `sdk/src/bridge/BridgeService.ts` · mirror `SwapService.ts` swap() branch (424-451) · verify: `cd packages/sdk && npx vitest run src/bridge/BridgeService.test.ts` · (~20min)
- [ ] **P3.7** 5-case backend submit-tx test batch — `sdk/src/bridge/BridgeService.test.ts` · mirror `SwapService.test.ts` Batch 7 (2701-2887) · verify: `cd packages/sdk && npx vitest run src/bridge/BridgeService.test.ts` · (~40min)
- [ ] **P3.8** Sodax `bridgeOptions` wiring assertion (`sodax.bridge.useBackendSubmitTx===true`, `sodax.api.bridge` defined) — `sdk/src/bridge/BridgeService.test.ts` · mirror in-file Sodax assertions (40/128-132) · verify: `cd packages/sdk && npx vitest run src/bridge/BridgeService.test.ts` · (~10min)
- [ ] **P3.9** Phase-3 typecheck + full sdk tests — verify: `pnpm --filter @sodax/sdk checkTs && pnpm --filter @sodax/sdk test` · (~10min)

✅ **Gate:** `pnpm --filter @sodax/sdk checkTs && pnpm --filter @sodax/sdk test`

---

## Phase 4 — `@sodax/dapp-kit` `bridgeApi/` hooks (plan §4)

- [ ] **P4.1** Rebuild SDK so bridge types resolve into dist — verify: `pnpm build:packages` · (~10min)
- [ ] **P4.2** `useBridgeApiAllowance` query (WIRE names: inputToken/inputAmount) — `dapp-kit/src/hooks/bridgeApi/useBridgeApiAllowance.ts` · mirror `useSwapsApiAllowance.ts` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~20min) · `>` scaffold exists
- [ ] **P4.3** `useBridgeApiApprove` mutation — `dapp-kit/src/hooks/bridgeApi/useBridgeApiApprove.ts` · mirror `useSwapsApiApprove.ts` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~20min) · `>` scaffold exists
- [ ] **P4.4** `useBridgeApiCreateBridgeIntent` mutation (no intent) — `dapp-kit/src/hooks/bridgeApi/useBridgeApiCreateBridgeIntent.ts` · mirror `useSwapsApiCreateIntent.ts` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~20min) · `>` scaffold exists
- [ ] **P4.5** `useBridgeApiSubmitTx` mutation (full relayData) — `dapp-kit/src/hooks/bridgeApi/useBridgeApiSubmitTx.ts` · mirror `useSwapsApiSubmitTx.ts` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~20min) · `>` scaffold exists
- [ ] **P4.6** `useBridgeApiSubmitTxStatus` poll (txHash+srcChainKey, terminal executed/failed) — `dapp-kit/src/hooks/bridgeApi/useBridgeApiSubmitTxStatus.ts` · mirror `useSwapsApiSubmitTxStatus.ts` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~25min) · `>` scaffold exists
- [ ] **P4.7** `useBridgeApiTokens` query (NEW — Decision #3) — `dapp-kit/src/hooks/bridgeApi/useBridgeApiTokens.ts` · mirror `useSwapsApiTokens.ts` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~20min)
- [ ] **P4.8** Wire `bridgeApi` barrel — ensure **all 6 hooks** (incl `useBridgeApiTokens`; stub likely lists 5) — `dapp-kit/src/hooks/bridgeApi/index.ts` · mirror `swapsApi/index.ts` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~10min) · `>` scaffold exists
- [ ] **P4.9** Export `bridgeApi` from hooks index — `dapp-kit/src/hooks/index.ts` · mirror `hooks/index.ts:7` · verify: `pnpm --filter @sodax/dapp-kit checkTs` · (~10min)
- [ ] **P4.10** Register 3 mutation hooks in contract test — `dapp-kit/src/hooks/_mutationContract.test.ts` · mirror swapsApi entries (64-69) · verify: `cd packages/dapp-kit && npx vitest run src/hooks/_mutationContract.test.ts` · (~15min)
- [ ] **P4.11** Full dapp-kit typecheck + tests — verify: `pnpm --filter @sodax/dapp-kit checkTs && pnpm --filter @sodax/dapp-kit test` · (~15min)

✅ **Gate:** `pnpm --filter @sodax/dapp-kit checkTs && pnpm --filter @sodax/dapp-kit test`

---

## Phase 5 — `@sodax/demo` bridge-api page (plan §5)

- [ ] **P5.0** Rebuild packages so dapp-kit bridge hooks resolve into dist — verify: `pnpm build:packages` · (~10min)
- [ ] **P5.1** `lib/config.ts` (`BRIDGE_API_CONFIG`) — `demo/src/components/bridge-api/lib/config.ts` · mirror `swaps-api/lib/config.ts` · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~10min) · `>` scaffold exists
- [ ] **P5.2** Port `signAndBroadcast` dispatcher (Bitcoin → `BitcoinSpokeService` + Bound accessToken for TRADING) — `demo/src/components/bridge-api/lib/signAndBroadcast.ts` · mirror `swaps-api/lib/signAndBroadcast.ts` · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~30min) · `>` scaffold exists
- [ ] **P5.3** `toXToken` mapper (NO toIntentRequest) — `demo/src/components/bridge-api/lib/mappers.ts` · mirror `swaps-api/lib/mappers.ts` toXToken · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~10min) · `>` scaffold exists
- [ ] **P5.4** Copy `SelectChain` — `demo/src/components/bridge-api/SelectChain.tsx` · mirror `swaps-api/SelectChain.tsx` · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~10min) · `>` scaffold exists
- [ ] **P5.5** `OrderStatus` poller (no intent_hash) — `demo/src/components/bridge-api/OrderStatus.tsx` · mirror `swaps-api/OrderStatus.tsx` · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~20min) · `>` scaffold exists
- [ ] **P5.6** BridgeCard (a) shell + tokens + balances — `demo/src/components/bridge-api/BridgeCard.tsx` · mirror `SwapCard.tsx` (73-150/456-600) · *intermediate — no standalone gate; compiles at P5.8* · (~40min) · `>` scaffold exists
- [ ] **P5.7** BridgeCard (b) route gate + WIRE DTO + approve flow — `demo/src/components/bridge-api/BridgeCard.tsx` · mirror `SwapCard.tsx` (210-348) + `bridge/BridgeManager.tsx` (85-92/249-264) · *intermediate — no standalone gate; compiles at P5.8* · (~40min)
- [ ] **P5.8** BridgeCard (c) bridge + submitTx (full relayData) + chain gating + max-bridgeable — `demo/src/components/bridge-api/BridgeCard.tsx` · mirror `SwapCard.tsx` (350-417/640-758) + `bridge/BridgeDialog.tsx` · verify: `pnpm --filter sodax-demo-v2 checkTs` *(first BridgeCard gate — green only after a+b+c)* · (~40min)
- [ ] **P5.9** Implement bridge-api page (orders state) — `demo/src/pages/bridge-api/page.tsx` · mirror `swaps-api/page.tsx` · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~10min) · `>` scaffold exists
- [ ] **P5.10** Wire `/bridge-api` route — `demo/src/App.tsx` · mirror swaps-api route (35-38) · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~10min)
- [ ] **P5.11** Add Bridge API nav link — `demo/src/components/shared/header.tsx` · mirror Swaps API nav (L12) · verify: `pnpm --filter sodax-demo-v2 checkTs` · (~10min)
- [ ] **P5.12** Converge demo typecheck + lint — verify: `pnpm --filter sodax-demo-v2 checkTs && pnpm --filter sodax-demo-v2 lint` · (~30min)

✅ **Gate:** `pnpm --filter sodax-demo-v2 checkTs && pnpm --filter sodax-demo-v2 lint`

---

## Phase 6 — `@sodax/skills` + docs (plan §6)

- [ ] **P6.1** Bridge-api feature knowledge doc — `skills/sodax-sdk/integration/knowledge/features/bridge-api.md` + `features/README.md` · mirror `swaps-api.md` + README L10 · verify: `pnpm --filter @sodax/skills check:ai-structural` · (~35min)
- [ ] **P6.2** Bridge-api `SKILL.md` (reframe migration → on-chain→API + useBackendSubmitTx) — `skills/sodax-sdk/bridge-api/SKILL.md` · mirror `swaps-api/SKILL.md` · verify: `pnpm --filter @sodax/skills check:ai-structural` · (~30min)
- [ ] **P6.3** `BRIDGE_API.md` SDK doc — `sdk/docs/BRIDGE_API.md` · mirror `SWAPS_API.md` · verify: `test -f packages/sdk/docs/BRIDGE_API.md && rg -c 'sodax\.api\.bridge' packages/sdk/docs/BRIDGE_API.md` · (~40min)
- [ ] **P6.4** Routing row + feature list in sodax-sdk `SKILL.md` — `skills/sodax-sdk/SKILL.md` · mirror swaps-api row (L37) + list (L79) · verify: `pnpm --filter @sodax/skills check:ai-structural` · (~10min)
- [ ] **P6.5** Register bridge-api in skills `AGENTS.md` — `skills/AGENTS.md` · mirror swaps-api entries (L13/29/66) · verify: `pnpm --filter @sodax/skills check:ai-structural` · (~12min)
- [ ] **P6.6** Document `bridgeOptions` in `CONFIGURE_SDK.md` — `sdk/docs/CONFIGURE_SDK.md` · mirror swapsOptions (L147) + intro (L19) · verify: `rg -n 'bridgeOptions' packages/sdk/docs/CONFIGURE_SDK.md` · (~15min)
- [ ] **P6.7** Cross-link bridge-api in `BRIDGE.md` + `BACKEND_API.md` — `sdk/docs/BRIDGE.md`, `sdk/docs/BACKEND_API.md` · mirror SWAPS note + BACKEND_API L268-272 · verify: `rg -n 'BRIDGE_API' packages/sdk/docs/BACKEND_API.md packages/sdk/docs/BRIDGE.md` · (~20min)
- [ ] **P6.8** Document bridgeApi hooks in dapp-kit auxiliary-services — `skills/sodax-dapp-kit/.../features/auxiliary-services.md` + `auxiliary-services/SKILL.md` · mirror Swaps API subsection (L67-95/210) · verify: `pnpm --filter @sodax/skills check:ai-consistency` · (~30min)
- [ ] **P6.9** Add bridgeApi rows to dapp-kit reference tables — `skills/sodax-dapp-kit/.../reference/hooks-index.md` + `querykey-conventions.md` · mirror swapsApi rows (175-205) + keys (159-183) · verify: `pnpm --filter @sodax/skills check:ai-keys` · (~25min)
- [ ] **P6.10** Full skills gate — verify: `pnpm check:ai` · (~15min)

✅ **Gate:** `pnpm check:ai`

---

## Phase 7 — finalize (plan §7)

- [ ] **P7.1** Bridge e2e re-relay assertion (mirror swap test 2) — `sdk/src/e2e-tests/e2e-relay.test.ts` · mirror test 2 (L25-58) · verify: `cd packages/sdk && npx vitest run --config vitest.e2e.config.ts src/e2e-tests/e2e-relay.test.ts` *(needs live network/real data; otherwise a compile-only check)* · (~25min)
- [ ] **P7.2** Build all packages — verify: `pnpm build:packages` · (~10min)
- [ ] **P7.3** Full-repo typecheck — verify: `pnpm checkTs` · (~10min)
- [ ] **P7.4** Full-repo lint — verify: `pnpm lint` · (~10min)
- [ ] **P7.5** Full-repo unit tests — verify: `pnpm test` · (~20min)
- [ ] **P7.6** Circular-dependency check — verify: `pnpm check:circular-deps` · (~10min)
- [ ] **P7.7** Prepare + open PR (**ONLY on explicit user request**) — verify: `gh pr create --base feat/swaps-api-v2 --title 'feat(bridge): Bridge API v2 (gh-255)' --body-file <draft>` · (~20min)

✅ **Gate:** `pnpm build:packages && pnpm checkTs && pnpm lint && pnpm test && pnpm check:circular-deps`

---

## How to use

Do **one box at a time, top to bottom**. After each box, run its `verify:` and only tick
`[ ]`→`[x]` when green. Don't start the next box until the current one passes. `>` scaffold
exists = fill in the stub, don't recreate. Run each phase's **✅ Gate** before the next phase.
`useBackendSubmitTx` stays **default-OFF** the whole way; the demo never enables it.
</content>
