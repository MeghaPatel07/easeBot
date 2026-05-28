/**
 * easeBot Playwright sweep — drives http://localhost:8080 as a real user,
 * captures screenshots and console/network errors, emits one JSON object
 * per defect to stdout (one defect per line; first line is the manifest).
 *
 * Usage:
 *   node easebot-sweep.mjs <screenshotDir> <runId>
 */
import { chromium, devices } from 'playwright'
import fs from 'fs'
import path from 'path'

const screenshotDir = process.argv[2] || `D:/weddingease/qa-harness/screenshots/${new Date().toISOString().slice(0, 10)}`
const runId = process.argv[3] || `QA-RUN-EB-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`
fs.mkdirSync(screenshotDir, { recursive: true })

const today = new Date().toISOString().slice(0, 10)
const ymd = today.replace(/-/g, '')
let seq = 100

const defects = []
function ticket(partial) {
  seq += 1
  const t = {
    BUG_ID: `BUG-VIVA-${ymd}-${String(seq).padStart(3, '0')}`,
    DATE_FOUND: today,
    SEVERITY: 'P2-Medium',
    STATUS: 'Open',
    TYPE: 'Visual',
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
    ...partial,
  }
  defects.push(t)
  process.stdout.write(JSON.stringify(t) + '\n')
  return t
}

function shotPath(name) {
  return path.join(screenshotDir, `${name}.png`)
}

async function captureContextErrors(page) {
  const consoleErrors = []
  const pageErrors = []
  const requestFails = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('requestfailed', (r) => {
    const url = r.url()
    // Ignore expected dev-mode PostHog ingest proxy 404s
    if (url.includes('/ingest/')) return
    const f = r.failure()
    requestFails.push(`${url} — ${f ? f.errorText : 'unknown'}`)
  })
  return { consoleErrors, pageErrors, requestFails }
}

async function run() {
  const browser = await chromium.launch({ headless: true })

  // ─── Desktop sweep ───────────────────────────────────────────────────────
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const dPage = await desktopCtx.newPage()
  const dErr = await captureContextErrors(dPage)

  let resp
  try {
    resp = await dPage.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
  } catch (e) {
    ticket({
      SEVERITY: 'P0-Critical',
      TYPE: 'Functional',
      PAGE_COMPONENT: 'Chat home (/)',
      DESCRIPTION: `Initial navigation failed: ${e.message}`,
      EXPECTED: 'GET / returns 200 with rendered chat UI',
      ACTUAL: e.message,
      SCREENSHOT_PATH: '',
    })
    await browser.close()
    return
  }

  await dPage.waitForTimeout(1500)
  const home = shotPath('00-home-desktop')
  await dPage.screenshot({ path: home, fullPage: false })

  if (!resp || resp.status() !== 200) {
    ticket({
      SEVERITY: 'P0-Critical',
      TYPE: 'Functional',
      PAGE_COMPONENT: 'Chat home (/)',
      DESCRIPTION: `Non-200 response on /: ${resp?.status()}`,
      EXPECTED: '200 OK',
      ACTUAL: String(resp?.status()),
      SCREENSHOT_PATH: home,
    })
  }

  // Critical UI elements presence
  const checks = [
    { name: 'log in button', locator: 'button:has-text("Log In"), a:has-text("Log In")' },
    { name: 'chat input (textarea)', locator: 'textarea, input[type="text"]' },
    { name: 'plans/pricing link', locator: ':text("Plans"), :text("Pricing")' },
    { name: 'settings button', locator: ':text("Settings")' },
    { name: 'guest mode indicator', locator: ':text("Guest Mode")' },
  ]
  for (const c of checks) {
    const n = await dPage.locator(c.locator).count()
    if (n === 0) {
      ticket({
        SEVERITY: 'P1-High',
        TYPE: 'Visual',
        PAGE_COMPONENT: 'Chat home (/)',
        DESCRIPTION: `Missing UI element: ${c.name}`,
        EXPECTED: `Selector \`${c.locator}\` returns ≥1 element`,
        ACTUAL: 'Selector returned 0 elements',
        SCREENSHOT_PATH: home,
      })
    }
  }

  // Try sending a guest message
  try {
    const ta = dPage.locator('textarea').first()
    if (await ta.count()) {
      await ta.fill('Hello, can you help me plan a wedding for 2027?')
      await dPage.screenshot({ path: shotPath('01-message-typed'), fullPage: false })
      // Try Enter key
      await ta.press('Enter')
      await dPage.waitForTimeout(4000)
      await dPage.screenshot({ path: shotPath('02-after-send'), fullPage: false })
      // Heuristic: did a new message bubble appear?
      const txt = (await dPage.locator('body').innerText()).toLowerCase()
      if (!txt.includes('hello, can you help me plan')) {
        ticket({
          SEVERITY: 'P1-High',
          TYPE: 'Functional',
          PAGE_COMPONENT: 'Chat send flow',
          DESCRIPTION: 'User message not echoed in chat history after Enter key',
          EXPECTED: 'Typed message appears as a chat bubble after submit',
          ACTUAL: 'Message text not found in DOM body text after 4s wait',
          SCREENSHOT_PATH: shotPath('02-after-send'),
        })
      }
    } else {
      ticket({
        SEVERITY: 'P0-Critical',
        TYPE: 'Functional',
        PAGE_COMPONENT: 'Chat input',
        DESCRIPTION: 'No <textarea> found — user cannot type a chat message',
        EXPECTED: 'At least one textarea visible for user input',
        ACTUAL: 'Zero textareas in DOM',
        SCREENSHOT_PATH: home,
      })
    }
  } catch (e) {
    ticket({
      SEVERITY: 'P1-High',
      TYPE: 'Functional',
      PAGE_COMPONENT: 'Chat send flow',
      DESCRIPTION: `Error driving chat input: ${e.message}`,
      EXPECTED: 'Chat input accepts text and submits on Enter',
      ACTUAL: e.message,
      SCREENSHOT_PATH: home,
    })
  }

  // Try Settings button
  try {
    const settings = dPage.getByText('Settings', { exact: false }).first()
    if (await settings.count()) {
      await settings.click({ timeout: 3000 })
      await dPage.waitForTimeout(1200)
      await dPage.screenshot({ path: shotPath('03-settings-open'), fullPage: false })
      // Close (try Escape)
      await dPage.keyboard.press('Escape')
    }
  } catch (e) {
    ticket({
      SEVERITY: 'P2-Medium',
      TYPE: 'Functional',
      PAGE_COMPONENT: 'Settings dialog',
      DESCRIPTION: `Settings click did not open the dialog cleanly: ${e.message}`,
      EXPECTED: 'Clicking Settings opens a panel/dialog',
      ACTUAL: e.message,
      SCREENSHOT_PATH: shotPath('03-settings-open'),
    })
  }

  // Try Log In click
  try {
    const login = dPage.getByText('Log In', { exact: false }).first()
    if (await login.count()) {
      const beforeUrl = dPage.url()
      await login.click({ timeout: 3000 })
      await dPage.waitForTimeout(1500)
      await dPage.screenshot({ path: shotPath('04-login-clicked'), fullPage: false })
      const afterUrl = dPage.url()
      const bodyTxt = (await dPage.locator('body').innerText()).toLowerCase()
      const hasAuthSurface =
        afterUrl !== beforeUrl ||
        bodyTxt.includes('sign in') ||
        bodyTxt.includes('continue with') ||
        bodyTxt.includes('email')
      if (!hasAuthSurface) {
        ticket({
          SEVERITY: 'P1-High',
          TYPE: 'Auth',
          PAGE_COMPONENT: 'Login button',
          DESCRIPTION: 'Log In button click did not open an auth surface (no nav, no modal text)',
          EXPECTED: 'Clicking "Log In" navigates to an auth route OR opens a modal',
          ACTUAL: `URL unchanged: ${beforeUrl}; no auth keywords in body text after click`,
          SCREENSHOT_PATH: shotPath('04-login-clicked'),
        })
      }
    }
  } catch (e) {
    ticket({
      SEVERITY: 'P2-Medium',
      TYPE: 'Auth',
      PAGE_COMPONENT: 'Login button',
      DESCRIPTION: `Log In click failed: ${e.message}`,
      EXPECTED: 'Log In click is reachable and triggers auth flow',
      ACTUAL: e.message,
      SCREENSHOT_PATH: shotPath('04-login-clicked'),
    })
  }

  // Aggregate desktop errors
  if (dErr.pageErrors.length) {
    ticket({
      SEVERITY: 'P1-High',
      TYPE: 'Functional',
      PAGE_COMPONENT: 'Chat home (/) — console',
      DESCRIPTION: `JavaScript pageerror(s) during desktop load: ${dErr.pageErrors.slice(0, 3).join(' | ').slice(0, 480)}`,
      EXPECTED: 'No uncaught JS errors on initial load',
      ACTUAL: dErr.pageErrors[0],
      SCREENSHOT_PATH: home,
    })
  }
  if (dErr.requestFails.length) {
    ticket({
      SEVERITY: 'P2-Medium',
      TYPE: 'API',
      PAGE_COMPONENT: 'Network',
      DESCRIPTION: `Non-ingest network request failed: ${dErr.requestFails.slice(0, 3).join(' | ').slice(0, 480)}`,
      EXPECTED: 'No non-ingest request failures during initial load',
      ACTUAL: dErr.requestFails[0],
      SCREENSHOT_PATH: home,
    })
  }
  // Filter console errors to ignore expected dev-mode noise
  const realConsoleErrors = dErr.consoleErrors.filter(
    (e) => !e.includes('/ingest/') && !e.toLowerCase().includes('failed to load resource'),
  )
  if (realConsoleErrors.length) {
    ticket({
      SEVERITY: 'P2-Medium',
      TYPE: 'Functional',
      PAGE_COMPONENT: 'Chat home (/) — console',
      DESCRIPTION: `console.error during load: ${realConsoleErrors.slice(0, 3).join(' | ').slice(0, 480)}`,
      EXPECTED: 'No console.error on clean load',
      ACTUAL: realConsoleErrors[0],
      SCREENSHOT_PATH: home,
    })
  }

  // ─── Mobile sweep (375x812) ──────────────────────────────────────────────
  const mCtx = await browser.newContext({ ...devices['iPhone 13'] })
  const mPage = await mCtx.newPage()
  const mErr = await captureContextErrors(mPage)
  try {
    await mPage.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
    await mPage.waitForTimeout(1500)
    const mShot = shotPath('10-home-mobile')
    await mPage.screenshot({ path: mShot, fullPage: false })

    const taCount = await mPage.locator('textarea').count()
    if (taCount === 0) {
      ticket({
        SEVERITY: 'P1-High',
        TYPE: 'Visual',
        PAGE_COMPONENT: 'Mobile chat input',
        DESCRIPTION: 'Chat textarea missing or off-screen on mobile (iPhone 13 viewport)',
        EXPECTED: 'Chat input reachable on 375px wide viewport',
        ACTUAL: '0 textareas found',
        SCREENSHOT_PATH: mShot,
      })
    }

    // Check chat input is actually within the viewport (not pushed off-screen)
    const ta = mPage.locator('textarea').first()
    if (await ta.count()) {
      const box = await ta.boundingBox()
      if (box && (box.y > 812 || box.y + box.height < 0)) {
        ticket({
          SEVERITY: 'P1-High',
          TYPE: 'Visual',
          PAGE_COMPONENT: 'Mobile chat input',
          DESCRIPTION: `Chat textarea is outside visible viewport: y=${box.y} h=${box.height}`,
          EXPECTED: 'textarea y between 0 and 812',
          ACTUAL: `y=${box.y}, height=${box.height}`,
          SCREENSHOT_PATH: mShot,
        })
      }
    }
  } catch (e) {
    ticket({
      SEVERITY: 'P1-High',
      TYPE: 'Visual',
      PAGE_COMPONENT: 'Mobile (iPhone 13) load',
      DESCRIPTION: `Mobile load failed: ${e.message}`,
      EXPECTED: 'Mobile / loads cleanly',
      ACTUAL: e.message,
      SCREENSHOT_PATH: shotPath('10-home-mobile'),
    })
  }

  await browser.close()

  // Emit summary as last line (NDJSON convention)
  console.error(`\n[easebot-sweep] ${defects.length} defect(s) emitted. Screenshots: ${screenshotDir}`)
}

run().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
