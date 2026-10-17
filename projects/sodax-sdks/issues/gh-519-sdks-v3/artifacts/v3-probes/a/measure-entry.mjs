// Usage: node measure-entry.mjs <esbuild-path> <absWorkingDir> <label> <entry-code> [externalRegex]
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
const [esbuildPath, cwd, label, code, extRe = '^(?!@sodax/)[^./]'] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbuildPath);
const re = new RegExp(extRe);
const r = await esbuild.build({ stdin: { contents: code, resolveDir: cwd, loader: 'js' }, absWorkingDir: cwd, bundle: true, minify: true, format: 'esm', platform: 'browser', write: false, metafile: true, logLevel: "silent",
  plugins: [{ name: 'ext', setup(b) { b.onResolve({ filter: /.*/ }, a => (a.kind !== 'entry-point' && re.test(a.path) ? { path: a.path, external: true } : undefined)); } }] });
const out = r.outputFiles[0].contents;
const inputs = Object.entries(r.metafile.outputs)[0][1].inputs;
const byPkg = {};
for (const [f, v] of Object.entries(inputs)) { const m = f.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\/(?:dist\/)?([^/]+)/); const k = m ? `${m[1]}/${m[2]}` : f; byPkg[k] = (byPkg[k] ?? 0) + v.bytesInOutput; }
const top = Object.entries(byPkg).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${(v / 1024).toFixed(1)}K`).join(' ');
console.log(`${label}: min ${(out.length / 1024).toFixed(1)} KB, gzip ${(gzipSync(out).length / 1024).toFixed(1)} KB, modules ${Object.keys(inputs).length} | ${top}`);
