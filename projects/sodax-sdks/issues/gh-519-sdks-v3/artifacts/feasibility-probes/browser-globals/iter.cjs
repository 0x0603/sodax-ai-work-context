// node iter.cjs <bundle> [globals...]: add globals one at a time as failures appear
const vm = require('vm'), fs = require('fs');
const f = process.argv[2]; const code = fs.readFileSync(f, 'utf8'); const L = code.split('\n');
const extra = {}; const added = [];
for (let k = 0; k < 6; k++) {
  const g = { console, TextEncoder, TextDecoder, URL, URLSearchParams, fetch, Headers, Request, Response, AbortController, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, crypto: globalThis.crypto, Uint8Array, atob, btoa, navigator: { userAgent: 'p' }, ...extra };
  g.globalThis = g; g.window = g; g.self = g;
  try { vm.runInContext(code, vm.createContext(g), { filename: 'B.js' }); console.log(`ok after adding [${added}]`, typeof g.__r === 'object' ? 'result object' : g.__r); break; }
  catch (e) { const n = +(/B.js:(\d+)/.exec(e.stack) || [])[1]; let src = ''; for (let i = n - 1; i > 0; i--) if (/^\s*\/\/ .*node_modules/.test(L[i])) { src = L[i].replace(/.*node_modules\/(\.pnpm\/)?/, ''); break; } else if (/^\s*\/\/ .*packages\//.test(L[i])) { src = L[i].replace(/.*packages\//, 'packages/'); break; }
    console.log(`fail [${added}]: ${e.message} | ${src}`);
    const m = /^(\w+) is not defined/.exec(e.message); if (!m) break;
    extra[m[1]] = m[1] === 'Buffer' ? Buffer : m[1] === 'process' ? { env: {}, version: '', versions: {}, nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)), browser: true } : m[1] === 'global' ? undefined : undefined;
    if (m[1] === 'global') extra.global = 'SELF'; added.push(m[1]); if (extra.global === 'SELF') { extra.global = undefined; } }
}
