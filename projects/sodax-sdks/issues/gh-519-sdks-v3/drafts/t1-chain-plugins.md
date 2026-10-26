---
type: draft
repo: sodax-sdks
github: 519
status: Draft, not filed
updated: 2026-10-19
tags: [v3, epic, draft, chain-plugins]
---

# Epic draft · T1 chain plugins

Epic template (`.github/ISSUE_TEMPLATE/epic.md`). Sub-issues come later. Names are proposals until
the T1.1 ADR.

**Title**

```text
feat(sdk)!: make non-EVM chains opt-in
```

**Body**

````markdown
<!-- Workflow: .github/issue-workflow.md. An epic has no plan comment: its GitHub sub-issues are the plan. -->

## Goal

[Sang]: Apps should only install and ship the chains they actually use.

Right now `@sodax/sdk` brings every chain library with it: Solana, Stellar, Sui, ICON, Injective, Bitcoin, NEAR and Stacks. An app that only uses EVM chains still pays for all of them. On 2.2.0 those libraries are about 70% of what `new Sodax()` adds to a bundle, and Injective alone is 178 MB on install.

In v3 the SDK covers the Sonic hub and EVM chains. Every other chain becomes its own package that you add when you need it:

```ts
// npm i @sodax/sdk @sodax/chain-solana
import { Sodax } from '@sodax/sdk';
import { solanaPlugin } from '@sodax/chain-solana';

// EVM chains work out of the box. Add the rest as plugins.
const sodax = new Sodax({ plugins: [solanaPlugin()] });
```

```ts
// A backend that needs every chain
import { allChainPlugins } from '@sodax/chains-all';

const sodax = new Sodax({ plugins: allChainPlugins() });
```

If you use a chain you didn't add, the SDK throws `CHAIN_NOT_ENABLED` and tells you which package to install.

Nothing changes in 2.x. `new Sodax()` keeps every chain until 3.0, and a codemod adds the `plugins` line for you when you upgrade.

Package and function names aren't final. The first sub-issue, an ADR, settles them.

## Non-goals

- A separate package for EVM. EVM chains use viem like the hub does, so there's nothing to split out.
- Chain plugins written by third parties. The plugin API is for our own chain packages for now.
- Per-chain React wallet connectors. That's the wallet adapters work.

## Exit criteria

- [ ] `npm i @sodax/sdk` no longer installs any non-EVM chain library.
- [ ] Every chain supported today ships as `@sodax/chain-<name>`, and `@sodax/chains-all` has them all.
- [ ] An EVM-only app's bundle has no non-EVM chain code, and CI checks it.
- [ ] 2.x apps run unchanged, and the codemod moves them to 3.0.
- [ ] Docs and skills show how to add a chain.
````
