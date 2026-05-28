import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:8080/'
const outPath = process.argv[3] || 'D:/weddingease/easeBot/.run-screenshot.png'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
})
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`[console.error] ${m.text()}`)
})
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))
page.on('requestfailed', (r) => {
  const f = r.failure()
  consoleErrors.push(`[requestfailed] ${r.url()} — ${f ? f.errorText : 'unknown'}`)
})

const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
console.log('NAV_STATUS:', resp?.status())
console.log('NAV_URL:', page.url())
console.log('TITLE:', await page.title())

await page.waitForTimeout(1500)

const bodyText = (await page.locator('body').innerText()).slice(0, 800)
console.log('BODY_TEXT_FIRST_800:')
console.log(bodyText)

console.log('---VISIBLE BUTTONS---')
const buttons = await page.locator('button, a[role="button"], [role="button"]').all()
console.log(`BUTTON_COUNT: ${buttons.length}`)
for (let i = 0; i < Math.min(buttons.length, 15); i++) {
  try {
    const txt = (await buttons[i].innerText()).trim().slice(0, 80)
    if (txt) console.log(`  • ${txt}`)
  } catch {}
}

console.log('---INPUTS---')
const inputs = await page.locator('input, textarea').count()
console.log(`INPUT_COUNT: ${inputs}`)

await page.screenshot({ path: outPath, fullPage: false })
console.log('SCREENSHOT:', outPath)

console.log('---ERRORS---')
if (consoleErrors.length === 0) console.log('(none)')
else consoleErrors.slice(0, 20).forEach((e) => console.log(e))

await browser.close()
