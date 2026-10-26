// Bundle each entry as a Worker would (workerd/worker/browser conditions) and list Node builtins it imports.
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';
const require = createRequire('/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/package.json');
const esbuild = require('/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild');
const R = '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/';
const out = process.argv[2];
const entries = {
  types: R + 'types/dist/index.js', 'swaps-api': R + 'swaps-api/dist/index.mjs', 'bridge-api': R + 'bridge-api/dist/index.mjs',
  sdk: R + 'sdk/dist/esm/index.js', 'wallet-sdk-core': R + 'wallet-sdk-core/dist/index.mjs',
};
const builtins = new Set([...builtinModules, ...builtinModules.map(m => 'node:' + m)]);
for (const [name, entry] of Object.entries(entries)) {
  const hits = new Map();
  const plugin = { name: 'builtins', setup(b) {
    b.onResolve({ filter: /.*/ }, a => { const base = a.path; if (builtins.has(base) || builtins.has(base.split('/')[0])) { const k = base.replace(/^node:/, ''); hits.set(k, (hits.get(k) || new Set()).add(a.importer.replace(/.*node_modules\//, '').split('/').slice(0, 2).join('/'))); return { path: base, external: true }; } return undefined; });
  } };
  try {
    const r = await esbuild.build({ entryPoints: [entry], bundle: true, write: true, outfile: `${out}/${name}.worker.js`, format: 'esm', platform: 'browser',
      conditions: ['workerd', 'worker', 'browser'], mainFields: ['browser', 'module', 'main'], logLevel: 'silent', plugins: [plugin], minify: true, metafile: true });
    const code = require('node:fs').readFileSync(`${out}/${name}.worker.js`, 'utf8');
    const freeBuffer = (code.match(/\bBuffer\b/g) || []).length, procEnv = (code.match(/process\.env/g) || []).length, wasm = (code.match(/WebAssembly\.(instantiate|compile|Module)/g) || []).length, evalish = (code.match(/new Function\(|\beval\(/g) || []).length;
    console.log(`## ${name}: ${(code.length/1024).toFixed(0)} KB min; builtins=${hits.size}; Buffer refs=${freeBuffer}; process.env=${procEnv}; WebAssembly=${wasm}; eval/new Function=${evalish}`);
    for (const [k, v] of [...hits].sort()) console.log(`   ${k} <- ${[...v].slice(0, 4).join(', ')}`);
  } catch (e) { console.log(`## ${name}: BUILD FAIL ${e.errors?.slice(0, 3).map(x => x.text).join(' | ') || e.message}`); }
}
