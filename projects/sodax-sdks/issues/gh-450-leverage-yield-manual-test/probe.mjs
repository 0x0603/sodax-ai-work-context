#!/usr/bin/env node
/**
 * Zero-cost probe harness for GitHub issue icon-project/sodax-sdks#450.
 *
 * Exercises every read / quote / validation path that the two leverage-yield demo pages
 * depend on, WITHOUT signing anything or spending a cent:
 *
 *   - Group A: Leverage Yield API v2 over HTTP        (what /leverage-yield-api renders)
 *   - Group B: the SDK service against the Sonic hub  (what /leverage-yield renders)
 *   - Group C: API vs SDK parity — the two pages must agree on the same vault
 *   - Group D: negative / validation paths on both sides
 *
 * Group C is the point of the harness. Both demo pages show the same four numbers
 * (APR, total assets, LTV, share preview) sourced independently — HTTP vs on-chain —
 * so a drift between them is a real defect that neither page surfaces on its own.
 *
 * Usage:
 *   node probe.mjs                      # production gateway
 *   LY_API=https://canary-api.sodax.com/v1 node probe.mjs
 *   LY_SKIP_SDK=1 node probe.mjs        # HTTP only, no repo build needed
 *
 * Requires (for group B/C only): a built sodax-sdks checkout — by default the sibling
 * `sodax-sdks` of this repo in the workspace folder; override with LY_SDK. Run
 * `pnpm i && pnpm build:packages` there first. Reads go to the public Sonic RPC, so
 * they are rate-limited.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const API = process.env.LY_API ?? 'https://api.sodax.com/v1';
const SKIP_SDK = process.env.LY_SKIP_SDK === '1';

// This file lives at <workspace>/sodax-ai-work-context/projects/sodax-sdks/issues/<issue>/,
// and sodax-sdks is its sibling under <workspace>. Derive rather than hard-code: the
// workspace path differs per machine (see the workspace AGENTS.md).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '../../../../..');
const SDK_ROOT = process.env.LY_SDK ?? path.join(WORKSPACE, 'sodax-sdks');

// A chain key the solver routes today. NOTE the prefix — a bare 'arbitrum' is a 400.
const SRC_CHAIN = '0xa4b1.arbitrum';
const ARB_WEETH = '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe';
// Any address works for the balance reads; an unfunded one legitimately reads 0.
const PROBE_OWNER = '0x0000000000000000000000000000000000000001';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = '') {
  pass++;
  console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail) {
  fail++;
  failures.push(`${name} — ${detail}`);
  console.log(`  \x1b[31mFAIL\x1b[0m ${name} — ${detail}`);
}

function check(name, condition, detail = '') {
  if (condition) ok(name, detail);
  else bad(name, detail || 'assertion failed');
}

async function http(method, endpoint, body) {
  const url = `${API}${endpoint}`;
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, json: undefined, text: String(error), ms: Date.now() - started };
  }
}

/** An unsigned decimal-string bigint field, as most API numeric fields are encoded. */
function isNumericString(v) {
  return typeof v === 'string' && /^\d+$/.test(v);
}

/** A SIGNED decimal string — `netAprRay` is routinely negative, see A06/A24. */
function isSignedNumericString(v) {
  return typeof v === 'string' && /^-?\d+$/.test(v);
}

const RAY = 10n ** 27n;

/** RAY (1e27) -> percent, for human-readable assertion detail. */
function rayPct(v) {
  return (Number(BigInt(v)) / Number(RAY)) * 100;
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ──────────────────────────────────────────────────────────────────────────
// Group A — Leverage Yield API v2 read + quote surface
// ──────────────────────────────────────────────────────────────────────────

async function groupA() {
  section(`A. Leverage Yield API v2 read surface — ${API}`);

  const vaultsRes = await http('GET', '/leverage-yield/vaults');
  check('A01 GET /vaults returns 200', vaultsRes.status === 200, `status=${vaultsRes.status} in ${vaultsRes.ms}ms`);
  const vaults = Array.isArray(vaultsRes.json) ? vaultsRes.json : [];
  check('A02 /vaults returns a non-empty registry', vaults.length > 0, `${vaults.length} vaults`);
  check(
    'A03 every vault carries name/vault/asset/borrowToken/lsdSource',
    vaults.length > 0 && vaults.every(v => v.name && v.vault && v.asset && v.borrowToken && v.lsdSource),
    vaults.map(v => v.name).join(', '),
  );

  if (vaults.length === 0) {
    bad('A-- aborting group A', 'no vaults to probe');
    return { vaults: [] };
  }

  // Per-vault read fan-out. Every vault, not just the first — a vault whose underlying is
  // staging-only behaves differently and that is exactly what we want to surface.
  for (const v of vaults) {
    const q = `?vault=${v.vault}`;

    const byName = await http('GET', `/leverage-yield/vaults/${v.name}`);
    check(`A04 GET /vaults/${v.name}`, byName.status === 200 && byName.json?.vault === v.vault, `status=${byName.status}`);

    const asset = await http('GET', `/leverage-yield/asset${q}`);
    check(
      `A05 GET /asset (${v.name}) matches the registry`,
      asset.status === 200 && asset.json?.asset?.toLowerCase() === v.asset.toLowerCase(),
      `status=${asset.status} asset=${asset.json?.asset}`,
    );

    const apr = await http('GET', `/leverage-yield/apr${q}`);
    check(
      `A06 GET /apr (${v.name})`,
      apr.status === 200 && isSignedNumericString(apr.json?.netAprRay) && isNumericString(apr.json?.targetLtvBps),
      `status=${apr.status} targetLtv=${apr.json?.targetLtvBps}bps net=${
        apr.status === 200 ? `${rayPct(apr.json.netAprRay).toFixed(2)}%` : 'n/a'
      }`,
    );

    const eff = await http('GET', `/leverage-yield/apr/effective${q}`);
    check(`A07 GET /apr/effective (${v.name})`, eff.status === 200, `status=${eff.status}`);

    // The headline number. `/apr` alone is the on-chain-rates-only view and is NEGATIVE for
    // every vault today (Aave supply on the sodaXXX collateral is ~0 while the borrow leg
    // costs real money). Only `/apr/effective` folds in the off-chain LSD yield and turns
    // positive. A UI that renders `netAprRay` instead of `effectiveNetAprRay` would show
    // users a negative APR on a product that yields ~8-14%, so pin the relationship here.
    if (apr.status === 200 && eff.status === 200) {
      check(
        `A24 ${v.name} raw netApr is negative while effectiveNetApr is positive`,
        BigInt(apr.json.netAprRay) < 0n && BigInt(eff.json.effectiveNetAprRay) > 0n,
        `raw=${rayPct(apr.json.netAprRay).toFixed(2)}% effective=${rayPct(eff.json.effectiveNetAprRay).toFixed(2)}%`,
      );
      // Composition, exact: the effective supply leg is the off-chain LSD yield PLUS the
      // Aave supply rate on the collateral. Pinning the identity (not just "they look close")
      // is what catches a backend that silently drops one of the two terms.
      const lsdRay = BigInt(eff.json.lsdApr?.aprRay ?? '0');
      const aaveSupplyRay = BigInt(eff.json.supplyAprRay ?? '0');
      check(
        `A25 ${v.name} effectiveSupplyApr === lsdApr + aave supplyApr`,
        BigInt(eff.json.effectiveSupplyAprRay) === lsdRay + aaveSupplyRay,
        `${rayPct(eff.json.effectiveSupplyAprRay).toFixed(4)}% = ${rayPct(lsdRay).toFixed(4)}% (${
          eff.json.lsdApr?.label
        }) + ${rayPct(aaveSupplyRay).toFixed(4)}% (aave)`,
      );
    }

    const lsd = await http('GET', `/leverage-yield/apr/lsd${q}`);
    // `stale: true` is a valid outcome — it means the DefiLlama fetch failed and the
    // hard-coded fallbackAprPct was served. It must be flagged, never silently swapped in.
    check(
      `A08 GET /apr/lsd (${v.name}) reports its staleness`,
      lsd.status === 200 && typeof lsd.json?.stale === 'boolean',
      `status=${lsd.status} stale=${lsd.json?.stale} label=${lsd.json?.label}`,
    );

    const total = await http('GET', `/leverage-yield/total-assets${q}`);
    check(
      `A09 GET /total-assets (${v.name})`,
      total.status === 200 && isNumericString(total.json?.totalAssets),
      `status=${total.status} totalAssets=${total.json?.totalAssets}`,
    );

    const pos = await http('GET', `/leverage-yield/position${q}`);
    const ltv = Number(pos.json?.ltv ?? -1);
    check(
      `A10 GET /position (${v.name}) LTV within 0..10000 bps`,
      pos.status === 200 && ltv >= 0 && ltv <= 10_000,
      `status=${pos.status} ltv=${pos.json?.ltv} hf=${pos.json?.healthFactor}`,
    );
    // A vault carrying debt must stay above a health factor of 1.0 (1e18), or it is liquidatable.
    if (pos.status === 200 && BigInt(pos.json?.debt ?? '0') > 0n) {
      check(
        `A11 ${v.name} health factor > 1.0`,
        BigInt(pos.json.healthFactor) > 10n ** 18n,
        `hf=${pos.json.healthFactor}`,
      );
    }

    const pd = await http('GET', `/leverage-yield/preview/deposit${q}&assets=1000000000000000000`);
    check(
      `A12 GET /preview/deposit (${v.name})`,
      pd.status === 200 && isNumericString(pd.json?.shares),
      `status=${pd.status} 1e18 assets -> ${pd.json?.shares} shares`,
    );

    const pw = await http('GET', `/leverage-yield/preview/withdraw${q}&assets=1000000000000000000`);
    check(`A13 GET /preview/withdraw (${v.name})`, pw.status === 200 && isNumericString(pw.json?.shares), `status=${pw.status}`);

    const pr = await http('GET', `/leverage-yield/preview/redeem${q}&shares=1000000000000000000`);
    check(`A14 GET /preview/redeem (${v.name})`, pr.status === 200 && isNumericString(pr.json?.assets), `status=${pr.status}`);

    // ERC-4626 round-trip sanity: depositing X assets then redeeming the resulting shares
    // must never return MORE than X. More would mean the vault mints value out of nothing.
    if (pd.status === 200 && pr.status === 200) {
      const shares = BigInt(pd.json.shares);
      const back = await http('GET', `/leverage-yield/preview/redeem${q}&shares=${shares}`);
      if (back.status === 200) {
        check(
          `A15 ${v.name} deposit->redeem round-trip does not gain value`,
          BigInt(back.json.assets) <= 10n ** 18n,
          `1e18 assets -> ${shares} shares -> ${back.json.assets} assets`,
        );
      }
    }

    const sb = await http('GET', `/leverage-yield/share-balance${q}&owner=${PROBE_OWNER}`);
    check(
      `A16 GET /share-balance (${v.name}, unfunded owner) reads 0`,
      sb.status === 200 && sb.json?.balance === '0',
      `status=${sb.status} balance=${sb.json?.balance}`,
    );

    const mw = await http('GET', `/leverage-yield/max-withdraw${q}&owner=${PROBE_OWNER}`);
    check(
      `A17 GET /max-withdraw (${v.name}, unfunded owner) reads 0`,
      mw.status === 200 && mw.json?.maxWithdraw === '0',
      `status=${mw.status} maxWithdraw=${mw.json?.maxWithdraw}`,
    );
  }

  section('A. Fees, deadline, quotes');

  const pf = await http('GET', '/leverage-yield/fees/partner?amount=1000000000000000000');
  check('A18 GET /fees/partner', pf.status === 200 && isNumericString(pf.json?.fee), `fee=${pf.json?.fee}`);

  const sf = await http('GET', '/leverage-yield/fees/solver?amount=1000000000000000000');
  check('A19 GET /fees/solver', sf.status === 200 && isNumericString(sf.json?.fee), `fee=${sf.json?.fee} (of 1e18)`);

  const dl = await http('GET', '/leverage-yield/deadline');
  const nowSec = Math.floor(Date.now() / 1000);
  check(
    'A20 GET /deadline is in the future',
    dl.status === 200 && Number(dl.json?.deadline) > nowSec,
    `deadline=${dl.json?.deadline} now=${nowSec} (+${Number(dl.json?.deadline) - nowSec}s)`,
  );

  const target = vaults[0];
  const depQuote = await http('POST', '/leverage-yield/quote/deposit', {
    vault: target.vault,
    tokenSrc: ARB_WEETH,
    tokenSrcChainKey: SRC_CHAIN,
    amount: '10000000000000000',
    quoteType: 'exact_input',
  });
  check(
    `A21 POST /quote/deposit (${SRC_CHAIN} weETH -> ${target.name})`,
    depQuote.status === 200 && isNumericString(depQuote.json?.quotedAmount),
    `status=${depQuote.status} quoted=${depQuote.json?.quotedAmount} ${depQuote.json?.message ?? ''}`,
  );

  const wdQuote = await http('POST', '/leverage-yield/quote/withdraw', {
    vault: target.vault,
    srcChainKey: SRC_CHAIN,
    tokenDst: ARB_WEETH,
    tokenDstChainKey: SRC_CHAIN,
    amount: '10000000000000000',
    quoteType: 'exact_input',
  });
  check(
    `A22 POST /quote/withdraw (${target.name} -> ${SRC_CHAIN} weETH)`,
    wdQuote.status === 200 && isNumericString(wdQuote.json?.quotedAmount),
    `status=${wdQuote.status} quoted=${wdQuote.json?.quotedAmount} ${wdQuote.json?.message ?? ''}`,
  );

  // Shares CreateDepositIntentParamsV2 with /approve and /intents/deposit, so a 200 here also
  // proves the deposit request body is well-formed without building or signing anything.
  const allowance = await http('POST', '/leverage-yield/allowance/check', {
    vault: target.vault,
    srcChainKey: SRC_CHAIN,
    srcAddress: PROBE_OWNER,
    inputToken: ARB_WEETH,
    inputAmount: '10000000000000000',
    minOutputAmount: '1',
  });
  check(
    'A23 POST /allowance/check (unfunded owner) answers valid:false',
    allowance.status === 200 && allowance.json?.valid === false,
    `status=${allowance.status} valid=${allowance.json?.valid} ${
      allowance.status === 200 ? '' : allowance.text.slice(0, 140)
    }`,
  );

  return { vaults };
}

// ──────────────────────────────────────────────────────────────────────────
// Group D — negative / validation paths
// ──────────────────────────────────────────────────────────────────────────

async function groupD(vaults) {
  section('D. Validation / negative paths (API)');

  const badVault = await http('GET', '/leverage-yield/apr?vault=0xdeadbeef');
  check(
    'D01 /apr rejects a malformed vault address with 400',
    badVault.status === 400,
    `status=${badVault.status} ${badVault.json?.message ?? ''}`,
  );

  const noVault = await http('GET', '/leverage-yield/apr');
  check('D02 /apr rejects a missing vault param', noVault.status === 400, `status=${noVault.status}`);

  const unknownName = await http('GET', '/leverage-yield/vaults/lsodaNOPE');
  check(
    'D03 /vaults/{name} 404s (not 500s) on an unknown vault',
    unknownName.status === 404 || unknownName.status === 400,
    `status=${unknownName.status} ${unknownName.json?.message ?? ''}`,
  );

  // The tripwire that costs every new tester their first hour: chain keys are prefixed.
  const bareChainKey = await http('POST', '/leverage-yield/quote/deposit', {
    vault: vaults[0]?.vault,
    tokenSrc: ARB_WEETH,
    tokenSrcChainKey: 'arbitrum',
    amount: '10000000000000000',
    quoteType: 'exact_input',
  });
  check(
    "D04 /quote/deposit rejects a bare chain key ('arbitrum', not '0xa4b1.arbitrum')",
    bareChainKey.status === 400,
    `status=${bareChainKey.status} ${bareChainKey.json?.message ?? ''}`,
  );

  const missingFields = await http('POST', '/leverage-yield/quote/deposit', { vault: vaults[0]?.vault });
  check(
    'D05 /quote/deposit enumerates every missing field',
    missingFields.status === 400 && /tokenSrc/.test(missingFields.json?.message ?? ''),
    `status=${missingFields.status}`,
  );

  const badQuoteType = await http('POST', '/leverage-yield/quote/deposit', {
    vault: vaults[0]?.vault,
    tokenSrc: ARB_WEETH,
    tokenSrcChainKey: SRC_CHAIN,
    amount: '10000000000000000',
    quoteType: 'exact_output',
  });
  check(
    "D06 /quote/deposit rejects quoteType other than 'exact_input'",
    badQuoteType.status === 400,
    `status=${badQuoteType.status} ${badQuoteType.json?.message ?? ''}`,
  );

  const zeroAmount = await http('POST', '/leverage-yield/quote/deposit', {
    vault: vaults[0]?.vault,
    tokenSrc: ARB_WEETH,
    tokenSrcChainKey: SRC_CHAIN,
    amount: '0',
    quoteType: 'exact_input',
  });
  check(
    'D07 /quote/deposit refuses a zero amount',
    zeroAmount.status >= 400,
    `status=${zeroAmount.status} ${zeroAmount.json?.message ?? ''}`,
  );

  // A base URL missing the /v1 prefix silently 404s every call with no diagnostic —
  // worth pinning so the failure mode stays loud in the harness even if it is quiet in the SDK.
  const noPrefix = await fetch('https://api.sodax.com/leverage-yield/vaults', {
    signal: AbortSignal.timeout(20_000),
  })
    .then(r => r.status)
    .catch(() => 0);
  check(
    'D08 a base URL missing /v1 404s (documents the silent-misconfig failure mode)',
    noPrefix === 404,
    `status=${noPrefix}`,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Groups B + C — SDK reads, and SDK-vs-API parity
// ──────────────────────────────────────────────────────────────────────────

async function groupBC(vaults) {
  section('B. SDK service reads (Sonic hub RPC)');

  let Sodax;
  try {
    const entry = pathToFileURL(path.join(SDK_ROOT, 'packages/sdk/dist/index.mjs')).href;
    ({ Sodax } = await import(entry));
  } catch (error) {
    bad('B-- import @sodax/sdk dist', `${String(error).slice(0, 200)} (run pnpm build:packages)`);
    return;
  }

  const sodax = new Sodax();

  // The single fact issue #452 turns on, pinned from the built artefact rather than the source.
  check(
    'B01 leverageYield.useBackendSubmitTx defaults to FALSE (opt-in)',
    sodax.leverageYield.useBackendSubmitTx === false,
    `value=${sodax.leverageYield.useBackendSubmitTx}`,
  );
  const optedIn = new Sodax({ leverageYield: { useBackendSubmitTx: true } });
  check(
    'B02 leverageYield.useBackendSubmitTx honours an explicit opt-in',
    optedIn.leverageYield.useBackendSubmitTx === true,
    `value=${optedIn.leverageYield.useBackendSubmitTx}`,
  );

  const sdkVaults = sodax.leverageYield.listVaults();
  check('B03 listVaults() returns the packaged registry', sdkVaults.length > 0, `${sdkVaults.length} vaults`);

  section('C. API vs SDK parity — the two demo pages must agree');

  check(
    'C01 vault COUNT matches between the API and @sodax/types',
    sdkVaults.length === vaults.length,
    `sdk=${sdkVaults.length} api=${vaults.length}`,
  );

  const apiByName = new Map(vaults.map(v => [v.name, v]));
  for (const sv of sdkVaults) {
    const av = apiByName.get(sv.name);
    if (!av) {
      bad(`C02 ${sv.name} present in the SDK registry but absent from the API`, 'registry drift');
      continue;
    }
    check(
      `C02 ${sv.name} vault/asset/borrowToken addresses match`,
      sv.vault.toLowerCase() === av.vault.toLowerCase() &&
        sv.asset.toLowerCase() === av.asset.toLowerCase() &&
        sv.borrowToken.toLowerCase() === av.borrowToken.toLowerCase(),
      `vault ${sv.vault}`,
    );
  }
  for (const av of vaults) {
    if (!sdkVaults.some(sv => sv.name === av.name)) {
      bad(`C03 ${av.name} served by the API but missing from @sodax/types`, 'registry drift');
    }
  }

  // Live value parity. The API reads the hub over its own RPC; the SDK reads it over ours.
  // Both answer the same question, so a mismatch is drift, a caching bug, or a stale deploy.
  for (const sv of sdkVaults) {
    const av = apiByName.get(sv.name);
    if (!av) continue;

    const [sdkTotal, apiTotal] = await Promise.all([
      sodax.leverageYield.getTotalAssets(sv.vault),
      http('GET', `/leverage-yield/total-assets?vault=${sv.vault}`),
    ]);
    if (!sdkTotal.ok) {
      bad(`C04 ${sv.name} SDK getTotalAssets`, JSON.stringify(sdkTotal.error).slice(0, 160));
    } else if (apiTotal.status === 200) {
      // totalAssets moves with every deposit/withdraw, so compare within a small relative band
      // rather than exactly — an exact match across two RPC snapshots would be luck.
      const a = sdkTotal.value;
      const b = BigInt(apiTotal.json.totalAssets);
      const diff = a > b ? a - b : b - a;
      const within1pct = b === 0n ? a === 0n : (diff * 10_000n) / b <= 100n;
      check(`C04 ${sv.name} totalAssets agree within 1%`, within1pct, `sdk=${a} api=${b}`);
    }

    const [sdkPos, apiPos] = await Promise.all([
      sodax.leverageYield.getPosition(sv.vault),
      http('GET', `/leverage-yield/position?vault=${sv.vault}`),
    ]);
    if (!sdkPos.ok) {
      bad(`C05 ${sv.name} SDK getPosition`, JSON.stringify(sdkPos.error).slice(0, 160));
    } else if (apiPos.status === 200) {
      const ltvDelta = Math.abs(Number(sdkPos.value.ltv) - Number(apiPos.json.ltv));
      check(
        `C05 ${sv.name} LTV agrees within 25 bps`,
        ltvDelta <= 25,
        `sdk=${sdkPos.value.ltv} api=${apiPos.json.ltv} delta=${ltvDelta}bps`,
      );
    }

    const [sdkAsset, apiAsset] = await Promise.all([
      sodax.leverageYield.getAsset(sv.vault),
      http('GET', `/leverage-yield/asset?vault=${sv.vault}`),
    ]);
    if (!sdkAsset.ok) {
      bad(`C06 ${sv.name} SDK getAsset`, JSON.stringify(sdkAsset.error).slice(0, 160));
    } else if (apiAsset.status === 200) {
      check(
        `C06 ${sv.name} asset() agrees`,
        sdkAsset.value.toLowerCase() === apiAsset.json.asset.toLowerCase(),
        `sdk=${sdkAsset.value} api=${apiAsset.json.asset}`,
      );
    }

    const [sdkPrev, apiPrev] = await Promise.all([
      sodax.leverageYield.previewDeposit(sv.vault, 10n ** 18n),
      http('GET', `/leverage-yield/preview/deposit?vault=${sv.vault}&assets=1000000000000000000`),
    ]);
    if (!sdkPrev.ok) {
      bad(`C07 ${sv.name} SDK previewDeposit`, JSON.stringify(sdkPrev.error).slice(0, 160));
    } else if (apiPrev.status === 200) {
      const a = sdkPrev.value;
      const b = BigInt(apiPrev.json.shares);
      const diff = a > b ? a - b : b - a;
      const within1pct = b === 0n ? a === 0n : (diff * 10_000n) / b <= 100n;
      check(`C07 ${sv.name} previewDeposit(1e18) agrees within 1%`, within1pct, `sdk=${a} api=${b}`);
    }

    const sdkLsd = await sodax.leverageYield.getLsdApr(sv.vault);
    if (!sdkLsd.ok) {
      bad(`C08 ${sv.name} SDK getLsdApr`, JSON.stringify(sdkLsd.error).slice(0, 160));
    } else {
      check(
        `C08 ${sv.name} getLsdApr flags staleness rather than hiding the fallback`,
        typeof sdkLsd.value.stale === 'boolean',
        `stale=${sdkLsd.value.stale} label=${sdkLsd.value.label}`,
      );
    }
  }

  section('D. Validation / negative paths (SDK)');

  const unregistered = await sodax.leverageYield.getAsset('0x000000000000000000000000000000000000dEaD');
  check(
    'D09 SDK getAsset on an unregistered address returns an error Result (never throws)',
    unregistered.ok === false,
    `code=${unregistered.error?.code ?? 'n/a'}`,
  );

  const unknownVault = sodax.leverageYield.getVault('lsodaNOPE');
  check('D10 SDK getVault returns undefined for an unknown name', unknownVault === undefined);

  const byAddr = sodax.leverageYield.getVaultByAddress(sdkVaults[0].vault.toUpperCase());
  check(
    'D11 SDK getVaultByAddress is case-insensitive',
    byAddr?.name === sdkVaults[0].name,
    `resolved=${byAddr?.name}`,
  );
}

// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\x1b[1mLeverage Yield zero-cost probe — issue #450\x1b[0m`);
  console.log(`API:  ${API}`);
  console.log(`SDK:  ${SKIP_SDK ? '(skipped)' : SDK_ROOT}`);

  const { vaults } = await groupA();
  if (vaults.length > 0) await groupD(vaults);
  if (!SKIP_SDK && vaults.length > 0) await groupBC(vaults);

  console.log(`\n\x1b[1mRESULT\x1b[0m  ${pass} passed, ${fail} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('harness crashed:', error);
  process.exit(2);
});
