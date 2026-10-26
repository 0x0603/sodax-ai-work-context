const { createRequire } = require('node:module'); const path = require('node:path');
const [iconDir, viemDir] = process.argv.slice(2);
const IconRaw = require(iconDir); const Icon = IconRaw.default && IconRaw.default.Converter ? IconRaw.default : IconRaw;
const vreq = createRequire(path.join(viemDir, 'package.json'));
const { sha3_256 } = vreq('@noble/hashes/sha3'); const { secp256k1 } = vreq('@noble/curves/secp256k1');
let bad = 0;
for (let i = 0; i < 500; i++) {
  const pk = Buffer.from(secp256k1.utils.randomPrivateKey()).toString('hex');
  const pub = secp256k1.getPublicKey(pk, false).slice(1);
  const mine = 'hx' + Buffer.from(sha3_256(pub).slice(-20)).toString('hex');
  if (mine !== Icon.Wallet.loadPrivateKey(pk).getAddress()) bad++;
}
console.log('address cases=500 failures=' + bad);
