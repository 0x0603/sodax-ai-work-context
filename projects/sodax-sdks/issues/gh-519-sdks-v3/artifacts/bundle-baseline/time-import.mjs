// usage: node time-import.mjs <file>  — one fresh process per call; prints ms and RSS
const t0 = performance.now();
await import(process.argv[2]);
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms: Math.round(ms), rss: Math.round(process.memoryUsage().rss / 1048576) }));
