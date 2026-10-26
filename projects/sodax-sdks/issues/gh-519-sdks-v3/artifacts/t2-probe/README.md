# T2 probe: unbundled ESM + lazy ECC init (2026-10-19, main 0181a053)

Throwaway worktree `sodax-sdks-t2probe`; nothing committed. `sdk.diff` is the whole change:
- tsc emits ESM per file to `dist/esm` (`tsconfig.build.json`);
- tsup builds CJS only;
- `exports["."].import` points at `dist/esm`;
- `initEccLib` runs once from the `BitcoinSpokeService` constructor.

| Check | Result |
| --- | --- |
| `pnpm build` (tsup CJS + tsc ESM) | OK, 206 ESM files, `verify-dist-exports` OK |
| `pnpm checkTs`, `pnpm test` (sdk) | pass, 2998/2998 |
| `attw --pack` | no problems (node10, node16 CJS/ESM, bundler) |
| Node ESM and CJS import + `new Sodax()` | OK, 510 exports, identical sets |
| `apps/node-cjs` | OK |
| `apps/example-next-js-16` verify (Next 16.3.8) | 5/5 with Turbopack and with `--webpack` |
| `t2-next-probe`, `next dev` SSR | OK |
| Next 16.4.x | not run: pnpm `minimumReleaseAge` (14 days) blocks every 16.4 release |

| Bundle (gzip) | Bundled (main) | T2 |
| --- | --: | --: |
| esbuild, `import { SodaxError }` | 825 KB | 0.6 KB |
| esbuild, `import { getChainType }` | 825 KB | 34 KB (types has no `sideEffects`; T14.1) |
| esbuild, `new Sodax()` | 1,258 KB | 1,261 KB (needs T1 / T12) |
| Next Turbopack, client component imports `SodaxError` (client JS total) | 1,550 KB | 166 KB |
| Next webpack, same | 1,253 KB | 260 KB |

Chain-library markers (`p2wpkh`, `StrKey`, `icx_sendTransaction`, `TransactionInstruction`) are in
the bundled build's client JS and absent from T2's.

Re-run:
- `node measure.mjs <esbuild dir> <app dir> <label>`;
- `next-probe.sh <app dir> <label> [--webpack]`.

## T12 add-on: swap-only entry (same worktree, T2 build)

`t12/swap-only.mjs` builds the core the way `Sodax.ts` does, then constructs only `SwapService`. That
stands in for `createSodaxCore()` + `@sodax/sdk/swap`. It constructs and runs in Node. The stub
regex covers the non-EVM chain libraries and PancakeSwap, simulating T1 + T5.

| Bundle (gzip) | Full `new Sodax()` | Swap only |
| --- | --: | --: |
| T2 | 1,261 KB | 1,211 KB |
| T2 + chains and PancakeSwap stubbed | 303 KB | 248 KB (sdk own code 461 → 196 KB min) |

T12 alone saves little, because `SpokeService` still imports every chain. It pays off after T1 and T5.
