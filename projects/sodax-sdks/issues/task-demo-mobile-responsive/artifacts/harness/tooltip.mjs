// Tap/hover behaviour of the demo's Radix tooltips.  node tooltip.mjs http://localhost:3000
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3000';
const CASES = [
  { path: '/money-market', trigger: p => p.getByRole('button', { name: 'Money Market Info' }) },
  { path: '/leverage-positions', trigger: p => p.getByRole('button', { name: 'More info' }).first() },
];

const tooltipOpen = page => page.locator('[role="tooltip"]').count().then(n => n > 0);

const browser = await chromium.launch();
for (const c of CASES) {
  // Touch phone.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await touch.newPage();
  await page.goto(`${base}${c.path}`, { waitUntil: 'domcontentloaded' });
  const trigger = c.trigger(page);
  await trigger.waitFor({ state: 'visible', timeout: 30000 });
  await trigger.scrollIntoViewIfNeeded();
  const res = {};
  await trigger.tap();
  await page.waitForTimeout(300);
  res.tapOpens = await tooltipOpen(page);
  await trigger.tap();
  await page.waitForTimeout(300);
  res.secondTapCloses = !(await tooltipOpen(page));
  await trigger.tap();
  await page.waitForTimeout(300);
  const reopened = await tooltipOpen(page);
  await page.touchscreen.tap(5, 830);
  await page.waitForTimeout(300);
  res.tapOutsideCloses = reopened && !(await tooltipOpen(page));
  await touch.close();

  // Desktop mouse.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await desk.newPage();
  await dp.goto(`${base}${c.path}`, { waitUntil: 'domcontentloaded' });
  const dt = c.trigger(dp);
  await dt.waitFor({ state: 'visible', timeout: 30000 });
  await dt.hover();
  await dp.waitForTimeout(300);
  res.hoverOpens = await tooltipOpen(dp);
  await dp.mouse.move(5, 790);
  await dp.waitForTimeout(400);
  res.leaveCloses = !(await tooltipOpen(dp));
  await dt.hover();
  await dp.waitForTimeout(300);
  await dt.click();
  await dp.waitForTimeout(300);
  res.clickWhileHoveredCloses = !(await tooltipOpen(dp));
  await desk.close();
  console.log(`${base} ${c.path}`, JSON.stringify(res));
}
await browser.close();
