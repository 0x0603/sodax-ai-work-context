// usage: node measure.mjs <esbuildPath> <nodePath> <entry> <label> [stubRegex]
import { createRequire, builtinModules } from 'node:module';
import { gzipSync } from 'node:zlib';
const [esb, nodePath, entry, label, stubRe] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esb);
const re = stubRe ? new RegExp(stubRe) : null;
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const r = await esbuild.build({
  entryPoints: [entry], bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022',
  write: false, outdir: 'unused', metafile: true, nodePaths: [nodePath], logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (builtins.has(a.path) || builtins.has(a.path.split('/')[0])) return { path: a.path, external: true };
      if (re && re.test(a.path)) return { path: a.path, namespace: 'stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
  } }],
});
const out = r.outputFiles.find((f) => f.path.endsWith('.js')).contents;
const own = Object.entries(Object.values(r.metafile.outputs).find((o) => o.entryPoint).inputs)
  .filter(([f]) => /dist\/esm\//.test(f) && !f.includes('node_modules')).reduce((s, [, i]) => s + i.bytesInOutput, 0);
console.log(`${label.padEnd(44)} | ${(gzipSync(out).length / 1024).toFixed(0).padStart(5)} KB gzip | sdk own code ${(own / 1024).toFixed(0)} KB min`);
