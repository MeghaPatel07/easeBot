import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

const messages = []
page.on('console', (m) => {
  if (m.type() === 'error' && m.text().includes('DialogContent')) {
    messages.push(m.text())
    // Try to extract stack via location
    const loc = m.location()
    if (loc) messages.push(`  at ${loc.url}:${loc.lineNumber}`)
  }
})

await page.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2000)

// Look at the DOM for radix dialog content present
const radixDialogs = await page.evaluate(() => {
  const els = document.querySelectorAll('[data-radix-dialog-content], [role="dialog"]')
  return Array.from(els).map(el => {
    return {
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaLabelledby: el.getAttribute('aria-labelledby'),
      hasTitle: !!el.querySelector('[id]'),
      classes: el.className.slice(0, 200),
      outerHTMLHead: el.outerHTML.slice(0, 300),
    }
  })
})
console.log('=== Radix dialogs / role=dialog in DOM at load ===')
console.log(JSON.stringify(radixDialogs, null, 2))
console.log('\n=== DialogContent warning messages ===')
messages.forEach(m => console.log(m))

await browser.close()
