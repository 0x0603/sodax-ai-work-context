// Open the swap review dialog with the fake wallet at 360px and check it fits and scrolls.
import { chromium } from 'playwright';
const base = process.argv[2];
const walletInit = addr => {
  const provider = { async request({ method }) { if (method==='eth_requestAccounts'||method==='eth_accounts') return [addr]; if (method==='eth_chainId') return '0xa4b1'; if (method==='net_version') return '42161'; if (method.startsWith('wallet_')) return method.includes('Permissions') ? [{ parentCapability: 'eth_accounts' }] : null; const e = new Error('unsupported '+method); e.code = 4200; throw e; }, on() {}, removeListener() {} };
  const detail = Object.freeze({ info: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Fake Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', rdns: 'test.fake.wallet' }, provider });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  window.addEventListener('eip6963:requestProvider', announce); announce();
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(walletInit, '0x1111111111111111111111111111111111111111');
await ctx.route('**/__intake/**', r => r.fulfill({ status: 204, body: '' }));
const p = await ctx.newPage();
await p.goto(`${base}/swaps-sdk`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('header')?.textContent?.match(/Chain/), null, { timeout: 30000 });
await p.locator('input[placeholder="0.0"]').first().fill('0.001');
await p.waitForTimeout(6000);
await p.getByRole('button', { name: 'Swap', exact: true }).click();
const dlg = p.getByRole('dialog');
await dlg.waitFor({ state: 'visible', timeout: 10000 });
await p.waitForTimeout(800);
const m = await dlg.evaluate(el => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: document.documentElement.clientWidth, vh: innerHeight, scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth, pageSW: document.documentElement.scrollWidth, overflowY: getComputedStyle(el).overflowY }; });
console.log(base, JSON.stringify(m));
await p.screenshot({ path: `swapdialog-${new URL(base).port}.png` });
await dlg.evaluate(el => { el.scrollTop = el.scrollHeight; });
await p.waitForTimeout(300);
await p.screenshot({ path: `swapdialog-${new URL(base).port}-bottom.png` });
await b.close();
