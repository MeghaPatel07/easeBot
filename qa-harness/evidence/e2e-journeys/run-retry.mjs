// Retry runner — dismisses Analytics Consent first, then runs J1/J3/J4
import { chromium } from '/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8081';
const OUT = '/Users/krish/Desktop/easebot/qa-harness/evidence/e2e-journeys';
const results = { journeys: [] };

function log(j, step, status, detail = '') {
  const line = `[${new Date().toISOString()}] [${j}-retry] ${step} → ${status}${detail ? ' :: ' + detail : ''}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT, j, 'journey-retry.log'), line + '\n');
}

async function newCtx(j) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordHar: { path: path.join(OUT, j, 'network-retry.har'), mode: 'minimal' },
  });
  const page = await ctx.newPage();
  const consoleLog = [];
  const failedReqs = [];
  page.on('console', m => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLog.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => failedReqs.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  return { browser, ctx, page, consoleLog, failedReqs };
}

async function dismissConsent(page, j) {
  try {
    const btn = page.getByRole('button', { name: /accept|decline/i }).first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click({ timeout: 3000 });
    await page.waitForTimeout(700);
    log(j, 'consent-dismissed', 'ok');
    return true;
  } catch (e) {
    log(j, 'consent-dismiss', 'skip', e.message.slice(0, 80));
    return false;
  }
}

async function snap(page, j, name) {
  try { await page.screenshot({ path: path.join(OUT, j, `retry-${name}.png`), fullPage: false }); } catch {}
}

async function finish(j, ctx, browser, consoleLog, failedReqs, journeyResult) {
  try { await ctx.close(); } catch {}
  try { await browser.close(); } catch {}
  fs.appendFileSync(path.join(OUT, j, 'console-retry.log'), consoleLog.join('\n'));
  fs.appendFileSync(path.join(OUT, j, 'failed-requests-retry.log'), failedReqs.join('\n'));
  results.journeys.push({ journey: j, ...journeyResult });
}

// J1 redo
async function J1() {
  const j = 'j1';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await snap(page, j, '00-landed');
    await dismissConsent(page, j);
    await snap(page, j, '01-after-consent');

    const input = page.locator('textarea[placeholder*="anything" i]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.click({ timeout: 6000 });
    await input.fill('qa-test-j1: hello from journey1');
    await snap(page, j, '02-typed');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(9000);
    await snap(page, j, '03-after-send');

    const html1 = await page.content();
    const hasUserMsg = /qa-test-j1/.test(html1);
    steps.push({ step: 'first-msg-sent', ok: hasUserMsg });
    if (!hasUserMsg) { failed = { step: 'send-message', reason: 'user msg not in DOM' }; throw new Error('no echo'); }

    // burn 10 more to test guest cap
    for (let i = 2; i <= 11; i++) {
      try {
        const inp = page.locator('textarea[placeholder*="anything" i]').first();
        await inp.click({ timeout: 3000 });
        await inp.fill(`qa-test-j1: msg ${i}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      } catch (e) { log(j, `cap-loop ${i}`, 'skip', e.message.slice(0, 80)); break; }
    }
    await snap(page, j, '05-cap-attempt');
    const html2 = await page.content();
    const capHit = /you.{0,15}reach|sign in to continue|upgrade.*chat|cap.*reach|guest.*limit|free.*limit|out of (chat|message)/i.test(html2);
    steps.push({ step: 'guest-cap-banner', ok: capHit, note: capHit ? 'cap msg present' : 'no clear cap banner after 11 messages' });
  } catch (e) {
    log(j, 'fatal', 'fail', e.message.slice(0, 200));
    if (!failed) failed = { step: 'unknown', reason: e.message.slice(0, 200) };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed' });
}

// J3 redo — look harder for planner trigger
async function J3() {
  const j = 'j3';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissConsent(page, j);
    await snap(page, j, '01-after-consent');

    // Strategy: directly ask in chat with a planner-flavored prompt — backend auto-routes.
    const input = page.locator('textarea[placeholder*="anything" i]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.click({ timeout: 6000 });
    await input.fill('qa-test-j3: switch to planner mode and create a 5-item wedding venue scouting checklist');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(14000);
    await snap(page, j, '02-after-prompt');
    const html = await page.content();
    const plannerOrList = /checklist|todo|step\s*1|1\)\s|^\s*-\s|<li|<input[^>]*type=["']checkbox/im.test(html);
    steps.push({ step: 'planner-style-response', ok: plannerOrList, note: plannerOrList ? 'list-like content detected' : 'response did not include list/checkbox' });

    // Try sidebar / menu lookup
    const sidebarPlanner = await page.getByRole('link', { name: /planner/i }).first().isVisible().catch(() => false);
    steps.push({ step: 'planner-route-link', ok: sidebarPlanner, note: sidebarPlanner ? 'planner route visible in nav' : 'no /planner nav link' });
  } catch (e) {
    log(j, 'fatal', 'fail', e.message.slice(0, 200));
    if (!failed) failed = { step: 'unknown', reason: e.message.slice(0, 200) };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed' });
}

// J4 redo — image mode
async function J4() {
  const j = 'j4';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissConsent(page, j);
    await snap(page, j, '01-after-consent');

    const input = page.locator('textarea[placeholder*="anything" i]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.click({ timeout: 6000 });
    await input.fill('qa-test-j4: generate an image of minimalist bridal mehndi pattern');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(35000);
    await snap(page, j, '02-after-imgreq');
    const html = await page.content();
    const hasImg = /<img[^>]+src=["'](data:image|blob:|https?:[^"']+\.(png|jpg|jpeg|webp|gif))/i.test(html);
    steps.push({ step: 'image-rendered', ok: hasImg, note: hasImg ? 'image element found' : 'no generated image visible in DOM' });
  } catch (e) {
    log(j, 'fatal', 'fail', e.message.slice(0, 200));
    if (!failed) failed = { step: 'unknown', reason: e.message.slice(0, 200) };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed' });
}

(async () => {
  for (const fn of [J1, J3, J4]) {
    try { await fn(); } catch (e) { console.error('crash', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'summary-retry.json'), JSON.stringify(results, null, 2));
  console.log('\n===== RETRY SUMMARY =====');
  console.log(JSON.stringify(results, null, 2));
})();
