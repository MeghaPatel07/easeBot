# PostHog Implementation — Sprint Report

Orchestrator: Claude. Execution: single-pass, 4 sprints. Status: **Code complete, awaiting real API keys**.

## What was built

### Sprint A — Foundation
- `posthog-js` installed in `Wedding-Ease-Viva-Chat`
- `posthog-node` installed in `easebot-backend`
- FE wrapper: `src/lib/analytics.ts` — `initAnalytics/track/identify/alias/reset/register/setUserProperties/getDistinctId/startReplay/isFeatureEnabled/getFeatureFlag`
- BE wrapper: `src/lib/posthog.ts` — `initPostHog/capture/identify/isFeatureEnabled/shutdownPostHog`
- BE middleware: `src/middleware/posthogContext.ts` — resolves `req.phDistinctId`
- BE route: `src/routes/ingest.ts` — reverse proxy `/ingest/*` → PostHog (defeats ad-blockers)
- FE init in `src/main.tsx`, BE init + shutdown in `src/server.ts`
- FE consent banner: `src/components/AnalyticsConsent.tsx` (opt-out by default until user accepts)
- Env vars added to both `.env.example` files
- Taxonomy published: `docs/PostHog-EVENTS.md`

### Sprint B — Funnel instrumentation
FE events:
- `AuthContext.tsx`: identify/register on login, reset on logout, `login_completed`, `signup_completed` (Google new-user detection via Firebase metadata), `logout`
- `Login.tsx`: `signup_started`, `password_reset_requested`
- `Index.tsx`: `first_message_sent` (session-gated w/ time_to_first_msg), `message_sent`, `mode_selected` (via effect), `voice_input_used`, `image_uploaded`
- `Checkout.tsx`: `checkout_started`

BE events (authoritative source-of-truth):
- `paymentController.ts`: `payu_initiated`, `payment_failed`, `payment_succeeded` (both return + webhook paths, idempotent via existing `finalizePayment`)
- `chatController.ts` (handleChatStream): `stream_started`, `stream_completed` (with latency_ms + tokens_charged), `stream_errored` (incl. client disconnect)

### Sprint C — Session replay + PII masking
- `startReplay()` helper with per-session deterministic sampling (paying = 100%, checkout = 100%, rest = 10%)
- `maskAllInputs: true` default
- `maskTextSelector: '[data-ph-mask],[data-ph-mask] *'` — applied to:
  - ChatInput textarea
  - User chat bubble text
  - AI markdown response container
  - Entire Checkout billing form
- `blockSelector: '[data-ph-block],input[type=password]'`
- Replay start wired into `AuthContext` (paying upgrade) + `main.tsx` (anonymous sampled)

### Sprint D — Flags + GTM
- `useFeatureFlag(key, default)` hook — subscribes to flag changes
- `isFeatureEnabled` + `getFeatureFlag` exports from analytics.ts
- `docs/PostHog-RUNBOOK.md` — cost control, ops playbook, incident runbook, GTM checklist

## Files changed / created

Frontend:
- CREATED `src/lib/analytics.ts`
- CREATED `src/hooks/useFeatureFlag.ts`
- CREATED `src/components/AnalyticsConsent.tsx`
- MODIFIED `src/main.tsx`, `src/App.tsx`, `src/contexts/AuthContext.tsx`,
  `src/pages/Login.tsx`, `src/pages/Index.tsx`, `src/pages/Checkout.tsx`,
  `src/components/chat/ChatInput.tsx`, `src/components/chat/ChatMessages.tsx`,
  `.env.example`, `package.json` (posthog-js)

Backend:
- CREATED `src/lib/posthog.ts`
- CREATED `src/middleware/posthogContext.ts`
- CREATED `src/routes/ingest.ts`
- MODIFIED `src/app.ts`, `src/server.ts`, `src/controllers/paymentController.ts`,
  `src/controllers/chatController.ts`, `.env.example`, `package.json` (posthog-node)

Docs:
- CREATED `docs/PostHog-EVENTS.md` (taxonomy)
- CREATED `docs/PostHog-RUNBOOK.md` (ops)
- CREATED `docs/PostHog-SPRINT-REPORT.md` (this)

## QA — what was verified

- Backend `tsc --noEmit` clean
- Frontend `tsc --noEmit` clean
- Kill-switch defaults to `false` — no events fire until `POSTHOG_ENABLED=true`
  AND `NODE_ENV=production` (BE) / `import.meta.env.PROD` (FE)
- Consent banner opts out by default — PostHog explicit opt-in required
- Webhook payment idempotency preserved — `phCapture('payment_succeeded')`
  lives inside `finalizePayment` which is already guarded against duplicate state

## QA — what was NOT verified (needs real keys)

- End-to-end event delivery to a real PostHog project
- Replay masking rendered in PostHog UI (visually inspect after first session)
- Reverse proxy `/ingest/*` actually forwards correctly in the deployed env
- PayU webhook → `payment_succeeded` round-trip with a sandbox txn

These require a PostHog key + deployed backend. Follow `docs/PostHog-RUNBOOK.md` §1 to flip it on and §9 to verify.

## Known limitations (tracked as follow-ups)

- `tool_invoked` per-tool instrumentation skipped — add to each handler in `chatController.ts`
- `otp_verified` not wired into `authController.handleVerifyOtp`
- `payment_abandoned` is client-side; a backend sweep of 30-min-old `pending` payments would be more accurate
- Pricing page `plan_viewed` / `plan_selected` skipped (separate page explorer pass needed)
- Usage watchdog dashboard is PostHog-side config, not code — see runbook §3

## Cost posture

Default config stays well within free tier at up to ~10K MAU:
- Autocapture OFF → ~80 events/user/month
- Replay sampled 10% free + 100% paying/checkout → ~3K/mo at 1K MAU
- Flags bootstrapped → <5 requests per session

Full breakdown in `docs/PostHog-EVENTS.md` §7.
