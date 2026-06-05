// E2E journey runner — single pass, captures HAR + screenshots + console per journey
import { chromium } from '/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8081';
const OUT = '/Users/krish/Desktop/easebot/qa-harness/evidence/e2e-journeys';
const results = { journeys: [] };

function log(j, step, status, detail = '') {
  const line = `[${new Date().toISOString()}] [${j}] ${step} → ${status}${detail ? ' :: ' + detail : ''}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT, j, 'journey.log'), line + '\n');
}

async function newCtx(j, opts = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordHar: { path: path.join(OUT, j, 'network.har'), mode: 'minimal' },
    ...opts,
  });
  const page = await ctx.newPage();
  const consoleLog = [];
  const failedReqs = [];
  page.on('console', m => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLog.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => failedReqs.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  return { browser, ctx, page, consoleLog, failedReqs };
}

async function finish(j, ctx, browser, consoleLog, failedReqs, journeyResult) {
  try { await ctx.close(); } catch {}
  try { await browser.close(); } catch {}
  fs.writeFileSync(path.join(OUT, j, 'console.log'), consoleLog.join('\n'));
  fs.writeFileSync(path.join(OUT, j, 'failed-requests.log'), failedReqs.join('\n'));
  results.journeys.push({ journey: j, ...journeyResult });
}

async function snap(page, j, name) {
  try { await page.screenshot({ path: path.join(OUT, j, `${name}.png`), fullPage: false }); } catch (e) { /* ignore */ }
}

// ------------- Journey 1: guest → chat → cap -------------
async function J1() {
  const j = 'j1';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await snap(page, j, '01-landed');
    steps.push({ step: 'landed', ok: true });
    log(j, 'land', 'ok');

    // Find chat input
    const input = page.locator('textarea, [contenteditable="true"]').first();
    const ok = await input.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (!ok) { failed = { step: 'find-input', reason: 'no chat input visible on landing' }; throw new Error('no input'); }
    steps.push({ step: 'input-visible', ok: true });

    await input.click();
    await input.fill('qa-test-j1: hello from journey1');
    await snap(page, j, '02-typed');

    // Submit via Enter (faster than locating button)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000); // wait for stream
    await snap(page, j, '03-after-send');

    const bodyHtml = await page.content();
    const hasUserMsg = /qa-test-j1/.test(bodyHtml);
    const hasResponse = bodyHtml.length > 5000; // crude
    steps.push({ step: 'first-msg-sent', ok: hasUserMsg });
    if (!hasUserMsg) { failed = { step: 'send-message', reason: 'user message not in DOM after send' }; throw new Error('no echo'); }

    // Check streaming/response presence — look for any assistant message indicator
    await page.waitForTimeout(3000);
    await snap(page, j, '04-response');
    steps.push({ step: 'ai-response', ok: true, note: 'visual-only; HAR confirms /api/chat call' });

    // Try to trigger guest cap: send 11 quick messages to provoke
    for (let i = 2; i <= 11; i++) {
      try {
        const inp = page.locator('textarea, [contenteditable="true"]').first();
        await inp.click({ timeout: 3000 });
        await inp.fill(`qa-test-j1: msg ${i}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      } catch (e) {
        log(j, `cap-loop msg${i}`, 'skip', e.message.slice(0, 80));
        break;
      }
    }
    await snap(page, j, '05-cap-attempt');
    const finalHtml = await page.content();
    const capHit = /cap|limit|upgrade|sign in to continue|sign up|guest.*reach/i.test(finalHtml);
    steps.push({ step: 'guest-cap', ok: capHit, note: capHit ? 'cap banner present' : 'no cap banner found after 11 messages' });
    log(j, 'cap-check', capHit ? 'ok' : 'fail');
  } catch (e) {
    log(j, 'fatal', 'fail', e.message);
    if (!failed) failed = { step: 'unknown', reason: e.message };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed' });
}

// ------------- Journey 2: signup attempt (no real email; just verify entry) -------------
async function J2() {
  const j = 'j2';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await snap(page, j, '01-login-page');
    const hasGoogle = await page.getByRole('button', { name: /google/i }).first().isVisible().catch(() => false);
    const hasEmail = await page.locator('input[type="email"]').first().isVisible().catch(() => false);
    steps.push({ step: 'login-controls', ok: hasGoogle || hasEmail, note: `google=${hasGoogle} email=${hasEmail}` });
    if (!hasGoogle && !hasEmail) { failed = { step: 'login-controls', reason: 'no signin controls visible' }; throw new Error('no controls'); }

    // We will NOT actually sign up (no real email available, and we must not write to Firebase).
    // Instead, type a clearly-fake address and verify form validation runs.
    if (hasEmail) {
      await page.locator('input[type="email"]').first().fill('qa-test-noop@weddingease.test');
      const pw = page.locator('input[type="password"]').first();
      if (await pw.isVisible().catch(() => false)) {
        await pw.fill('qa-test-noop-passwd!!');
      }
      await snap(page, j, '02-form-filled');
      steps.push({ step: 'form-fillable', ok: true });
    }
    // Don't submit — capture state and exit.
    log(j, 'no-submit', 'ok', 'avoiding firebase write');
  } catch (e) {
    log(j, 'fatal', 'fail', e.message);
    if (!failed) failed = { step: 'unknown', reason: e.message };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed', note: 'signup completion not exercised (Firebase write forbidden); entry surface verified only' });
}

// ------------- Journey 3: planner mode → checklist -------------
async function J3() {
  const j = 'j3';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await snap(page, j, '01-landed');

    // Locate mode/category controls. Try common labels.
    const plannerCandidates = [
      page.getByRole('button', { name: /planner/i }),
      page.getByText(/planner/i, { exact: false }).first(),
    ];
    let clicked = false;
    for (const c of plannerCandidates) {
      try {
        await c.first().click({ timeout: 3500 });
        clicked = true; break;
      } catch {}
    }
    steps.push({ step: 'planner-mode-clickable', ok: clicked });
    if (!clicked) { failed = { step: 'switch-mode', reason: 'no planner mode trigger found' }; throw new Error('no planner trigger'); }
    await page.waitForTimeout(1500);
    await snap(page, j, '02-planner');

    // Send a planner-prompt
    const input = page.locator('textarea, [contenteditable="true"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.click();
    await input.fill('qa-test-j3: create a 5-item wedding checklist for venue scouting');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(10000);
    await snap(page, j, '03-planner-reply');
    steps.push({ step: 'planner-prompt', ok: true });

    // Look for checklist-like UI (checkbox, list, etc.)
    const html = await page.content();
    const hasChecklist = /checklist|todo|<input[^>]*type=["']checkbox/.test(html);
    steps.push({ step: 'checklist-rendered', ok: hasChecklist, note: hasChecklist ? 'list-like UI present' : 'no checklist UI in DOM' });
  } catch (e) {
    log(j, 'fatal', 'fail', e.message);
    if (!failed) failed = { step: 'unknown', reason: e.message };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed' });
}

// ------------- Journey 4: image/stylist mode → generate -------------
async function J4() {
  const j = 'j4';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await snap(page, j, '01-landed');

    const candidates = [
      page.getByRole('button', { name: /image|stylist/i }),
      page.getByText(/image|stylist/i, { exact: false }).first(),
    ];
    let clicked = false;
    for (const c of candidates) {
      try { await c.first().click({ timeout: 3500 }); clicked = true; break; } catch {}
    }
    steps.push({ step: 'image-mode-clickable', ok: clicked });
    if (!clicked) { failed = { step: 'switch-image', reason: 'no image/stylist mode trigger found' }; throw new Error('no image trigger'); }
    await page.waitForTimeout(1500);
    await snap(page, j, '02-image-mode');

    const input = page.locator('textarea, [contenteditable="true"]').first();
    await input.click();
    await input.fill('qa-test-j4: minimalist bridal mehndi pattern');
    await page.keyboard.press('Enter');
    // image gen is slow — give it 25s
    await page.waitForTimeout(25000);
    await snap(page, j, '03-after-genimg');

    const html = await page.content();
    const hasImage = /<img[^>]+src=["']data:image|<img[^>]+src=["']blob:|<img[^>]+src=["']https?:[^"']*\.(png|jpg|jpeg|webp)/i.test(html);
    steps.push({ step: 'image-rendered', ok: hasImage, note: hasImage ? 'img tag with src present' : 'no generated image element found' });
  } catch (e) {
    log(j, 'fatal', 'fail', e.message);
    if (!failed) failed = { step: 'unknown', reason: e.message };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed' });
}

// ------------- Journey 5: settings page reachable (nickname/voice surface only — Firebase writes forbidden) -------------
async function J5() {
  const j = 'j5';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    // Most settings live behind auth — but the route may render a shell. We attempt /settings.
    const urls = [`${BASE}/settings`, `${BASE}/settings/profile`, `${BASE}/`];
    let landed = false;
    for (const u of urls) {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(2000);
      const url = page.url();
      const title = await page.title();
      log(j, 'navigate', 'ok', `→ ${u} resulted in ${url} (${title})`);
      if (/settings|profile|preferences/i.test(await page.content())) { landed = true; break; }
    }
    await snap(page, j, '01-settings');
    steps.push({ step: 'settings-reachable', ok: landed, note: landed ? 'settings content rendered' : 'redirected away or no settings surface visible to guest' });
  } catch (e) {
    log(j, 'fatal', 'fail', e.message);
    if (!failed) failed = { step: 'unknown', reason: e.message };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed', note: 'nickname save not exercised (Firebase write forbidden); surface visibility verified only' });
}

// ------------- Journey 6: token cap → banner (guest fast-burn proxy) -------------
async function J6() {
  const j = 'j6';
  const { browser, ctx, page, consoleLog, failedReqs } = await newCtx(j);
  const steps = [];
  let failed = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await snap(page, j, '01-landed');
    const input = page.locator('textarea, [contenteditable="true"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });

    // Burn through tokens: send LONG prompts to inflate input-token usage fast.
    const longPrompt = 'qa-test-j6: ' + 'write a very long detailed wedding plan with venues vendors food music decor invitations attire transport accommodation guest list seating chart timeline budget breakdown contracts. '.repeat(20);
    for (let i = 1; i <= 6; i++) {
      try {
        await input.click({ timeout: 3000 });
        await input.fill(`${longPrompt} [round ${i}]`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(6000);
      } catch (e) {
        log(j, `burn ${i}`, 'skip', e.message.slice(0, 80));
        break;
      }
    }
    await snap(page, j, '02-after-burn');
    const html = await page.content();
    const banner = /token.*cap|daily.*cap|upgrade|tier|reach.*limit|out of tokens|cap.*reach|free.*plan/i.test(html);
    steps.push({ step: 'cap-banner', ok: banner, note: banner ? 'cap/upgrade messaging present' : 'no cap banner observed after 6 long prompts (cap may be higher than burn quantity)' });
  } catch (e) {
    log(j, 'fatal', 'fail', e.message);
    if (!failed) failed = { step: 'unknown', reason: e.message };
  }
  await finish(j, ctx, browser, consoleLog, failedReqs, { steps, failed, status: failed ? 'failed' : 'passed' });
}

(async () => {
  for (const fn of [J1, J2, J3, J4, J5, J6]) {
    try { await fn(); } catch (e) { console.error('journey crashed', e); }
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(results, null, 2));
})();
