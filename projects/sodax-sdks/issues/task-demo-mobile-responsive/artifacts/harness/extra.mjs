// Interactive states the page-level harness does not reach. node extra.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = 'http://localhost:3000';
const OUT = new URL('./runs/extra/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const walletInit = addr => {
  const provider = { async request({ method }) { if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr]; if (method === 'eth_chainId') return '0xa4b1'; if (method === 'net_version') return '42161'; if (method.startsWith('wallet_')) return method.includes('Permissions') ? [{ parentCapability: 'eth_accounts' }] : null; const e = new Error('unsupported ' + method); e.code = 4200; throw e; }, on() {}, removeListener() {} };
  const detail = Object.freeze({ info: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Fake Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', rdns: 'test.fake.wallet' }, provider });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  window.addEventListener('eip6963:requestProvider', announce); announce();
};
const h = n => '0x' + n.repeat(64);
const ORDERS = [
  { mode: 'solver', intentHash: h('a'), orderId: '1234567890123', dstTxHash: h('b'), srcTxHash: h('c'), srcChainKey: '0xa4b1.arbitrum', createdAt: 1790000000000,
    summary: { from: { amount: '0.123456789', symbol: 'ETH', chain: '0xa4b1.arbitrum' }, to: { amount: '456.789012', symbol: 'USDC', chain: '0x89.polygon' } },
    final: { label: 'SOLVED', extraRows: [{ label: 'Dst Tx Hash', value: h('d') }] } },
  { mode: 'submit-tx', txHash: h('e'), srcChainKey: '0xa4b1.arbitrum', createdAt: 1790000000001,
    summary: { from: { amount: '1', symbol: 'USDC', chain: '0xa4b1.arbitrum' }, to: { amount: '0.0003', symbol: 'ETH', chain: 'solana' } },
    final: { label: 'FAILED', error: 'execution reverted: ' + 'InsufficientOutputAmount_'.repeat(8) } },
];
const results = [];
const pageOverflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function measure(p, loc, name, w) {
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await p.waitForTimeout(400);
  const m = await loc.evaluate(el => {
    const r = el.getBoundingClientRect(); const vw = document.documentElement.clientWidth; const vh = innerHeight;
    let worst = 0; for (const c of el.querySelectorAll('*')) { const cr = c.getBoundingClientRect(); if (cr.width && cr.right > r.right + 1) { let clipped = false; for (let a = c.parentElement; a && a !== el; a = a.parentElement) { if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break; } } if (!clipped) worst = Math.max(worst, cr.right - r.right); } }
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw, vh, innerOverflowX: el.scrollWidth - el.clientWidth, childrenPastEdge: Math.round(worst), scrollsY: el.scrollHeight > el.clientHeight + 1 };
  });
  const ok = m.left >= -1 && m.right <= m.vw + 1 && m.top >= -1 && m.bottom <= m.vh + 1 && m.innerOverflowX <= 1 && m.childrenPastEdge <= 1;
  await p.screenshot({ path: `${OUT}${name}-${w}.png` });
  results.push({ name, w, ok, ...m, pageOverflow: await pageOverflow(p) });
}
async function step(name, w, fn) { try { await fn(); } catch (e) { results.push({ name, w, ok: false, error: String(e.message).split('\n')[0].slice(0, 160) }); } }
const b = await chromium.launch();
for (const w of [320, 360, 390]) {
  const mk = async (opts = {}) => { const ctx = await b.newContext({ viewport: { width: w, height: w === 320 ? 640 : 800 }, isMobile: true, hasTouch: true }); if (opts.wallet !== false) await ctx.addInitScript(walletInit, '0x1111111111111111111111111111111111111111'); if (opts.orders) await ctx.addInitScript(o => localStorage.setItem('sodax-demo:solver:orders', JSON.stringify(o)), ORDERS); await ctx.route('**/__intake/**', r => r.fulfill({ status: 204, body: '' })); return ctx; };
  // Money market Supply / Borrow modals.
  await step('mm-supply-modal', w, async () => { const ctx = await mk(); const p = await ctx.newPage(); await p.goto(`${base}/money-market`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('table', { timeout: 30000 }); await p.waitForTimeout(3000);
    await p.getByRole('button', { name: 'Supply', exact: true }).first().click(); await measure(p, p.getByRole('dialog').first(), 'mm-supply-modal', w); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    const borrow = p.getByRole('button', { name: 'Borrow', exact: true }).first();
    if (await borrow.isEnabled().catch(() => false)) { await borrow.click(); await measure(p, p.getByRole('dialog').first(), 'mm-borrow-modal', w); } else results.push({ name: 'mm-borrow-modal', w, ok: true, note: 'Borrow disabled without collateral' });
    await ctx.close(); });
  // Swaps API review dialog.
  await step('swaps-api-dialog', w, async () => { const ctx = await mk(); const p = await ctx.newPage(); await p.goto(`${base}/swaps-api`, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.querySelector('header')?.textContent?.match(/Chain/), null, { timeout: 30000 });
    await p.locator('input[placeholder="0.0"]').first().fill('0.001'); await p.waitForTimeout(6000); await p.getByRole('button', { name: 'Swap', exact: true }).click(); await measure(p, p.getByRole('dialog').first(), 'swaps-api-dialog', w); await ctx.close(); });
  // Limit order dialog.
  await step('limit-order-dialog', w, async () => { const ctx = await mk(); const p = await ctx.newPage(); await p.goto(`${base}/swaps-sdk`, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.querySelector('header')?.textContent?.match(/Chain/), null, { timeout: 30000 });
    await p.getByRole('tab', { name: 'Limit Order' }).click(); await p.waitForTimeout(800); await p.locator('#limitOrderPrice').fill('3000'); await p.locator('input[placeholder="0.0"]:not([disabled]):not([readonly])').first().fill('0.001'); await p.waitForTimeout(800);
    await p.getByRole('button', { name: 'Create Limit Order' }).click(); await measure(p, p.getByRole('dialog').first(), 'limit-order-dialog', w); await ctx.close(); });
  // Leverage positions: eMode select inside Advanced.
  await step('leverage-emode-select', w, async () => { const ctx = await mk(); const p = await ctx.newPage(); await p.goto(`${base}/leverage-positions`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    await p.getByRole('button', { name: /Advanced/ }).click(); await p.waitForTimeout(500); await p.locator('div.space-y-1', { has: p.getByText('eMode category') }).getByRole('combobox').click(); await measure(p, p.getByRole('listbox').first(), 'leverage-emode-select', w); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.getByRole('combobox').filter({ hasText: /^S$|Sonic/ }).first().click().catch(() => {}); const lb = p.getByRole('listbox').first(); if (await lb.isVisible().catch(() => false)) await measure(p, lb, 'leverage-token-select', w); await ctx.close(); });
  // Swap status panel with long hashes and a long error.
  await step('order-status-panel', w, async () => { const ctx = await mk({ wallet: false, orders: true }); const p = await ctx.newPage(); await p.goto(`${base}/swaps-sdk`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
    const ov = await pageOverflow(p); await p.screenshot({ path: `${OUT}order-status-panel-${w}.png`, fullPage: true }); results.push({ name: 'order-status-panel', w, ok: ov <= 0, pageOverflow: ov }); await ctx.close(); });
}
await b.close();
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name.padEnd(22)} ${String(r.w).padStart(3)}  ${r.error ?? r.note ?? JSON.stringify({ box: [r.left, r.right, r.top, r.bottom], vw: r.vw, vh: r.vh, innerX: r.innerOverflowX, past: r.childrenPastEdge, scrollsY: r.scrollsY, pageOverflow: r.pageOverflow })}`);
