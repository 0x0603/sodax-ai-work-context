---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-18
updated: 2026-09-18
---

# Session 02 — decision record, rev 2, and the PR #163 collision

ADR written: `decisions/0003-adopt-privy-as-the-email-wallet-provider.md` (Accepted, supersedes
0001, which now carries a banner). Then, while a second workflow (research on the five remaining
open questions + a five-lens review of `plan.md`) ran, I verified four things first-hand.

## Findings

### F7. `'use client'` is absent from the published dists — both ours and Privy's

`https://unpkg.com/@sodax/wallet-sdk-react@2.0.0-rc.17/dist/index.mjs` starts with a plain
`import … from './chunk-OFHQ3WFM.mjs'` — **zero** occurrences of `use client`, confirming that
tsup's rollup pass strips the directive that `SodaxWalletProvider.tsx:1` carries in source.
`@privy-io/react-auth@3.40.0/dist/esm/index.mjs` also has **zero**. So no library in this stack
ships the directive and App Router consumers already wrap providers in their own `'use client'`
module. → rev 2 must decide whether `restore-use-client.mjs` is worth owning at all, or whether the
docs simply state the wrapper requirement.

### F8. Privy's RPC override is the answer to the chain-coverage risk

`@privy-io/chains@0.5.2` (what react-auth 3.39/3.40 depend on) exports 61 chains including
**sonic 146, hyperEVMMainnet 999, kaia 8217** but **not Hedera 295, LightLink 1890, Redbelly 151 or
Robinhood 4663**. That is survivable: reading `react-auth@3.40.0/dist/esm/getPublicClient-*.mjs`,
the embedded provider resolves its RPC as
`chain.rpcUrls.privyWalletOverride → app-config rpcUrls[chainId] → chain.rpcUrls.privy (+?privyAppId) →
chain.rpcUrls.public/default`, and throws `Unsupported chainId` **4901 only when the id is missing
from the `supportedChains` array we pass**. A chain Privy has never heard of therefore works
client-side as long as we pass it and it carries an RPC URL.
→ rev 2: pass `supportedChains` built from the SDK's chain tuple **with the partner's
`EVM.chains[key].rpcUrl` injected as `rpcUrls.privyWalletOverride`**, so Privy broadcasts through the
same endpoint wagmi reads from. Drop "addRpcUrlOverrideToChain as a follow-up" from the risk list.
Server-side acceptance of an unknown chain id during signing is still unverified.

### F9. PR #163 already opened the seam this plan was going to invent

`feat/wallet-hw` (open 2026-05-27, updated 2026-09-07, 0xmilktea, 30 files, REVIEW_REQUIRED, no
reviews) adds **`EVM.wagmiConnectors?: CreateConnectorFn[]`** to `EvmAdapterFields` — "the supported
way to add custom EVM wallets" — pushed in the same `EvmProvider` `useMemo` our plan edits, and
ships a separate opt-in package `@sodax/wallet-hw` with peer-only deps and `./ledger` / `./trezor`
sub-paths. It independently confirms the direction ("signing flows through wagmi's wallet client, so
`useWalletProvider` returns the usual `EvmWalletProvider`") and its connectors deliberately return
`isAuthorized() === false`, which is the opposite of what AC3 needs here.

Consequences, all for rev 2: the two PRs conflict on the same `useMemo` and the same
`EvmAdapterFields` block (and #163 predates #443, so it needs a rebase regardless); if #163 lands
first the Privy connector can ride `wagmiConnectors` and only the React **host** needs a core seam;
and the "separate package" option is more live than the plan assumed. Against it: verified that
`scripts/release.mjs` discovers publishable packages from `packages/*` (non-private `@sodax/*`) and
`packageListErrors()` fails unless `scripts/bump-versions.sh:7` and
`.github/workflows/sdks-publish.yml:30,72` list the same set — `@sodax/wallet-hw` is
`"private": false` at `0.0.1-test` and #163 edits none of those, so **#163 as it stands would fail
`pnpm release` preflight**. That is a note for their PR thread (not a new issue), and it is the
concrete reason a sub-path still beats a new package here.

### Draft comment for PR #163 — NOT POSTED (ask the user first)

> Heads-up from #456 (Privy email login as an opt-in EVM wallet source): `EVM.wagmiConnectors` is the
> right seam and we'll append next to it rather than replace it — Privy additionally needs a React host
> inside `EvmProvider` (it has to read the partner's per-chain `rpcUrl` map, which only exists there), so
> it keeps its own typed `EVM.privy` slot and both fields feed the same `connectors` array. Two mechanical
> conflicts to expect on a rebase: `EvmProvider.tsx`'s `useMemo` gained `persistKey` in #443, and
> `src/providers/evm/EvmProvider.test.tsx` has existed on main since #247, so the new file here becomes an
> add/add. Separately, `packages/wallet-hw/package.json` is `"private": false` at version `0.0.1-test`,
> which will fail CI on merge: `scripts/release.mjs` discovers every non-private `@sodax/*` manifest under
> `packages/`, rejects any version that isn't `X.Y.Z[-rc.N]` (`scripts/config-version.mjs:15`), and
> `scripts/release.test.mjs:306-311` asserts this against the real repo root inside `pnpm test`
> (`.github/workflows/ci.yml:234`). The fix is either `"private": true` until you're ready to publish, or
> aligning the version to the `2.0.0-rc` line and adding `wallet-hw` to `scripts/bump-versions.sh:7` and
> `.github/workflows/sdks-publish.yml:30` and `:72`. That gate landed in #407 on 2026-08-30, after this
> branch's last CI run, so it has never been exercised here.


### F10. Nothing moved on the issue itself

#456 still has zero comments and one assignee (2026-09-15). No other Privy/email work is open in
either repo except sodax-frontend#1069.

## Round 2 close (2026-09-18)

Second workflow finished clean (39/39 agents): five research topics and a five-lens review of rev 1,
with every non-minor finding put through two independent refuters. It invalidated **five** things rev 1
called settled — `setWalletRecovery()` throws on TEE rather than merely being unnecessary;
`supportedChains` needs `privyWalletOverride` decoration and Privy's registry maps id 999 to Zora Goerli
Testnet; AC5's "reconnects are never delayed" is false because wagmi's reconnect loop has no `break`;
the single 300 s `connectTimeoutMs` is the wrong shape; and `loginMethods: ['email']` does not stop Privy
standing up its own WalletConnect, Coinbase and Base Account stacks. Below those: the reconnect flag
would have gone into a **session cookie** and died on browser quit, `getChainId`/`getAccounts` were never
specified although `getConnectorClient` throws on disagreement, `isAuthorized` compared a Promise to
`true`, and the chain-switch sequence was a guaranteed race.

`plan.md` is now rev 2 with all 53 edits plus the PR #163 memo folded in. The spike shrank from 8 items
to 5 and gained a Turbopack prerender go/no-go that needs no Privy app. Estimate moved to 9-10 days.
Full delta and the 38 primary-source facts: `plan-revision-2.md`.

## Session close (2026-09-18, first pause)

User paused the work. Workflow run `wf_9eac3d91-095` stopped with 7 agents outstanding
(C5/C8/C9/C10 second refuters, critic). Resume recipe in `brief.md`. Work resumed the same day —
see session 2 above.
