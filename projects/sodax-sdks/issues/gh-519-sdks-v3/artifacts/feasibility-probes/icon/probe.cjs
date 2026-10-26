// Known-answer probe: hand-rolled ICON v3 raw tx + serialization + sha3-256 + secp256k1 signature
// vs icon-sdk-js 1.5.3. Usage: node probe.cjs <icon-sdk-js dir> <viem dir>
const { createRequire } = require('node:module');
const path = require('node:path');
const [iconDir, viemDir] = process.argv.slice(2);
const IconRaw = require(iconDir);
const Icon = IconRaw.default && IconRaw.default.Converter ? IconRaw.default : IconRaw;
const vreq = createRequire(path.join(viemDir, 'package.json'));
const { sha3_256 } = vreq('@noble/hashes/sha3');
const { secp256k1 } = vreq('@noble/curves/secp256k1');

const toHex = v => '0x' + BigInt(v).toString(16);
function buildRaw({ from, to, stepLimit, nid, version, timestamp, value, method, params }) {
  const raw = { to, from, stepLimit: toHex(stepLimit), nid, version, timestamp: toHex(timestamp) };
  if (value !== undefined) raw.value = value;
  raw.dataType = 'call';
  raw.data = params === undefined ? { method } : { method, params };
  return raw;
}
const esc = s => s.replace(/([\\.{}[\]])/g, '\\$1');
function val(v) {
  if (v === null || v === undefined) return '\\0';
  if (typeof v === 'string') return esc(v);
  if (Array.isArray(v)) return '[' + v.map(val).join('.') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map(k => k + '.' + val(v[k])).join('.') + '}';
  return esc(String(v));
}
function serialize(raw) {
  const { signature, txHash, ...rest } = raw;
  return 'icx_sendTransaction.' + val(rest).slice(1, -1);
}
const s0 = raw => Buffer.from(sha3_256(new TextEncoder().encode(serialize(raw)))).toString('hex');
function sign(raw, privHex) {
  const hash = sha3_256(new TextEncoder().encode(serialize(raw)));
  const sig = secp256k1.sign(hash, privHex);
  const out = new Uint8Array(65);
  out.set(sig.toCompactRawBytes(), 0);
  out[64] = sig.recovery;
  return { hash: Buffer.from(hash).toString('hex'), signature: Buffer.from(out).toString('base64') };
}

// deterministic PRNG
let seed = 0x1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const rhex = n => [...Array(n)].map(() => Math.floor(rnd() * 16).toString(16)).join('');
const nasty = ['a.b', 'x{y}', '[z]', 'back\\slash', 'plain', '', '日本'];

const pk = 'a'.repeat(63) + '1';
const wallet = Icon.Wallet.loadPrivateKey(pk);
const from = wallet.getAddress();
let fails = 0;
const N = 2000;
for (let i = 0; i < N; i++) {
  const params = {
    dstChainId: toHex(Math.floor(rnd() * 1e6)),
    dstAddress: '0x' + rhex(40),
    payload: '0x' + rhex(Math.floor(rnd() * 200)),
    note: nasty[i % nasty.length],
    nested: { b: ['1', nasty[(i + 1) % nasty.length], null], a: { z: '0x1' } },
  };
  const tx = {
    from, to: 'cx' + rhex(40), stepLimit: 2000000 + i, nid: '0x1', version: '0x3',
    timestamp: Date.now() * 1000 + i, value: i % 2 ? toHex(i * 1e12) : undefined,
    method: i % 3 ? 'sendMessage' : 'transfer', params,
  };
  // Mirrors IconSpokeService.ts:80-91 (Converter.toBigNumber stepLimit, number timestamp)
  let b = new Icon.CallTransactionBuilder().from(tx.from).to(tx.to)
    .stepLimit(Icon.Converter.toBigNumber(String(tx.stepLimit))).nid(tx.nid).version(tx.version)
    .timestamp(tx.timestamp);
  if (tx.value !== undefined) b = b.value(tx.value);
  const built = b.method(tx.method).params(tx.params).build();
  const sdkRaw = Icon.Converter.toRawTransaction(built);
  const mine = buildRaw(tx);
  const canon = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v));
  const rawEq = canon(sdkRaw) === canon(mine);
  const sdkSer = Icon.Util.serialize({ ...sdkRaw });
  const serEq = sdkSer === serialize(mine) || sdkSer === s0(mine);
  const signed = new Icon.SignedTransaction(built, wallet);
  const props = signed.getProperties();
  const s = sign(mine, pk);
  const sigEq = props.signature === s.signature;
  if (!rawEq || !serEq || !sigEq) {
    fails++;
    if (fails < 4) console.log({ i, rawEq, serEq, sigEq, sdkSer, mine: serialize(mine) });
  }
}
console.log(`cases=${N} failures=${fails}`);
console.log('txHash check', Icon.Util.makeTxHash ? 'makeTxHash present' : '');
