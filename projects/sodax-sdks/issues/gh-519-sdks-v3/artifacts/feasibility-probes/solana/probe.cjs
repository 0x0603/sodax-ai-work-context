// Byte-for-byte probe: Anchor 0.30.1 instruction (from the live on-chain IDL) vs a hand Borsh encoder
// built from the static layout in the vendored type files. Usage: node probe.cjs <sdk dir> <idl out dir>
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const [sdkDir, outDir] = process.argv.slice(2);
const req = createRequire(path.join(sdkDir, 'package.json'));
const { PublicKey, Connection, SystemProgram } = req('@solana/web3.js');
const { AnchorProvider, Program } = req('@coral-xyz/anchor');
const BN = req('bn.js');

const AM = new PublicKey('AnCCJjheynmGqPp6Vgat9DTirGKD4CtQzP8cwTYV8qKH');
const CONN = new PublicKey('GxS8i6D9qQjbSeniD487CnomUxU2pXt6V8P96T6MkUXB');
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN22 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const pda = (seeds, pid) => PublicKey.findProgramAddressSync(seeds.map(s => (typeof s === 'string' ? Buffer.from(s) : s)), pid)[0];

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const uLE = (v, bytes) => { const b = Buffer.alloc(bytes); let x = BigInt(v); for (let i = 0; i < bytes; i++) { b[i] = Number(x & 0xffn); x >>= 8n; } return b; };
const bytes = buf => Buffer.concat([u32(buf.length), buf]);
const meta = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable });

function handTransfer({ signer, amount, to, data, mint, signerTokenAccount, tokenProgram }) {
  const native = !mint;
  const opt = (pk, w) => (pk ? meta(pk, false, w) : meta(AM, false, false));
  return {
    programId: AM,
    keys: [
      meta(signer, true, true),
      meta(SystemProgram.programId, false, false),
      meta(pda(['config-seed'], AM), false, true),
      opt(native ? pda(['vault_native'], AM) : null, true),
      opt(native ? null : pda(['vault_seed', mint.toBuffer()], AM), true),
      opt(native ? null : signerTokenAccount, true),
      meta(pda(['dapp_authority'], AM), false, false),
      opt(native ? null : mint, false),
      meta(CONN, false, false),
      meta(tokenProgram, false, false),
      meta(pda(['config'], CONN), false, true),
    ],
    data: Buffer.concat([Buffer.from([163, 52, 200, 231, 140, 3, 69, 186]), uLE(amount, 8), bytes(to), bytes(data)]),
  };
}
function handSendMessage({ signer, dstChainId, dstAddress, payload }) {
  return {
    programId: CONN,
    keys: [meta(signer, true, true), meta(CONN, false, false), meta(SystemProgram.programId, false, false), meta(pda(['config'], CONN), false, true)],
    data: Buffer.concat([Buffer.from([57, 40, 34, 178, 189, 10, 65, 26]), uLE(dstChainId, 16), bytes(dstAddress), bytes(payload)]),
  };
}
const norm = ix => JSON.stringify({ p: ix.programId.toBase58(), k: ix.keys.map(k => [k.pubkey.toBase58(), k.isSigner, k.isWritable]), d: Buffer.from(ix.data).toString('hex') });

(async () => {
  const signer = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  const provider = new AnchorProvider(new Connection('https://api.mainnet-beta.solana.com'), { publicKey: signer, signTransaction: () => Promise.reject(), signAllTransactions: () => Promise.reject() }, { commitment: 'confirmed' });
  const amIdl = await Program.fetchIdl(AM, provider);
  const cnIdl = await Program.fetchIdl(CONN, provider);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'asset_manager.json'), JSON.stringify(amIdl, null, 1));
  fs.writeFileSync(path.join(outDir, 'connection.json'), JSON.stringify(cnIdl, null, 1));
  console.log('idl addresses', amIdl.address, cnIdl.address, 'spec', amIdl.metadata?.spec, cnIdl.metadata?.spec);
  const am = new Program(amIdl, provider);
  const cn = new Program(cnIdl, provider);

  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rbuf = n => Buffer.from([...Array(n)].map(() => Math.floor(rnd() * 256)));
  const mints = [null, new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), new PublicKey('So11111111111111111111111111111111111111112')];
  let n = 0, fails = 0;
  for (let i = 0; i < 300; i++) {
    const mint = mints[i % 3];
    const tokenProgram = mint ? (i % 2 ? TOKEN22 : TOKEN) : TOKEN;
    const amount = (BigInt(Math.floor(rnd() * 2 ** 32)) << 31n) | BigInt(i);
    const to = rbuf(20 + (i % 13)), data = rbuf(32);
    const sta = mint ? new PublicKey(rbuf(32)) : null;
    const a = await am.methods.transfer(new BN(amount.toString()), to, data).accountsStrict({
      signer, systemProgram: SystemProgram.programId, config: pda(['config-seed'], am.programId),
      nativeVaultAccount: mint ? null : pda(['vault_native'], am.programId),
      tokenVaultAccount: mint ? pda(['vault_seed', mint.toBuffer()], am.programId) : null,
      signerTokenAccount: sta, authority: pda(['dapp_authority'], am.programId), mint, connection: cn.programId, tokenProgram,
    }).remainingAccounts([{ pubkey: pda(['config'], cn.programId), isSigner: false, isWritable: true }]).instruction();
    const h = handTransfer({ signer, amount, to, data, mint, signerTokenAccount: sta, tokenProgram });
    n++; if (norm(a) !== norm(h)) { fails++; if (fails < 3) console.log('transfer mismatch', norm(a), norm(h)); }

    const dst = (BigInt(Math.floor(rnd() * 2 ** 48)) << 64n) | BigInt(i);
    const da = rbuf(20 + (i % 7)), pl = rbuf(32);
    const b = await cn.methods.sendMessage(new BN(dst.toString()), da, pl).accountsStrict({
      signer, dapp: null, config: pda(['config'], cn.programId), systemProgram: SystemProgram.programId,
    }).instruction();
    const hs = handSendMessage({ signer, dstChainId: dst, dstAddress: da, payload: pl });
    n++; if (norm(b) !== norm(hs)) { fails++; if (fails < 3) console.log('sendMessage mismatch', norm(b), norm(hs)); }
  }
  console.log(`instructions=${n} failures=${fails}`);
})().catch(e => { console.error('probe error', e.message); process.exit(1); });
