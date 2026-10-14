// v3 EVM swap dapp, approximated: swap-only client-first sdk + EVM wallet adapter + wagmi hooks, one @sodax/types copy.
export { swaps } from './src-swap-only.ts';
export { EvmXService, EvmXConnector, createWagmiConfig } from 'wallet-react-src/xchains/evm/index.ts';
export { WagmiProvider, useAccount, useConnect, useWalletClient } from 'wagmi';
export { walletConnect, injected } from 'wagmi/connectors';
