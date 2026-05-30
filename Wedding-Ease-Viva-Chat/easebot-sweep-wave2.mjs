/**
 * easeBot Wave 2 Playwright sweep — deeper UI flows.
 * Drives the live frontend at http://localhost:8080 through Login modal,
 * Settings, Send Feedback, Plans/Pricing, and mobile viewports.
 *
 * Emits one NDJSON line per defect to stdout. Screenshots into the dir
 * passed as argv[2].
 */
import { chromium, devices } from 'playwright'
import fs from 'fs'
import path from 'path'

const screenshotDir = process.argv[2] || 'D:/weddingease/qa-harness/screenshots/2026-05-25'
const runId = process.argv[3] || 'QA-RUN-EB-20260525-W2'
fs.mkdirSync(screenshotDir, { recursive: true })

const ymd = '20260525'
let seq = 200
const defects = []
function ticket(p) {
  seq += 1
  const t = {
    BUG_ID: `BUG-VIVA-${ymd}-${String(seq).padStart(3, '0')}`,
    DATE_FOUND: '2026-05-25',
    SEVERITY: 'P2-Medium',
    STATUS: 'Open',
    TYPE: 'Functional',
    REPO: 'viva-chat',
    PAGE_COMPONENT: '',
    FILE_PATH: '',
    DESCRIPTION: '',
    STEPS_TO_REPRODUCE: '',
    EXPECTED: '',
    ACTUAL: '',
    SCREENSHOT_PATH: '',
    PR_LINK: '',
    ASSIGNED_TO: 'Frontend Dev Agent',
    CHAIRMAN_NOTES: '',
    FIXED_DATE: '',
    RUN_ID: runId,
    ...p,
  }
  defects.push(t)
  process.stdout.write(JSON.stringify(t) + '\n')
  return t
}
const shot = (n) => path.join(screenshotDir, `${n}.png`)

async function withErr(page) {
  const out = { console: [], page: [], req: [] }
  page.on('console', (m) => {
    if (m.type() === 'error') out.console.push(m.text())
  })
  page.on('pageerror', (e) => out.page.push(e.message))
  page.on('requestfailed', (r) => {
    if (!r.url().includes('/ingest/')) out.req.push(`${r.url()} ${(r.failure() || {}).errorText}`)
  })
  return out
}

async function run() {
  const browser = await chromium.launch({ headless: true })

  // ── Test A: Login modal flow ─────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    const err = await withErr(p)
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1200)

    const before = p.url()
    const login = p.getByText('Log In', { exact: false }).first()
    if (await login.count()) {
      await login.click({ timeout: 3000 }).catch(() => {})
      await p.waitForTimeout(1500)
      await p.screenshot({ path: shot('w2-01-login-after-click'), fullPage: false })
      const txt = (await p.locator('body').innerText()).toLowerCase()
      const isModalOpen =
        p.url() !== before ||
        txt.includes('continue with google') ||
        txt.includes('sign in') ||
        txt.includes('email')
      if (!isModalOpen) {
        ticket({
          SEVERITY: 'P1-High',
          TYPE: 'Auth',
          PAGE_COMPONENT: 'Log In button → auth modal',
          DESCRIPTION: 'Clicking "Log In" does not appear to open any auth surface',
          EXPECTED: 'Click opens sign-in modal OR navigates to /login',
          ACTUAL: `URL unchanged (${before}); no auth keywords in DOM after click`,
          SCREENSHOT_PATH: shot('w2-01-login-after-click'),
        })
      } else {
        // Try email validation paths
        const emailIn = p.locator('input[type="email"], input[name="email"]').first()
        if (await emailIn.count()) {
          await emailIn.fill('not-an-email')
          await p.keyboard.press('Tab')
          await p.waitForTimeout(500)
          await p.screenshot({ path: shot('w2-02-login-email-invalid'), fullPage: false })

          const subBtn = p.locator('button:has-text("Continue"), button:has-text("Sign in"), button:has-text("Log in")').first()
          if (await subBtn.count()) {
            await subBtn.click({ timeout: 2000 }).catch(() => {})
            await p.waitForTimeout(800)
            const errVisible = await p.locator(':has-text("valid email"), :has-text("invalid"), [role="alert"]').count()
            if (errVisible === 0) {
              ticket({
                SEVERITY: 'P2-Medium',
                TYPE: 'Auth',
                PAGE_COMPONENT: 'Sign in form email validation',
                DESCRIPTION: 'Submitting invalid email "not-an-email" did not surface a visible validation error',
                EXPECTED: 'A user-facing error like "Enter a valid email" appears',
                ACTUAL: 'No alert / error text visible after submit',
                SCREENSHOT_PATH: shot('w2-02-login-email-invalid'),
              })
            }
          }
        } else {
          ticket({
            SEVERITY: 'P3-Low',
            TYPE: 'Auth',
            PAGE_COMPONENT: 'Sign in form',
            DESCRIPTION: 'Login surface opened but no email input rendered (sign-in may be Google-only)',
            EXPECTED: 'If email/password supported, email input visible',
            ACTUAL: 'No <input type=email> after opening login surface',
            SCREENSHOT_PATH: shot('w2-01-login-after-click'),
          })
        }
      }
    }
    if (err.page.length) {
      ticket({
        SEVERITY: 'P1-High',
        TYPE: 'Functional',
        PAGE_COMPONENT: 'Login flow — JS errors',
        DESCRIPTION: `pageerror during login flow: ${err.page.slice(0, 2).join(' | ').slice(0, 400)}`,
        EXPECTED: 'No uncaught JS errors during auth interaction',
        ACTUAL: err.page[0],
        SCREENSHOT_PATH: shot('w2-01-login-after-click'),
      })
    }
    await ctx.close()
  }

  // ── Test B: Settings dialog (open → theme switch → close) ────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    await withErr(p)
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1200)
    const settings = p.getByText('Settings', { exact: false }).first()
    if (await settings.count()) {
      await settings.click({ timeout: 3000 }).catch(() => {})
      await p.waitForTimeout(1000)
      await p.screenshot({ path: shot('w2-10-settings-open'), fullPage: false })
      const bodyTxt = (await p.locator('body').innerText()).toLowerCase()
      const hasThemeOpt = bodyTxt.includes('dark') || bodyTxt.includes('light') || bodyTxt.includes('theme')
      const hasLangOpt = bodyTxt.includes('language') || bodyTxt.includes('english') || bodyTxt.includes('hindi')
      if (!hasThemeOpt) {
        ticket({
          SEVERITY: 'P3-Low',
          TYPE: 'Visual',
          PAGE_COMPONENT: 'Settings dialog — theme controls',
          DESCRIPTION: 'Settings dialog opened but no theme keywords (dark/light/theme) found in dialog content',
          EXPECTED: 'Theme picker visible',
          ACTUAL: 'No theme-related text in dialog',
          SCREENSHOT_PATH: shot('w2-10-settings-open'),
        })
      }
      // Try toggle dark mode if a button reads "Dark"
      const darkBtn = p.getByRole('button', { name: /dark/i }).first()
      if (await darkBtn.count()) {
        await darkBtn.click({ timeout: 2000 }).catch(() => {})
        await p.waitForTimeout(600)
        await p.screenshot({ path: shot('w2-11-after-dark'), fullPage: false })
        const htmlClass = await p.locator('html').getAttribute('class')
        if (htmlClass && !htmlClass.includes('dark')) {
          ticket({
            SEVERITY: 'P2-Medium',
            TYPE: 'Visual',
            PAGE_COMPONENT: 'Theme toggle',
            DESCRIPTION: 'Clicking the Dark option did not add the "dark" class to <html>',
            EXPECTED: '<html class="... dark"> after clicking Dark',
            ACTUAL: `<html class="${htmlClass}">`,
            SCREENSHOT_PATH: shot('w2-11-after-dark'),
          })
        }
      }
      await p.keyboard.press('Escape')
    } else {
      ticket({
        SEVERITY: 'P1-High',
        TYPE: 'Visual',
        PAGE_COMPONENT: 'Settings entry point',
        DESCRIPTION: 'No "Settings" entry point found in the chat shell',
        EXPECTED: 'Settings button visible in the sidebar or header',
        ACTUAL: 'getByText("Settings") returned 0 matches',
        SCREENSHOT_PATH: shot('w2-10-settings-open'),
      })
    }
    await ctx.close()
  }

  // ── Test C: Send Feedback flow ───────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    await withErr(p)
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1000)
    const fb = p.getByText('Send Feedback', { exact: false }).first()
    if (await fb.count()) {
      await fb.click({ timeout: 3000 }).catch(() => {})
      await p.waitForTimeout(900)
      await p.screenshot({ path: shot('w2-20-feedback-open'), fullPage: false })
      const ta = p.locator('textarea').last()
      if (await ta.count()) {
        // Empty submit first
        const submit = p.locator('button:has-text("Send"), button:has-text("Submit"), button[type="submit"]').first()
        if (await submit.count()) {
          await submit.click({ timeout: 2000 }).catch(() => {})
          await p.waitForTimeout(700)
          await p.screenshot({ path: shot('w2-21-feedback-empty-submit'), fullPage: false })
          // Now fill + submit
          await ta.fill('QA smoke test feedback — please ignore (BUG-VIVA-20260525-W2)')
          await submit.click({ timeout: 2000 }).catch(() => {})
          await p.waitForTimeout(1500)
          await p.screenshot({ path: shot('w2-22-feedback-after-submit'), fullPage: false })
          const after = (await p.locator('body').innerText()).toLowerCase()
          const success = after.includes('thank') || after.includes('received') || after.includes('sent')
          if (!success) {
            ticket({
              SEVERITY: 'P2-Medium',
              TYPE: 'Functional',
              PAGE_COMPONENT: 'Feedback dialog submit',
              DESCRIPTION: 'Filled feedback + Submit produced no visible success/thank-you confirmation',
              EXPECTED: 'A toast / inline message confirming feedback submission',
              ACTUAL: 'No "thank", "received", or "sent" text on screen after submit',
              SCREENSHOT_PATH: shot('w2-22-feedback-after-submit'),
            })
          }
        }
      } else {
        ticket({
          SEVERITY: 'P2-Medium',
          TYPE: 'Functional',
          PAGE_COMPONENT: 'Feedback dialog',
          DESCRIPTION: 'Feedback opened but no textarea to type the feedback',
          EXPECTED: 'A textarea or input visible for typing feedback',
          ACTUAL: 'No textarea in feedback dialog',
          SCREENSHOT_PATH: shot('w2-20-feedback-open'),
        })
      }
    }
    await ctx.close()
  }

  // ── Test D: Plans / Pricing flow ─────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    await withErr(p)
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1000)
    const plans = p.getByText('See Plans And Pricing', { exact: false }).first()
    if (await plans.count()) {
      const before = p.url()
      await plans.click({ timeout: 3000 }).catch(() => {})
      await p.waitForTimeout(1500)
      await p.screenshot({ path: shot('w2-30-plans-open'), fullPage: false })
      const after = (await p.locator('body').innerText()).toLowerCase()
      const looksLikePricing = after.includes('plan') || after.includes('pricing') || after.includes('₹') || after.includes('$') || after.includes('month')
      if (!looksLikePricing) {
        ticket({
          SEVERITY: 'P1-High',
          TYPE: 'Functional',
          PAGE_COMPONENT: 'See Plans And Pricing button',
          DESCRIPTION: 'Clicking "See Plans And Pricing" did not surface pricing content',
          EXPECTED: 'Pricing tiers, monthly/annual options, currency symbols visible',
          ACTUAL: `URL ${before}→${p.url()}, no pricing keywords in DOM`,
          SCREENSHOT_PATH: shot('w2-30-plans-open'),
        })
      }
    }
    await ctx.close()
  }

  // ── Test E: Android viewport ─────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ ...devices['Pixel 5'] })
    const p = await ctx.newPage()
    await withErr(p)
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1500)
    await p.screenshot({ path: shot('w2-40-android-home'), fullPage: false })
    const ta = p.locator('textarea').first()
    if (await ta.count()) {
      const box = await ta.boundingBox()
      if (box && (box.y < 0 || box.y > 851)) {
        ticket({
          SEVERITY: 'P1-High',
          TYPE: 'Visual',
          PAGE_COMPONENT: 'Mobile chat input (Pixel 5)',
          DESCRIPTION: `Chat textarea outside viewport on Pixel 5: y=${box.y}, h=${box.height}`,
          EXPECTED: 'textarea visible within 393x851 viewport',
          ACTUAL: `y=${box.y}, h=${box.height}`,
          SCREENSHOT_PATH: shot('w2-40-android-home'),
        })
      }
    }
    await ctx.close()
  }

  await browser.close()
  console.error(`\n[easebot-sweep-wave2] ${defects.length} defect(s) emitted.`)
}

run().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
