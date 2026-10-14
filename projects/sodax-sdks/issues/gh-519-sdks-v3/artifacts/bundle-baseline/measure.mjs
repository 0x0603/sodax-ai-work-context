// usage: node measure.mjs <esbuildPath> <nodeModulesDir> <outDir> <entry...>
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const [esbuildPath, nodeModules, outDir, ...entries] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbuildPath);
mkdirSync(outDir, { recursive: true });
const builtins = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);
for (const entry of entries) {
  const nodeImports = new Set();
  const plugin = { name: 'node-builtins', setup(b) {
    b.onResolve({ filter: /.*/ }, a => {
      const base = a.path.split('/')[0];
      if (builtins.has(a.path) || builtins.has(base) || a.path.startsWith('node:')) { nodeImports.add(a.path); return { path: a.path, external: true }; }
      return undefined;
    });
  } };
  const name = basename(entry).replace(/\.m?js$/, '');
  const outfile = join(outDir, `${name}.js`);
  try {
    const r = await esbuild.build({
      entryPoints: [entry], bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022',
      outfile, metafile: true, nodePaths: [nodeModules], logLevel: 'silent', treeShaking: true,
      define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
      external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
      plugins: [plugin], loader: { '.node': 'empty', '.wasm': 'file' },
    });
    const buf = readFileSync(outfile);
    const byPkg = {};
    for (const [file, info] of Object.entries(r.metafile.outputs[Object.keys(r.metafile.outputs).find(k => k.endsWith('.js'))].inputs)) {
      const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
      const pkg = m ? m[m.length - 1].replace('node_modules/', '') : '(entry)';
      byPkg[pkg] = (byPkg[pkg] || 0) + info.bytesInOutput;
    }
    const top = Object.entries(byPkg).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([p, b]) => `${p}=${(b / 1024).toFixed(0)}K`).join(' ');
    console.log(`\n### ${name}: min ${(buf.length / 1024).toFixed(0)} KB | gzip ${(gzipSync(buf).length / 1024).toFixed(0)} KB | brotli ${(brotliCompressSync(buf).length / 1024).toFixed(0)} KB | pkgs ${Object.keys(byPkg).length}`);
    console.log(`  top: ${top}`);
    console.log(`  node builtins needed (polyfill in browser): ${[...nodeImports].sort().join(', ') || 'none'}`);
    writeFileSync(join(outDir, `${name}.meta.json`), JSON.stringify(r.metafile));
  } catch (e) {
    console.log(`\n### ${name}: BUILD FAILED`);
    console.log((e.errors || []).slice(0, 5).map(x => `  ${x.text} @ ${x.location?.file}`).join('\n') || e.message);
  }
}
