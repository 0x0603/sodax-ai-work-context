// Usage: node scan-imports.mjs <ts-path> <module-specifier-regex> <dir>... ; prints value vs type import names
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const [tsPath, specRe, ...dirs] = process.argv.slice(2);
const ts = createRequire(import.meta.url)(tsPath);
const re = new RegExp(specRe);
const files = [];
const walk = d => { for (const n of readdirSync(d)) { if (n === 'node_modules' || n === 'dist' || n === '.next' || n === '.turbo') continue; const p = join(d, n); const s = statSync(p);
  if (s.isDirectory()) walk(p); else if (/\.(ts|tsx|mts|cts)$/.test(n) && !/\.d\.ts$/.test(n)) files.push(p); } };
for (const d of dirs) walk(d);
const value = new Map(), type = new Map(), star = [];
const bump = (m, k, f) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(f); };
const isTest = f => /\.(test|spec)\.|e2e|__tests__|\/tests?\//.test(f);
for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const st of sf.statements) {
    if (!(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) || !st.moduleSpecifier) continue;
    const spec = st.moduleSpecifier.text; if (!re.test(spec)) continue;
    if (ts.isExportDeclaration(st)) { if (!st.exportClause) star.push(`${f} export * from ${spec}`); else for (const e of st.exportClause.elements) bump(st.isTypeOnly || e.isTypeOnly ? type : value, (e.propertyName ?? e.name).text, f); continue; }
    const c = st.importClause; if (!c) { star.push(`${f} side-effect import ${spec}`); continue; }
    if (c.name) bump(c.isTypeOnly ? type : value, 'default', f);
    if (c.namedBindings) { if (ts.isNamespaceImport(c.namedBindings)) star.push(`${f} import * as ${c.namedBindings.name.text} from ${spec}`); else for (const e of c.namedBindings.elements) bump(c.isTypeOnly || e.isTypeOnly ? type : value, (e.propertyName ?? e.name).text, f); }
  }
}
const prod = m => [...m.entries()].map(([k, s]) => [k, [...s].filter(f => !isTest(f)).length, s.size]).filter(([, p, t]) => t > 0).sort((a, b) => b[2] - a[2]);
console.log(`files: ${files.length}`);
console.log(`VALUE imports (${value.size} names): name prodFiles/allFiles`);
console.log(prod(value).map(([k, p, t]) => `${k} ${p}/${t}`).join(' | '));
console.log(`TYPE-only imports: ${type.size} names`);
if (star.length) console.log('STAR/side-effect:\n' + star.join('\n'));
