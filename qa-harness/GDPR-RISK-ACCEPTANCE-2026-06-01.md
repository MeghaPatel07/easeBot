# GDPR Article 17 (Right to Erasure) — Risk Acceptance

**Ticket:** WE-20260528-1001
**Decision date:** 2026-06-01
**Decision owner:** Krish (Chairman)
**Status:** RISK-ACCEPTED (documented, no code change this cycle)

## Finding
`/api/account/delete` is a no-op with respect to actual data erasure: it sets a
`deleted=true` flag on the user document but **does not purge** the user's Firestore
data (`users/{uid}` profile, `chats/{threadId}` + messages, `users/{uid}/images`,
notes, checklists, budget, shopping lists, calendar events, subscription/payment docs).
No scheduled job removes flagged accounts. Under GDPR Article 17 a data subject's
erasure request must result in actual deletion within a reasonable period.

## Decision
Risk is **formally accepted for now** (early-stage product, low user count, no confirmed
EU data subjects). No purge job is built this cycle.

## Why this is acceptable *for now* (and only for now)
- Pre-launch / limited user base; erasure-request volume is effectively zero.
- A real purge job requires a **Firebase Cloud Function deploy**, which per the permanent
  Firebase strict rule only Krish runs by hand — it is not agent-automatable.
- The `deleted=true` flag already removes the account from active product surfaces
  (functional soft-delete), bounding the exposure to data-at-rest, not data-in-use.

## Conditions that flip this to MUST-FIX (revisit triggers)
1. Any real EU/EEA/UK data subject onboards, OR
2. Public launch / marketing beyond closed testing, OR
3. Any actual erasure request is received, OR
4. A DPA / privacy-policy commitment promises erasure (note: PrivacyPolicy.tsx references
   data rights — verify wording does not over-promise erasure we don't perform).

## Remediation path when triggered (pre-scoped, not built)
- `fix-backend-api` scaffolds a `purgeUserData` Cloud Function: recursive delete of
  `users/{uid}` + all subcollections + `chats` authored by uid + `users/{uid}/images`
  (and Storage objects) + subscription/payment docs, idempotent, audit-logged.
- Wire `/api/account/delete` to enqueue the purge (e.g. Pub/Sub or a `pendingDeletion`
  collection a scheduled function drains).
- **Krish hand-runs the deploy** (`firebase deploy --only functions:purgeUserData`) —
  agents never deploy.
- Re-verify PrivacyPolicy.tsx erasure wording matches actual behavior.

## Cross-check action (safe, do now)
Confirm `PrivacyPolicy.tsx` does not claim erasure is performed when it is not — a
mismatch between policy text and behavior is itself a compliance/representation risk.
This is flagged to the PROMPTS/legal review lane, not auto-edited.
