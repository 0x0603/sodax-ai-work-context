import { chromium } from 'playwright';
const walletInit = addr => { const provider = { async request({ method }) { if (method==='eth_requestAccounts'||method==='eth_accounts') return [addr]; if (method==='eth_chainId') return '0xa4b1'; if (method==='net_version') return '42161'; if (method.startsWith('wallet_')) return method.includes('Permissions') ? [{ parentCapability: 'eth_accounts' }] : null; const e = new Error('x'); e.code = 4200; throw e; }, on() {}, removeListener() {} }; const detail = Object.freeze({ info: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Fake Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', rdns: 'test.fake.wallet' }, provider }); const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail })); window.addEventListener('eip6963:requestProvider', announce); announce(); };
const b = await chromium.launch();
for (const [w, wallet] of [[320, true], [360, true], [1280, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 700 }, isMobile: w < 640, hasTouch: w < 640 });
  if (wallet) await ctx.addInitScript(walletInit, '0x1111111111111111111111111111111111111111');
  await ctx.route('**/__intake/**', r => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/swaps-sdk', { waitUntil: 'domcontentloaded' });
  if (wallet) await p.waitForFunction(() => document.querySelector('header')?.textContent?.match(/Chain/), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  const m = await p.evaluate(() => { const row = document.querySelector('header .container > div'); const [left, right] = row.children; const logo = left.querySelector('a'); const lr = logo.getBoundingClientRect(); const rr = right.getBoundingClientRect(); return { logoRight: Math.round(lr.right), rightLeft: Math.round(rr.left), logoVisibleW: Math.round(Math.min(lr.right, rr.left) - lr.left), logoW: Math.round(lr.width), pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  const name = wallet ? null : await p.locator('header').getByRole('button', { name: 'Connect Wallet' }).count();
  console.log(`${w} ${wallet ? 'connected   ' : 'disconnected'} ${JSON.stringify(m)} logoCovered=${m.logoRight > m.rightLeft}${name !== null ? ` a11yName"Connect Wallet"=${name}` : ''}`);
  await p.screenshot({ path: `hdr2-${w}-${wallet ? 'w' : 'nw'}.png`, clip: { x: 0, y: 0, width: w, height: 64 } });
  await ctx.close();
}
await b.close();
