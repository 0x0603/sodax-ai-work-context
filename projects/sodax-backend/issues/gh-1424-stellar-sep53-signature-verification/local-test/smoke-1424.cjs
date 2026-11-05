const path = require('node:path'); const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire(path.join(process.argv[2], 'packages/shared-utils/package.json'));
const { Keypair } = req('@stellar/stellar-sdk');
const msg = `By signing this I confirm that I have read and I agree to the terms of service and legal disclaimer provided by SODAX on ${new Date().toISOString()}`;
const sep53 = (kp) => kp.sign(crypto.createHash('sha256').update('Stellar Signed Message:\n').update(msg, 'utf8').digest()).toString('base64');
const legacy = (kp) => kp.sign(Buffer.from(msg, 'base64')).toString('base64');
async function post(name, address, signature) {
  const r = await fetch('http://localhost:3007/api/users/register', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' }, body: JSON.stringify({ address, signature, message: msg, chain: 'STELLAR' }) });
  const body = await r.text();
  console.log(`${name}: ${r.status} acao=${r.headers.get('access-control-allow-origin')} ${body.slice(0, 120)}`);
}
(async () => {
  const a = Keypair.random(), b = Keypair.random(), c = Keypair.random();
  await post('SEP-53', a.publicKey(), sep53(a));
  await post('legacy', b.publicKey(), legacy(b));
  await post('wrong key', c.publicKey(), sep53(Keypair.random()));
  await post('SEP-53 again (dup)', a.publicKey(), sep53(a));
  const g = await fetch(`http://localhost:3007/api/users/${a.publicKey()}/chain/STELLAR`);
  console.log(`GET user: ${g.status} ${(await g.text()).slice(0, 120)}`);
})();
