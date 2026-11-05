const path = require('node:path');
const w = process.argv[2];
const { createRequire } = require('node:module');
const req = createRequire(path.join(w, 'packages/shared-utils/package.json'));
const { Keypair } = req('@stellar/stellar-sdk');
const { verifyStellarSignature } = require(path.join(w, 'packages/shared-utils/dist/utils/chain-utils.js'));
const addr = 'GC6E42U7HW3TFWJAUGEVBGGROIKKGFKHFUHJEGL6W74CTL2VJTTPOBXD';
const vectors = [
  ['Freighter', 'By signing this I confirm that I have read and I agree to the terms of service and legal disclaimer provided by SODAX on 2026-10-30T09:43:37.485Z', 'wVvJgwpWdD/SdXatGsQHu7Wk8p1O/AtjlmrsnFWogvX+bGSlln1ukSj4+cydg3pEhW+pMFpQRNnHifsakpaMCA=='],
  ['Hana dev', 'By signing this I confirm that I have read and I agree to the terms of service and legal disclaimer provided by SODAX on 2026-10-30T09:47:14.570Z', 'RB/psLqPxF1xoJCVECgFUhdw0ekIw4oxKEYcKD3oqziLSkoeYKfgL4F952JEBxsnfWNlY9wXdzxbsdcRUqdVAw=='],
];
const oldVerify = (m, s, pk) => { try { return Keypair.fromPublicKey(pk).verify(Buffer.from(m, 'base64'), Buffer.from(s, 'base64')); } catch { return false; } };
console.error = () => {};
for (const [name, m, s] of vectors) console.log(`${name}: old=${oldVerify(m, s, addr)} new=${verifyStellarSignature(m, s, addr)}`);
