// Per-file transpile (isolatedModules-equivalent of `tsc` JS emit). Usage: node transpile-pkg.mjs <ts-path> <srcDir> <outDir>
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
const [tsPath, srcDir, outDir] = process.argv.slice(2);
const ts = createRequire(import.meta.url)(tsPath);
let n = 0;
const walk = d => { for (const name of readdirSync(d)) { const p = join(d, name); const s = statSync(p);
  if (s.isDirectory()) { if (/^(e2e-tests|__tests__|__mocks__)$/.test(name)) continue; walk(p); continue; }
  if (!/\.tsx?$/.test(name) || /\.d\.ts$/.test(name) || /\.(test|spec)\.tsx?$/.test(name)) continue;
  const out = join(outDir, relative(srcDir, p)).replace(/\.tsx?$/, '.js');
  const r = ts.transpileModule(readFileSync(p, 'utf8'), { fileName: p, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, verbatimModuleSyntax: true, isolatedModules: true, jsx: ts.JsxEmit.ReactJSX, sourceMap: false } });
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, r.outputText); n++; } };
walk(srcDir);
console.log(`transpiled ${n} files -> ${outDir}`);
