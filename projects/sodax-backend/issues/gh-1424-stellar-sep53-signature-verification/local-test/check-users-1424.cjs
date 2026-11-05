// Lists Stellar users in the LOCAL test DB and says which signature format each one used.
const path = require('node:path');
const { createRequire } = require('node:module');
const w = process.argv[2];
const reqApp = createRequire(path.join(w, 'apps/stateful-api/package.json'));
const reqUtils = createRequire(path.join(w, 'packages/shared-utils/package.json'));
const mongoose = reqApp('mongoose');
const { Keypair } = reqUtils('@stellar/stellar-sdk');
const crypto = require('node:crypto');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27027/?replicaSet=rs0', { dbName: 'sodax-stateful' });
  const col = mongoose.connection.db.collection('stateful_users');
  if (process.argv[3] === '--wipe') { const r = await col.deleteMany({}); console.log(`wiped ${r.deletedCount}`); }
  for (const u of await col.find({ chain: 'STELLAR' }).toArray()) {
    const kp = Keypair.fromPublicKey(u.address); const sig = Buffer.from(u.signature, 'base64');
    const sep53 = kp.verify(crypto.createHash('sha256').update('Stellar Signed Message:\n').update(u.message, 'utf8').digest(), sig);
    const legacy = kp.verify(Buffer.from(u.message, 'base64'), sig);
    console.log(`${u.address} format=${sep53 ? 'SEP-53' : legacy ? 'legacy' : '??'} oldCodeWouldAccept=${legacy} message="${u.message.slice(0, 60)}..."`);
  }
  await mongoose.disconnect();
})();
