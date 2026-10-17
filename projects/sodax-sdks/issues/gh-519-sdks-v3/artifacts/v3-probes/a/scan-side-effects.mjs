// Usage: node scan-side-effects.mjs <typescript-module-path> <pkgSrcDir> [--list soft|hard|enum|all]
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const [tsPath, srcDir, , listMode = 'hard'] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const ts = require(tsPath);
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); const s = statSync(p);
  if (s.isDirectory()) { if (/^(e2e-tests|e2e|tests|__tests__|__mocks__|test-utils|mocks|fixtures)$/.test(n)) continue; walk(p); }
  else if (/\.(ts|tsx)$/.test(n) && !/\.(test|spec|e2e)\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n) && !/(test-utils|testUtils|vitest)/.test(n)) files.push(p); } };
walk(srcDir);
const HARD_CALLEE = /^(initEccLib|ECPairFactory|BIP32Factory|create|createStore|createJSONStorage|persist|register\w*|Object\.defineProperty|Object\.assign|setInterval|setTimeout|addEventListener|globalThis\.\w+|window\.\w+)$/;
const unwrap = e => { while (e && (ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isParenthesizedExpression(e) || ts.isTypeAssertionExpression?.(e) || ts.isNonNullExpression(e))) e = e.expression; return e; };
const findings = [];
const add = (file, sf, node, kind, detail) => { const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf)); findings.push({ file: relative(process.cwd(), file), line: line + 1, kind, detail: detail.replace(/\s+/g, ' ').slice(0, 110) }); };
function scanExpr(expr, sf, file, stmt, name) {
  // collect calls/news/property reads not inside nested functions
  const calls = []; const reads = [];
  const visit = n => {
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isClassExpression(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n)) return;
    if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n)) calls.push(n);
    if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && !(n.parent && (ts.isCallExpression(n.parent) && n.parent.expression === n))) reads.push(n);
    if (ts.isSpreadAssignment(n) || ts.isSpreadElement(n)) reads.push(n);
    ts.forEachChild(n, visit);
  };
  visit(expr);
  if (calls.length) {
    const callee = c => ts.isTaggedTemplateExpression(c) ? c.tag.getText(sf) : c.expression.getText(sf);
    const hard = calls.some(c => HARD_CALLEE.test(callee(c)));
    add(file, sf, stmt, hard ? 'HARD-call' : 'soft-call', `${name} = ${calls.slice(0, 3).map(c => (ts.isNewExpression(c) ? 'new ' : '') + callee(c)).join(', ')}${calls.length > 3 ? ` (+${calls.length - 3})` : ''}`);
  } else if (reads.length) {
    add(file, sf, stmt, 'soft-read', `${name} reads ${reads.slice(0, 3).map(r => r.getText(sf).slice(0, 40)).join(', ')}${reads.length > 3 ? ` (+${reads.length - 3})` : ''}`);
  }
}
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && !st.importClause) { add(file, sf, st, 'HARD-side-effect-import', st.getText(sf)); continue; }
    if (ts.isExpressionStatement(st)) { add(file, sf, st, 'HARD-top-level-stmt', st.getText(sf)); continue; }
    if (ts.isIfStatement(st) || ts.isForStatement(st) || ts.isForOfStatement(st) || ts.isTryStatement(st) || ts.isBlock(st)) { add(file, sf, st, 'HARD-top-level-stmt', st.getText(sf)); continue; }
    if (ts.isEnumDeclaration(st)) { const isConst = st.modifiers?.some(m => m.kind === ts.SyntaxKind.ConstKeyword); const isDeclare = st.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword); if (!isDeclare) add(file, sf, st, isConst ? 'const-enum' : 'enum-IIFE', `enum ${st.name.text}`); continue; }
    if (ts.isModuleDeclaration(st) && !st.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword) && st.body && ts.isModuleBlock(st.body) && st.body.statements.some(s => !ts.isInterfaceDeclaration(s) && !ts.isTypeAliasDeclaration(s))) { add(file, sf, st, 'namespace-IIFE', `namespace ${st.name.getText(sf)}`); continue; }
    if (ts.isExportAssignment(st)) { scanExpr(st.expression, sf, file, st, 'export default'); continue; }
    if (ts.isClassDeclaration(st)) {
      if (st.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword)) continue;
      if (ts.canHaveDecorators?.(st) && ts.getDecorators?.(st)?.length) add(file, sf, st, 'HARD-decorator', `class ${st.name?.text}`);
      for (const h of st.heritageClauses ?? []) for (const t of h.types) if (ts.isCallExpression(unwrap(t.expression))) add(file, sf, st, 'soft-call', `class ${st.name?.text} extends ${t.expression.getText(sf)}`);
      for (const m of st.members) {
        if (ts.isClassStaticBlockDeclaration?.(m)) add(file, sf, m, 'HARD-static-block', `class ${st.name?.text} static {}`);
        if (ts.isPropertyDeclaration(m) && m.modifiers?.some(x => x.kind === ts.SyntaxKind.StaticKeyword) && m.initializer) scanExpr(m.initializer, sf, file, m, `${st.name?.text}.${m.name.getText(sf)} (static)`);
      }
      continue;
    }
    if (ts.isVariableStatement(st)) {
      if (st.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword)) continue;
      for (const d of st.declarationList.declarations) { if (!d.initializer) continue; const init = unwrap(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isClassExpression(init)) continue;
        scanExpr(init, sf, file, d, d.name.getText(sf)); }
    }
  }
}
const counts = {}; for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
const filesBy = k => new Set(findings.filter(f => f.kind === k).map(f => f.file)).size;
console.log(`files scanned: ${files.length}`);
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v} in ${filesBy(k)} files`);
const want = listMode === 'all' ? () => true : listMode === 'hard' ? f => f.kind.startsWith('HARD') : listMode === 'enum' ? f => /enum|namespace/.test(f.kind) : f => f.kind.startsWith(listMode);
for (const f of findings.filter(want)) console.log(`${f.kind}\t${f.file}:${f.line}\t${f.detail}`);
