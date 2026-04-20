# QA Screenshot Harness — Theme Migration Verification

Captures full-page screenshots of each route at four viewports so a reviewer can
confirm the theme-token migration did not alter look & feel.

Viewports:

| Name          | Width | Height | Target                          |
|---------------|-------|--------|---------------------------------|
| desktop-1440  | 1440  | 900    | Laptop (MacBook 14")            |
| desktop-1920  | 1920  | 1080   | Desktop monitor (FHD)           |
| mobile-390    | 390   | 844    | iPhone 14 Pro                   |
| mobile-360    | 360   | 800    | Android (Pixel 5-class)         |

## Setup (one-time)

```bash
npm install -D playwright
npx playwright install chromium
```

## Run — public routes only

```bash
# In terminal 1:
npm run dev    # serves on http://localhost:8080

# In terminal 2:
node qa/screenshot-harness.mjs
```

Writes to `qa/screenshots/<route>/<viewport>.png` plus `_manifest.json`.

## Run — authenticated routes

Auth routes need a signed-in `storageState.json`. Sign into the app manually in
a Playwright codegen session, export the storage state, then:

```bash
QA_UID=<your-test-uid> node qa/screenshot-harness.mjs --auth storage.json
```

## Interpreting results

This is a **snapshot** harness, not a diff harness. To verify visual parity,
compare against a pre-migration baseline:

```bash
# 1. On the pre-migration commit:
git checkout <pre-migration-sha>
node qa/screenshot-harness.mjs  # output into qa/screenshots-baseline/
mv qa/screenshots qa/screenshots-baseline

# 2. On main (post-migration):
git checkout main
node qa/screenshot-harness.mjs

# 3. Diff with any image-diff tool, e.g.
# npx pixelmatch <baseline> <current> <diff.png>
```

## Modal / state coverage

The harness visits each route at rest. Modal and interactive-state coverage
(SignInModal, SignUpModal, CheckoutModal, NoteHeader popovers, AttachmentPicker
dropdown, MessageAttachmentChips chips, etc.) requires interaction scripts —
add them to `screenshot-harness.mjs` as explicit `await page.click(...)` steps.
