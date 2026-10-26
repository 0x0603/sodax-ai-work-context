const R = '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/';
const t = { types: 'types/dist/index.js', 'swaps-api': 'swaps-api/dist/index.mjs', 'bridge-api': 'bridge-api/dist/index.mjs', sdk: 'sdk/dist/esm/index.js', 'wallet-sdk-core': 'wallet-sdk-core/dist/index.mjs' };
for (const [k, p] of Object.entries(t)) {
  if (Deno.args[0] && Deno.args[0] !== k) continue;
  try { const m = await import(R + p); let extra = '';
    if (k === 'sdk') { const s = new m.Sodax(); extra = ' new Sodax() ok, sui endpoint=' + s.spoke?.sui?.transport?.endpoint; }
    if (k === 'types') extra = ' getChainType=' + m.getChainType(m.ChainKeys.SONIC_MAINNET);
    console.log('OK  ', k, Object.keys(m).length, extra);
  } catch (e) { console.log('FAIL', k, String(e?.message ?? e).split('\n')[0].slice(0, 220)); }
}
