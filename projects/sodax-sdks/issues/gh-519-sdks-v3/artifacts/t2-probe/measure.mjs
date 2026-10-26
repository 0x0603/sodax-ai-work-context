// usage: node measure.mjs <esbuildDir> <resolveDir> <label>
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { builtinModules } from 'node:module';
const [esbDir, resolveDir, label] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbDir);
const cases = {
  'SodaxError only': `import { SodaxError } from '@sodax/sdk'; console.log(SodaxError);`,
  'getChainType only': `import { getChainType } from '@sodax/sdk'; console.log(getChainType);`,
  'new Sodax()': `import { Sodax } from '@sodax/sdk'; console.log(new Sodax());`,
};
const external = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
for (const [name, contents] of Object.entries(cases)) {
  const r = await esbuild.build({
    stdin: { contents, resolveDir, loader: 'js' }, bundle: true, minify: true, write: false,
    format: 'esm', platform: 'browser', external, logLevel: 'silent', metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const out = r.outputFiles[0].contents;
  const libs = new Set(Object.entries(Object.values(r.metafile.outputs)[0].inputs).filter(([, v]) => v.bytesInOutput > 0).map(([p]) => p).map((p) => ([...p.matchAll(/node_modules\/((?:@[^/]+\/)?[^/.][^/]*)/g)].pop() || [])[1]).filter(Boolean));
  const has = ['bitcoinjs-lib', '@stellar/stellar-sdk', '@solana/web3.js', 'icon-sdk-js'].filter((l) => libs.has(l));
  console.log(`${label} | ${name} | ${(gzipSync(out).length / 1024).toFixed(1)} KB gzip | chain libs: ${has.join(', ') || 'none'}`);
}
