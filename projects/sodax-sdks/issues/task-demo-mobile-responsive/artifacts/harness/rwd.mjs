// Responsive harness for apps/demo.
//   node rwd.mjs capture --base http://localhost:3001 --name before [--record] [--wallet] [--routes a,b] [--widths 360,1280]
//   node rwd.mjs capture --base http://localhost:3000 --name after --replay before [--wallet]
//   node rwd.mjs diff before after [--widths 1280,1440]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const RUNS = path.join(ROOT, 'runs');

const ROUTES = [
  { slug: 'swaps-sdk', path: '/swaps-sdk' },
  { slug: 'swaps-api', path: '/swaps-api' },
  { slug: 'money-market', path: '/money-market', expect: '/money-market/0xa4b1.arbitrum' },
  { slug: 'bridge', path: '/bridge' },
  { slug: 'bridge-api', path: '/bridge-api' },
  { slug: 'dex', path: '/dex' },
  { slug: 'staking', path: '/staking' },
  { slug: 'partner-fee-claim', path: '/partner-fee-claim' },
  { slug: 'recovery', path: '/recovery' },
  { slug: 'leverage-yield', path: '/leverage-yield' },
  { slug: 'leverage-yield-api', path: '/leverage-yield-api' },
  { slug: 'leverage-positions', path: '/leverage-positions' },
  { slug: 'oracle', path: '/oracle' },
];
const HEIGHTS = { 320: 640, 360: 800, 390: 844, 768: 1024, 1024: 768, 1280: 800, 1440: 900 };
const DEFAULT_WIDTHS = [360, 390, 768, 1024, 1280, 1440];
const FIXED_TIME = new Date('2026-09-30T08:00:00Z');
const FAKE_ADDR = '0x1111111111111111111111111111111111111111';

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      opts[k] = v;
    } else opts._.push(a);
  }
  return { cmd, opts };
}

// ---------- network record / replay (JSON-RPC ids normalized) ----------
function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
const isRpc = o => o && typeof o === 'object' && !Array.isArray(o) && 'jsonrpc' in o;
function normBody(body) {
  if (!body) return '';
  const j = parseJson(body);
  if (j === undefined) return body;
  const strip = o => (isRpc(o) ? { ...o, id: 0 } : o);
  return JSON.stringify(Array.isArray(j) ? j.map(strip) : strip(j));
}
function rpcIds(body) {
  const j = parseJson(body || '');
  if (Array.isArray(j)) return j.map(x => (isRpc(x) ? x.id : undefined));
  return isRpc(j) ? j.id : undefined;
}
function rewriteIds(buf, recIds, newIds) {
  if (recIds === undefined || newIds === undefined) return buf;
  const j = parseJson(buf.toString('utf8'));
  if (j === undefined) return buf;
  const map = new Map();
  if (Array.isArray(recIds) && Array.isArray(newIds)) recIds.forEach((id, i) => map.set(JSON.stringify(id), newIds[i]));
  else map.set(JSON.stringify(recIds), newIds);
  const fix = o => (o && typeof o === 'object' && 'id' in o && map.has(JSON.stringify(o.id)) ? { ...o, id: map.get(JSON.stringify(o.id)) } : o);
  return Buffer.from(JSON.stringify(Array.isArray(j) ? j.map(fix) : fix(j)));
}
function cleanHeaders(h, origin) {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const lk = k.toLowerCase();
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lk)) continue;
    if (lk.startsWith('access-control-')) continue;
    out[k] = v;
  }
  out['access-control-allow-origin'] = origin;
  out['access-control-allow-credentials'] = 'true';
  return out;
}

async function attachNet(context, { mode, file, origin }) {
  const store = new Map();
  if (mode === 'replay' && fs.existsSync(file)) {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) store.set(k, v);
  }
  const stats = { hits: 0, misses: 0, live: 0 };
  const intercept = u => !u.href.startsWith(origin) || u.pathname.startsWith('/__intake/');
  await context.route(intercept, async route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/__intake/')) return route.fulfill({ status: 204, body: '' });
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('ws')) {
      return route.fallback();
    }
    if (!mode) return route.fallback();
    const body = req.postData() || '';
    const key = `${req.method()} ${url} ${normBody(body)}`;
    if (mode === 'replay') {
      const q = store.get(key);
      if (q?.length) {
        const rec = q.length > 1 ? q.shift() : q[0];
        stats.hits++;
        const buf = rewriteIds(Buffer.from(rec.body, 'base64'), rec.reqIds, rpcIds(body));
        return route.fulfill({ status: rec.status, headers: cleanHeaders(rec.headers, origin), body: buf }).catch(() => {});
      }
      stats.misses++;
    }
    try {
      const resp = await route.fetch({ timeout: mode === 'replay' ? 10000 : 30000 });
      const buf = await resp.body();
      if (mode === 'record') {
        if (!store.has(key)) store.set(key, []);
        store.get(key).push({ reqIds: rpcIds(body), status: resp.status(), headers: resp.headers(), body: buf.toString('base64') });
      } else stats.live++;
      return route.fulfill({ status: resp.status(), headers: cleanHeaders(resp.headers(), origin), body: buf }).catch(() => {});
    } catch {
      return route.abort().catch(() => {});
    }
  });
  return {
    stats,
    save() {
      if (mode !== 'record') return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(Object.fromEntries(store)));
    },
  };
}

// ---------- fake EIP-6963 EVM wallet ----------
const walletInit = addr => {
  const provider = {
    isFake: true,
    async request({ method }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [addr];
        case 'eth_chainId':
          return '0xa4b1';
        case 'net_version':
          return '42161';
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
          return null;
        case 'wallet_requestPermissions':
        case 'wallet_getPermissions':
          return [{ parentCapability: 'eth_accounts' }];
        default: {
          const e = new Error(`fake wallet: ${method} unsupported`);
          e.code = 4200;
          throw e;
        }
      }
    },
    on() {},
    removeListener() {},
  };
  const detail = Object.freeze({
    info: {
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'Fake Wallet',
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%23888"/%3E%3C/svg%3E',
      rdns: 'test.fake.wallet',
    },
    provider,
  });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
};

// ---------- page helpers ----------
const FREEZE_CSS =
  '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

let IDLE_MS = 30000;
async function settle(page, flags) {
  await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => flags.push('networkidle-timeout'));
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page
    .waitForFunction(
      () =>
        ![...document.querySelectorAll('.animate-pulse,.animate-spin')].some(e => {
          const r = e.getBoundingClientRect();
          return r.width > 12 || r.height > 12;
        }),
      null,
      { timeout: 10000 },
    )
    .catch(() => flags.push('spinners'));
  await page
    .evaluate(
      () =>
        new Promise(res => {
          let t;
          const obs = new MutationObserver(() => {
            clearTimeout(t);
            t = setTimeout(done, 1000);
          });
          const done = () => {
            obs.disconnect();
            res();
          };
          obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
          t = setTimeout(done, 1000);
          setTimeout(done, 6000);
        }),
    )
    .catch(() => {});
}

// Elements sticking out of the viewport that no on-screen scroll/clip container contains.
const measureOverflow = rootSel => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const root = rootSel ? document.querySelector(rootSel) : document.body;
  const rootRect = root.getBoundingClientRect();
  const minX = rootSel ? rootRect.left : 0;
  const maxX = rootSel ? rootRect.right : vw;
  const desc = el => {
    const parts = [];
    for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += `#${e.id}`;
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      if (cls) s += `.${cls}`;
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const offenders = [];
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= maxX + 1 && r.left >= minX - 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    let clipped = false;
    for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.overflowX !== 'visible' && a !== root) {
        const ar = a.getBoundingClientRect();
        if (ar.right <= maxX + 1 && ar.left >= minX - 1) {
          clipped = true;
          break;
        }
      }
    }
    if (!clipped) offenders.push(el);
  }
  const top = offenders.filter(el => !offenders.some(o => o !== el && o.contains(el)));
  return {
    vw,
    scrollWidth: rootSel ? root.scrollWidth : de.scrollWidth,
    clientWidth: rootSel ? root.clientWidth : vw,
    offenders: top.slice(0, 12).map(el => {
      const r = el.getBoundingClientRect();
      return {
        el: desc(el),
        left: Math.round(r.left),
        right: Math.round(r.right),
        text: (el.textContent || '').trim().slice(0, 60),
      };
    }),
  };
};

async function checkOverlay(page, name, dialog, outDir, width, results) {
  await dialog.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(250);
  const id = `ov-${Date.now()}`;
  await dialog.evaluate((el, id) => el.setAttribute('data-rwd', id), id);
  const box = await dialog.evaluate(el => {
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    };
  });
  const inner = await page.evaluate(measureOverflow, `[data-rwd="${id}"]`);
  await page.screenshot({ path: path.join(outDir, `${width}-${name}.png`), animations: 'disabled', caret: 'hide' });
  const problems = [];
  if (box.left < -1 || box.right > box.vw + 1) problems.push('outside viewport (x)');
  if (box.top < -1 || box.bottom > box.vh + 1) problems.push('outside viewport (y)');
  if (box.scrollW > box.clientW + 1) problems.push(`inner scrollWidth ${box.scrollW} > ${box.clientW}`);
  if (inner.offenders.length) problems.push(`inner offenders: ${inner.offenders.map(o => o.el).join(' | ')}`);
  results.push({ name, box, problems });
}

async function capture(opts) {
  if (opts.idle) IDLE_MS = Number(opts.idle);
  const base = opts.base;
  const name = opts.name;
  const origin = new URL(base).origin;
  const widths = opts.widths ? String(opts.widths).split(',').map(Number) : DEFAULT_WIDTHS;
  const routes = opts.routes ? ROUTES.filter(r => String(opts.routes).split(',').includes(r.slug)) : ROUTES;
  const runDir = path.join(RUNS, name);
  fs.mkdirSync(runDir, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  let storageState;

  if (opts.wallet) {
    // Connect the fake wallet once, keep the persisted wagmi/app state for every later context.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(walletInit, FAKE_ADDR);
    await attachNet(ctx, { origin });
    const page = await ctx.newPage();
    await page.goto(`${base}/swaps-sdk`, { waitUntil: 'domcontentloaded' });
    // The injected EIP-6963 provider answers eth_accounts, so the app connects it on load.
    await page.waitForFunction(() => document.querySelector('header')?.textContent?.match(/Chain/), null, { timeout: 30000 });
    storageState = await ctx.storageState();
    await ctx.close();
    console.log('fake wallet connected');
  }

  for (const width of widths) {
    const mobile = width < 640;
    const ctx = await browser.newContext({
      viewport: { width, height: HEIGHTS[width] || 900 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: 'reduce',
      storageState,
    });
    if (opts.wallet) await ctx.addInitScript(walletInit, FAKE_ADDR);
    await ctx.clock.setFixedTime(FIXED_TIME);
    const desktop = width >= 1280;
    const netMode = desktop && opts.record ? 'record' : desktop && opts.replay ? 'replay' : undefined;
    for (const route of routes) {
      const outDir = path.join(runDir, route.slug);
      fs.mkdirSync(outDir, { recursive: true });
      const netFile = path.join(RUNS, opts.replay || name, 'net', `${route.slug}-${width}${opts.wallet ? '-w' : ''}.json`);
      const page = await ctx.newPage();
      await ctx.unrouteAll({ behavior: 'ignoreErrors' });
      const net = await attachNet(ctx, { mode: netMode, file: netFile, origin });
      const consoleMsgs = [];
      page.on('console', m => {
        if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text().split('\n')[0].slice(0, 200)}`);
      });
      page.on('pageerror', e => consoleMsgs.push(`pageerror: ${String(e.message).split('\n')[0].slice(0, 200)}`));
      const flags = [];
      await page.goto(`${base}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (opts.wallet) {
        await page
          .waitForFunction(() => document.querySelector('header')?.textContent?.match(/Chain/), null, { timeout: 30000 })
          .catch(() => flags.push('wallet-not-connected'));
      }
      await settle(page, flags);
      await page.addStyleTag({ content: FREEZE_CSS });
      await page.waitForTimeout(200);
      const finalPath = new URL(page.url()).pathname;
      const overflow = await page.evaluate(measureOverflow, null);
      await page.screenshot({ path: path.join(outDir, `${width}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });

      const overlays = [];
      if (route.slug === 'swaps-sdk' || route.slug === 'money-market') {
        const tryOverlay = async (label, open, dialogLocator) => {
          try {
            await open();
            await checkOverlay(page, label, dialogLocator(), outDir, width, overlays);
          } catch (e) {
            overlays.push({ name: label, problems: [`error: ${String(e.message).split('\n')[0]}`] });
          }
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        };
        if (route.slug === 'swaps-sdk') {
          await tryOverlay(
            'settings',
            () => page.getByTitle('Sodax Settings').click(),
            () => page.getByRole('dialog').first(),
          );
          await tryOverlay(
            'wallet',
            () => page.locator('header').getByRole('button', { name: /Connect Wallet|Wallet/ }).last().click(),
            () => page.getByRole('dialog', { name: 'Wallet Modal' }),
          );
          const navBtn = page.getByRole('button', { name: 'Open navigation' });
          if (await navBtn.isVisible().catch(() => false)) {
            await tryOverlay('mobile-nav', () => navBtn.click(), () => page.getByRole('dialog').first());
            try {
              await navBtn.click();
              const sheet = page.getByRole('dialog').first();
              await sheet.waitFor({ state: 'visible' });
              const links = await sheet.getByRole('link').count();
              await sheet.getByRole('link', { name: 'Oracle' }).click();
              await page.waitForURL('**/oracle', { timeout: 5000 });
              const closed = await sheet.isHidden();
              overlays.push({ name: 'mobile-nav-navigate', links, closed, problems: closed ? [] : ['sheet still open'] });
            } catch (e) {
              overlays.push({ name: 'mobile-nav-navigate', problems: [`error: ${String(e.message).split('\n')[0]}`] });
            }
          }
        }
        if (route.slug === 'money-market') {
          await tryOverlay(
            'chain-select',
            () => page.getByRole('combobox').first().click(),
            () => page.getByRole('listbox').first(),
          );
        }
      }

      net.save();
      const entry = {
        route: route.slug,
        width,
        finalPath,
        redirectOk: route.expect ? finalPath === route.expect : undefined,
        pageOverflow: overflow.scrollWidth > overflow.clientWidth,
        overflow,
        overlays,
        console: [...new Set(consoleMsgs)],
        flags,
        net: net.stats,
      };
      report.push(entry);
      const bad = entry.pageOverflow || overflow.offenders.length;
      const ovBad = overlays.filter(o => o.problems?.length).map(o => o.name);
      console.log(
        `${route.slug.padEnd(20)} ${String(width).padStart(4)}  ${bad ? `OVERFLOW sw=${overflow.scrollWidth} off=${overflow.offenders.length}` : 'ok'}${ovBad.length ? `  overlays:${ovBad.join(',')}` : ''}${flags.length ? `  [${flags.join(',')}]` : ''}${netMode ? `  net=${JSON.stringify(net.stats)}` : ''}`,
      );
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(runDir, `report${opts.wallet ? '-wallet' : ''}.json`), JSON.stringify(report, null, 2));
}

function diff(a, b, opts) {
  const widths = opts.widths ? String(opts.widths).split(',').map(Number) : [1280, 1440];
  const out = path.join(RUNS, `diff-${a}-${b}`);
  fs.mkdirSync(out, { recursive: true });
  const rows = [];
  for (const route of ROUTES) {
    for (const w of widths) {
      const pa = path.join(RUNS, a, route.slug, `${w}.png`);
      const pb = path.join(RUNS, b, route.slug, `${w}.png`);
      if (!fs.existsSync(pa) || !fs.existsSync(pb)) continue;
      const A = PNG.sync.read(fs.readFileSync(pa));
      const B = PNG.sync.read(fs.readFileSync(pb));
      if (A.width !== B.width || A.height !== B.height) {
        rows.push({ route: route.slug, w, result: `SIZE ${A.width}x${A.height} -> ${B.width}x${B.height}` });
        continue;
      }
      const D = new PNG({ width: A.width, height: A.height });
      const n = pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold: 0.1 });
      let box = null;
      if (n) {
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < A.height; y++)
          for (let x = 0; x < A.width; x++) {
            const i = (y * A.width + x) * 4;
            if (D.data[i] === 255 && D.data[i + 1] === 0 && D.data[i + 2] === 0) {
              if (x < x0) x0 = x;
              if (y < y0) y0 = y;
              if (x > x1) x1 = x;
              if (y > y1) y1 = y;
            }
          }
        box = x1 >= 0 ? `[${x0},${y0} → ${x1},${y1}]` : null;
        fs.writeFileSync(path.join(out, `${route.slug}-${w}.png`), PNG.sync.write(D));
      }
      rows.push({ route: route.slug, w, result: n ? `DIFF ${n}px ${box ?? ''}` : 'identical' });
    }
  }
  for (const r of rows) console.log(`${r.route.padEnd(20)} ${String(r.w).padStart(4)}  ${r.result}`);
}

const { cmd, opts } = parseArgs(process.argv.slice(2));
if (cmd === 'capture') await capture(opts);
else if (cmd === 'diff') diff(opts._[0], opts._[1], opts);
else console.log('usage: capture|diff');
