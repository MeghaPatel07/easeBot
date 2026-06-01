# WE-20260528-056: Dark mode — secondary buttons ("Go to Plan & Billing", "Decline" in consent, "Annual…" pricing pill) become invisible

| Field | Value |
|---|---|
| **ID** | `WE-20260528-056` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P1` |
| **Priority** | `P1` |
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/ui/button.tsx` (`variant: secondary`/`ghost`/`outline` dark tokens) |
| **URL / Page** | `/payment/success`, `/pricing`, AnalyticsConsent banner (any page) — dark mode |
| **Breakpoint** | `all` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

The ghost / secondary button variant is rendered with a near-transparent or near-black surface in dark mode, causing the label text to disappear visually. Confirmed on:

- `/payment/success` — "Go to Plan & Billing" button is nearly invisible (`desktop-dark-payment-success.png`)
- `/pricing` — "Annual — save ~34%" pill (inactive billing-cycle toggle) is unreadable (`mobile-dark-pricing.png`)
- AnalyticsConsent banner — "Decline" button is washed-out
- `/login` — "View Plans" link washed-out (related to WE-20260528-054)

## Steps to reproduce

1. Enable dark mode (`localStorage.setItem('theme','dark')`)
2. Visit `/payment/success`, `/pricing`, and any page that triggers the analytics consent
3. Observe the secondary button variants

## Expected

Secondary/ghost button text contrast ≥4.5:1 against page background in both light and dark modes.

## Actual

Text colour falls back to the same near-black foreground used in light mode, against a dark surface — visually invisible.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-056/screenshots/`
  - `desktop-dark-payment-success.png`
  - `mobile-dark-pricing.png`

## Notes

Single token fix probably covers all three reported instances + WE-20260528-054. Check `--secondary-foreground` in `index.css` `.dark` block.
