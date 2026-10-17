import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const src = process.argv[2]; const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) && !/\.d\.ts$/.test(n)) files.push(p); } })(src);
const graph = new Map();
for (const f of files) { const t = readFileSync(f, 'utf8'); const deps = [];
  for (const m of t.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    if (/^\s*import\s+type\b|^\s*export\s+type\b/.test(m[0])) continue;
    let p = resolve(dirname(f), m[1]).replace(/\.js$/, ''); const c = [p + '.ts', p + '.tsx', join(p, 'index.ts')].find(existsSync); if (c) deps.push(c); }
  graph.set(f, deps); }
const color = new Map(); const cycles = []; const stack = [];
const dfs = n => { color.set(n, 1); stack.push(n); for (const d of graph.get(n) ?? []) { if (color.get(d) === 1) cycles.push(stack.slice(stack.indexOf(d)).concat(d).map(x => x.replace(src + '/', ''))); else if (!color.get(d)) dfs(d); } stack.pop(); color.set(n, 2); };
for (const f of files) if (!color.get(f)) dfs(f);
console.log(`${src.split('/packages/')[1]}: ${files.length} files, ${cycles.length} value-import cycles`); for (const c of cycles.slice(0, 5)) console.log('  ' + c.join(' -> '));
