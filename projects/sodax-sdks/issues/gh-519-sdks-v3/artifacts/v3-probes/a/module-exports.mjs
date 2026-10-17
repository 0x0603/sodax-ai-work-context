import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const [tsPath, srcDir] = process.argv.slice(2);
const ts = createRequire(import.meta.url)(tsPath);
const files = []; (function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) files.push(p); } })(srcDir);
for (const f of files.sort()) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  let values = 0, types = 0; const imports = new Set(); const bytes = statSync(f).size;
  for (const st of sf.statements) {
    const exp = st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isImportDeclaration(st) && !st.importClause?.isTypeOnly) { const named = st.importClause?.namedBindings; const allType = named && ts.isNamedImports(named) && named.elements.every(e => e.isTypeOnly); if (!allType) imports.add(st.moduleSpecifier.text.replace(/^\.\.?\//, '').replace(/\.js$/, '')); }
    if (!exp) continue;
    if (ts.isVariableStatement(st) || ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) values += ts.isVariableStatement(st) ? st.declarationList.declarations.length : 1;
    else if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) types++;
  }
  if (values + types === 0) continue;
  console.log(`${relative(srcDir, f).padEnd(34)} ${String(bytes).padStart(7)}B values=${String(values).padStart(3)} types=${String(types).padStart(3)} valueImports: ${[...imports].join(', ')}`);
}
