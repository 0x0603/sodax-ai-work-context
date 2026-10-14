// usage: node import-time.mjs <absolute module file>
const t0 = performance.now();
const h0 = process.memoryUsage().heapUsed;
await import(process.argv[2]);
const t1 = performance.now();
console.log(`import ${(t1 - t0).toFixed(0)} ms, +heap ${((process.memoryUsage().heapUsed - h0) / 1048576).toFixed(0)} MB, rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`);
