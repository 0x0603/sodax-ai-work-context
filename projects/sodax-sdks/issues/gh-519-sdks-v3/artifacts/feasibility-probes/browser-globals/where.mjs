import vm from 'node:vm'; import { readFileSync } from 'node:fs';
const f = process.argv[2]; const code = readFileSync(f, 'utf8');
const g = { console, TextEncoder, TextDecoder, URL, fetch, setTimeout, clearTimeout, queueMicrotask, crypto: globalThis.crypto, Uint8Array, navigator: { userAgent: 'p' } };
g.globalThis = g; g.window = g; g.self = g;
try { vm.runInContext(code, vm.createContext(g), { filename: f }); console.log('ok'); }
catch (e) { const m = /:(\d+):(\d+)/.exec(e.stack.split('\n').find((l) => l.includes(f)) || ''); console.log(e.message, m && m[1]);
  if (m) { const lines = code.split('\n'); const n = +m[1];
    for (let i = n - 1; i > 0; i--) if (/^\s*\/\/ .*node_modules/.test(lines[i])) { console.log(lines[i].replace(/.*node_modules\/(\.pnpm\/)?/, '')); break; }
    console.log(lines[n - 1].trim().slice(0, 160)); } }
