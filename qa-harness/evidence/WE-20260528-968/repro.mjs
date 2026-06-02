// WE-20260528-968 manual repro: two same-origin tabs (one BrowserContext, two
// Pages) — Tab A accepts consent, Tab B should hide banner via storage event.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const URL = process.env.URL || 'http://localhost:8080/';
const OUT = process.env.OUT || '/Users/krish/Desktop/easebot/qa-harness/evidence/WE-20260528-968/screenshots';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
// Same context so both pages share the same localStorage origin partition,
// which is the real-world cross-tab condition the ticket describes.
const context = await browser.newContext();

// Start clean — clear any prior ph_consent so the banner is shown.
const page0 = await context.newPage();
await page0.goto(URL, { waitUntil: 'domcontentloaded' });
await page0.evaluate(() => localStorage.removeItem('ph_consent'));
await page0.close();

const tabA = await context.newPage();
const tabB = await context.newPage();

await tabA.goto(URL, { waitUntil: 'networkidle' });
await tabB.goto(URL, { waitUntil: 'networkidle' });

const consentDialog = (p) => p.locator('div[role="dialog"][aria-label="Analytics consent"]');

// Confirm both tabs show the banner pre-accept.
await consentDialog(tabA).waitFor({ state: 'visible', timeout: 5_000 });
await consentDialog(tabB).waitFor({ state: 'visible', timeout: 5_000 });

await tabA.screenshot({ path: `${OUT}/01-tabA-before.png`, fullPage: false });
await tabB.screenshot({ path: `${OUT}/02-tabB-before.png`, fullPage: false });

// Accept in Tab A.
await tabA.getByRole('button', { name: 'Accept' }).click();

// Tab A's banner should be gone immediately (local setState).
await consentDialog(tabA).waitFor({ state: 'hidden', timeout: 3_000 });

// Tab B's banner should be gone within ~1s via the `storage` event listener.
const start = Date.now();
await consentDialog(tabB).waitFor({ state: 'hidden', timeout: 3_000 });
const elapsed = Date.now() - start;

await tabA.screenshot({ path: `${OUT}/03-tabA-after.png`, fullPage: false });
await tabB.screenshot({ path: `${OUT}/04-tabB-after.png`, fullPage: false });

console.log(`PASS: Tab B banner hidden in ${elapsed}ms after Tab A accepted.`);

// Bonus: verify the reverse — removing the key in Tab A re-shows banner in Tab B.
await tabA.evaluate(() => localStorage.removeItem('ph_consent'));
await consentDialog(tabB).waitFor({ state: 'visible', timeout: 3_000 });
console.log('PASS: Tab B banner re-appears when consent is cleared in Tab A.');
await tabB.screenshot({ path: `${OUT}/05-tabB-reshown-after-reset.png`, fullPage: false });

await browser.close();
