/**
 * easeBot Wave 3 Playwright sweep — a11y + cross-viewport + dark mode.
 *
 * Injects axe-core via a CDN, audits the chat home, then drives a desktop
 * dark mode switch and iPad Mini viewport.
 *
 * Emits one NDJSON defect per line.
 */
import { chromium, devices } from 'playwright'
import fs from 'fs'
import path from 'path'

const screenshotDir = process.argv[2] || 'D:/weddingease/qa-harness/screenshots/2026-05-25'
const runId = process.argv[3] || 'QA-RUN-EB-20260525-W3'
fs.mkdirSync(screenshotDir, { recursive: true })

let seq = 300
const defects = []
function ticket(p) {
  seq += 1
  const t = {
    BUG_ID: `BUG-VIVA-20260525-${String(seq).padStart(3, '0')}`,
    DATE_FOUND: '2026-05-25',
    SEVERITY: 'P2-Medium',
    STATUS: 'Open',
    TYPE: 'Accessibility',
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
}
const shot = (n) => path.join(screenshotDir, `${n}.png`)

async function run() {
  const browser = await chromium.launch({ headless: true })

  // ── Test A: axe-core accessibility audit ─────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1500)
    // Inject axe via CDN
    await p.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js' })
    const results = await p.evaluate(async () => {
      // @ts-ignore
      const r = await axe.run(document, { resultTypes: ['violations'] })
      return r.violations
    })
    await p.screenshot({ path: shot('w3-00-a11y-home'), fullPage: true })
    // Emit each violation as a ticket (capped severity by axe impact)
    const sevMap = { critical: 'P1-High', serious: 'P2-Medium', moderate: 'P3-Low', minor: 'P3-Low' }
    for (const v of results) {
      const sev = sevMap[v.impact] || 'P3-Low'
      ticket({
        SEVERITY: sev,
        TYPE: 'Accessibility',
        PAGE_COMPONENT: `axe: ${v.id}`,
        DESCRIPTION: `${v.help} — ${v.description.slice(0, 200)}`,
        STEPS_TO_REPRODUCE: '1. Load http://localhost:8080/ 2. Run axe-core 4.10 audit',
        EXPECTED: 'Zero axe-core violations in critical/serious impact',
        ACTUAL: `${v.nodes.length} node(s) violate "${v.id}" (impact: ${v.impact})`,
        SCREENSHOT_PATH: shot('w3-00-a11y-home'),
        CHAIRMAN_NOTES: `axe rule: ${v.helpUrl}`,
      })
    }
    if (results.length === 0) {
      console.error('[w3-a11y] zero violations')
    }
    await ctx.close()
  }

  // ── Test B: keyboard nav (Tab + focus visibility) ────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1500)
    // Tab a few times and screenshot focus ring
    let firstFocus = null
    for (let i = 0; i < 6; i++) {
      await p.keyboard.press('Tab')
      const f = await p.evaluate(() => {
        const a = document.activeElement
        return a ? `${a.tagName}${a.getAttribute('aria-label') ? `[aria=${a.getAttribute('aria-label')}]` : ''} text:"${(a.textContent || '').trim().slice(0, 40)}"` : 'null'
      })
      if (i === 0) firstFocus = f
    }
    await p.screenshot({ path: shot('w3-10-kbd-focus'), fullPage: false })
    if (!firstFocus || firstFocus === 'null') {
      ticket({
        SEVERITY: 'P2-Medium',
        TYPE: 'Accessibility',
        PAGE_COMPONENT: 'Keyboard nav',
        DESCRIPTION: 'After first Tab key, document.activeElement is null — no focusable element receives focus',
        EXPECTED: 'First Tab moves focus to a visible focusable element',
        ACTUAL: 'activeElement === null after Tab',
        SCREENSHOT_PATH: shot('w3-10-kbd-focus'),
      })
    }
    await ctx.close()
  }

  // ── Test C: Dark mode visual ─────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1200)
    // Force dark mode via localStorage and reload (the boot script reads easebot-theme)
    await p.evaluate(() => localStorage.setItem('easebot-theme', 'dark'))
    await p.reload({ waitUntil: 'networkidle' })
    await p.waitForTimeout(1500)
    const htmlClass = await p.locator('html').getAttribute('class')
    await p.screenshot({ path: shot('w3-20-dark-mode'), fullPage: true })
    if (!htmlClass || !htmlClass.includes('dark')) {
      ticket({
        SEVERITY: 'P2-Medium',
        TYPE: 'Visual',
        PAGE_COMPONENT: 'Dark mode boot',
        DESCRIPTION: `localStorage.easebot-theme=dark + reload did not add "dark" class to <html>`,
        EXPECTED: '<html class="dark ...">',
        ACTUAL: `<html class="${htmlClass}">`,
        SCREENSHOT_PATH: shot('w3-20-dark-mode'),
      })
    }
    await ctx.close()
  }

  // ── Test D: iPad Mini (768 × 1024) ───────────────────────────────────────
  {
    const ctx = await browser.newContext({ ...devices['iPad Mini'] })
    const p = await ctx.newPage()
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1500)
    await p.screenshot({ path: shot('w3-30-ipad-home'), fullPage: false })
    const ta = await p.locator('textarea').count()
    if (ta === 0) {
      ticket({
        SEVERITY: 'P1-High',
        TYPE: 'Visual',
        PAGE_COMPONENT: 'iPad Mini chat input',
        DESCRIPTION: 'No textarea found on iPad Mini viewport',
        EXPECTED: 'textarea visible',
        ACTUAL: '0 textareas',
        SCREENSHOT_PATH: shot('w3-30-ipad-home'),
      })
    }
    await ctx.close()
  }

  // ── Test E: very narrow (320 × 568, iPhone SE old) ───────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } })
    const p = await ctx.newPage()
    await p.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await p.waitForTimeout(1500)
    await p.screenshot({ path: shot('w3-40-narrow-320'), fullPage: false })
    // Check no horizontal overflow
    const overflow = await p.evaluate(() => document.body.scrollWidth > window.innerWidth + 4)
    if (overflow) {
      ticket({
        SEVERITY: 'P2-Medium',
        TYPE: 'Visual',
        PAGE_COMPONENT: 'Narrow viewport (320px)',
        DESCRIPTION: 'Horizontal overflow on 320px viewport (body.scrollWidth > window.innerWidth + 4)',
        EXPECTED: 'No horizontal scroll on 320px (old iPhone SE)',
        ACTUAL: 'body wider than viewport',
        SCREENSHOT_PATH: shot('w3-40-narrow-320'),
      })
    }
    await ctx.close()
  }

  await browser.close()
  console.error(`[easebot-sweep-wave3] ${defects.length} defect(s) emitted.`)
}

run().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
