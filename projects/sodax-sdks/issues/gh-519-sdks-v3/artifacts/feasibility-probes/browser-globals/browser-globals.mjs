// usage: node browser-globals.mjs <esbuildDir> <probeRoot> <outDir>
// Bundles each case for platform=browser WITHOUT externalizing Node builtins (reports what fails to
// resolve), then evaluates the bundle in a vm context that has browser-like globals but no Buffer,
// process, global or setImmediate, and reports the first runtime error.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';
const [esbDir, root, outDir] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbDir);
const app = `${root}/apps/example-next-js-16`;
const sdk = `${root}/packages/sdk`;
const wsc = `${root}/packages/wallet-sdk-core`;
const cases = [
  ['sdk: new Sodax()', app, `import { Sodax } from '@sodax/sdk'; globalThis.__r = new Sodax();`],
  ['sdk: import only', app, `import * as m from '@sodax/sdk'; globalThis.__r = Object.keys(m).length;`],
  ['wallet-sdk-core: import', app, `import * as m from '@sodax/wallet-sdk-core'; globalThis.__r = Object.keys(m).length;`],
  ['viem', sdk, `import * as m from 'viem'; globalThis.__r = m.toHex(new Uint8Array([1]));`],
  ['@solana/web3.js PublicKey', sdk, `import { PublicKey } from '@solana/web3.js'; globalThis.__r = new PublicKey('11111111111111111111111111111111').toBytes();`],
  ['@stellar/stellar-sdk Address', sdk, `import { Address } from '@stellar/stellar-sdk'; globalThis.__r = Address.fromString('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7').toScVal();`],
  ['bitcoinjs-lib + ecc', sdk, `import * as b from 'bitcoinjs-lib'; import * as ecc from '@bitcoinerlab/secp256k1'; b.initEccLib(ecc); globalThis.__r = b.address.toOutputScript('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');`],
  ['icon-sdk-js', sdk, `import * as I from 'icon-sdk-js'; globalThis.__r = typeof (I.default ?? I).IconService;`],
  ['@injectivelabs/sdk-ts', sdk, `import * as I from '@injectivelabs/sdk-ts'; globalThis.__r = Object.keys(I).length;`],
  ['near-api-js', sdk, `import * as N from 'near-api-js'; globalThis.__r = Object.keys(N).length;`],
  ['@mysten/sui bcs', sdk, `import { bcs } from '@mysten/sui/bcs'; globalThis.__r = bcs.Address.serialize('0x2').toBytes();`],
  ['@sodax/libs/stacks/core', sdk, `import { Cl, serializeCV } from '@sodax/libs/stacks/core'; globalThis.__r = serializeCV(Cl.uint(1));`],
  ['@coral-xyz/anchor', sdk, `import * as A from '@coral-xyz/anchor'; globalThis.__r = Object.keys(A).length;`],
  ['wsc: bip322-js + ecpair + secp256k1', wsc, `import * as bip from 'bip322-js'; import { ECPairFactory } from 'ecpair'; import s from 'secp256k1'; globalThis.__r = [typeof bip.Signer, typeof ECPairFactory, typeof s];`],
];
import { builtinModules } from 'node:module';
const emptied = new Set();
const emptyBuiltins = { name: 'empty-builtins', setup(b) {
  const re = new RegExp(`^(node:)?(${builtinModules.map((m) => m.replace(/[/]/g, '\\/')).join('|')})$`);
  b.onResolve({ filter: re }, async (a) => {
    if (a.pluginData === 'inner') return undefined;
    const r = await b.resolve(a.path, { resolveDir: a.resolveDir, kind: a.kind, importer: a.importer, pluginData: 'inner' });
    if (!r.errors.length) return r.path.startsWith('/') ? r : { path: a.path, namespace: 'empty' };
    emptied.add(a.path); return { path: a.path, namespace: 'empty' };
  });
  b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'module.exports = {}', loader: 'js' }));
} };
const browserGlobals = () => {
  const g = {
    console, TextEncoder, TextDecoder, URL, URLSearchParams, fetch, Headers, Request, Response, AbortController,
    AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone, atob, btoa,
    crypto: globalThis.crypto, Event, EventTarget, WebSocket: globalThis.WebSocket, performance, BigInt, Uint8Array,
    navigator: { userAgent: 'probe' },
  };
  g.globalThis = g; g.window = g; g.self = g;
  return g;
};
for (const [name, resolveDir, contents] of cases) {
  let line = `| ${name} |`;
  try {
    const r = await esbuild.build({
      stdin: { contents, resolveDir, loader: 'js' }, bundle: true, write: false, format: 'iife',
      platform: 'browser', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
      plugins: process.env.EMPTY_BUILTINS ? [emptyBuiltins] : [],
    });
    const code = r.outputFiles[0].text;
    const file = `${outDir}/${name.replace(/[^a-z0-9]+/gi, '_')}.js`;
    writeFileSync(file, code);
    const ctx = vm.createContext(browserGlobals());
    try {
      vm.runInContext(code, ctx, { filename: file });
      line += ` bundles | runs |`;
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 80);
      const m = String(e && e.stack || '').split('\n');
      const at = m.find((l) => l.includes('node_modules/')) || '';
      line += ` bundles | throws: ${msg} @ ${at.trim().replace(/.*node_modules\/(\.pnpm\/)?/, '').replace(/\/node_modules\//, ' ').slice(0, 90)} |`;
    }
  } catch (e) {
    const errs = (e.errors || []).map((x) => `${x.text} <- ${x.location?.file?.replace(/.*node_modules\/(\.pnpm\/)?/, '') ?? ''}`);
    line += ` build error (${errs.length}): ${[...new Set(errs)].slice(0, 4).join('; ')} |`;
  }
  console.log(line + (emptied.size ? ` emptied: ${[...emptied].join(',')}` : ''));
  emptied.clear();
}
