---
type: process
repo: sodax-sdks
github: 21
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Measured the actual fragmentation against `origin/main @ 3e7872a3` so the
  design argues from numbers. No code written.

## Findings

### The scale: ~161 exported hooks across 16 feature directories

`packages/dapp-kit/src/hooks/index.ts` re-exports 16 directories:

| dir | count | dir | count |
| --- | --- | --- | --- |
| `swapsApi/` | 23 | `staking/` | 18 |
| `dex/` | 16 | `mm/` | 14 |
| `shared/` | 13 | `bitcoin/` | 11 |
| `bridgeApi/` | 10 | `leverageYield/` | 10 |
| `partner/` | 10 | `backend/` | 10 |
| `swap/` | 8 | `migrate/` | 6 |
| `bridge/` | 5 | `sponsoring/` | 4 |
| `recovery/` | 2 | `provider/` | 1 |

**Swap and bridge each exist twice** — `swap/` (on-chain `SwapService`) alongside `swapsApi/`
(backend HTTP), and `bridge/` alongside `bridgeApi/`. Any controller design has to say which
lane it drives.

### What one swap form costs today

`apps/demo/src/components/swaps/SwapCard.tsx`, 792 lines, imports **17 symbols from
`@sodax/dapp-kit`** (`:21-45`) and **6 from `@sodax/wallet-sdk-react`** (`:46-53`). The ordered
wiring:

| # | step | where |
| --- | --- | --- |
| 1 | `useSodaxContext()` | :63 |
| 2 | `useXAccount` / `useWalletProvider` ×2 (both sides) | :84-87 |
| 3 | `useSwap()` | :95 |
| 4 | `useSwapAllowance({...})` | :98-103 |
| 5 | `useSwapApprove()` | :105 |
| 6 | `useStellarGate({...})` | :108-114 |
| 7 | `useNearStorageGate({...})` | :115-120 |
| 8 | `useSwapsApiSubmitTx()` | :129 |
| 9 | two manual Bitcoin-readiness `useState`s | :130-131 |
| 10 | `useXBalances` ×2 | :153, :165 |
| 11 | `useTradingWalletBalance` ×2 | :192-197 |
| 12 | `useQuote({...})` | :218 |
| 13 | build `CreateIntentParams` by hand (~36 lines, incl. a Bitcoin dst-address override) | :270-306 |
| 14 | `useEvmSwitchChain({...})` | :312 |
| 15 | approve + manual `result.ok` branch | :404-416 |
| 16 | submit, hand-destructure the response | :362-393 |
| 17 | the *other* submit path, calling `sodax.swaps.createIntent` **directly on the SDK** | :322, :344 |
| 18 | gate the button on all of it | :726-741 |
| 19 | status — **not** `useStatus` | see below |

The consumer is left owning **five conditional buttons** (Approve, Switch Chain, Swap, three
Stellar affordances, Register NEAR Storage), **four separate error `useState`s**
(`approveError`, `swapError`, `nearStorageError`, `stellarError`, :776-781), and a six-clause
`disabled` expression (:726-741) combining allowance, submitting, Bitcoin readiness on **both**
sides, `stellar.blocksAction` and `nearStorage.blocksAction`.

That `disabled` expression is the single best argument for the ticket and belongs verbatim in
any proposal.

### A consumer already reimplemented an SDK primitive rather than find it

`useStatus` is exported from `packages/dapp-kit/src/hooks/swap/` and has **zero usages in
`apps/demo`**. The demo hand-rolls `apps/demo/src/hooks/useSolverStatus.ts` — raw `fetch`
(:20), its own `MAX_POLLS = 40` (:14) and its own `refetchInterval` (:34) — and its header
comment admits it *"Mirrors the SDK's SolverApiService.getStatus contract"*.

This is exactly the failure mode #21 predicts, already happening inside our own demo. It is the
strongest evidence in the ticket's favour and it was not in the ticket.

### There is prior art, in a sibling package

No controller abstraction exists in dapp-kit: `git grep -iE "controller"` over
`packages/dapp-kit` and `apps/demo` → **zero hits**; `useReducer` / `xstate` / `createMachine`
across `packages/` and `apps/` → **zero**.

But `packages/wallet-sdk-react/src/useWalletModalStore.ts:9` is a documented discriminated-union
flow machine — "Discriminated union for the wallet-modal flow state machine", Zustand-backed,
`closed → chainSelect → walletSelect → connecting → success | error`, documented in
`docs/WALLET_MODAL.md`. That is the shape to copy.

The only existing composition primitives are `useStellarGate` (composes four hooks via
`resolveStellarGate`) and `useNearStorageGate` — right shape, too narrow. And
`useBitcoinTradingSetup` exists as the library-side Bitcoin abstraction, but **the demo does not
use it** — it wires `useTradingWalletBalance` directly and holds the readiness booleans itself.

### Chain quirks — where each lives now

| quirk | today |
| --- | --- |
| Bitcoin setup | `useBitcoinTradingSetup` (dapp-kit, inert unless Bitcoin) **plus** a ~200-line demo-local `BitcoinSetupPanel.tsx` mounted twice, reporting readiness up via `onReadyChange` |
| Stellar trustline | `useStellarGate` — good, but the consumer still renders 3 buttons and an error state |
| EVM chain switch | `useEvmSwitchChain` in a **different package** (`wallet-sdk-react`); consumer owns the "show Switch Chain instead of Swap" branch |
| NEAR storage | `useNearStorageGate` — same shape as Stellar |

### The cost side a proposal must carry

- `AGENTS.md:109` — public behaviour changes require `packages/skills` updates; `pnpm check:ai`
  gates it. Definition of done names `check:ai` explicitly.
- `packages/dapp-kit/AGENTS.md:99-107` — new hooks: place in the feature dir, use
  `useSodaxContext()`, precise query keys and invalidations, export from both barrels, **add
  mutations to `_mutationContract.test.ts`**, update skills docs.
- **`packages/dapp-kit` has no `docs/` directory** — consumer docs live entirely in
  `packages/skills/skills/sodax-dapp-kit/` (11 sub-trees). Five controllers is a substantial
  docs deliverable, not an afterthought.

## Changes During Work

None.
