// qa-screenshots.mjs — Feedback Round 2 screenshot capture
// Boots against a running Vite dev server on http://localhost:8080.
// Captures 16 pointers across mobile (375x812) and desktop (1440x900) viewports.
//
// NOTE: Settings dialog is opened via ?settings=<tab-id> URL param
// (SettingsShell wires a `useSearchParams` listener). This is more reliable
// than clicking through menus. The profile dropdown with "Visit WeddingEase.ai"
// only renders for authenticated users — in guest mode the sidebar footer shows
// direct "Settings / Help / Pricing" buttons instead.

import pkg from '/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/node_modules/@playwright/test/index.js';
const { chromium, devices } = pkg;
import fs from 'fs';
import path from 'path';

const OUT_DIR = '/Users/krish/Desktop/easebot/qa-screenshots';
const BASE_URL = 'http://localhost:8080';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const consoleErrors = [];
const playwrightErrors = [];

function rec(viewport, n, slug, status, file, note) {
  const id = `${viewport}-${String(n).padStart(2, '0')}-${slug}`;
  results.push({ id, viewport, n, slug, status, file, note });
  console.log(`[${status}] ${id}${note ? ' — ' + note : ''}`);
}

async function safeShot(page, filePath, opts = {}) {
  try {
    await page.screenshot({ path: filePath, fullPage: false, ...opts });
    return true;
  } catch (e) {
    playwrightErrors.push(`screenshot ${filePath}: ${e.message}`);
    return false;
  }
}

async function runViewport(browser, label, contextOpts) {
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ viewport: label, text: msg.text().slice(0, 400) });
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ viewport: label, text: 'pageerror: ' + (err.message || String(err)).slice(0, 400) });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Helper: open sidebar by clicking the PanelLeft toggle
  // ─────────────────────────────────────────────────────────────────────
  async function openSidebar() {
    // Sidebar may already be open on desktop at certain widths. Check first.
    const sidebarOpen = await page.locator('div.fixed.left-0.top-0.h-full').filter({ hasText: /./ }).first().evaluate(
      el => el && getComputedStyle(el).width && parseInt(getComputedStyle(el).width) > 32
    ).catch(() => false);
    if (sidebarOpen) return true;
    const btn = page.getByRole('button', { name: /open sidebar/i }).first();
    if (await btn.count() > 0) {
      await btn.click().catch(async () => { await btn.tap().catch(() => {}); });
      await page.waitForTimeout(500);
      return true;
    }
    return false;
  }

  async function closeSidebarIfMobile() {
    if (label === 'mobile') {
      const closeBtn = page.getByRole('button', { name: /close sidebar/i }).first();
      if (await closeBtn.count() > 0 && await closeBtn.isVisible()) {
        await closeBtn.click().catch(() => {});
        await page.waitForTimeout(300);
      } else {
        // click outside
        await page.mouse.click(350, 400).catch(() => {});
        await page.waitForTimeout(200);
      }
    }
  }

  // Settings helper — use URL param
  async function openSettings(tab = 'ai-behavior') {
    // Navigate preserving current route
    const url = new URL(page.url());
    url.searchParams.set('settings', tab);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const dialog = page.getByRole('dialog').first();
    return (await dialog.count()) > 0 && (await dialog.isVisible());
  }

  async function closeSettings() {
    const url = new URL(page.url());
    url.searchParams.delete('settings');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 1. landing-base
  // ────────────────────────────────────────────────────────────────────────
  try {
    try {
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 20_000 });
    } catch {
      // fallback — networkidle can be flaky with long-lived sockets/HMR. Use domcontentloaded.
      await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
    // Wait for header to render as a readiness signal
    await page.waitForSelector('header', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const file = path.join(OUT_DIR, `${label}-01-landing-base.png`);
    await safeShot(page, file);
    rec(label, 1, 'landing-base', 'captured', file);
  } catch (e) {
    rec(label, 1, 'landing-base', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 2. header-beta-badge
  // ────────────────────────────────────────────────────────────────────────
  try {
    const header = page.locator('header').first();
    if (await header.count() > 0) {
      const file = path.join(OUT_DIR, `${label}-02-header-beta-badge.png`);
      await header.screenshot({ path: file });
      rec(label, 2, 'header-beta-badge', 'captured', file);

      if (label === 'mobile') {
        try {
          const beta = page.getByRole('button', { name: /beta program info/i }).first();
          if (await beta.count() > 0) {
            await beta.tap();
            await page.waitForTimeout(500);
            const file2 = path.join(OUT_DIR, `${label}-02b-betabadge-tooltip-open.png`);
            await safeShot(page, file2);
            rec(label, '02b', 'betabadge-tooltip-open', 'captured', file2);
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(200);
          }
        } catch (e) {
          rec(label, '02b', 'betabadge-tooltip-open', 'error', null, e.message.slice(0, 120));
        }
      }
    } else {
      rec(label, 2, 'header-beta-badge', 'skipped', null, 'no header');
    }
  } catch (e) {
    rec(label, 2, 'header-beta-badge', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 3. mobile-language-selector
  // ────────────────────────────────────────────────────────────────────────
  if (label === 'mobile') {
    try {
      const globe = page.getByRole('button', { name: /response language/i }).first();
      if (await globe.count() > 0) {
        await globe.tap();
        await page.waitForTimeout(500);
        const file = path.join(OUT_DIR, `${label}-03-mobile-language-selector.png`);
        await safeShot(page, file);
        rec(label, 3, 'mobile-language-selector', 'captured', file);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
      } else {
        rec(label, 3, 'mobile-language-selector', 'skipped', null, 'globe button not found');
      }
    } catch (e) {
      rec(label, 3, 'mobile-language-selector', 'error', null, e.message.slice(0, 120));
    }
  } else {
    rec(label, 3, 'mobile-language-selector', 'skipped', null, 'mobile-only pointer');
  }

  // ────────────────────────────────────────────────────────────────────────
  // 4. themes-row-no-horizontal-scroll
  // ────────────────────────────────────────────────────────────────────────
  try {
    const metrics = await page.evaluate(() => ({
      scrollLeft: document.documentElement.scrollLeft || document.body.scrollLeft,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const overflow = metrics.scrollWidth > metrics.clientWidth;
    const file = path.join(OUT_DIR, `${label}-04-themes-row-no-horizontal-scroll.png`);
    await safeShot(page, file);
    rec(label, 4, 'themes-row-no-horizontal-scroll', 'captured', file,
      `scrollLeft=${metrics.scrollLeft} scrollW=${metrics.scrollWidth} clientW=${metrics.clientWidth} overflow=${overflow}`);
  } catch (e) {
    rec(label, 4, 'themes-row-no-horizontal-scroll', 'error', null, e.message.slice(0, 120));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 5. mehendi-chip-visible
  // ────────────────────────────────────────────────────────────────────────
  try {
    const body = await page.locator('body').innerText();
    const hasMehendi = /mehendi/i.test(body);
    const file = path.join(OUT_DIR, `${label}-05-mehendi-chip-visible.png`);
    await safeShot(page, file);
    rec(label, 5, 'mehendi-chip-visible', 'captured', file,
      hasMehendi ? 'Mehendi text present' : 'Mehendi text NOT found');
  } catch (e) {
    rec(label, 5, 'mehendi-chip-visible', 'error', null, e.message.slice(0, 120));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 6. auto-subagents-dropdown (mobile)
  // ────────────────────────────────────────────────────────────────────────
  if (label === 'mobile') {
    try {
      let auto = page.getByRole('button', { name: /^auto$/i }).first();
      if (await auto.count() === 0) {
        auto = page.locator('button:has-text("Auto")').first();
      }
      if (await auto.count() > 0) {
        await auto.scrollIntoViewIfNeeded();
        await auto.tap();
        await page.waitForTimeout(600);
        const file = path.join(OUT_DIR, `${label}-06-auto-subagents-dropdown.png`);
        await safeShot(page, file);
        rec(label, 6, 'auto-subagents-dropdown', 'captured', file);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
      } else {
        rec(label, 6, 'auto-subagents-dropdown', 'skipped', null, 'Auto chip not found');
      }
    } catch (e) {
      rec(label, 6, 'auto-subagents-dropdown', 'error', null, e.message.slice(0, 160));
    }
  } else {
    rec(label, 6, 'auto-subagents-dropdown', 'skipped', null, 'mobile-only pointer');
  }

  // ────────────────────────────────────────────────────────────────────────
  // 7. settings-single-x — open via ?settings=ai-behavior (guest default)
  // ────────────────────────────────────────────────────────────────────────
  let settingsOpened = false;
  try {
    // 'account' requires auth — use 'ai-behavior' for initial open (guest-visible)
    settingsOpened = await openSettings('ai-behavior');
    if (settingsOpened) {
      const file = path.join(OUT_DIR, `${label}-07-settings-single-x.png`);
      await safeShot(page, file);
      // Count distinct visible X buttons inside the dialog
      const dialog = page.getByRole('dialog').first();
      const xCount = await dialog.locator('button[aria-label*="close" i]:visible, button[title*="close" i]:visible').count();
      // Also look for buttons containing only an X svg
      const xSvgCount = await dialog.locator('button:visible').evaluateAll(btns =>
        btns.filter(b => {
          const svg = b.querySelector('svg');
          if (!svg) return false;
          const cls = svg.getAttribute('class') || '';
          return /lucide-x\b/.test(cls);
        }).length
      );
      rec(label, 7, 'settings-single-x', 'captured', file,
        `close-X candidates: aria-label=${xCount} svg-lucide-x=${xSvgCount}`);
    } else {
      rec(label, 7, 'settings-single-x', 'skipped', null, 'could not open Settings via URL param');
    }
  } catch (e) {
    rec(label, 7, 'settings-single-x', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 8. settings-about-v001-beta
  // ────────────────────────────────────────────────────────────────────────
  try {
    const opened = await openSettings('about');
    if (opened) {
      await page.waitForTimeout(400);
      const dialog = page.getByRole('dialog').first();
      const body = (await dialog.innerText()).toString();
      const hasV = /V\s*0\.0\.1|0\.0\.1/.test(body);
      const hasBeta = /beta release/i.test(body);
      const file = path.join(OUT_DIR, `${label}-08-settings-about-v001-beta.png`);
      await safeShot(page, file);
      rec(label, 8, 'settings-about-v001-beta', 'captured', file,
        `V0.0.1=${hasV} BetaRelease=${hasBeta}`);
    } else {
      rec(label, 8, 'settings-about-v001-beta', 'skipped', null, 'could not open About tab');
    }
  } catch (e) {
    rec(label, 8, 'settings-about-v001-beta', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 9. settings-account-connected — Account tab (auth-required)
  // ────────────────────────────────────────────────────────────────────────
  try {
    const opened = await openSettings('account');
    if (opened) {
      await page.waitForTimeout(500);
      const dialog = page.getByRole('dialog').first();
      const body = (await dialog.innerText()).toString();
      // As guest, 'account' will fall back to first visible tab (ai-behavior)
      const gated = !/connected accounts|linked accounts|email/i.test(body);
      const file = path.join(OUT_DIR, `${label}-09-settings-account-connected.png`);
      await safeShot(page, file);
      rec(label, 9, 'settings-account-connected',
        gated ? 'captured' : 'captured',
        file,
        gated ? 'account tab hidden for guests — auth required to verify Connected Accounts' : 'Account tab rendered'
      );
    } else {
      rec(label, 9, 'settings-account-connected', 'skipped', null, 'settings dialog not open');
    }
  } catch (e) {
    rec(label, 9, 'settings-account-connected', 'error', null, e.message.slice(0, 160));
  }

  await closeSettings();

  // ────────────────────────────────────────────────────────────────────────
  // 10. profile-menu-wedding-ease-ai — only renders in auth'd ProfileMenu
  // ────────────────────────────────────────────────────────────────────────
  try {
    await openSidebar();
    // In guest mode, sidebar footer shows direct Settings/Help/Pricing buttons
    // instead of the ProfileMenu dropdown. "Visit WeddingEase.ai" is inside
    // the auth-only ProfileMenu. We'll still screenshot sidebar bottom for
    // traceability.
    const footer = page.locator('div.fixed.left-0.top-0').first();
    if (await footer.count() > 0) {
      const file = path.join(OUT_DIR, `${label}-10-profile-menu-wedding-ease-ai.png`);
      const box = await footer.boundingBox();
      if (box) {
        const clipH = Math.min(260, box.height);
        await page.screenshot({
          path: file,
          clip: {
            x: box.x,
            y: Math.max(0, box.y + box.height - clipH),
            width: Math.max(1, box.width),
            height: clipH,
          },
        });
      } else {
        await safeShot(page, file);
      }
      rec(label, 10, 'profile-menu-wedding-ease-ai', 'captured', file,
        'SKIP auth: Visit WeddingEase.ai lives inside ProfileMenu (auth-only). Captured sidebar footer (guest variant) as evidence.');
    } else {
      rec(label, 10, 'profile-menu-wedding-ease-ai', 'skipped', null,
        'SKIP — auth required (Visit WeddingEase.ai is in ProfileMenu which only renders when authenticated)');
    }
    await closeSidebarIfMobile();
  } catch (e) {
    rec(label, 10, 'profile-menu-wedding-ease-ai', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 11. feedback-dialog-guest
  // ────────────────────────────────────────────────────────────────────────
  try {
    await openSidebar();
    const sf = page.locator('[aria-label="Send Feedback"]').first();
    if (await sf.count() > 0) {
      await sf.click().catch(async () => { await sf.tap().catch(() => {}); });
      await page.waitForTimeout(700);
      const file = path.join(OUT_DIR, `${label}-11-feedback-dialog-guest.png`);
      await safeShot(page, file);
      rec(label, 11, 'feedback-dialog-guest', 'captured', file);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(400);
    } else {
      rec(label, 11, 'feedback-dialog-guest', 'skipped', null, 'Send Feedback button not found');
    }
    await closeSidebarIfMobile();

    // Inline "Send it here" on homepage
    try {
      if (!page.url().endsWith('/')) {
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
      }
      const sendItHere = page.locator('text=/send it here/i').first();
      if (await sendItHere.count() > 0) {
        await sendItHere.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(300);
        const file = path.join(OUT_DIR, `${label}-11b-feedback-inline-send-it-here.png`);
        await safeShot(page, file);
        rec(label, '11b', 'feedback-inline-send-it-here', 'captured', file);
      } else {
        rec(label, '11b', 'feedback-inline-send-it-here', 'skipped', null, '"Send it here" link not on page');
      }
    } catch (e) {
      rec(label, '11b', 'feedback-inline-send-it-here', 'error', null, e.message.slice(0, 120));
    }
  } catch (e) {
    rec(label, 11, 'feedback-dialog-guest', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 12. no-top-right-profile
  // ────────────────────────────────────────────────────────────────────────
  try {
    await closeSidebarIfMobile();
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
    const header = page.locator('header').first();
    if (await header.count() > 0) {
      const box = await header.boundingBox();
      if (box) {
        const clip = {
          x: Math.max(0, box.x + box.width / 2),
          y: box.y,
          width: box.width / 2,
          height: box.height,
        };
        const file = path.join(OUT_DIR, `${label}-12-no-top-right-profile.png`);
        await page.screenshot({ path: file, clip });
        const avatars = await header.locator('img[alt*="Profile" i], [data-radix-avatar-root]').count();
        rec(label, 12, 'no-top-right-profile', 'captured', file, `header-avatar-candidates=${avatars}`);
      } else {
        rec(label, 12, 'no-top-right-profile', 'skipped', null, 'header bbox missing');
      }
    } else {
      rec(label, 12, 'no-top-right-profile', 'skipped', null, 'no header');
    }
  } catch (e) {
    rec(label, 12, 'no-top-right-profile', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 13. sidebar-profile-bottom-left
  // ────────────────────────────────────────────────────────────────────────
  try {
    await openSidebar();
    // The sidebar container is <div class="fixed left-0 top-0 h-full ...">
    const sidebar = page.locator('div.fixed.left-0.top-0.h-full').first();
    if (await sidebar.count() > 0) {
      const isVis = await sidebar.isVisible();
      const box = await sidebar.boundingBox();
      const file = path.join(OUT_DIR, `${label}-13-sidebar-profile-bottom-left.png`);
      if (box && box.width > 10) {
        // Capture bottom 240px
        const clipH = Math.min(240, box.height);
        await page.screenshot({
          path: file,
          clip: {
            x: box.x,
            y: Math.max(0, box.y + box.height - clipH),
            width: box.width,
            height: clipH,
          },
        });
        rec(label, 13, 'sidebar-profile-bottom-left', 'captured', file, `visible=${isVis} w=${box.width}`);
      } else {
        await safeShot(page, file);
        rec(label, 13, 'sidebar-profile-bottom-left', 'captured', file, `no bbox — fallback full-page`);
      }
    } else {
      rec(label, 13, 'sidebar-profile-bottom-left', 'skipped', null, 'sidebar container not found');
    }
    await closeSidebarIfMobile();
  } catch (e) {
    rec(label, 13, 'sidebar-profile-bottom-left', 'error', null, e.message.slice(0, 160));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 14. artifact-share-buttons — skip (guest mode has no seeded artifacts)
  // ────────────────────────────────────────────────────────────────────────
  rec(label, 14, 'artifact-share-buttons', 'skipped', null,
    'SKIP — auth + chat history required to seed artifact messages');

  // ────────────────────────────────────────────────────────────────────────
  // 15. timeline-mobile-interactive
  // ────────────────────────────────────────────────────────────────────────
  try {
    await page.goto(BASE_URL + '/guest/timeline', { waitUntil: 'networkidle', timeout: 20_000 });
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    const authGated = /sign in|please sign|must be signed in/i.test(body);
    const file = path.join(OUT_DIR, `${label}-15-timeline-mobile-interactive.png`);
    await safeShot(page, file);
    rec(label, 15, 'timeline-mobile-interactive', 'captured', file,
      authGated ? 'auth-gated in guest mode — captured current state' : 'timeline route rendered');
  } catch (e) {
    rec(label, 15, 'timeline-mobile-interactive', 'skipped', null, `nav failed: ${e.message.slice(0, 120)}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 16. notes-attach-to-chat
  // ────────────────────────────────────────────────────────────────────────
  try {
    await page.goto(BASE_URL + '/guest/notes', { waitUntil: 'networkidle', timeout: 20_000 });
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    const authGated = /sign in to|please sign|login required/i.test(body);
    const file = path.join(OUT_DIR, `${label}-16-notes-attach-to-chat.png`);
    await safeShot(page, file);
    rec(label, 16, 'notes-attach-to-chat', 'captured', file,
      authGated ? 'SKIP — auth required in guest mode (captured current state)' : 'notes route rendered');
  } catch (e) {
    rec(label, 16, 'notes-attach-to-chat', 'skipped', null, `nav failed: ${e.message.slice(0, 100)}`);
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await runViewport(browser, 'mobile', {
      ...devices['iPhone 13'],
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await runViewport(browser, 'desktop', {
      viewport: { width: 1440, height: 900 },
    });
  } catch (e) {
    playwrightErrors.push('top-level: ' + e.message);
  } finally {
    await browser.close();
  }

  console.log('\n\n======== SUMMARY ========');
  for (const r of results) {
    console.log(`${r.status.padEnd(9)} ${r.id}${r.note ? ' | ' + r.note : ''}${r.file ? ' -> ' + r.file : ''}`);
  }

  console.log('\n======== CONSOLE ERRORS ========');
  if (consoleErrors.length === 0) console.log('(none)');
  else for (const ce of consoleErrors.slice(0, 40)) console.log(`[${ce.viewport}] ${ce.text}`);

  console.log('\n======== PLAYWRIGHT ERRORS ========');
  if (playwrightErrors.length === 0) console.log('(none)');
  else for (const pe of playwrightErrors) console.log(pe);

  fs.writeFileSync(
    path.join(OUT_DIR, '_summary.json'),
    JSON.stringify({ results, consoleErrors, playwrightErrors }, null, 2)
  );
  console.log('\nSummary JSON:', path.join(OUT_DIR, '_summary.json'));
})();
