// Top-level side-effect scan: hard = top-level expression statements (calls, assignments);
// soft = top-level const initializers that call/construct (kept by bundlers unless annotated).
const ts = require('/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/node_modules/.pnpm/typescript@5.5.4/node_modules/typescript');
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const pkgs = ['sdk','wallet-sdk-core','wallet-sdk-react','dapp-kit','types','swaps-api','bridge-api','libs'];
function walk(d, out=[]) { for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) { if (!/node_modules|__tests__|e2e/.test(e.name)) walk(p,out);} else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(e.name)) out.push(p);} return out; }
function hasCall(n) { let f=false; (function v(x){ if (f) return; if (ts.isArrowFunction(x)||ts.isFunctionExpression(x)||ts.isClassExpression(x)) return; if (ts.isCallExpression(x)||ts.isNewExpression(x)||ts.isTaggedTemplateExpression(x)) { f=true; return;} ts.forEachChild(x,v); })(n); return f; }
for (const pk of pkgs) {
  const files = walk(path.join(root,'packages',pk,'src'));
  let hard=[], soft=0, softFiles=new Set(), enums=0, sideImports=[];
  for (const f of files) {
    const sf = ts.createSourceFile(f, fs.readFileSync(f,'utf8'), ts.ScriptTarget.Latest, true);
    for (const st of sf.statements) {
      const rel = path.relative(root,f)+':'+(sf.getLineAndCharacterOfPosition(st.getStart()).line+1);
      if (ts.isExpressionStatement(st)) { if (ts.isStringLiteral(st.expression)) continue; hard.push(rel+'  '+st.getText().slice(0,60).replace(/\s+/g,' ')); }
      else if (ts.isImportDeclaration(st) && !st.importClause) sideImports.push(rel+' '+st.moduleSpecifier.getText());
      else if (ts.isEnumDeclaration(st) && !(st.modifiers||[]).some(m=>m.kind===ts.SyntaxKind.ConstKeyword) && !(st.modifiers||[]).some(m=>m.kind===ts.SyntaxKind.DeclareKeyword)) enums++;
      else if (ts.isVariableStatement(st)) { for (const d of st.declarationList.declarations) if (d.initializer && hasCall(d.initializer)) { soft++; softFiles.add(f);} }
    }
  }
  console.log(`## ${pk}: files=${files.length} hard=${hard.length} soft=${soft} (in ${softFiles.size} files) enumIIFE=${enums} sideEffectImports=${sideImports.length}`);
  for (const h of hard) console.log('   HARD', h);
  for (const h of sideImports) console.log('   IMPORT', h);
}
