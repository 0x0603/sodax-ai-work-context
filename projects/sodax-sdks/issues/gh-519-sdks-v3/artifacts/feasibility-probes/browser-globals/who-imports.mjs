// usage: node who-imports.mjs <esbuildDir> <resolveDir> <specifierRegex> <contents>
import { createRequire } from 'node:module';
const [esbDir, resolveDir, spec, contents] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbDir);
const r = await esbuild.build({ stdin: { contents, resolveDir, loader: 'js' }, bundle: true, write: false, format: 'esm',
  platform: 'browser', logLevel: 'silent', metafile: true, external: ['crypto', 'stream'] });
const re = new RegExp(spec);
const short = (p) => p.replace(/.*node_modules\/(\.pnpm\/)?/, '').replace(/\/node_modules\//, ' > ');
for (const [file, info] of Object.entries(r.metafile.inputs)) for (const imp of info.imports) if (re.test(imp.path) || re.test(imp.original ?? '')) console.log(`${short(file)}  ->  ${imp.original ?? imp.path}  (${short(imp.path)})`);
