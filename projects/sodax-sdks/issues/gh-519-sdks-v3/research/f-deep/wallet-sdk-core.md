---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, wallet]
---

# wallet-sdk-core — deep dive (feasibility, complexity, benefit)

1. wsc-1 is feasible. Private-key code adds 98–160 KB gzip (3.5–6.6%) to a multi-chain dapp: small in percent, but above the rubric's 50 KB line for B3. Injective's `MsgBroadcasterWithPk` (which pulls in ethers) is 57% of that today and 84% once sdk-2 lands. Tron's private-key code (#534) would add ~1 KB more to a wallet-sdk-react bundle. No consumer repo builds a private-key provider.
2. Unbundled ESM alone (sdk-2) removes another 108 KB from a wallet-sdk-react bundle, and 51 KB from the minimal swap dapp, where the sdk itself keeps bitcoinjs-lib. That weight is wallet-sdk-core's whole Bitcoin class and its libraries, kept alive by module-level side effects even though wallet-sdk-react never uses that class.
3. wsc-2 cuts required interface members from 35 to 26, or to 24 if the two non-RPC helpers also go. It breaks 6 consumer call sites (frontend 4, whitelabel 2) and the API-only example. All 6 have a replacement: `SpokeService` builds from public `@sodax/sdk` exports without `new Sodax()` (probe, EVM only). Only apps without `@sodax/sdk`, such as the API-only example, need a decision.
4. The send paths of Injective, NEAR and Sui already wait for inclusion or execution (library behaviour; NEAR's browser path relies on the wallet). Moving those waits out under wsc-2 would change what "submitted" means.
5. wsc-4: a viem WalletClient already works. The EIP-1193 adapter (54 lines) and the Wallet Standard adapter (32 lines) have no type errors of their own, but the probe's tsc run exits 2 on 20 errors in its copied wallet-sdk-core tree. No issue or consumer repo asks for them.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| wsc-1 | Feasible with caveats / Code-traced (bundle gain Proven by probe) | C4 | B3 | 3.0 (expand in 2.x) | 9 mixed-mode classes (10 with Tron); the browser gain is 98–160 KB gzip (~111 KB after sdk-2), mostly Injective (Tron ~1 KB more); no consumer repo signs with a private key in a browser |
| wsc-2 | Feasible with caveats / Code-traced (Sodax-free receipt wait Proven by probe on EVM) | C3 (C4 if chain clients ship outside `@sodax/sdk`) | B2 | 3.0 (internal callers in 2.x) | 35 → 26 required members (24 without the helpers); 3 in-repo calls, 1 public helper and 6 consumer receipt-wait calls, all replaceable today; apps without `@sodax/sdk` need a replacement |
| wsc-4 | Feasible / Proven (type-check of the adapter files only) | C2 | B1 | Later | WalletClient already supported; adapters are small; no demand found |

Method for every bundle number: esbuild 0.25.12 (from the `sodax-sdks-t2probe` store), `bundle+minify`, ESM, `platform: browser`, es2022, Node builtins external, react / react-query external. gzip is the node zlib default level, and 1 KB here is 1,024 bytes (`measure.mjs` divides by 1024). wallet-sdk-core is built from its **source** at 0181a053, copied to scratch twice:
- `asis`: unchanged;
- `browser`: private-key branches deleted by hand.

Context bundles use the t2probe dists of wallet-sdk-react and dapp-kit, with `@sodax/wallet-sdk-core` aliased to one of the two source trees. The t2probe sdk dist carries the T2 patch, so absolute dapp numbers differ from published 2.2.0. The deltas are the result. Scripts are listed in § Resume notes.

## wsc-1 · Private-key signers to server-only entries
**Bullet:** "Move private-key signers to server-only entries"  ·  **T-ids:** T6 (T6.2, T6.3, T6.4; T6.5 if wsc-3)

### Today
Each class picks its mode from the shape of the config in its constructor, so private-key code is reachable from every browser import. [verified]

| Class | Private-key path (`packages/wallet-sdk-core/src/wallet-providers/…`) | Libraries only that path needs |
| --- | --- | --- |
| EVM | guard `evm/EvmWalletProvider.ts:130-132`; constructor `:162-173` (`getEvmViemChain`, `http`, `createWalletClient`, `privateKeyToAccount` imported `:23`, used `:168`) | `viem/accounts` (@noble/curves, @noble/hashes), 12 `viem/chains` definitions |
| Solana | guard `solana/SolanaWalletProvider.ts:39-43`; `Keypair.fromSecretKey` `:64`; public `signTransactionWithKeypair` `:176-184`; `buildV0TxnWithKeypair` `:186-201`; the browser guard uses `instanceof Keypair` `:48` | none (same `@solana/web3.js`) |
| Sui | guard `sui/SuiWalletProvider.ts:32-34`; `Ed25519Keypair.deriveKeypair(mnemonics)` `:90`; signs with keypair `:116-122` | `@mysten/sui/keypairs/ed25519`, @scure/bip39 |
| Stellar | exported `isValidStellarPrivateKey` `stellar/StellarWalletProvider.ts:74-83`; constructor `:104-111`; signing `:143-156` | none (same stellar-sdk) |
| Stacks | guard `stacks/StacksWalletProvider.ts:30-32`; `makeContractCall`/`broadcastTransaction` `:110-127`; `getAddressFromPrivateKey` `:166-168`; `getPublicKey` works only with a private key `:172-177`, although `IStacksWalletProvider` requires it (`types/src/stacks/stacks.ts:234`) | signing half of `@sodax/libs/stacks/core` |
| ICON | `Wallet.loadPrivateKey` `icon/IconWalletProvider.ts:53`; `SignedTransaction` + `iconService.sendTransaction` `:90-92` | none: `import * as IconSdkRaw` `:3` ships all of icon-sdk-js in both modes |
| NEAR | guard `near/NearWalletProvider.ts:26-28`; `JsonRpcProvider`/`KeyPairSigner`/`Account` `:45-50`; submit `:92-100`; public fields `account?`, `rpcProvider?` `:38-39` | near-api-js (the browser path uses only a type, `:4`) |
| Bitcoin | **module-level** `bitcoin.initEccLib(ecc); ECPairFactory(ecc)` `bitcoin/BTCWalletProvider.ts:19-20`; `ECPair.fromPrivateKey` `:56`; `secp256k1.ecdsaSign` `:157`; `bip322.Signer.sign` `:170`; public `getPayment` `:177-209` | ecpair, secp256k1 (→ elliptic in browsers), bip322-js (→ bitcoinjs-message) |
| Injective | guard `injective/InjectiveWalletProvider.ts:42-51`; `PrivateKey.fromPrivateKey/fromMnemonic`, `new MsgBroadcasterWithPk`, `getNetworkEndpoints` `:103-114`; **the browser path also tests `instanceof MsgBroadcasterWithPk`** at `:177`, `:190`, `:222`, `:270` (value import `:26`); the private key signs a raw SignDoc `:271-275` | `MsgBroadcasterWithPk` (pulls ethers, aes-js, axios, extra protobufs), `@injectivelabs/networks` |
| Tron (#534 head `ecbdeddc`) | `tron/TronWalletProvider.ts:2,56,116,128` (`privateKeyToAccount`, `sign`); guard `:25-27`; base58check helpers `:35-58` serve only the private-key address | `viem/accounts` (@noble/curves, @noble/hashes) |

**Bundle cost of the private-key code** [verified, probe], gzip, with the change in npm packages in the bundle. For a dapp, the context rows are the ones that matter.

| Bundle | as-is → browser-only | Δ |
| --- | --- | --- |
| wallet-sdk-core root on its own (all 9 classes) | 1,225.5 → 841.5 KB; packages 115 → 52 | −384.0 (−31%) |
| one class on its own: EVM / Solana / Sui / Stellar / Stacks | 123.2→39.7 / 88.0→87.8 / 132.6→112.0 / 274.9→274.6 / 58.8→48.3 | −83.5 / −0.2 / −20.6 / −0.3 / −10.5 |
| one class on its own: ICON / NEAR / Bitcoin / Injective | 147.6→147.5 / 39.7→0.7 / 209.7→104.0 / 268.8→114.6 | −0.1 / −39.0 / −105.7 / −154.2 |
| **wallet-sdk-react root** (`SodaxWalletProvider`) | 2,440.8 → 2,280.4 KB; packages 233 → 186 | **−160.4 (−6.6%)** |
| ↳ per chain: Injective / Bitcoin / Stacks / NEAR / EVM / Sui | | −92.2 / −49.3 / −10.2 / −5.5 / −0.9 / ~0 |
| wallet-sdk-react root, with wallet-sdk-core unbundled and `sideEffects: false` (sdk-2 simulated) | 2,333.2 → 2,222.3 KB; packages 183 → 180 (ethers, aes-js, http-status-codes) | **−110.9 (−4.8%)**; Injective −93.1, Stacks −11.4, NEAR −5.7, EVM −1.0 |
| minimal swap dapp (dapp-kit hooks + wallet-sdk-react) | 2,855.7 → 2,706.5; with sdk-2 simulated 2,804.5 → 2,706.5 | −149.2 (−5.2%); −98.0 (−3.5%) |
| EVM-only v3 shape (EvmWalletProvider + wagmi `createConfig`/`injected` + viem clients) | 129.9 → 125.4 | −4.5 (−3.5%) |
| Tron (#534) class on its own | 27.2 → 1.0 KB; packages 4 → 1 (viem, @noble/curves, @noble/hashes leave) | −26.2 |
| wallet-sdk-core root with Tron (10 classes) | 1,226.6 → 842.3 KB; packages 115 → 52 | −384.3; Tron adds 1.1 KB to the as-is root and 0.3 KB to the gain [derived: 1,226.6 − 1,225.5; 384.3 − 384.0] |
| browser-only root, Tron left as-is vs split | 854.7 → 842.3 KB | −12.4: an unsplit Tron class re-adds `viem/accounts` |
| wallet-sdk-react root + Tron class (simulates #534's `chainRegistry.ts:419`) | 2,282.3 → 2,281.2 KB; packages 186 → 186 | −1.1: viem and noble already ship in that bundle |

Notes:
- Sanity check: the real wallet-sdk-core dist in the wallet-sdk-react context is 2,510.1 KB. It inlines `@sodax/types` again.
- sdk-2 alone takes the wallet-sdk-react root from 2,440.8 to 2,333.2 KB (−107.6) [derived]. In that bundle it drops the whole Bitcoin class, bitcoinjs-lib and bip174 included. In the minimal swap dapp it saves only 51.2 KB (2,855.7 → 2,804.5) [derived], because the sdk keeps bitcoinjs-lib, bip174 and `@bitcoinerlab/secp256k1`; only the private-key libraries leave [verified, `diffpkgs.mjs` on `dapp-asis` / `dapp-sdk2-asis`].
- `sideEffects: false` is already set (`packages/wallet-sdk-core/package.json:48`). The single-file dist (`tsup.config.ts:7`) is what keeps the unused classes, so the sdk-2 rows simulate per-file output plus that flag [verified].
- Tron rows [verified, probe]: `TronWalletProvider.ts` and `types.ts` from `origin/pr-534` (`ecbdeddc`) copied into two scratch trees; the browser copy has the `privateKey` branches, `viem/accounts` and the base58 helpers removed by script. Same esbuild settings. The wallet-sdk-react row adds the class export to the `SodaxWalletProvider` entry with wallet-sdk-core aliased to `browser-src`; it does not build #534's wallet-sdk-react code.
- In the Node builtins actually referenced by the output (grep of the bundles), the Bitcoin class as-is needs `buffer, crypto, events, stream, string_decoder, util`; browser-only it needs `buffer` alone [verified].

**Install** [verified]. npm 11.6.0 with `--ignore-scripts --before=2026-10-05`. Inputs: the 19 external dependencies of wallet-sdk-core at catalog versions.

| Install | Size (`du -sk`) | Packages | `npm audit`: flagged packages · distinct advisories |
| --- | --- | --- | --- |
| all 19 deps | 503,200 KB | 396 | 30 flagged (13 low, 5 moderate, 12 high) · 51 advisories (41 of them axios) |
| without ecpair, secp256k1, bip322-js | −4.0 MB | −13 | −2 low flagged packages (bip322-js, bitcoinjs-message, flagged only through elliptic) · 51 → 51 advisories |
| also without near-api-js | −10.9 MB (−2.2%) | −31 | — (28 flagged · 51 advisories) |

The 30 is npm's `metadata.vulnerabilities` total, which counts flagged packages, not advisories. The advisory count is the distinct `via[].url` values [verified, `wf-verify-wsc/audit.mjs`]. wsc-1 removes no advisory.

These savings need the packages to leave `dependencies`. A `./server` subpath alone saves no install size [derived: npm installs every entry in `dependencies`].

What stays installed anyway [verified]:
- near-api-js: it is also a dependency of `@sodax/sdk` and `@sodax/wallet-sdk-react`, imported at `sdk/src/shared/services/spoke/NearSpokeService.ts:30` and `wallet-sdk-react/src/xchains/near/NearXService.ts:4`.
- elliptic (GHSA-848j-6mx2-7j84; the audit data lists the affected range as `<=6.6.1` and no patched version as of the 2026-10-05 snapshot): it comes through `@cosmjs/crypto` (Injective) and icon-sdk-js.
- secp256k1@5.0.1: icon-sdk-js depends on it (`npm ls elliptic`).

**Who uses private-key providers** [verified]:
- **sodax-backend@985959e9:** no package depends on `@sodax/wallet-sdk-core` (`git grep -c wallet-sdk-core origin/development | wc -l` → 0). It signs with viem `privateKeyToAccount` and Stellar `Keypair` directly in task-executor and sponsoring-api.
- **sodax-frontend@1b915ec7:** no imports.
- **whitelabel@5e1fbba:** lists `2.0.0-rc.12` in `package.json` with no source imports.
- **wallet-sdk-react:** builds 8 classes, all in browser mode: `chainRegistry.ts:274,320,345,379,397`, `EvmHydrator.tsx:87`, `SolanaHydrator.tsx:75`, `SuiHydrator.tsx:75`. It ships its own 4 Bitcoin providers (`xchains/bitcoin/{Xverse,Unisat,OKX,BitcoinHana}XConnector.ts`).
- **Private-key users in the repo:**
  - `apps/node-cjs/src/index.ts:23-27` (ICON, a CJS smoke test);
  - `apps/node` (dead code);
  - `docs/quickstart.mdx:48-52`, which leads with a private key;
  - `rg -l privateKey docs --glob '*.md*' | wc -l` → 36 doc files;
  - #541 R4/AC2 asks for private-key Tron scripts.

### Change
From one mixed class per chain, to a browser class with no private-key references plus a server class:

```ts
// before
import { InjectiveWalletProvider } from '@sodax/wallet-sdk-core';
new InjectiveWalletProvider({ secret: { mnemonics }, chainId, network });
// after (path depends on wsc-3: wallet-sdk-core/server or @sodax/chain-injective/server)
import { PrivateKeyInjectiveWalletProvider } from '@sodax/wallet-sdk-core/server';
new PrivateKeyInjectiveWalletProvider({ secret: { mnemonics }, chainId, network });
// browser apps: unchanged code, smaller bundle
```

### Feasibility — Feasible with caveats · Code-traced
- **Proven [verified]:** browser-only variants of all 9 classes bundle, and every symbol wallet-sdk-react imports still resolves.
- **Not proven:** they were bundled, not executed.
- **Caveat 1: Injective entanglement.** The browser class needs a mode field or a separate class in place of the four `instanceof` checks. The type `InjectiveWallet = { msgBroadcaster: MsgBroadcaster | MsgBroadcasterWithPk }` (`injective/types.ts:66-68`) is exposed through the public `wallet` field (`InjectiveWalletProvider.ts:90`).
- **Caveat 2: the gain needs a break.** The bundle gain arrives only when browser code stops referencing private-key code. In 2.x that means one of:
  - (a) a new browser-only entry that wallet-sdk-react switches to (additive);
  - (b) a lazy `import()` of the private-key path, which needs entry splitting in tsup (`splitting: false` today, `tsup.config.ts:7`). Unproven.
- **Caveat 3: public surface to remove in 3.0:**
  - `NearWalletProvider.account` / `rpcProvider`;
  - Solana `signTransactionWithKeypair`;
  - `isValidStellarPrivateKey`;
  - Bitcoin `getPayment`;
  - `isSecretInjectiveWalletConfig`;
  - the private-key variants of the config unions.
- **Decision (wsc-3):** where the server classes live.
- **Note on #540:** its non-goal "private-key accounts cannot batch" (`EvmWalletProvider.ts:224-225,239-243`) becomes structural: the server class omits the optional batch methods.

### Complexity — C4
**PRs.**

| PR | Release | Scope | Size [judgement] |
| --- | --- | --- | --- |
| 1 | 2.x | `./server` scaffold, plus EVM, Solana, Sui, Stellar and Stacks server classes | ~400–600 LOC |
| 2 | 2.x | Bitcoin, Injective, NEAR, ICON and Tron | ~400–600 LOC |
| 3 | 2.x | browser-only classes, consumed by wallet-sdk-react; captures the bundle gain early | ~300 LOC |
| 4 | 3.0 | remove the root private-key branches, narrow the types, migrate docs and skills | — |

- **Code to split.** Provider production code is 2,121 lines (`wc -l` of the 9 classes). Their tests are 2,795 lines in 9 files, and they must split [verified, `wc -l`]. The browser-only prototype deletes 358 non-blank lines and adds 37 across the 9 classes, which fits PR 3's ~300 LOC [verified: `diff -ru proto/asis-src proto/browser-src -x '*.test.ts' | grep -c '^-[^-]'`, and `'^+[^+]'` for additions].
- **Coordination:**
  - wsc-3: the location;
  - #534 (gcranju): Tron adds a tenth class;
  - x-3: a codemod for imports and class renames.
- **What breaks:** scripts, 36 doc files, and `apps/node-cjs`.
- **Top risks:**
  1. During the expand phase, two code paths per chain sign the same transactions. Injective already signs differently by mode (`:263-284`).
  2. Churn for Node users who see no benefit.
- **Against earlier points:** T6.2 + T6.3 + T6.4 = 11 points (first pass: L). That fits C4 only once the 3.0 docs migration and the wsc-3 move are counted.

### Benefit — B3
- **P1 (EVM-only):** today it ships the multi-chain root anyway, so see P2. In the v3 shape the gain is −4.5 KB gzip [verified], which is negligible.
- **P2 (multi-chain dapp):**
  - bundle: −160 KB gzip today (−6.6%), or −111 KB with sdk-2 (−4.8%). That is ≈0.57–0.82 s at 1.6 Mbit/s [derived: KB × 8.192 kbit ÷ 1,600 kbit/s]. Injective is 57% of the first and 84% of the second [derived: 92.2 ÷ 160.4, 93.1 ÷ 110.9];
  - packages: −47 npm packages in the bundle today, −3 with sdk-2 [verified].
- **Why B3:** the measured gain on the common path is 98–160 KB gzip, above the rubric's 50 KB line. That path is the `SodaxWalletProvider` root, which both sodax-frontend (`apps/web/providers/wallet-providers.tsx:5`) and whitelabel (`src/providers/wallet-provider.tsx:4`) mount [verified]. It is not B4: the gain is under 200 KB, wsc-1 removes no advisory, and no bullet in the Dependencies table waits on it [judgement]. Real Next.js builds of those apps were not measured, and the gain moves into lazy chunks if wsr-1 lazy-loads chains [judgement].
- **P3 (scripts):** gains an explicit server entry and pays an import rename. The backend gets no benefit (0 uses).
- **P4 (API-only):** none.
- **P5 (maintainers):**
  - cleaner classes;
  - ~1k LOC more classes during expand.
- **P6 (AI agents):** a clearer split for skills to teach.

**Security, precisely:**
- Shipping signer code leaks no key. A key reaches a bundle only if app code puts it there [judgement].
- **Real gains:**
  - less third-party code running in the dapp origin: ethers, aes-js and bip322-js leave the wallet-sdk-react bundle [verified, `byPkg` of `wsr-asis` / `wsr-browser`]. axios leaves only the Injective class on its own; other code keeps it in the wallet-sdk-react and dapp bundles [verified]. A compromised release of one of them could tamper with calldata before the wallet prompt [judgement];
  - a guardrail: a server-only export condition can turn browser use into a build error [judgement; needs a prototype].
- **No exploitable bug is fixed.**

### Recommendation
- **2.x:** start with Injective. Moving `MsgBroadcasterWithPk` out of the browser path captures ~84% of the gain left after sdk-2 (57% of today's). Ship browser-only classes for wallet-sdk-react together with sdk-2.
- **3.0:** remove the root private-key branches once wsc-3 settles the location.
- **Wording:** "Move private-key and mnemonic signers to server-only entries; browser classes never reference them".

### Corrections to earlier research
- **c-wallet T6, "Stacks: no private-key-only libs":** the signing half of `@sodax/libs/stacks/core` is private-key-only and weighs 10.5–11.4 KB gzip.
- **c-wallet T6 / T6.3, "near-api-js is used only by the private-key path" and "`secp256k1` → noble drops elliptic":**
  - near-api-js is also a dependency of the sdk and wallet-sdk-react;
  - icon-sdk-js keeps secp256k1 and elliptic installed.
- **First pass, "the Injective browser path references `MsgBroadcasterWithPk`":** confirmed. It costs 92–154 KB gzip.
- **New:** in wallet-sdk-react bundles, the Bitcoin libraries ship because of `BTCWalletProvider.ts:19-20` plus the flat dist, not because of wallet-sdk-react's usage. sdk-2 removes the whole unused class. wsc-1 alone removes only its private-key part (−49.3 KB in the wallet-sdk-react root) and adds nothing for Bitcoin once sdk-2 lands [verified].

## wsc-2 · Signing-only wallet interfaces
**Bullet:** "Keep wallet interfaces focused on signing and submission capabilities; move RPC reads and confirmation polling to chain clients"  ·  **T-ids:** T23 (T23.1, T23.2)

### Today
Read and polling members in `packages/types/src` [verified]:

| Interface | Chain RPC reads and polls | Non-RPC helpers |
| --- | --- | --- |
| EVM | `waitForTransactionReceipt` `evm/evm.ts:93` | — |
| ICON | `waitForTransactionReceipt` `icon/icon.ts:66` | — |
| Stellar | `waitForTransactionReceipt` `stellar/stellar.ts:110` | — |
| Solana | `waitForConfirmation` `solana/solana.ts:133`, `getBalance` `:140`, `getTokenAccountBalance` `:141` | `getAssociatedTokenAddress` `:139` (PDA derivation) |
| Sui | `viewContract` `sui/sui.ts:298`, `getCoins` `:306` | — |
| Stacks | `getBalance` `stacks/stacks.ts:235` | — |
| NEAR | — | `getRawTransaction` `near/near.ts:103` (a descriptor; `NearWalletProvider.ts:78-81`) |
| Tron (#534) | `waitForTransactionReceipt` `tron/tron.ts:66` | — |
| Injective, Bitcoin | — | — |

The EIP-5792 members (`getAtomicBatchSupport`, `sendAtomicBatch`, `waitForBatch`) are wallet RPC and stay; #540 lists changing them as a non-goal.

**Hidden reads and waits inside signing and submission** [verified]:
- Solana `buildV0Txn` fetches a blockhash (`SolanaWalletProvider.ts:145,194`).
- Sui `signAndExecuteTxn` builds against gRPC, dry-runs and executes (`SuiWalletProvider.ts:106-135,174-188`).
- Injective `sendTransaction` calls `TxGrpcApi.broadcast` (`:243`), which polls for inclusion (`fetchTxPoll`, sdk-ts 1.18.14 `dist/esm/tx-ByxSGpt3.js:359`). The browser paths poll too: each `MsgBroadcaster` broadcast path in wallet-core 1.18.14 ends in `fetchTxPoll` (`dist/esm/index.js:448,541,584,671,687,845`) or, on the Keplr/Leap Ledger path, in `TxGrpcApi.broadcast` (`:759`) [verified].
- The NEAR private-key path waits `'FINAL'` (`NearWalletProvider.ts:15,97`). The browser path returns the wallet's `FinalExecutionOutcome` (`:109-123`; typed in near-connect 0.10.0 `build/types/index.d.ts:143`), so how final it is depends on the wallet [verified types; behaviour is judgement].
- Stacks `makeContractCall` fetches the nonce and fee when they are not passed (`@stacks/transactions` 7.3.1 `dist/esm/builders.js:211-218`; the private-key path passes neither, `StacksWalletProvider.ts:114-123`).

**Callers through the wallet interface.** Command: `rg "[.?]<member>\b"`, receivers checked by hand [verified].

| Where | Calls |
| --- | --- |
| sdk | 1: `leverageYield/LeverageYieldService.ts:3168`. Its comment at `:3156-3166` explains why: `spoke.verifyTxHash` does not wait on EVM |
| sdk public helper | 1: `shared/utils/evm-utils.ts:15-19`. Its only importer is dead code (`apps/node/src/near.ts:18,299`); none in packages or the 3 consumer repos |
| dapp-kit | 2: `utils/approvalPlan.ts:99,119`. #511 routes its new API-lane hook through it |
| wallet-sdk-react | 0 |
| `apps/swap-api-example` | 1: `SwapCard.tsx:54`. It has no sdk dependency |
| `apps/node` (dead code) | 24 |
| sodax-frontend | 4, all in `waitForTxFinality`: `apps/web/lib/swaps-api-sign.ts:173,175,177,179`. Its comment `:158-165` relies on the Sui, NEAR and Injective sends already waiting |
| whitelabel | 2: `src/components/swap/swap-confirm.tsx:176`, `src/hooks/use-bridge.ts:52` |
| docs and skills | 18 lines in 11 files; 19 with the NEAR `getRawTransaction` helper (`sodax-wallet-sdk-core/…/sign-and-broadcast.md:145`) |

The non-receipt reads have **0** non-test callers through a wallet receiver in packages, apps and the 3 consumer repos [verified, rg / git grep; the wallet-sdk-core tests do call them]. Inside the sdk, newer code already waits through the spoke:
- `SwapService.ts:1148` (`this.spoke.waitForTxReceipt`);
- #512's tests mock `sodax.spoke.waitForTxReceipt`.

**Replacement that exists.** `SpokeService.waitForTxReceipt` (`SpokeService.ts:1273`) dispatches per chain. It needs a `ConfigService`. `Sodax` builds one (`shared/entities/Sodax.ts:68`), but apps can build it too [verified, probe]:
- `ConfigService`, `BackendApiService`, `EvmHubProvider`, `SpokeService`, `EvmSpokeService` and `sodaxConfig` are all public exports of `@sodax/sdk` (`sdk/src/index.ts:2,6,15`, `shared/index.ts:2,4,5`, `shared/entities/index.ts:6`, `backendApi/index.ts:9`, `shared/services/spoke/index.ts:2-3`).
- The `api` argument of `ConfigService` is accepted but unused (`ConfigService.ts:84-86,137-157`).
- Runtime probe (t2probe CJS dist, Node 22.15). The T2 patch touches none of these four files; it only moves `initEccLib` into the `BitcoinSpokeService` constructor, which `SpokeService` runs, and that call does no I/O. The probe builds `new ConfigService({ api: undefined, config: sodaxConfig })`, then `new EvmSpokeService(config)` and `new SpokeService({ config, hubProvider: new EvmHubProvider({ config }) })`. Construction made 0 `fetch` calls (counted by wrapping `globalThis.fetch` after the module loaded; other transports were not instrumented). Both `EvmSpokeService.waitForTransactionReceipt` and `SpokeService.waitForTxReceipt` returned `ok: true, status: 'success'` for a live Base mainnet transaction. Scope: the probe takes the first transaction of the latest block, which on Base is the already-mined L1-attributes deposit (type `0x7e`). It shows that the Sodax-free path returns a receipt. It does not show waiting for a pending transaction or reporting a revert. Re-run by the verifier on 2026-10-19 with the same result.
- Type probe (tsc 5.5.4, strict, against `t2probe/packages/sdk/dist/esm/index.d.ts`): the typed form `new ConfigService({ api: new BackendApiService(sodaxConfig.api), config: sodaxConfig })` plus `SpokeService` compiles with no casts, and a negative file fails as expected. A second negative file from the verifier also fails on the `SpokeService` and `waitForTxReceipt` types, so they are not `any`.
- So a chain client works without `Sodax`, but not without the `@sodax/sdk` package. sodax-frontend (`apps/web/package.json:48`) and whitelabel (`package.json:24`) both depend on `@sodax/sdk`; `apps/swap-api-example` does not [verified].

There is duplicate receipt code: `EvmWalletProvider.ts:309-325` and `EvmSpokeService.ts:325-342` [verified].

### Change
- Remove the reads.
- Move the receipt waits to the spoke for SDK flows.
- Make the Solana member `signTransaction(bytes)` instead of `buildV0Txn`. The spoke already builds v0 transactions (`SolanaSpokeService.ts:340-356`).

```ts
// before (whitelabel, swap-confirm.tsx:176)
await walletProvider.waitForTransactionReceipt(approveResult.value);
// after
await sodax.spoke.waitForTxReceipt({ txHash: approveResult.value, chainKey: intentParams.srcChainKey });
```

### Feasibility — Feasible with caveats · Code-traced
- **In-repo:** easy (3 calls, plus the public helper in `evm-utils.ts`).
- **The 6 consumer call sites can move today** to `sodax.spoke.waitForTxReceipt` or to a Sodax-free `SpokeService` (probe above).
- **The "chain clients" part needs a decision** only for apps without `@sodax/sdk`. Options:
  - (a) keep receipt waits as optional wallet members;
  - (b) ship read clients outside `@sodax/sdk` (a new API; best placed in sdk-1 chain packages). Inside the sdk this already works; at most a small factory would hide the unused `api` argument;
  - (c) document per-chain recipes: a viem `publicClient`, Solana `confirmTransaction`, Horizon, or polling `swapsApi.checkAllowance` (`swaps-api/src/client.ts:122`).
- **Embedded waits:** Injective, NEAR and Sui wait inside their sends. Changing that changes what the frontend relies on, so keep it and document it [judgement].

### Complexity — C3
**PRs.**

| PR | Release | Scope | Size |
| --- | --- | --- | --- |
| 1 | 2.x | move internal callers to the spoke; deprecate members with JSDoc | ~80 LOC; conflicts with #511/#512 in `LeverageYieldService.ts` and `approvalPlan.ts` |
| 2 | 3.0 | remove members from 7 interfaces (with Tron), the classes, 21 read-member test calls (`rg -c`) and the fakes | — |
| 3 | 3.0 | Solana `signTransaction(bytes)` | — |
| 4 | 3.0 | docs (18–19 lines) and the consumer migration (6 call sites) | — |

- **If option (b) ships clients outside `@sodax/sdk`:** C4. A factory inside the sdk stays within C3 [judgement].
- **Top risks:**
  1. Apps without `@sodax/sdk` (for example `apps/swap-api-example`) lose their only receipt path.
  2. The Solana signature change ripples into the sdk's deposit and send paths (`SolanaSpokeService.ts:197,333`), which move funds, and 15 test lines that name `buildV0Txn` (`rg -c`). wallet-sdk-react passes the adapter state through unchanged (`SolanaHydrator.tsx:75-79`), so its wiring should not change [verified call sites; impact is judgement].
- **Against earlier points:** T23.1 + T23.2 = 5 points.

### Benefit — B2
- **Custom wallet authors:** required members fall from 35 to 26, or to 24 with the helpers also gone (`members.py`) [verified].

  | Chain | Required now → after |
  | --- | --- |
  | Solana | 8 → 4 |
  | Sui | 4 → 2 |
  | EVM | 3 → 2 |
  | ICON | 3 → 2 |
  | Stellar | 3 → 2 |
  | NEAR | 3 → 2 |
  | Stacks | 4 → 3 |

  Sui and Solana authors still need RPC access to submit. Today's custom implementers are 4 Bitcoin classes (unaffected) and test fakes.
- **P5 (maintainers):** one receipt path instead of two, and it removes inconsistent read semantics, for example Stacks `getBalance` returning `0n` on error (`StacksWalletProvider.ts:179-197`).
- **P2:** no bundle effect.
- **P4:** negative for apps without `@sodax/sdk`, unless option (a) or (c). Apps that already have the sdk keep a receipt path through `SpokeService` [verified by probe for EVM; the other chain branches are code-traced].

### Recommendation
- **2.x:** move internal callers to the spoke now, and land it after #511/#512.
- **3.0:** remove the zero-caller reads, and keep EVM, Stellar and ICON receipt waits optional (option a + c).
- **Wording:** "Wallet interfaces only sign and submit; SDK flows wait through chain clients, and receipt waits stay optional for API-only apps".

### Corrections to earlier research
- c-wallet T23 listed Solana `getAssociatedTokenAddress` as a read. It does no RPC.
- c-wallet T23 said Injective has "none beyond send/sign". Its send polls for inclusion.
- First pass, "frontend and whitelabel call the waits": confirmed and counted (4 + 2).
- This report's first version said the `ConfigService` that `SpokeService` needs is built only by `Sodax`. The probe shows apps can build it from public exports, so the API-only gap is limited to apps without `@sodax/sdk`.

## wsc-4 · Standard wallet adapters
**Bullet:** "Add adapters for EIP-1193 providers, viem WalletClient and Solana Wallet Standard"  ·  **T-ids:** T32 (T32.1)

### Today
- **viem WalletClient: already supported** through `{ walletClient, publicClient }` (`evm/types.ts:51-55`; `EvmWalletProvider.ts:175-184`) [verified]. The config is named "BrowserExtension", but it also accepts server-side KMS/MPC viem accounts. The `publicClient` is used only by the receipt wait (`:216`).
- **Chain binding:** for a json-rpc (wallet) account, viem asserts that the client's chain matches the wallet's chain on every send (`viem@2.29.2 actions/wallet/sendTransaction.ts:209-216`) [verified]. So an EIP-1193 wrapper must rebuild on `chainChanged`.
- **EIP-5792 fallback:**
  - a json-rpc account enables batches (`:295-297`);
  - capability errors read as `'unsupported'` (`sdk/src/shared/utils/evmAtomicBatch.ts:22-31`);
  - swap falls back to sequential (`SwapService.ts:823-834,884-893`);
  - other features follow under #540.
- **Solana:** the browser config is `{ wallet: { publicKey, signTransaction }, endpoint }` (`solana/types.ts:4-7,29-33`).
  - `@solana/wallet-adapter-react` 0.15.35 already wraps Wallet Standard wallets. `@solana/wallet-standard-features@1.3.0` is present transitively.
  - Sui already takes a Wallet Standard-style `signTransaction` callback (PR #367).
- **Demand: none found.**
  - The `gh issue list --state all --search "eip-1193 OR wallet standard"` search matched 6 issues. Two mention the terms, and neither asks for an adapter: #456 (Privy) says EIP-1193 wallets should come in as a wagmi connector, not a new core class; #368 mentions the `@mysten/wallet-standard` dependency.
  - Consumers: 0 uses. The frontend only maps EIP-1193 error codes.
  - PR #163 (wallet-hw) builds EIP-1193 providers, but for wagmi connectors.

### Change
`fromEip1193(provider, { chainKey })`, `watchEip1193(…)`, and `fromWalletStandard(wallet, account, endpoint)`.

```ts
const evm = await fromEip1193(window.ethereum, { chainKey: ChainKeys.BASE_MAINNET }); // no wagmi
const sol = fromWalletStandard(phantom, phantom.accounts[0], rpcUrl);                  // no wallet-adapter
```

### Feasibility — Feasible · Proven (type-check of the adapter files only)
- **Prototypes:** `eip1193.ts` (54 lines) and `walletStandardSolana.ts` (32 lines), checked with tsc 5.5.4 (strict, Bundler resolution, t2probe node_modules). The two files have 0 errors, but the run exits 2 on 20 errors, all in the copied wallet-sdk-core tree (`adapters/src/core`). The probe's `paths` mapping skips package `exports`, so subpaths of `@mysten/sui`, `@sodax/libs/stacks` and `near-api-js` do not resolve, and `secp256k1` has no types. The negative test fails on its 2 expected lines. A second negative file from the verifier confirms that the EVM and Solana config types and both adapter signatures are real, not `any` [verified, re-run 2026-10-19].
- **Not run against a wallet.**
- **Decision:** whether `fromEip1193` switches chains itself or only rebinds.

### Complexity — C2
- 1–2 PRs, ~200 LOC plus tests, additive.
- Needs a manual wallet test.
- Risk: chain and account event races.
- Earlier estimate: T32.1 = 3 points. That matches.

### Benefit — B1
**Bundle** [verified]:
- `fromEip1193` + provider: 123.2 KB gzip. A hand-written viem setup is 122.9 KB, and the wagmi-based one is 129.9 KB.
- Wallet Standard Solana: 88.6 KB, against 121.4 KB through `@solana/wallet-adapter-react`.

**Who gains:** non-React apps and P4. P1/P2 React apps gain nothing. P6 agents already pass viem accounts.

**Why B1:** there is no demand evidence.

### Recommendation
Later, and additive. Build the Solana adapter after wsc-2, so it targets `signTransaction(bytes)`, which matches `solana:signTransaction`.

**Wording:** "Add EIP-1193 and Solana Wallet Standard adapters (viem WalletClient already works)".

### Corrections to earlier research
- The client-usage T32 snippet `fromWalletClient(walletClient)` also needs a `publicClient` until wsc-2 lands.
- First pass, "Solana is ~30 lines": confirmed (32).

## Dependencies between these bullets

| From | To | What |
| --- | --- | --- |
| wsc-1 | wsc-3 | Where the server classes live |
| wsc-1 | sdk-2 | sdk-2 removes the unused Bitcoin class (−107.6 KB in the wallet-sdk-react root, −51.2 KB in the swap dapp); wsc-1 then removes −110.9 / −98.0 KB |
| wsc-1 | sdk-5 | The ICON delta is ≈0 until icon-sdk-js leaves |
| wsc-1 | sdk-7 | Bitcoin private-key polyfills |
| wsc-1 | #534 | Tron is a tenth class |
| wsc-1 | x-3 | Codemod |
| wsc-2 | #540, #511, #512 | The shared batch helper must wait through the spoke |
| wsc-2 | sdk-1, api-2, api-3 | Chain clients and receipts for API-only apps |
| wsc-2 | sdk-10 | Fakes shrink |
| wsc-2 | dk-2 | Lifecycle waits |
| wsc-4 | wsc-2 | Optional `publicClient`; Solana bytes signer |
| wsc-4 | wsr-1, wsr-5 | Adapters; Privy exposes EIP-1193 |

## Not verified
- Browser-only variants and adapters were bundled or type-checked, never executed.
- The Tron browser-only variant was bundled, not run; #534's own wallet-sdk-react Tron code was not bundled.
- The Sodax-free receipt probe ran on EVM (Base) only, on an already-mined deposit transaction; other chain branches of `SpokeService.waitForTxReceipt`, pending transactions and reverts were not run.
- Real consumer builds (the Next.js bundles of sodax-frontend and whitelabel) were not measured; the bundle rows use synthetic entries.
- npm installs cover only wallet-sdk-core's own dependencies.
- External npm users of private-key providers are unknown.
- PR LOC figures are judgement; only the browser-only deletion (358 lines) was measured.
- Whether sdk-ts exposes `MsgBroadcasterWithPk` on a subpath (for the lazy-load option) is unknown.

## Resume notes
**Scratch root:** `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-wsc/`

| Path | What |
| --- | --- |
| `scripts/measure.mjs` | Run as `node measure.mjs <out> label=entry[@alias=<srcDir>]` |
| `scripts/diffpkgs.mjs` | Diffs two `.res.json` files |
| `scripts/members.py` | Counts interface members; arg: `<types/src>` |
| `scripts/install.sh` | Install-size probe |
| `proto/{asis-src,browser-src,only-<chain>,se-*}` | Source trees (`se-*` adds `sideEffects: false`) |
| `entries/` | Bundle entries |
| `out/{cls,ctx,ad}/*.res.json` | Bundle results |
| `out/doc-reads.txt` | Doc lines that use wallet read members |
| `installs/*/{size.kb,pkgs.count,audit.json}` | Install results |
| `adapters/src/*.ts` with `tsconfig*.json` | Adapter prototypes; check with `tsc` from `t2probe/node_modules/.pnpm/typescript@5.5.4` |

PR heads were fetched as `origin/pr-{511,512,534}` in the `sodax-sdks-v3feas` repo.

**Finish pass scratch:** `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-wsc/`

| Path | What |
| --- | --- |
| `tron-{asis,browser}/` | Tron source trees from `origin/pr-534` |
| `entries/{asis,browser}-tron.ts`, `root-*.ts`, `wsr-tron-*.mjs` | Tron bundle entries; measured with `deep-wsc/scripts/measure.mjs` |
| `out/*.res.json` | Tron bundle results |
| `probe/no-sodax.cjs` | Runtime probe: receipt waits without `new Sodax()` (`node no-sodax.cjs`; reads a live Base block) |
| `probe/no-sodax.ts`, `probe/bad.ts`, `probe/tsconfig*.json` | Type probe and its negative check |

Done:
- **wsc-1:** Tron measured (§ Bundle cost, Tron rows).
- **wsc-2:** Sodax-free `EvmSpokeService` / `SpokeService` construction and receipt wait probed (§ Replacement that exists).

Still open (optional, no score depends on them):
- **wsc-1:**
  - ~~Measure LOC~~ done in the verification pass: −358 / +37 non-blank lines.
  - Run each browser-only class under vitest with fakes.
- **wsc-2:**
  - Draft the Solana `signTransaction(bytes)` diff.
  - Run the Sodax-free probe on a non-EVM chain.
- **wsc-4:**
  - Run `fromEip1193` against a browser wallet (Playwright plus MetaMask test build).
  - Check the `chainChanged` rebuild.

## Verification (2026-10-19)

This was an adversarial pass against the rubric, the code at `0181a053`, `origin/pr-534` (`ecbdeddc`), the three consumer repos and the earlier scratch outputs. Verifier scratch: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-wsc/`. It holds `audit.mjs`, `out/` (re-run bundles), `typeprobe/neg2.ts` and `adneg/neg3.ts`.

**What was checked**
- **Scores:** verdict, confidence, C, B and timing for all 3 IDs, against the rubric and the evidence in each section.
- **Citations:** about 125 path:line citations, opened in these places:
  - `sodax-sdks-v3feas` at `0181a053` and `origin/pr-534`;
  - the t2probe node_modules (sdk-ts and wallet-core 1.18.14, viem 2.29.2, near-connect 0.10.0, `@stacks/transactions` 7.3.1);
  - the consumers, through `git show` / `git grep`: frontend `1b915ec7`, whitelabel `5e1fbbaa`, backend `985959e9`.

  Four were wrong or imprecise: the frontend comment range, the `apps/node-cjs` range, the Solana browser config shape, and "0 importers" for the sdk receipt helper.
- **Numbers:** 22 headline numbers re-derived.
  - Bundles: 8 entries re-run with `deep-wsc/scripts/measure.mjs`, all identical: root 1,225.5 / 841.5, EVM 123.2 / 39.7, Tron 27.2 / 1.0, and the root with Tron 842.3 / 854.7. Every other delta in the bundle table was recomputed from the stored `.res.json` files.
  - Interface members: `python3 -I deep-wsc/scripts/members.py <v3feas>/packages/types/src` gives 35 / 26 / 24.
  - Installs: sizes and package counts from `installs/*/{size.kb,pkgs.count}`. Advisories from `node wf-verify-wsc/audit.mjs installs/{full,nobtcpk,nopk}/audit.json`.
  - Call sites in the consumers: `git -C <repo> grep -n -E "[.?](waitForTransactionReceipt|waitForConfirmation|getTokenAccountBalance|getCoins|viewContract|getAssociatedTokenAddress|getRawTransaction|getBalance)[(<]" <branch> -- '*.ts' '*.tsx'` gives frontend 4, whitelabel 2 and backend 0 on wallet receivers.
  - Call sites in the repo, all with `rg`:
    - sdk 1, dapp-kit 2, swap-api-example 1;
    - `apps/node` 24, which is 26 matches minus 2 spoke-provider calls;
    - wallet-sdk-core test lines 21;
    - docs 25 lines, minus 6 on non-wallet receivers, which leaves 18 read lines plus 1 helper line, in 11 files;
    - 36 doc files with `privateKey`.
  - LOC: `wc -l` gives 2,121 and 2,795, and the browser-only diff is −358 / +37.
  - Issue search: 6 hits, 2 mentions, 0 requests.
- **Probes re-run:**
  - The Sodax-free runtime probe gave the same result.
  - The type probe and its negative check gave the same result. A stronger negative check was added.
  - The adapter type-check did not reproduce as written (see below). A negative check was added.

**What changed, and why**
- **wsc-1 benefit B2 → B3.** The measured gain on the path both consumer dapps mount is 98–160 KB gzip, and the rubric's B3 line is ≥50 KB gzip on a common path. x-1 got B3 for 74 KB. The old "modest" reading used percentages, which the rubric does not use. It is not B4: under 200 KB, no advisory removed.
- **"84% is Injective"** holds only after sdk-2. Today it is 57% (92.2 ÷ 160.4). The summary, P2 and the Recommendation now give both.
- **sdk-2 attribution:**
  - In the wallet-sdk-react root, the −107.6 KB is the whole unused Bitcoin class, bitcoinjs-lib and bip174 included, not only private-key libraries.
  - In the swap dapp, sdk-2 saves 51.2 KB, because the sdk keeps bitcoinjs-lib.
  - wsc-1 alone also removes the Bitcoin private-key part (−49.3 KB), so "sdk-2 removes them, not wsc-1" was wrong.

  Summary line 2, the Notes, the Corrections bullet and the Dependencies row were fixed.
- **Install "Advisories" was mislabeled.** The 30 is npm's count of flagged packages. There are 51 distinct advisories, 41 of them in axios. The "−2" are flagged packages; 0 advisories leave. The bundles keep every advisory-carrying package too: elliptic, axios, bigint-buffer, ws and uuid are still in `wsr-browser`.
- **axios** stays in the wallet-sdk-react and dapp bundles. Only the Injective class on its own loses it. The security bullet was corrected.
- **wsc-2 member count:** "35 → 24" needs the two non-RPC helpers removed, which the Change section does not do. The report now gives 26, and 24 with the helpers.
- **wsc-2 runtime probe:**
  - The T2 patch does touch code that the probe runs, in the `BitcoinSpokeService` constructor, but that code does no I/O.
  - The receipt was for an already-mined Base deposit transaction (type `0x7e`, checked with `eth_getTransactionByHash`). So the probe proves the code path, not the wait or the revert handling.
  - The fetch count covers only `globalThis.fetch`.
- **wsc-2 callers and risks:**
  - The `evm-utils.ts` helper has one importer, in dead code (`apps/node/src/near.ts:18,299`).
  - "0 callers anywhere" for the non-receipt reads is now scoped: the wallet-sdk-core tests do call them.
  - Risk 2 is corrected. The Solana change reaches `SolanaSpokeService.ts:197,333`, not wallet-sdk-react's wiring.
- **wsc-2 hidden waits:**
  - Injective's browser paths also poll (wallet-core dist cited).
  - NEAR's browser path depends on the wallet.
  - The Stacks nonce and fee fetch is now cited.
- **wsc-4 type-check:** re-running `adapters/tsconfig.json` with tsc 5.5.4 exits 2 with 20 errors. All 20 are in the copied core tree, because the `paths` mapping bypasses package `exports`, and `near-api-js`, `@mysten/sui` and `@sodax/libs` declare types only there. The two adapter files have 0 errors, and both negative checks fail as they should. The confidence is now scoped to "type-check of the adapter files only".
- **wsc-4 demand:** "0 actual mentions" became 2 mentions (#456, #368), 0 requests.
- **Smaller fixes:**
  - the after-snippet variable is now `intentParams.srcChainKey`;
  - KB is stated as 1,024 bytes;
  - the transfer time is ≈0.57–0.82 s, with the arithmetic shown;
  - the Tron gain sign is fixed;
  - the elliptic "no fix" is scoped to the audit snapshot;
  - `wc -l` counts are tagged `[verified]`;
  - the viem chain assertion is scoped to json-rpc accounts;
  - the two citation ranges are corrected.

**What remains judgement**
- **wsc-1 C4.** The bullet touches signing code on every chain, and the rubric's C5 includes "risk on paths that move funds". It stays C4 because the split mostly moves code; the browser signing logic changes only for Injective's mode check.
- **wsc-2 C3.** The Solana `signTransaction(bytes)` change sits on fund-moving spoke paths, and sizing PRs 2–4 could push it to C4.
- **wsc-4 C2,** although it needs a manual wallet test, which is a C3 trait.
- **Benefit scores:** B2 for wsc-2 and B1 for wsc-4.
- **Other judgement:**
  - every PR LOC estimate;
  - whether the bundle deltas carry over to the real Next.js builds;
  - the security framing;
  - NEAR browser finality.

**Residual doubts**
- The wsc-1 B3 rests on synthetic entries. No consumer production build was measured. If wsr-1 lazy-loads chains first, most of the gain leaves the initial bundle.
- No browser-only variant, Tron included, was executed or unit-tested.
- The Sodax-free receipt path is proven only for an EVM success on an already-mined transaction.
- The adapter type-check harness needs a fix before it can be rerun cleanly: use the published `.d.ts` or package-aware resolution.
- The npm audit numbers reflect the 2026-10-05 registry snapshot.
