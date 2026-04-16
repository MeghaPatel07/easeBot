# Spec — `quotaMiddleware.ts`

**Owner:** System Architect
**File:** `easebot-backend/src/middleware/quotaMiddleware.ts`
**Status:** Draft v1 — Sprint 1 deliverable
**Grounded in:** PRICING_PRD.md §5, §6; EXECUTION_PLAN.md §0 guardrail 8, §5 UCs, §6 loopholes
**Depends on:** `token-meter.md`

One middleware, five routes. Runs **after** `requireAuth` and attaches `req.quotaContext` with a pre-reserved budget. Callers (controllers) use the context to run the expensive call, then call `tokenMeter.chargeTokens` with the actual measured cost. On over-limit, respond 402 with a structured body and short-circuit the chain.

**Non-goals:** This middleware does not implement any model-downgrade path. Guardrail 8 from EXECUTION_PLAN.md §0: **NO MINI MODEL FALLBACK**. When the pool is empty, we return 402. Full stop. There is no `req.quotaContext.useMiniModel` flag. There is no `/fallback` deployment. Agents reviewing this spec: if you ever see "fallback to mini" in a PR, reject it.

---

## 1. Signature & shape

```ts
// easebot-backend/src/middleware/quotaMiddleware.ts
import type { Request, Response, NextFunction } from 'express'
import type { RawCost, Service, Tier, EstimateResult } from '../services/tokenMeter'

// What the middleware attaches to the request.
export interface QuotaContext {
  principal: {
    kind: 'user' | 'guest'
    id: string                          // uid or guestId
    tier: Tier
  }
  service: Service                       // 'chat' | 'image' | 'tts' | 'stt' | 'vision'
  estimate: EstimateResult               // from tokenMeter.estimateCost
  // The controller MUST call reconcile(actualRawCost) exactly once after
  // the downstream call completes (success or failure). If the downstream
  // call throws before Azure is reached, call reconcile({...rawCostSkeleton, skip:true}).
  reconcile: (actual: RawCost | { skip: true }) => Promise<void>
}

declare global {
  namespace Express {
    interface Request {
      quotaContext?: QuotaContext
    }
  }
}

/**
 * Factory — one middleware per service type. The service type drives the
 * raw-cost shape the middleware will use for its pre-call estimate.
 *
 * Usage:
 *   router.post('/chat', requireAuth, quotaCheck('chat'), chatHandler)
 *   router.post('/image', requireAuth, quotaCheck('image'), imageHandler)
 *   ...
 */
export function quotaCheck(service: Service): (
  req: Request, res: Response, next: NextFunction,
) => Promise<void>
```

Everything is inside `quotaCheck(service)`. There is no default export, no other named export. One function, one responsibility.

---

## 2. Route map (who wraps whom)

| Route | Service arg | Notes |
|---|---|---|
| `POST /api/chat` | `'chat'` | Also handles vision — if request has `imageBase64`/`imageMimeType`, the reconcile step passes a second `chargeTokens('vision', ...)` call. |
| `POST /api/image` | `'image'` | Standard vs HD determined by aspect-ratio / `preferredAspectRatio`. |
| `POST /api/tts` | `'tts'` | Pre-estimate from `text.length`; post-reconcile from actual synthesized char count (usually equal). |
| `POST /api/transcribe` (STT) | `'stt'` | Pre-estimate from payload audio duration header OR fallback to `audioBase64.length / avgBytesPerSecond`; post-reconcile from Azure's returned duration. |
| `POST /api/vision` (if / when extracted) | `'vision'` | Only fires if vision becomes a separate route; today it rides on `/chat`. |

Routes NOT wrapped by `quotaCheck`:
- `/api/account/*` — no LLM cost
- `/api/reminders` CRUD — no LLM cost (WhatsApp send is charged on the scheduler, not here)
- `/api/notes`, `/api/checklists` — no LLM cost
- `/api/health` — obvious
- `/api/payment/*` — this is the tier mutator, not the cost generator
- Algolia product search — the tool call happens inside the chat pipeline; it's charged directly from `algoliaProducts.ts` via `tokenMeter.chargeTokens`, not via middleware (the middleware sees the outer `chat` route only)

---

## 3. Pre-call flow

```
1. Resolve principal
   - If req.user?.uid is set         → principal = { kind:'user', id:uid, tier: resolveTier(req) }
   - Else                            → principal = { kind:'guest', id: resolveGuestId(req) , tier:'guest' }

2. tier resolution (user only)
   - Read req.user.tier (custom claim, see §6)
   - If undefined, read `users/{uid}.tierMirror` (Firestore fallback, cached 60s per uid)
   - If still undefined, default to 'free'
   - guestId is never 'free' — guests hit the guest branch of the meter

3. Build a conservative RawCost skeleton from the request body
   - chat: { kind:'chat', promptTokens: tokenize(historyJoin + body.message + systemPromptFor(mode)),
             completionTokens: MAX_COMPLETION_TOKENS_FOR_MODE }
   - image: { kind:'image', quality: body.preferredAspectRatio?.includes('1536') ? 'hd' : 'standard', count: 1 }
   - tts: { kind:'tts', characters: (body.text ?? '').length }
   - stt: { kind:'stt', seconds: estimateAudioSeconds(body) }
   - vision: { kind:'vision', imageCount: countImageParts(body) }

4. const est = await tokenMeter.estimateCost({ principal, raw: skeleton })

5. If est.wouldExceedGuestLimit → respond 402 (guest branch, see §4)
   If est.wouldExceedDaily      → respond 402 'daily_cap_exceeded'
   If est.wouldExceedMonthly    → respond 402 'monthly_cap_exceeded'

6. Attach req.quotaContext = { principal, service, estimate: est, reconcile: ... }
7. next()
```

The estimate is **pessimistic**: chat uses the maximum completion budget, image uses the higher-cost quality if ambiguous, STT uses a conservative-upper-bound for audio seconds. This protects against LH-01 (single-call blow-out). Post-call reconcile uses the real measured cost so the user is never over-charged.

---

## 4. Guest branch

If `principal.kind === 'guest'`, the estimate path is identical — `tokenMeter.estimateCost` internally branches on `principal.kind` and consults `guests/{guestId}`. The middleware's only responsibility is to resolve `guestId` correctly and map the 402 body to guest-appropriate language:

```
guestId resolution:
  - Read signed cookie `eb_gid` (HMAC-SHA256 with APP_SECRET) — set on first visit
  - If absent, generate `guestId = uuidv4()`, set cookie, attach
  - Also compute `ipHash = sha256(req.ip + APP_SECRET)` and pass to meter for
    dedupe logging (LH-09, LH-20)

Whatsapp for guests:
  - Never happens — reminders aren't wired for guests, and the reminder
    scheduler runs out-of-band (not through this middleware). No action here.
```

Guest 402 body differs from the user 402 body only in the `upgradeUrl` field (points to `/signup?from=guest-cap`).

---

## 5. Post-call reconciliation (the `reconcile` closure)

```ts
// Inside quotaCheck — the closure that becomes req.quotaContext.reconcile
async function reconcile(actual: RawCost | { skip: true }): Promise<void> {
  if ('skip' in actual) {
    // Controller aborted before Azure was called — nothing to charge.
    // e.g. validation error, bad body, upstream 500. No meter mutation.
    return
  }

  const result = await tokenMeter.chargeTokens(principal, actual)

  if (!result.allowed) {
    // LH-03 race: someone else drained the pool between estimate and charge.
    // We've already made the Azure call, so the user gets the output for
    // free on this one call. Log for observability; do not error the response.
    console.warn('[quota] reconcile denied after Azure call', {
      uid: principal.id, reason: result.reason, service,
    })
    return
  }

  // Success metadata attached to the response if possible (depends on timing).
  // If the controller has already res.end()'d, this is fire-and-forget.
  res.setHeader?.('X-Easebot-Tokens-Charged', String(result.tokensCharged))
  res.setHeader?.('X-Easebot-Remaining-Monthly', String(result.remainingMonthly))
}
```

**Contract with controllers:** Every controller wrapped by `quotaCheck` MUST call `req.quotaContext.reconcile(actualCost)` exactly once before returning. A small helper in the controller file:

```ts
const qc = req.quotaContext!
try {
  const azureResp = await azureAI.chatComplete(...)
  await qc.reconcile({
    kind: 'chat',
    promptTokens: azureResp.usage.prompt_tokens,
    completionTokens: azureResp.usage.completion_tokens,
  })
  res.json(...)
} catch (e) {
  await qc.reconcile({ skip: true })
  throw e
}
```

QA verifies this pattern exists at every wrapped controller site.

### 5.1 `byService` breakdown

The service label comes from the middleware's `service` arg. The meter writes it directly into `byService[service] += tokens` inside the same transaction that debits the ledger. No separate call, no second write.

For chat-with-vision: the controller calls `reconcile({ kind:'chat', ...})` AND then directly calls `tokenMeter.chargeTokens(principal, { kind:'vision', imageCount })`. The second call bypasses `reconcile` because there's only one estimate in the middleware. This is the one exception to "one reconcile per request." Documented loudly in `chatController.ts`.

---

## 6. Tier resolution — custom claim first, Firestore fallback

```ts
function resolveTier(req: Request): Tier {
  // 1. Custom claim on the decoded ID token (PRD §6 point 10 — authoritative)
  const fromClaim = (req.user as any)?.tier as Tier | undefined
  if (fromClaim === 'free' || fromClaim === 'pro' || fromClaim === 'promax') return fromClaim

  // 2. Firestore fallback (tierMirror on the user doc) — cached 60s per uid
  //    to avoid a read on every request
  const cached = tierCache.get(req.user!.uid)
  if (cached && cached.expiresAt > Date.now()) return cached.tier

  // 3. Fire-and-forget Firestore read → populate cache → default 'free' for this request
  refreshTierMirrorAsync(req.user!.uid)
  return 'free'
}
```

The default-to-`free` + async-refresh pattern is chosen because option (3) costs zero latency. The first request after an upgrade reads stale `'free'`, the async refresh lands, the second request (<100ms later) reads the new tier. The edge cost: one tier-constrained call right after upgrade. Acceptable — the frontend force-refreshes the ID token on payment success (LH-43), which means the claim lands before the next chat call in practice.

### 6.1 Depends on auth middleware extending `req.user.tier`

The current `requireAuth` in `middleware/auth.ts` (lines 40-45) does NOT include `tier` on `req.user`. This middleware **requires** it. Resolution options, in preference order:

- **Option A (recommended):** `requireAuth` adds one line: `tier: (decoded as any).tier ?? undefined`. Minimal, grounded, respects Guardrail 4 (no breaking auth changes — this is an extension, not a rewrite).
- **Option B:** `quotaMiddleware` makes its own `adminAuth.verifyIdToken` call. Duplicate work, duplicate attack surface. **Rejected.**
- **Option C:** Skip custom-claim entirely and read tier from Firestore. Slower, misses the PRD directive. **Rejected.**

Escalate to human via the Open concerns section if Option A needs sign-off.

---

## 7. 402 response shape

```ts
// HTTP 402 Payment Required
{
  error: 'quota_exceeded',
  reason: 'daily_cap_exceeded' | 'monthly_cap_exceeded' | 'guest_limit_exceeded' | 'firestore_unreachable',
  message: string,            // human-readable; the frontend shows this verbatim if no local translation
  resetAt: string,            // ISO; for daily caps, next UTC midnight; for monthly, period end; for guest, null
  upgradeUrl: string,         // '/pricing?from=free-cap' | '/pricing?from=pro-cap' | '/signup?from=guest-cap'
  remaining: {
    daily: number,            // tokens, or for guests: { messages, images, voice, vision } counters
    monthly: number,
    extras: number,
  },
}
```

For guests, `remaining` is instead:
```ts
remaining: {
  guest: { msgCount: 10, imgCount: 3, voiceCount: 3, visionCount: 3 },
  used:  { msgCount:  …, imgCount:  …, voiceCount: …, visionCount: … },
}
```

Status code is always **402 Payment Required**, matching PRD §6 point 2.

`firestore_unreachable` is 503 (Service Unavailable), not 402 — it's infra, not money.

---

## 8. Integration with existing auth middleware

The middleware runs AFTER `requireAuth` in the route definition:

```ts
// routes/chat.ts
router.post('/chat', requireAuth, quotaCheck('chat'), handleChat)
```

`requireAuth` already has a guest pass-through (`req.user` undefined = guest). `quotaCheck` handles both branches via `principal.kind`.

Do not chain `quotaCheck` without `requireAuth` — it depends on `req.user?.uid` being set OR unset consistently. Combining `quotaCheck` with a different auth implementation is out of scope.

---

## 9. Error cases

| Case | Response |
|---|---|
| Pre-call estimate exceeds cap | 402, structured body (§7), no `next()` |
| `tokenMeter.estimateCost` throws (Firestore unreachable) | 503, `{ error: 'service_unavailable' }`, no `next()`. Controller does not run. Call is safe. |
| Controller forgets to call `reconcile` | Under-counting bug. QA catches in UC-21. Observability: `tokenMeter` cumulative sum vs `Azure` monthly cost dashboard diff triggers an alert — but that alert lives in §13 GTM checklist, not in code. |
| Controller calls `reconcile` twice | The second call debits again — real bug. Add a `_reconciled` flag on `QuotaContext` and `console.warn` + early-return on double call. |
| `reconcile({skip:true})` on a controller that actually did make the Azure call | Under-counting. Same observability path. |
| Request body shape invalid (can't build a skeleton) | 400 before the estimate runs. Middleware does not mask validation errors. |

---

## 10. Test matrix (QA hooks)

- UC-01 Guest first chat passes, counter incremented, reconcile fires
- UC-02 Guest 11th chat → 402 guest body
- UC-12 Free chat reconcile writes `byService.chat`
- UC-15 Free at 100% → 402 with upgrade CTA URL
- UC-16 Free hits daily 50k → 402 daily, monthly untouched
- UC-21 Pro real-time meter — reconcile header visible on response
- UC-22 Pro at 100% monthly → 402, no fallback, no mini
- LH-01 Single 100k prompt → rejected by estimate
- LH-03 Concurrent chat calls from same uid → no double-spend (reconcile handles the race)
- LH-06 Image fails post-charge → controller calls `tokenMeter.refundTokens`; **reconcile does NOT charge** (controller wraps with try/catch + refund path)

---

## 11. Open architectural concerns

1. **Depends on `req.user.tier` from auth middleware.** See §6.1. The fix is a one-line extension to `middleware/auth.ts`. Flagging to the Orchestrator so the Backend agent isn't accidentally forbidden from touching `auth.ts` under Guardrail 4. **This IS an extension, not a rewrite, and it's necessary.**

2. **`reconcile` is an informal contract.** There's no compile-time check that a controller actually calls it. QA must audit every wrapped controller diff. Consider a runtime assertion in dev: wrap `res.end` on request entry; on end, log a warning if `_reconciled` is false. Not enforced in prod (perf) — but cheap guardrail in dev.

3. **Guest `whatsapp` is not wired through this middleware anyway.** WhatsApp is sent from the reminder scheduler, which has its own process and doesn't pass through any middleware. See `token-meter.md` §9 concern 5. Not a quota-middleware problem, but noting it for completeness.

4. **Vision double-charge split.** The decision to charge `vision` separately from the `chat` reconcile is architecturally clean but requires controller-side discipline. If the controller forgets the second `chargeTokens('vision')`, we miss ~2k tokens per vision call. Low stakes ($0.005 per miss) but tag in QA's LH sweep.

5. **No enforcement on free-tier reminder count (3 active).** PRD §4.2 says "Reminders: 3 active, email only" for Free. That enforcement is NOT in this middleware — it belongs in `reminderController`. Flagged so the PM Agent doesn't assign it to the quota-middleware ticket by mistake.
