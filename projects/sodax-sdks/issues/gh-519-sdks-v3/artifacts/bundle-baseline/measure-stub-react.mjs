// usage: node measure-stub-react.mjs <esbuildPath> <nodeModulesDir> <entry> <stubRegex|""> <label>
// Like measure-stub.mjs (imports matching <stubRegex> become an empty module = "that chain plugin is not
// installed"), with react / react-dom / react-query external as in measure.mjs — for dapp entries.
import { createRequire, builtinModules } from 'node:module';
import { gzipSync } from 'node:zlib';
const [esbuildPath, nodeModules, entry, stubRe, label] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbuildPath);
const re = stubRe ? new RegExp(stubRe) : /^$^/;
const builtins = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);
const stubbed = new Set();
const r = await esbuild.build({
  entryPoints: [entry], bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022',
  write: false, outdir: 'unused', metafile: true, nodePaths: [nodeModules], logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /.*/ }, a => {
      if (builtins.has(a.path) || builtins.has(a.path.split('/')[0])) return { path: a.path, external: true };
      if (re.test(a.path)) { stubbed.add(a.path.split('/').slice(0, a.path.startsWith('@') ? 2 : 1).join('/')); return { path: a.path, namespace: 'stub' }; }
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
  } }],
});
const out = r.outputFiles.find(f => f.path.endsWith('.js')).contents;
const byPkg = {};
for (const [file, info] of Object.entries(Object.values(r.metafile.outputs).find(o => o.entryPoint).inputs)) {
  const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
  const pkg = m ? m[m.length - 1].replace('node_modules/', '') : '(other)';
  byPkg[pkg] = (byPkg[pkg] || 0) + info.bytesInOutput;
}
console.log(`### ${label}: min ${(out.length / 1024).toFixed(0)} KB | gzip ${(gzipSync(out).length / 1024).toFixed(0)} KB`);
console.log('  top: ' + Object.entries(byPkg).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, b]) => `${p}=${(b / 1024).toFixed(0)}K`).join(' '));
console.log('  stubbed: ' + [...stubbed].sort().join(' '));
