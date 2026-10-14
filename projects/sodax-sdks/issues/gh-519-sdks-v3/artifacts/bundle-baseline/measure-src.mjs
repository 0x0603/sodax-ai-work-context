// usage: node measure-src.mjs <esbuildPath> <nodeModulesDir> <srcRoot> <entry> <label> [stubRegex] [pure=0|1] [platform=browser|node] [outfile]
// Bundles an entry against the sodax-sdks *source* (workspace packages resolved to packages/*/src),
// third-party deps from <nodeModulesDir>. stubRegex replaces matching imports with an empty module
// (= "that chain plugin is not installed"). pure=1 marks every workspace source module side-effect-free
// (= "@sodax/types gets sideEffects:false + no import-time side effects").
// Env: EXTERNAL_RE=<regex> leaves matching imports external (e.g. react, or viem "already in the app");
// STUB_PROXY=1 makes stubs a callable no-op proxy so a platform=node build can be imported for timing.
// Entry aliases: sdk-src/<path>.js and wallet-react-src/<path>.ts point into <srcRoot>/packages/*/src.
import { createRequire, builtinModules } from 'node:module';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const [esbuildPath, nodeModules, SRC, entry, label, stubRe = '', pure = '0', platform = 'browser', outfile = ''] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbuildPath);
const re = stubRe ? new RegExp(stubRe) : null;
const ext = process.env.EXTERNAL_RE ? new RegExp(process.env.EXTERNAL_RE) : null; // e.g. viem: already shipped by the app
const builtins = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);
const ws = {
  '@sodax/sdk': 'packages/sdk/src/index.ts',
  '@sodax/types': 'packages/types/src/index.ts',
  '@sodax/types/dex': 'packages/types/src/dex/index.ts',
  '@sodax/swaps-api': 'packages/swaps-api/src/index.ts',
  '@sodax/bridge-api': 'packages/bridge-api/src/index.ts',
  '@sodax/wallet-sdk-core': 'packages/wallet-sdk-core/src/index.ts',
};
const stubbed = new Set(); const nodeImports = new Set();
const r = await esbuild.build({
  entryPoints: [entry], bundle: true, minify: true, format: 'esm', platform, target: 'es2022',
  banner: platform === 'node' ? { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } : undefined,
  write: false, outdir: 'unused', metafile: true, nodePaths: [nodeModules], logLevel: 'silent', treeShaking: true,
  define: { 'process.env.NODE_ENV': '"production"', ...(platform === 'browser' ? { global: 'globalThis' } : {}) },
  plugins: [{ name: 'ws', setup(b) {
    b.onResolve({ filter: /.*/ }, async a => {
      if (a.pluginData?.skip) return;
      if (builtins.has(a.path) || builtins.has(a.path.split('/')[0])) { nodeImports.add(a.path); return { path: a.path, external: true }; }
      if (ext && ext.test(a.path)) return { path: a.path, external: true };
      if (re && re.test(a.path)) { stubbed.add(a.path.split('/').slice(0, a.path.startsWith('@') ? 2 : 1).join('/')); return { path: a.path, namespace: 'stub' }; }
      // entry-file aliases into the source tree: sdk-src/<path>.js, wallet-react-src/<path>.ts
      const al = a.path.match(/^(sdk-src|wallet-react-src)\/(.+)$/);
      if (al) return { path: `${SRC}/packages/${al[1] === 'sdk-src' ? 'sdk' : 'wallet-sdk-react'}/src/${al[2].replace(/\.js$/, '.ts')}`, ...(pure === '1' ? { sideEffects: false } : {}) };
      if (ws[a.path]) return { path: `${SRC}/${ws[a.path]}`, ...(pure === '1' ? { sideEffects: false } : {}) };
      if (pure === '1' && (a.path.startsWith('.') ) && a.importer.startsWith(`${SRC}/packages/`)) {
        const res = await b.resolve(a.path, { kind: a.kind, importer: a.importer, resolveDir: a.resolveDir, pluginData: { skip: true } });
        if (res.errors.length) return { errors: res.errors };
        return { path: res.path, sideEffects: false };
      }
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ loader: 'js', contents: process.env.STUB_PROXY === '1'
      // callable no-op proxy, so import-time code that touches a stubbed lib still runs (for Node timing only)
      ? 'const p = new Proxy(function () {}, { get: (t, k) => (k === "__esModule" ? false : k === Symbol.toPrimitive ? () => "" : p), apply: () => p, construct: () => p, getPrototypeOf: () => p }); module.exports = p;'
      : 'module.exports = {};' }));
  } }],
});
const out = r.outputFiles.find(f => f.path.endsWith('.js')).contents;
if (outfile) writeFileSync(outfile, out);
const byPkg = {};
for (const [file, info] of Object.entries(Object.values(r.metafile.outputs).find(o => o.entryPoint).inputs)) {
  const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
  const ws2 = file.match(/packages\/([^/]+)\/src\/(?:([^/]+)\/)?/);
  const pkg = m ? m[m.length - 1].replace('node_modules/', '') : ws2 ? `[${ws2[1]}${ws2[1] === 'sdk' && ws2[2] ? '/' + ws2[2] : ''}]` : '(other)';
  byPkg[pkg] = (byPkg[pkg] || 0) + info.bytesInOutput;
}
console.log(`### ${label}: min ${(out.length / 1024).toFixed(0)} KB | gzip ${(gzipSync(out).length / 1024).toFixed(0)} KB | brotli ${(brotliCompressSync(out).length / 1024).toFixed(0)} KB`);
console.log('  top: ' + Object.entries(byPkg).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([p, b]) => `${p}=${(b / 1024).toFixed(0)}K`).join(' '));
if (stubbed.size) console.log('  stubbed: ' + [...stubbed].sort().join(' '));
console.log('  node builtins: ' + ([...nodeImports].sort().join(', ') || 'none'));
