// node one.mjs <esbuildDir> <resolveDir> <out> <contents>
import { createRequire } from 'node:module'; import { writeFileSync } from 'node:fs';
const [esbDir, resolveDir, out, contents] = process.argv.slice(2);
const esbuild = createRequire(import.meta.url)(esbDir);
const r = await esbuild.build({ stdin: { contents, resolveDir, loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'error', external: [] });
writeFileSync(out, r.outputFiles[0].text);
