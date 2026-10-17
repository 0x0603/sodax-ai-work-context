import { createRequire } from 'node:module';
const [esbuildPath, cwd, code, extRe] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbuildPath); const re = new RegExp(extRe); const ext = new Set();
const r = await esbuild.build({ stdin: { contents: code, resolveDir: cwd }, bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent', metafile: true,
  plugins: [{ name: 'x', setup(b) { b.onResolve({ filter: /.*/ }, a => a.kind !== 'entry-point' && re.test(a.path) ? { path: a.path, external: true } : undefined); } }] });
const out = r.outputFiles[0].text; for (const m of out.matchAll(/from"([^"]+)"/g)) ext.add(m[1].split('/').slice(0, m[1].startsWith('@') ? 2 : 1).join('/'));
console.log(`${(out.length/1024).toFixed(1)} KB min own code; externals still imported: ${[...ext].sort().join(', ') || 'none'}`);
