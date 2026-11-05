const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(process.argv[2], 'packages/shared-test-utils/package.json'));
const { MongoMemoryReplSet } = req('mongodb-memory-server');
(async () => {
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0' },
    instanceOpts: [{ port: 27027, ip: '127.0.0.1', dbPath: process.argv[3], storageEngine: 'wiredTiger' }],
  });
  console.log('MONGO READY', rs.getUri());
  const stop = async () => { await rs.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch(e => { console.error(e); process.exit(1); });
