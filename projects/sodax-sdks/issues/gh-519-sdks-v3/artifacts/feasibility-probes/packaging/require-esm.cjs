// Probe: CommonJS require() of each package's ESM build (Node require(esm)).
const R = '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/';
const targets = {
  'types (esm)': R + 'types/dist/index.js',
  'swaps-api (esm)': R + 'swaps-api/dist/index.mjs',
  'bridge-api (esm)': R + 'bridge-api/dist/index.mjs',
  'sdk (tsc esm)': R + 'sdk/dist/esm/index.js',
  'wallet-sdk-core (esm)': R + 'wallet-sdk-core/dist/index.mjs',
  'libs stacks/core (esm)': R + 'libs/dist/stacks/core/index.mjs',
  'libs injective/wallet-strategy (esm)': R + 'libs/dist/injective/wallet-strategy/index.mjs',
  'dapp-kit (esm)': R + 'dapp-kit/dist/index.mjs',
  'wallet-sdk-react (esm)': R + 'wallet-sdk-react/dist/index.mjs',
};
const only = process.argv[2];
for (const [k, p] of Object.entries(targets)) {
  if (only && !k.startsWith(only)) continue;
  const t = Date.now();
  try {
    const m = require(p);
    console.log('OK  ', k, Object.keys(m).length, 'exports', Date.now() - t, 'ms');
  } catch (e) {
    console.log('FAIL', k, e.code || '', String(e.message).split('\n')[0].slice(0, 200));
  }
}
