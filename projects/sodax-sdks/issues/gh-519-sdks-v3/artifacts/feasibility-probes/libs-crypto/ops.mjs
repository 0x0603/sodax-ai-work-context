import * as s from './package/dist/stacks/core/index.mjs';
const key = '0000000000000000000000000000000000000000000000000000000000000001' + '01'; // dummy test key
const out = {};
out.address = s.getAddressFromPrivateKey(key, 'mainnet');
out.pubkey = s.privateKeyToPublic(key);
out.cv = s.serializeCV(s.Cl.tuple({ a: s.Cl.uint(5), b: s.Cl.stringAscii('sodax'), c: s.Cl.bufferFromHex('deadbeef') }));
out.cvRoundTrip = s.cvToString(s.deserializeCV(out.cv));
const call = await s.makeContractCall({ contractAddress: 'SP000000000000000000002Q6VF78', contractName: 'pox-4', functionName: 'get-info', functionArgs: [s.Cl.uint(1), s.Cl.principal('SP000000000000000000002Q6VF78')], senderKey: key, network: 'mainnet', fee: 1000n, nonce: 0n, postConditionMode: 'allow', validateWithAbi: false });
out.contractCall = call.serialize(); out.contractCallTxid = call.txid();
const unsigned = await s.makeUnsignedContractCall({ contractAddress: 'SP000000000000000000002Q6VF78', contractName: 'pox-4', functionName: 'get-info', functionArgs: [], publicKey: out.pubkey, network: 'mainnet', fee: 1000n, nonce: 2n, postConditionMode: 'allow', validateWithAbi: false });
out.unsignedCall = unsigned.serialize();
const xfer = await s.makeSTXTokenTransfer({ recipient: 'SP000000000000000000002Q6VF78', amount: 12345n, senderKey: key, network: 'mainnet', fee: 200n, nonce: 1n, memo: 'probe' });
out.stxTransfer = xfer.serialize();
out.valid = s.validateStacksAddress(out.address);
console.log(JSON.stringify(out));
